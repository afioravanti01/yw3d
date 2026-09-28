import {
  HEARING_DISTANCE,
  MAX_SAY_LENGTH,
  type ActionRequest,
  type AgentEvent,
  type Perception,
} from '../../core/agents/agentWorld';
import type { WorldMap } from '../../core/map/worldMap';
import type { AgentDecl } from '../../core/yaml/worldFile';
import type { Brain, Thought, Usage } from './brain';
import { buildContext, type AgentIdentity, type AgentTrigger, type ContextInput } from './context';
import { LONG_SAY_LENGTH, readReply, Sequence, type Outcome, type Step } from './reply';

/**
 * An agent drives its character from the host (AGENT-003–006, plan F08 P1, P8–P10): it listens
 * to the events and the perception of the character, asks its brain when something calls for
 * it, one request at a time, within a time limit and a rate, and runs the reply. The world
 * never waits for it: every request runs aside, and only its reply touches the character.
 */

/** Time limits of a request, milliseconds (Q4). */
export const TIME_LIMIT_MS = { headless: 60_000, api: 30_000, fake: 5_000 } as const;
/** Requests per minute of an agent (Q4). */
export const MAX_REQUESTS_PER_MINUTE = 6;
/** Recent events kept in the memory (plan F08 P10). */
export const MEMORY_SIZE = 12;
/** The player is near within this distance, and far beyond HEARING_DISTANCE (Q1). */
export const NEAR_DISTANCE = 8;
/** How long the player must have been far to be greeted again, seconds (Q1). */
export const AWAY_SECONDS = 60;
/** How long an agent waits for the answer of someone it spoke to, seconds (A8.4). */
export const ANSWER_SECONDS = 60;

export type AgentState = 'idle' | 'thinking' | 'acting' | 'stopped' | 'error';

/** What the overlay shows of an agent (DEBUG-001.a, plan F08 P14). */
export interface AgentStatus {
  readonly mode: AgentDecl['mode'];
  readonly brain: string;
  readonly model: string | null;
  readonly state: AgentState;
  /** Duration of the last request, milliseconds; null before the first. */
  readonly last_ms: number | null;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Who follows the task of a scenario (LAB-002, plan F10 P5): the requests made for it, their
 * answers with the outcome when the agent declares one, and the failed requests.
 */
export interface TaskListener {
  asked(): void;
  answered(outcome: Outcome | undefined): void;
  failed(reason: string): void;
}

/** What an agent does, for the trace of a run (LAB-005.a, plan F10 P8). */
export type AgentActivity =
  | {
      readonly kind: 'request';
      readonly n: number;
      readonly triggers: readonly AgentTrigger[];
      readonly context: string;
    }
  | {
      readonly kind: 'reply';
      readonly n: number;
      /** The reply as the brain gave it: an object, or the text the JSON was read from. */
      readonly raw: unknown;
      readonly usage: Usage;
      readonly latency_ms: number;
      readonly steps: readonly Step[];
      readonly discarded: readonly string[];
      readonly outcome: Outcome | null;
    }
  | {
      readonly kind: 'failed';
      readonly n: number;
      readonly reason: string;
      readonly latency_ms: number;
    }
  | { readonly kind: 'action'; readonly request: ActionRequest }
  | { readonly kind: 'action_end'; readonly event: AgentEvent };

export interface AgentHost {
  /** Asks an action of the character (PROTO-001.b). */
  request(request: ActionRequest): void;
  /** The map of the world now running. */
  map(): WorldMap;
  /** Whether an id is another agent, for the limit of exchanges between agents. */
  isAgent(id: string): boolean;
  /** Whether an id is a character of the world. */
  isCharacter(id: string): boolean;
  /** Lines of a conversation between agents without the player (AGENT-004.c, A8.6). */
  conversationTurns(): number;
  /** A line in the terminal of the host, with the character's id. */
  log(line: string): void;
  /** What the agent does, for the trace of a run (LAB-005.a). */
  observe?(activity: AgentActivity): void;
}

export class AgentRuntime {
  private stateNow: AgentState = 'idle';
  private lastMs: number | null = null;
  private seen: Perception | undefined;
  private pending: AgentTrigger[] = [];
  private thinking: AbortController | undefined;
  private sequence: Sequence | undefined;
  private readonly memory: string[] = [];
  private readonly requestTimes: number[] = [];
  private retry: unknown;
  /** Lines of the conversation with other agents since the player last took part (A8.6). */
  private agentExchanges = 0;
  /** Since when the player is far, seconds of the world; -Infinity: never seen near. */
  private playerFarSince = -Infinity;
  private playerNear = false;
  private lastAutonomous = 0;
  /** Characters it spoke to, and until when their answer counts as one to it (A8.4). */
  private readonly awaiting = new Map<string, number>();
  private nextId = 0;
  private stopped = false;
  /** Requests made so far, to number them in the trace. */
  private requestCount = 0;
  /** The task of a scenario, while it runs (LAB-002). */
  private task: { readonly text: string; readonly listener: TaskListener } | undefined;

  constructor(
    readonly id: string,
    private readonly identity: AgentIdentity,
    private readonly config: AgentDecl,
    private readonly brain: Brain,
    private readonly host: AgentHost,
    private readonly clock: Clock = realClock,
  ) {}

  get status(): AgentStatus {
    return {
      mode: this.config.mode,
      brain: this.brain.name,
      model: this.config.model ?? null,
      state: this.stateNow,
      last_ms: this.lastMs,
    };
  }

  /** An event of the character (PROTO-002.b). */
  event(_: string, event: AgentEvent): void {
    if (this.stopped) return;
    if (
      event.type === 'action_done' ||
      event.type === 'action_failed' ||
      event.type === 'action_replaced'
    ) {
      this.host.observe?.({ kind: 'action_end', event });
    }
    this.sequence?.event(event);
    if (event.type === 'heard') this.heard(event);
    else if (event.type === 'interacted') {
      this.agentExchanges = 0;
      this.trigger({ kind: 'interact' });
    }
  }

  /** The perception of the character, 4 times a second (PROTO-002.a). */
  perception(_: string, perception: Perception): void {
    if (this.stopped) return;
    const first = !this.seen;
    this.seen = perception;
    const player = perception.nearby.find((e) => e.kind === 'player');
    const time = perception.time;
    // A player already near at the start was never away: no greeting for that (Q1).
    if (first && player && player.distance <= HEARING_DISTANCE) this.playerFarSince = time;
    if (first) this.ask();
    // The player coming near after being far for a while (Q1).
    if (!player || player.distance > HEARING_DISTANCE) {
      if (this.playerNear) this.playerFarSince = time;
      this.playerNear = false;
    } else if (player.distance <= NEAR_DISTANCE && !this.playerNear) {
      this.playerNear = true;
      if (time - this.playerFarSince >= AWAY_SECONDS) {
        this.agentExchanges = 0;
        this.trigger({ kind: 'near', who: player.id, whoName: player.name ?? player.id });
      }
    }
    // Autonomy: now and then, when it has nothing to do (AGENT-004.b).
    if (
      this.config.initiative === 'autonomous' &&
      time - this.lastAutonomous >= this.config.every &&
      !this.thinking &&
      this.pending.length === 0 &&
      (!this.sequence || this.sequence.finished)
    ) {
      this.lastAutonomous = time;
      this.trigger({ kind: 'autonomous' });
    }
  }

  /**
   * Gives the agent the task of a scenario (LAB-002.a): it asks its brain at once, whatever its
   * initiative, and again whenever its actions end, until it declares the outcome or the task
   * is ended from outside.
   */
  startTask(text: string, listener: TaskListener): void {
    if (this.stopped) return;
    this.task = { text, listener };
    this.trigger({ kind: 'task' });
  }

  /** The scenario ended without the agent (time limit, steps, errors): back to the world file. */
  endTask(): void {
    this.task = undefined;
    this.pending = this.pending.filter((t) => t.kind !== 'task' && t.kind !== 'continue');
  }

  /** Whether the agent is working on a task now. */
  get hasTask(): boolean {
    return this.task !== undefined;
  }

  stop(): void {
    this.stopped = true;
    this.stateNow = 'stopped';
    this.thinking?.abort();
    this.sequence?.cancel();
    if (this.retry !== undefined) this.clock.clearTimeout(this.retry);
  }

  private heard(event: Extract<AgentEvent, { type: 'heard' }>): void {
    const map = this.host.map();
    const nameOf = (id: string) => map.entries.find((e) => e.id === id)?.name ?? id;
    const to = event.to ?? null;
    this.remember(
      `t=${Math.round(this.seen?.time ?? 0)}s ${nameOf(event.from)} → ${
        to === this.id ? 'you' : to ? nameOf(to) : 'everyone'
      }: ${event.text}`,
    );
    // Only messages to it make it think (Q1), and the answer of someone it just spoke to (A8.4).
    const now = this.seen?.time ?? 0;
    const answer = (this.awaiting.get(event.from) ?? -Infinity) >= now;
    if (to !== this.id && !answer) return;
    this.awaiting.delete(event.from);
    let turnsLeft: number | undefined;
    if (this.host.isAgent(event.from)) {
      // A conversation between agents lasts the lines the world allows (AGENT-004.c, A8.6).
      const turns = this.host.conversationTurns();
      if (this.agentExchanges >= turns) return;
      this.agentExchanges++;
      turnsLeft = turns - this.agentExchanges;
    } else {
      this.agentExchanges = 0;
    }
    this.trigger({
      kind: 'message',
      from: event.from,
      fromName: nameOf(event.from),
      to,
      text: event.text,
      ...(turnsLeft !== undefined ? { turnsLeft } : {}),
    });
  }

  private trigger(trigger: AgentTrigger): void {
    // Someone coming near, or the autonomy, does not interrupt what the agent is doing.
    const busy = this.thinking !== undefined || (this.sequence && !this.sequence.finished);
    if ((trigger.kind === 'near' || trigger.kind === 'autonomous') && busy) return;
    this.pending.push(trigger);
    this.ask();
  }

  /** Starts a request, if none is running and the rate allows it (AGENT-006.b, d). */
  private ask(): void {
    if (this.stopped || this.thinking || this.pending.length === 0 || this.retry !== undefined) {
      return;
    }
    // Before its first perception the agent does not know where it is: it waits for it.
    if (!this.seen) return;
    const now = this.clock.now();
    while (this.requestTimes.length > 0 && now - this.requestTimes[0]! >= 60_000) {
      this.requestTimes.shift();
    }
    if (this.requestTimes.length >= MAX_REQUESTS_PER_MINUTE) {
      this.retry = this.clock.setTimeout(
        () => {
          this.retry = undefined;
          this.ask();
        },
        60_000 - (now - this.requestTimes[0]!),
      );
      return;
    }
    this.requestTimes.push(now);
    this.task?.listener.asked();
    const triggers = this.pending;
    this.pending = [];
    const input = this.contextInput(triggers);
    const text = buildContext(input);
    const n = ++this.requestCount;
    this.host.observe?.({ kind: 'request', n, triggers, context: text });
    const controller = new AbortController();
    this.thinking = controller;
    this.stateNow = 'thinking';
    const limit = TIME_LIMIT_MS[this.config.mode];
    const timer = this.clock.setTimeout(() => controller.abort(), limit);
    const started = now;
    const aborted = new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () =>
        reject(new Error(`no reply within ${limit / 1000} s`)),
      ),
    );
    Promise.race([this.brain.think({ text, input }, controller.signal), aborted])
      .then(
        (thought) => this.answered(thought, n, this.clock.now() - started),
        (error: unknown) => {
          this.host.observe?.({
            kind: 'failed',
            n,
            reason: error instanceof Error ? error.message : String(error),
            latency_ms: this.clock.now() - started,
          });
          this.failed(error, triggers);
        },
      )
      .finally(() => {
        this.clock.clearTimeout(timer);
        this.lastMs = this.clock.now() - started;
        if (this.thinking === controller) this.thinking = undefined;
        this.ask();
      });
  }

  private contextInput(triggers: AgentTrigger[]): ContextInput {
    const p = this.seen;
    return {
      identity: this.identity,
      map: this.host.map(),
      self: p ? { x: p.self.x, y: p.self.y, z: p.self.z } : { x: 0, y: 0, z: 0 },
      nearby: p?.nearby ?? [],
      time: p?.time ?? 0,
      timeOfDay: p?.time_of_day,
      partOfDay: p?.part_of_day,
      memory: [...this.memory],
      triggers,
      ...(this.task ? { task: this.task.text } : {}),
    };
  }

  /** The brain answered: the valid part runs, in place of what the character was doing. */
  private answered(thought: Thought, n: number, latency: number): void {
    if (this.stopped) return;
    const raw = thought.reply;
    const map = this.host.map();
    const known = new Set([...map.entries.map((e) => e.id), 'player']);
    const reply = readReply(
      raw,
      known,
      this.config.answers === 'long' ? LONG_SAY_LENGTH : MAX_SAY_LENGTH,
    );
    for (const reason of reply.discarded) this.host.log(`reply set aside: ${reason}`);
    this.host.observe?.({
      kind: 'reply',
      n,
      raw,
      usage: thought.usage,
      latency_ms: latency,
      steps: reply.steps,
      discarded: reply.discarded,
      outcome: reply.outcome ?? null,
    });
    // The task goes on, or ends with the outcome the agent declares (LAB-002.c). The scenario
    // hears of it once the steps of this reply have started: its last sentence comes first.
    const task = this.task;
    if (task && reply.outcome) {
      this.task = undefined;
      this.remember(`you declared your task ${reply.outcome.result}: ${reply.outcome.reason}`);
    } else if (!task && reply.outcome) {
      this.host.log('reply set aside: an outcome, but there is no task');
    }
    const notify = () => task?.listener.answered(reply.outcome);
    if (reply.steps.length === 0) {
      this.stateNow = 'idle';
      notify();
      // A task is never left waiting: without actions the agent is asked again (plan F10 P5).
      if (this.task) this.trigger({ kind: 'continue', done: 'nothing: your reply had no actions' });
      return;
    }
    for (const step of reply.steps) {
      if (step.kind !== 'say') continue;
      this.remember(`you said${step.to ? ` to ${step.to}` : ''}: ${step.text}`);
      if (step.to && step.to !== 'player' && this.host.isCharacter(step.to)) {
        this.awaiting.set(step.to, (this.seen?.time ?? 0) + ANSWER_SECONDS);
        // Its own lines to an agent count in the conversation too (A8.6).
        if (this.host.isAgent(step.to)) this.agentExchanges++;
      }
    }
    // With a task the agent decides again when its actions end, asked or not (LAB-002.b).
    this.run(reply.steps, reply.continueAfter === true, this.task !== undefined);
    notify();
  }

  private failed(error: unknown, triggers: readonly AgentTrigger[]): void {
    if (this.stopped) return;
    const message = error instanceof Error ? error.message : String(error);
    this.host.log(`the request to ${this.brain.name} failed: ${message}`);
    this.stateNow = 'error';
    if (this.task) {
      // The scenario counts the failure; if the task goes on, the same question is asked again.
      this.task.listener.failed(message);
      if (this.task) this.pending.unshift(...triggers);
      return;
    }
    // Silence, or the fallback sentence of the world file (Q4).
    if (this.config.fallback) this.run([{ kind: 'say', text: this.config.fallback }]);
  }

  /**
   * Runs the steps of a reply. `continueAfter`: the agent asked to decide again at the end;
   * `forTask`: it will be asked anyway, if its task still runs then (LAB-002.b).
   */
  private run(steps: readonly Step[], continueAfter = false, forTask = false): void {
    this.sequence?.cancel();
    this.stateNow = 'acting';
    const done = steps.map((s) => ('target' in s ? `${s.kind} ${s.target}` : s.kind)).join(', ');
    const sequence = new Sequence(
      steps,
      (request) => {
        this.host.observe?.({ kind: 'action', request });
        this.host.request(request);
      },
      () => `agent-${++this.nextId}`,
      ({ failed, cancelled }) => {
        if (failed) this.remember(`your ${failed.step.kind} failed: ${failed.reason}`);
        if (this.sequence === sequence && this.stateNow === 'acting') this.stateNow = 'idle';
        // A step of a longer plan: the agent decides the next one (A8.5).
        const again = continueAfter || (forTask && this.task !== undefined);
        if (again && !cancelled && this.sequence === sequence) {
          this.trigger({
            kind: 'continue',
            done,
            ...(failed ? { failed: `${failed.step.kind} failed: ${failed.reason}` } : {}),
          });
        }
      },
    );
    this.sequence = sequence;
    sequence.start();
  }

  private remember(line: string): void {
    this.memory.push(line);
    if (this.memory.length > MEMORY_SIZE) this.memory.shift();
  }
}
