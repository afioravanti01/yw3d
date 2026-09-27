import { describe, expect, it } from 'vitest';
import { behaviorHarness } from './testing';

/** Places on the flat test world; characters are added by each test. */
const PLACES = `places:
  - { id: a, name: Punto A, at: [20, 20] }
  - { id: b, name: Punto B, at: [40, 20] }
  - { id: c, name: Punto C, at: [40, 50] }
  - { id: orto, name: Orto, area: { rect: { from: [60, 30], to: [70, 40] } } }
`;

/** A character with a behavior, as YAML under `characters:`. */
function character(id: string, at: [number, number], behavior = ''): string {
  const body = behavior.trim();
  const lines = [
    `  - id: ${id}`,
    `    name: ${id[0]!.toUpperCase()}${id.slice(1)}`,
    `    at: [${at[0]}, ${at[1]}]`,
  ];
  if (body) {
    lines.push('    behavior:', ...body.split('\n').map((l) => `      ${l}`));
  }
  return `${lines.join('\n')}\n`;
}

const world = (...characters: string[]) => `${PLACES}characters:\n${characters.join('')}`;

describe('routine and reactions', () => {
  it('BEHAV-002.a: the routine runs its instructions in order and starts again', () => {
    const h = behaviorHarness(
      world(character('tobia', [20, 20], 'routine:\n  - say: uno\n  - say: due')),
    );
    h.run(6);
    expect(h.said('tobia').slice(0, 4)).toEqual(['uno', 'due', 'uno', 'due']);
  });

  it('BEHAV-002.a: a routine that runs once leaves the character still, with its reactions', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'repeat: false\nroutine:\n  - say: uno\n  - say: due\nreactions:\n  - on: interacted\n    do: [{ say: eh? }]',
        ),
      ),
      { player: [21, 20] },
    );
    h.run(8);
    expect(h.said('tobia')).toEqual(['uno', 'due']);
    h.agents.interact();
    h.run(2);
    expect(h.said('tobia')).toEqual(['uno', 'due', 'eh?']);
  });

  it('BEHAV-002.b: instructions are the actions of the protocol with their fields; follow lasts its time', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 22],
          'routine:\n  - walk_to: b\n    speed: 3\n  - follow: marta\n    distance: 2\n    for: 3s\n  - say: basta\n  - wait: 100',
        ),
        character('marta', [40, 30], 'routine:\n  - walk_to: c\n  - wait: 100'),
      ),
    );
    h.until(() => h.said('tobia').length > 0, 30);
    const [walk, follow, stop] = h.requests.filter((r) => r.by === 'tobia');
    expect(walk).toMatchObject({ kind: 'walk_to', target: 'b', speed: 3 });
    expect(follow).toMatchObject({ kind: 'follow', target: 'marta', distance: 2 });
    expect(stop).toMatchObject({ kind: 'stop' });
    // The follow lasted its 3 seconds, then the next instruction came.
    expect(stop!.at - follow!.at).toBeCloseTo(3, 1);
    expect(h.saidAt('tobia', 'basta')[0]! - follow!.at).toBeCloseTo(3, 1);
  });

  it('BEHAV-002.c: a reaction interrupts the routine; then the interrupted instruction starts again', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'routine:\n  - walk_to: b\n  - say: arrivato\n  - wait: 100\nreactions:\n  - on: interacted\n    do: [{ say: un momento }]',
        ),
      ),
      { player: [21, 20] },
    );
    h.run(0.3);
    h.agents.interact();
    h.until(() => h.said('tobia').includes('arrivato'), 30);
    expect(h.requests.filter((r) => r.by === 'tobia').map((r) => r.kind)).toEqual([
      'walk_to',
      'stop',
      'say',
      'walk_to',
      'say',
    ]);
    expect(h.said('tobia')).toEqual(['un momento', 'arrivato']);
    expect(Math.hypot(h.state('tobia').x - 40.5, h.state('tobia').z - 20.5)).toBeLessThanOrEqual(1);
  });

  it('BEHAV-002.c: the interrupted instruction starts again also inside a branch', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'memory: { flags: [via] }\nroutine:\n  - set: via\n  - if: { flag: via }\n    then:\n      - walk_to: b\n      - say: fine del ramo\n  - wait: 100\nreactions:\n  - on: interacted\n    do: [{ say: un momento }]',
        ),
      ),
      { player: [21, 20] },
    );
    h.run(0.3);
    h.agents.interact();
    h.until(() => h.said('tobia').includes('fine del ramo'), 30);
    expect(h.said('tobia')).toEqual(['un momento', 'fine del ramo']);
    expect(h.requests.filter((r) => r.by === 'tobia' && r.kind === 'walk_to')).toHaveLength(2);
  });

  it('BEHAV-002.d: reactions have the priority of their order; a less important event is ignored', () => {
    // First: B (less important) is running when A comes, and A interrupts it for good.
    const interrupting = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'reactions:\n  - on: interacted\n    do: [{ say: A }]\n  - on: { after: 1s }\n    do: [{ say: B }, { wait: 5s }, { say: B di nuovo }]',
        ),
      ),
      { player: [21, 20] },
    );
    interrupting.run(2);
    interrupting.agents.interact();
    interrupting.run(10);
    expect(interrupting.said('tobia')).toEqual(['B', 'A']);

    // Then: while A runs, B cannot interrupt it and is lost, as a second A.
    const ignoring = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'reactions:\n  - on: interacted\n    do: [{ say: A }, { wait: 3s }]\n  - on: { after: 1s }\n    do: [{ say: B }]',
        ),
      ),
      { player: [21, 20] },
    );
    ignoring.run(0.5);
    ignoring.agents.interact();
    ignoring.run(1);
    ignoring.agents.interact();
    ignoring.run(8);
    expect(ignoring.said('tobia')).toEqual(['A']);
  });

  it('BEHAV-002.e: a reaction at most once in an interval, or only once', () => {
    const run = (limit: string) => {
      const h = behaviorHarness(
        world(
          character(
            'tobia',
            [20, 20],
            `reactions:\n  - on: interacted\n    ${limit}\n    do: [{ say: ciao }]`,
          ),
        ),
        { player: [21, 20] },
      );
      for (const t of [0.5, 3, 5, 12]) {
        h.until(() => h.agents.time >= t, 20);
        h.agents.interact();
      }
      h.run(2);
      return h.said('tobia').length;
    };
    expect(run('every: 10s')).toBe(2);
    expect(run('once: true')).toBe(1);
    expect(run('every: 1s')).toBe(4);
  });

  it('BEHAV-002.f: a failed action runs its failure branch, or the next instruction; the terminal says why', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'routine:\n  - walk_to: [500, 500]\n    on_fail:\n      - say: non posso\n  - walk_to: [600, 20]\n  - say: avanti\n  - wait: 100',
        ),
      ),
    );
    h.run(6);
    expect(h.said('tobia')).toEqual(['non posso', 'avanti']);
    expect(h.log).toEqual([
      '[tobia] w.yaml:15: walk_to failed: the destination is outside the world',
      '[tobia] w.yaml:18: walk_to failed: the destination is outside the world',
    ]);
  });

  it('BEHAV-002.g: a behavior never blocks the simulation: at most 100 instant instructions per step', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'memory: { counters: [n] }\nroutine:\n  - count: n\n  - if: { counter: n, equals: 250 }\n    then: [{ say: duecentocinquanta }]',
        ),
        character('marta', [30, 20], 'routine:\n  - walk_to: c\n  - wait: 100'),
      ),
    );
    // 2 instant instructions a turn: 50 turns per step, 250 after 5 steps.
    h.run(4 / 60);
    expect(h.said('tobia')).toEqual([]);
    h.run(2 / 60);
    expect(h.said('tobia')).toEqual(['duecentocinquanta']);
    expect(h.log).toEqual([
      '[tobia] more than 100 instructions without actions in one step (w.yaml:16): a loop that never waits?',
    ]);
    // The rest of the world goes on.
    h.run(2);
    expect(h.state('marta').z).toBeGreaterThan(22);
  });
});

describe('states', () => {
  const STATES = `start: giro
states:
  giro:
    routine:
      - say: giro
      - goto: riposo
    reactions:
      - on: interacted
        do: [{ say: sono in giro }]
  riposo:
    routine:
      - say: riposo
      - wait: 2s
      - goto: giro
reactions:
  - on: interacted
    do: [{ say: comune }]
  - on: { heard: { from: marta } }
    do: [{ goto: riposo }]`;

  it('BEHAV-003.a, BEHAV-003.b: states with routines; goto starts the routine of the other state', () => {
    const h = behaviorHarness(
      world(character('tobia', [20, 20], STATES), character('marta', [60, 60])),
    );
    h.run(8);
    expect(h.said('tobia').slice(0, 4)).toEqual(['giro', 'riposo', 'giro', 'riposo']);
    expect(h.behaviors.activity('tobia')?.state).toMatch(/giro|riposo/);
  });

  it('BEHAV-003.b: a change of state interrupts what runs and starts from the beginning', () => {
    const h = behaviorHarness(
      world(
        character('tobia', [20, 20], STATES),
        character('marta', [24, 20], 'repeat: false\nroutine:\n  - wait: 0.5s\n  - say: fermati'),
      ),
    );
    h.until(() => h.said('marta').length > 0, 5);
    h.run(0.1);
    // Marta spoke while Tobia said «giro»: Tobia goes to riposo and starts its routine.
    expect(h.said('tobia')).toEqual(['giro', 'riposo']);
    expect(h.behaviors.activity('tobia')?.state).toBe('riposo');
  });

  it('BEHAV-003.c: the reactions outside the states hold in all of them, after the state ones', () => {
    const h = behaviorHarness(
      world(character('tobia', [20, 20], STATES), character('marta', [60, 60])),
      {
        player: [21, 20],
      },
    );
    h.until(() => h.behaviors.activity('tobia')?.state === 'riposo', 5);
    h.agents.interact();
    h.until(() => h.behaviors.activity('tobia')?.state === 'giro', 10);
    h.run(0.1);
    h.agents.interact();
    h.run(2);
    expect(h.said('tobia').filter((t) => t === 'comune' || t === 'sono in giro')).toEqual([
      'comune',
      'sono in giro',
    ]);
  });
});

describe('events, conditions and memory', () => {
  it('BEHAV-004.a: sentences heard, filtered by who speaks; interaction of the player', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'reactions:\n  - on: { heard: { from: marta } }\n    do: [{ say: "ciao {speaker}" }]\n  - on: { heard: { from: player } }\n    do: [{ say: ciao viandante }]',
        ),
        character('marta', [25, 20], 'repeat: false\nroutine:\n  - say: buongiorno'),
      ),
    );
    h.run(3);
    expect(h.said('tobia')).toEqual(['ciao Marta']);
  });

  it('BEHAV-004.a: entering and leaving a radius or an area fire when it happens, not while it lasts', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [40, 24],
          'reactions:\n  - on: { near: marta, within: 6 }\n    do: [{ say: vicino }]\n  - on: { away: marta, within: 6 }\n    do: [{ say: lontano }]\n  - on: { enter: orto, who: marta }\n    do: [{ say: dentro }]\n  - on: { leave: orto, who: marta }\n    do: [{ say: fuori }]',
        ),
        character(
          'marta',
          [10, 20],
          'repeat: false\nroutine:\n  - walk_to: b\n  - wait: 3s\n  - walk_to: orto\n  - wait: 3s\n  - walk_to: c',
        ),
      ),
    );
    h.run(60);
    expect(h.said('tobia')).toEqual(['vicino', 'lontano', 'dentro', 'fuori']);
  });

  it('BEHAV-004.a: time spent in the current state', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [20, 20],
          'reactions:\n  - on: { after: 2s }\n    do: [{ say: sono passati due secondi }]',
        ),
      ),
    );
    h.run(5);
    expect(h.saidAt('tobia', 'sono passati due secondi')).toHaveLength(1);
    expect(h.saidAt('tobia', 'sono passati due secondi')[0]).toBeCloseTo(2, 1);
  });

  it('BEHAV-004.c, BEHAV-004.d: conditions on flags, counters, distance, areas and chance; memory changed by instructions', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [62, 32],
          `memory: { flags: [f], counters: [n] }
repeat: false
routine:
  - if: { flag: f }
    then: [{ say: f1 }]
  - set: f
  - if: { flag: f }
    then: [{ say: f2 }]
  - unset: f
  - if: { not_flag: f }
    then: [{ say: f3 }]
  - count: n
    add: 5
  - count: n
  - if: [{ counter: n, equals: 6 }, { counter: n, above: 5 }, { counter: n, below: 7 }]
    then: [{ say: n6 }]
  - count: n
    to: 0
  - if: { counter: n, equals: 0 }
    then: [{ say: n0 }]
  - if: { near: marta, within: 5 }
    then: [{ say: marta vicina }]
    else: [{ say: marta lontana }]
  - if: { inside: orto }
    then: [{ say: sono nell'orto }]
  - if: { inside: orto, who: marta }
    else: [{ say: marta fuori }]
  - if: { chance: 1 }
    then: [{ say: sempre }]
  - if: { chance: 0 }
    then: [{ say: mai }]`,
        ),
        character('marta', [30, 30]),
      ),
    );
    h.run(20);
    expect(h.said('tobia')).toEqual([
      'f2',
      'f3',
      'n6',
      'n0',
      'marta lontana',
      "sono nell'orto",
      'marta fuori',
      'sempre',
    ]);
  });

  it('BEHAV-004.e: chance is deterministic: world seed, character and time', () => {
    const coin =
      'routine:\n  - if: { chance: 0.5 }\n    then: [{ say: testa }]\n    else: [{ say: croce }]';
    const toss = (id: string, seed: number) => {
      const h = behaviorHarness(world(character(id, [20, 20], coin)), { seed });
      h.run(30);
      return h.said(id).join(' ');
    };
    expect(toss('tobia', 5)).toBe(toss('tobia', 5));
    expect(toss('tobia', 5)).not.toBe(toss('marta', 5));
    expect(toss('tobia', 5)).not.toBe(toss('tobia', 6));
    expect(toss('tobia', 5)).toMatch(/testa/);
    expect(toss('tobia', 5)).toMatch(/croce/);
  });

  it('BEHAV-006.c: characters with the same library behavior run it on their own: memory and chance', () => {
    const h = behaviorHarness(
      `${PLACES}behaviors:
  - name: saluta
    params: { saluto: { type: text } }
    memory: { flags: [toccato] }
    routine:
      - if: { flag: toccato }
        then: [{ say: $saluto }]
        else: [{ wait: 1s }]
    reactions:
      - on: interacted
        do: [{ set: toccato }]
characters:
  - { id: anna, name: Anna, at: [20, 20], behavior: { use: saluta, params: { saluto: ciao } } }
  - { id: bruno, name: Bruno, at: [60, 60], behavior: { use: saluta, params: { saluto: salve } } }
`,
      { player: [21, 20] },
    );
    h.run(1);
    h.agents.interact();
    h.run(4);
    expect(h.said('anna').length).toBeGreaterThan(1);
    expect(new Set(h.said('anna'))).toEqual(new Set(['ciao']));
    expect(h.said('bruno')).toEqual([]);
  });
});
