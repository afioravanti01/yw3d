import { describe, expect, it } from 'vitest';
import type { ActionRequest, AgentEvent } from '../../core/agents/agentWorld';
import { composeWorld } from '../../core/compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import { Simulation } from '../../core/sim/simulation';
import { createDefaultStructures } from '../../core/structures/builtin';
import type { World } from '../../core/world/world';
import { extractJson, readReply, Sequence, type Step } from './reply';

const KNOWN = new Set(['laghetto1', 'piazza', 'player', 'tobia']);

describe('the reply of an LLM', () => {
  it('AGENT-003.a: a sentence and up to five actions become steps, in order', () => {
    const reply = readReply(
      {
        say: { text: 'Seguimi, ti porto al laghetto!', to: 'player' },
        actions: [
          { type: 'look_at', target: 'player', x: null, z: null, distance: null, seconds: null },
          { type: 'walk_to', target: 'laghetto1' },
          { type: 'walk_to', target: null, x: 12.5, z: 40 },
          { type: 'follow', target: 'tobia', distance: 50 },
          { type: 'wait', seconds: 2 },
        ],
      },
      KNOWN,
    );
    expect(reply).toEqual({
      steps: [
        { kind: 'say', text: 'Seguimi, ti porto al laghetto!', to: 'player' },
        { kind: 'look_at', target: 'player' },
        { kind: 'walk_to', target: 'laghetto1' },
        { kind: 'walk_to', x: 12.5, z: 40 },
        { kind: 'follow', target: 'tobia', distance: 32 },
        { kind: 'wait', seconds: 2 },
      ],
      discarded: [],
    });
    expect(readReply({ say: null, actions: [] }, KNOWN)).toEqual({ steps: [], discarded: [] });
  });

  it('AGENT-003.b: the valid part runs, the rest is set aside with its reason; JSON is found inside a text', () => {
    const text =
      'Ecco la risposta:\n```json\n{"say": {"text": "Vengo con te!", "to": "nessuno"}, "actions": [{"type": "move", "target": "player"}, {"type": "walk_to", "target": "fontana"}, {"type": "walk_to"}, {"type": "stop"}, {"type": "wait"}, {"type": "stop"}, {"type": "stop"}]}\n```';
    expect(extractJson(text)).toMatchObject({ say: { text: 'Vengo con te!' } });
    expect(readReply(text, KNOWN)).toEqual({
      steps: [{ kind: 'stop' }],
      discarded: [
        'say: unknown addressee "nessuno"',
        'actions[0]: unknown action "move"',
        'actions[1]: walk_to: unknown target "fontana"',
        'actions[2]: walk_to: needs a target or x and z',
        'actions[4]: wait: needs seconds',
        'actions[5]: more than 5 actions',
        'actions[6]: more than 5 actions',
      ],
    });
    expect(readReply('Non so rispondere.', KNOWN)).toEqual({
      steps: [],
      discarded: ['the reply is not a JSON object'],
    });
    expect(readReply('{"say": "x" ', KNOWN).discarded).toEqual(['the reply is not a JSON object']);
  });

  it('AGENT-003.a, AGENT-003.c: the steps run one after the other; a failure or a cancel ends the sequence', () => {
    const requests: ActionRequest[] = [];
    const endings: unknown[] = [];
    let n = 0;
    const steps: Step[] = [
      { kind: 'say', text: 'Andiamo' },
      { kind: 'walk_to', target: 'laghetto1' },
      { kind: 'wait', seconds: 1 },
    ];
    const run = new Sequence(
      steps,
      (r) => requests.push(r),
      () => `a${++n}`,
      (o) => endings.push(o),
    );
    run.start();
    expect(requests).toEqual([{ kind: 'say', text: 'Andiamo', id: 'a1' }]);
    run.event({ type: 'action_done', id: 'other' } as AgentEvent);
    expect(requests).toHaveLength(1);
    run.event({ type: 'action_done', id: 'a1' });
    expect(requests.at(-1)).toEqual({ kind: 'walk_to', target: 'laghetto1', id: 'a2' });
    run.event({ type: 'action_failed', id: 'a2', reason: 'no path' });
    expect(endings).toEqual([{ failed: { step: steps[1], reason: 'no path' } }]);
    expect(run.finished).toBe(true);
    // A new reply cancels the one in progress.
    const second = new Sequence(
      steps,
      () => {},
      () => 'b',
      (o) => endings.push(o),
    );
    second.start();
    second.cancel();
    expect(endings.at(-1)).toEqual({});
  });

  it('AGENT-003.a: the steps move the character through the actions of the world', () => {
    const world = `version: 2
name: T
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
places:
  - { id: pozzo, name: Pozzo, at: [40, 30] }
characters:
  - { id: marta, name: Marta, at: [30, 30] }
`;
    const result = composeWorld(world, 'w.yaml', { registry: createDefaultStructures() });
    const lines: string[] = [];
    const sim = new Simulation(result as typeof result & { world: World }, {
      heard: (l) => lines.push(`${l.from}: ${l.text}`),
    });
    let ended = false;
    let n = 0;
    const run = new Sequence(
      [
        { kind: 'say', text: 'Vado al pozzo.' },
        { kind: 'walk_to', target: 'pozzo' },
      ],
      (r) => sim.agents.request('marta', r),
      () => `s${++n}`,
      () => (ended = true),
    );
    sim.attach('marta', { event: (_, e) => run.event(e), perception: () => {} });
    run.start();
    for (let i = 0; i < 60 * 20 && !ended; i++) sim.step();
    expect(ended).toBe(true);
    expect(lines).toEqual(['marta: Vado al pozzo.']);
    const marta = sim.agents.stateOf('marta')!;
    expect(Math.hypot(marta.x - 40.5, marta.z - 30.5)).toBeLessThanOrEqual(1.8);
  });
});
