import { describe, expect, it } from 'vitest';
import type { ActionRequest, Perception } from '../../core/agents/agentWorld';
import type { WorldMap } from '../../core/map/worldMap';
import type { AgentDecl } from '../../core/yaml/worldFile';
import { UNKNOWN_USAGE, type Brain, type BrainRequest, type Thought } from './brain';
import {
  AgentRuntime,
  MAX_REQUESTS_PER_MINUTE,
  MEMORY_SIZE,
  TIME_LIMIT_MS,
  type Clock,
} from './runtime';

const MAP: WorldMap = {
  name: 'Borgo',
  description: null,
  size: [64, 96, 64],
  entries: [
    {
      id: 'pozzo',
      kind: 'place',
      name: 'Pozzo',
      description: null,
      shape: { kind: 'point', x: 40, z: 30 },
    },
    {
      id: 'marta',
      kind: 'character',
      name: 'Marta',
      description: null,
      shape: { kind: 'point', x: 30.5, z: 30.5 },
    },
    {
      id: 'tobia',
      kind: 'character',
      name: 'Tobia',
      description: null,
      shape: { kind: 'point', x: 32.5, z: 30.5 },
    },
    {
      id: 'player',
      kind: 'player',
      name: 'Ada',
      description: null,
      shape: { kind: 'point', x: 20, z: 20 },
    },
  ],
};

/** A brain the test answers by hand. */
class ScriptedBrain implements Brain {
  readonly name = 'scripted';
  readonly requests: {
    request: BrainRequest;
    resolve: (v: unknown) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
  }[] = [];
  think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    return new Promise((resolve, reject) =>
      this.requests.push({
        request,
        resolve: (reply) => resolve({ reply, usage: UNKNOWN_USAGE }),
        reject,
        signal,
      }),
    );
  }
  answer(i: number, reply: unknown): Promise<void> {
    this.requests[i]!.resolve(reply);
    return flush();
  }
}

/** A clock the test moves by hand. */
class FakeClock implements Clock {
  time = 0;
  private timers: { at: number; callback: () => void; alive: boolean }[] = [];
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => {
    const timer = { at: this.time + ms, callback, alive: true };
    this.timers.push(timer);
    return timer;
  };
  clearTimeout = (handle: unknown) => {
    (handle as { alive: boolean }).alive = false;
  };
  async advance(ms: number): Promise<void> {
    this.time += ms;
    for (const t of this.timers) {
      if (t.alive && t.at <= this.time) {
        t.alive = false;
        t.callback();
      }
    }
    await flush();
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const say = (text: string) => ({ say: { text, to: null }, actions: [] });
/** Lines of a conversation between agents in the world of these tests (A8.6). */
const TURNS = 4;

function setup(config: Partial<AgentDecl> = {}) {
  const brain = new ScriptedBrain();
  const clock = new FakeClock();
  const requests: ActionRequest[] = [];
  const log: string[] = [];
  const runtime = new AgentRuntime(
    'marta',
    { id: 'marta', name: 'Marta', description: 'La pescatrice.' },
    { mode: 'api', initiative: 'reactive', every: 60, ...config } as AgentDecl,
    brain,
    {
      request: (r) => requests.push(r),
      map: () => MAP,
      isAgent: (id) => id === 'tobia',
      isCharacter: (id) => id === 'tobia' || id === 'marta',
      conversationTurns: () => TURNS,
      log: (l) => log.push(l),
    },
    clock,
  );
  const message = (text: string, from = 'player', to: string | null = 'marta') =>
    runtime.event('marta', { type: 'heard', from, text, distance: 4, to });
  const perceive = (time: number, playerDistance: number | null) =>
    runtime.perception('marta', {
      type: 'perception',
      time,
      self: { x: 30.5, y: 34, z: 30.5, yaw: 0, on_ground: true, in_water: false },
      action: null,
      nearby:
        playerDistance === null
          ? []
          : [
              {
                id: 'player',
                name: 'Ada',
                kind: 'player',
                x: 30.5,
                y: 34,
                z: 30.5 - playerDistance,
                distance: playerDistance,
              },
            ],
    } as Perception);
  // The agent asks only once it knows where it is (its first perception).
  perceive(0, null);
  return { brain, clock, requests, log, runtime, message, perceive };
}

describe('the runtime of an agent', () => {
  it('AGENT-004.a: a message to it, E, and the player coming near after a while make it ask; other sentences do not', async () => {
    const { brain, requests, runtime, message, perceive } = setup();
    // Each reply is a sentence: its end lets the next event through.
    const said = () => runtime.event('marta', { type: 'action_done', id: requests.at(-1)!.id });
    message('ciao a tutti', 'player', null);
    message('Tobia, vieni?', 'player', 'tobia');
    expect(brain.requests).toHaveLength(0);
    message('Cosa vedi?');
    expect(brain.requests).toHaveLength(1);
    expect(brain.requests[0]!.request.input.triggers).toEqual([
      { kind: 'message', from: 'player', fromName: 'Ada', to: 'marta', text: 'Cosa vedi?' },
    ]);
    await brain.answer(0, say('Vedo il pozzo.'));
    runtime.event('marta', { type: 'interacted', by: 'player' });
    expect(brain.requests[1]!.request.input.triggers).toEqual([{ kind: 'interact' }]);
    await brain.answer(1, say('Dimmi.'));
    said();
    // The player comes near for the first time: greeted once.
    perceive(10, 30);
    perceive(11, 6);
    expect(brain.requests[2]!.request.input.triggers).toEqual([
      { kind: 'near', who: 'player', whoName: 'Ada' },
    ]);
    await brain.answer(2, say('Ciao Ada!'));
    said();
    // Away for a short while: no new greeting; away for more than 60 s: greeted again.
    perceive(20, 20);
    perceive(40, 5);
    expect(brain.requests).toHaveLength(3);
    perceive(50, 20);
    perceive(115, 5);
    expect(brain.requests).toHaveLength(4);
  });

  it('AGENT-004.b: with the autonomous initiative it asks now and then, when it has nothing to do', async () => {
    const { brain, perceive } = setup({ initiative: 'autonomous', every: 30 });
    perceive(10, null);
    expect(brain.requests).toHaveLength(0);
    perceive(30, null);
    expect(brain.requests.map((r) => r.request.input.triggers)).toEqual([[{ kind: 'autonomous' }]]);
    await brain.answer(0, { say: null, actions: [] });
    perceive(45, null);
    expect(brain.requests).toHaveLength(1);
    perceive(61, null);
    expect(brain.requests).toHaveLength(2);
  });

  it('AGENT-004.c: a conversation between agents lasts the lines the world allows, both ways; the agent knows how many are left (A8.6)', async () => {
    const { brain, message } = setup();
    // Tobia starts: each of his lines is one; each of Marta's lines to him is another.
    message('Marta, parliamo di pesca?', 'tobia');
    expect(brain.requests[0]!.request.input.triggers).toMatchObject([{ turnsLeft: TURNS - 1 }]);
    await brain.answer(0, { say: { text: 'Parliamone.', to: 'tobia' }, actions: [] });
    message('Cosa abbocca oggi?', 'tobia');
    expect(brain.requests[1]!.request.input.triggers).toMatchObject([{ turnsLeft: TURNS - 3 }]);
    await brain.answer(1, { say: { text: 'Le tinche.', to: 'tobia' }, actions: [] });
    // Four lines: the next line of Tobia gets no answer.
    message('E domani?', 'tobia');
    expect(brain.requests).toHaveLength(2);
    // The player speaks: the agents may talk again.
    message('e voi due?');
    await brain.answer(2, say('Parlavamo di pesci.'));
    message('ancora', 'tobia');
    expect(brain.requests).toHaveLength(4);
    expect(brain.requests[3]!.request.text).toContain('can go on for 3 more lines');
  });

  it('AGENT-005.a: the recent exchanges and actions go with every request, the last 12', async () => {
    const { brain, message } = setup();
    for (let i = 0; i < MEMORY_SIZE; i++) message(`chiacchiera ${i}`, 'tobia', null);
    message('Cosa ti ho detto?');
    const memory = brain.requests[0]!.request.input.memory;
    expect(memory).toHaveLength(MEMORY_SIZE);
    expect(memory.at(-1)).toBe('t=0s Ada → you: Cosa ti ho detto?');
    expect(memory[0]).toBe('t=0s Tobia → everyone: chiacchiera 1');
    await brain.answer(0, say('Molte cose.'));
    message('E tu?');
    expect(brain.requests[1]!.request.input.memory).toContain('you said: Molte cose.');
  });

  it('AGENT-006.b, AGENT-003.c: one request at a time; what happens meanwhile goes in the next; a new reply replaces the running actions', async () => {
    const { brain, requests, runtime, message } = setup();
    message('Portami al pozzo');
    message('anzi, aspetta');
    message('e dimmi cosa vedi');
    expect(brain.requests).toHaveLength(1);
    await brain.answer(0, {
      say: { text: 'Andiamo', to: 'player' },
      actions: [{ type: 'walk_to', target: 'pozzo' }],
    });
    expect(brain.requests).toHaveLength(2);
    expect(
      brain.requests[1]!.request.input.triggers.map((t) => (t as { text: string }).text),
    ).toEqual(['anzi, aspetta', 'e dimmi cosa vedi']);
    expect(requests.at(-1)).toMatchObject({ kind: 'say', text: 'Andiamo' });
    runtime.event('marta', { type: 'action_done', id: requests.at(-1)!.id });
    expect(requests.at(-1)).toMatchObject({ kind: 'walk_to', target: 'pozzo' });
    // It walks while it already thinks the next reply: the overlay shows it thinking.
    expect(runtime.status.state).toBe('thinking');
    // The new reply comes while it walks: it replaces the walk.
    await brain.answer(1, say('Mi fermo qui.'));
    expect(requests.at(-1)).toMatchObject({ kind: 'say', text: 'Mi fermo qui.' });
    const walk = requests.at(-2)!;
    runtime.event('marta', { type: 'action_replaced', id: walk.id });
    runtime.event('marta', { type: 'action_done', id: requests.at(-1)!.id });
    expect(requests.at(-1)).toMatchObject({ kind: 'say', text: 'Mi fermo qui.' });
    expect(runtime.status.state).toBe('idle');
  });

  it('AGENT-006.c, AGENT-003.b: past the time limit the request is abandoned, with the fallback sentence if any; parts set aside are logged', async () => {
    const { brain, clock, requests, log, runtime, message } = setup({
      fallback: 'Mmh, non saprei.',
    });
    message('Cosa vedi?');
    await clock.advance(TIME_LIMIT_MS.api - 1);
    expect(brain.requests[0]!.signal.aborted).toBe(false);
    await clock.advance(1);
    expect(brain.requests[0]!.signal.aborted).toBe(true);
    expect(log).toContain('the request to scripted failed: no reply within 30 s');
    expect(requests.at(-1)).toMatchObject({ kind: 'say', text: 'Mmh, non saprei.' });
    expect(runtime.status).toMatchObject({ state: 'acting', last_ms: 30_000 });
    // A late answer does not count.
    await brain.answer(0, say('Troppo tardi'));
    expect(requests.some((r) => 'text' in r && r.text === 'Troppo tardi')).toBe(false);
    message('Riprova');
    await brain.answer(1, { say: null, actions: [{ type: 'fly', target: 'pozzo' }] });
    expect(log).toContain('reply set aside: actions[0]: unknown action "fly"');
  });

  it('AGENT-006.d: at most 6 requests a minute; the others wait', async () => {
    const { brain, clock, message } = setup();
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE + 1; i++) {
      message(`domanda ${i}`);
      if (brain.requests[i]) await brain.answer(i, say(`risposta ${i}`));
      await clock.advance(1000);
    }
    expect(brain.requests).toHaveLength(MAX_REQUESTS_PER_MINUTE);
    await clock.advance(60_000);
    expect(brain.requests).toHaveLength(MAX_REQUESTS_PER_MINUTE + 1);
  });

  it('AGENT-003.a, AGENT-004.a: a plan in steps goes on when its actions end; the answer of whom it asked counts; coming near does not interrupt (A8.4, A8.5)', async () => {
    const { brain, requests, runtime, message, perceive } = setup();
    const done = () => runtime.event('marta', { type: 'action_done', id: requests.at(-1)!.id });
    message('vai da Tobia e chiedigli se piove');
    await brain.answer(0, {
      say: { text: 'Vado.', to: 'player' },
      actions: [{ type: 'walk_to', target: 'tobia' }],
      continue: true,
    });
    done();
    // Walking, the player comes near: no request that would stop the errand.
    perceive(100, 30);
    perceive(170, 5);
    expect(brain.requests).toHaveLength(1);
    done();
    expect(brain.requests[1]!.request.input.triggers).toEqual([
      { kind: 'continue', done: 'say, walk_to tobia' },
    ]);
    await brain.answer(1, {
      say: { text: 'Tobia, piove?', to: 'tobia' },
      actions: [],
      continue: true,
    });
    done();
    await brain.answer(2, { say: null, actions: [], continue: false });
    // Tobia answers aloud, not to Marta: still the answer she waits for.
    message('No, non piove.', 'tobia', null);
    expect(brain.requests[3]!.request.input.triggers).toMatchObject([
      { kind: 'message', from: 'tobia', text: 'No, non piove.' },
    ]);
    await brain.answer(3, say('Torno dal viandante.'));
    // Only once: the next sentence of Tobia aloud is not an answer any more.
    message('Anzi, forse sì.', 'tobia', null);
    expect(brain.requests).toHaveLength(4);
    // A cancelled step of a plan does not go on.
    message('fermati');
    await brain.answer(4, {
      say: null,
      actions: [{ type: 'walk_to', target: 'pozzo' }],
      continue: true,
    });
    message('anzi no');
    runtime.event('marta', { type: 'action_replaced', id: requests.at(-1)!.id });
    expect(brain.requests.at(-1)!.request.input.triggers).toMatchObject([
      { kind: 'message', text: 'anzi no' },
    ]);
  });

  describe('with the task of a scenario', () => {
    function withTask(config: Partial<AgentDecl> = {}) {
      const t = setup(config);
      const events: string[] = [];
      const listener = {
        asked: () => events.push('asked'),
        answered: (o: unknown) => events.push(o ? `outcome ${JSON.stringify(o)}` : 'answered'),
        failed: (reason: string) => events.push(`failed ${reason}`),
      };
      t.runtime.startTask('Vai al pozzo e torna.', listener);
      const done = () =>
        t.runtime.event('marta', { type: 'action_done', id: t.requests.at(-1)!.id });
      return { ...t, events, done };
    }

    it('LAB-002.a: the agent asks at once, without messages and whatever its initiative; the task is in its context', async () => {
      const { brain, events } = withTask({ initiative: 'reactive' });
      expect(brain.requests).toHaveLength(1);
      const { input, text } = brain.requests[0]!.request;
      expect(input.triggers).toEqual([{ kind: 'task' }]);
      expect(input.task).toBe('Vai al pozzo e torna.');
      expect(text).toContain('YOUR TASK:\nVai al pozzo e torna.');
      expect(text).toContain('Add "outcome" to your reply');
      expect(text).toContain('The world has just started: begin your task.');
      expect(events).toEqual(['asked']);
    });

    it('LAB-002.b: when its actions end it is asked again, even without "continue"; a reply without actions too', async () => {
      const { brain, done, events } = withTask();
      await brain.answer(0, { say: null, actions: [{ type: 'walk_to', target: 'pozzo' }] });
      expect(brain.requests).toHaveLength(1);
      done();
      expect(brain.requests[1]!.request.input.triggers).toMatchObject([
        { kind: 'continue', done: 'walk_to pozzo' },
      ]);
      await brain.answer(1, { say: null, actions: [] });
      expect(brain.requests[2]!.request.input.triggers).toMatchObject([
        { kind: 'continue', done: 'nothing: your reply had no actions' },
      ]);
      expect(events).toEqual(['asked', 'answered', 'asked', 'answered', 'asked']);
    });

    it('LAB-002.c, AGENT-003.a: the agent declares the outcome with a reason; the task ends and it goes back to the world file', async () => {
      const { brain, done, events, runtime, message } = withTask();
      await brain.answer(0, {
        say: { text: 'Fatto!', to: null },
        actions: [{ type: 'walk_to', target: 'marta' }],
        outcome: { result: 'succeeded', reason: 'sono tornata dal pozzo' },
      });
      expect(events.at(-1)).toBe(
        'outcome {"result":"succeeded","reason":"sono tornata dal pozzo"}',
      );
      expect(runtime.hasTask).toBe(false);
      done();
      done();
      // No more questions of its own: it is reactive again, as the world file says.
      expect(brain.requests).toHaveLength(1);
      message('Com’è andata?');
      expect(brain.requests[1]!.request.input.task).toBeUndefined();
      expect(brain.requests[1]!.request.input.memory).toContain(
        'you declared your task succeeded: sono tornata dal pozzo',
      );
    });

    it('AGENT-003.a: without a task an outcome is set aside; a scenario ended from outside stops the questions', async () => {
      const plain = setup();
      plain.message('ciao');
      await plain.brain.answer(0, {
        say: null,
        actions: [],
        outcome: { result: 'succeeded', reason: 'x' },
      });
      expect(plain.log).toContain('reply set aside: an outcome, but there is no task');
      const { brain, runtime, done } = withTask();
      await brain.answer(0, { say: null, actions: [{ type: 'walk_to', target: 'pozzo' }] });
      runtime.endTask();
      done();
      expect(brain.requests).toHaveLength(1);
    });

    it('LAB-002.c: a failed request is counted, and the same question is asked again', async () => {
      const { brain, events, clock } = withTask();
      brain.requests[0]!.reject(new Error('HTTP 529'));
      await clock.advance(0);
      expect(events).toEqual(['asked', 'failed HTTP 529', 'asked']);
      expect(brain.requests[1]!.request.input.triggers).toEqual([{ kind: 'task' }]);
    });
  });
});
