import { describe, expect, it } from 'vitest';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultStructures } from '../structures/builtin';

/** A small valley: header of 13 lines, then the characters (line 14 onwards). */
const HEADER = `version: 2
name: Test
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }
places:
  - { id: piazza, name: Piazza, at: [30, 30] }
  - { id: orto, name: Orto, area: { rect: { from: [80, 20], to: [90, 30] } } }
structures:
  - { type: wooden_hut, id: capanno, name: Capanno, at: [64, 64] }
  - { type: pond, name: Laghetto, at: [64, 100], params: { radius: 8 } }
scatter:
  - { id: bosco, name: Bosco, types: { oak: 1 }, count: 3, minDistance: 5, area: { circle: { center: [100, 60], radius: 12 } } }
characters:
  - { id: marta, name: Marta, at: [50, 44] }
`;

/** A character `tobia` with the given behavior, indented as the value of `behavior:`. */
const withBehavior = (behavior: string) =>
  `${HEADER}  - id: tobia\n    name: Tobia\n    at: [40, 40]\n    behavior:\n${behavior
    .trim()
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n')}\n`;

const compose = (text: string) =>
  composeWorld(text, 'valle/world.yaml', { registry: createDefaultStructures() });

const errors = (behavior: string) =>
  compose(withBehavior(behavior)).diagnostics.map((d) => ({
    line: d.line,
    path: d.path,
    message: d.message,
  }));

const B = 'characters[1].behavior';

describe('compiling behaviors', () => {
  it('BEHAV-001.c: a valid behavior compiles into a program the character carries', () => {
    const result = compose(
      withBehavior(`
memory: { flags: [salutato], counters: [domande] }
routine:
  - walk_to: piazza
  - walk_to: [100, 20]
    speed: 2
  - say: Buongiorno!
  - wait: 5s
  - if: { not_flag: salutato }
    then:
      - set: salutato
      - count: domande
reactions:
  - on: interacted
    do:
      - look_at: player
      - say: Ciao {player}!
  - on: { near: player, within: 8 }
    every: 30s
    do:
      - follow: player
        for: 1min
`),
    );
    expect(result.diagnostics).toEqual([]);
    const tobia = result.characters.find((c) => c.id === 'tobia')!;
    const program = tobia.behavior!;
    expect(program.start).toBe('main');
    expect(program.flags).toEqual(['salutato']);
    expect(program.counters).toEqual(['domande']);
    const [main] = program.states;
    expect(main!.routine.map((i) => i.definition.name)).toEqual([
      'walk_to',
      'walk_to',
      'say',
      'wait',
      'if',
    ]);
    expect(main!.routine[1]!.args).toMatchObject({
      main: { kind: 'point', x: 100.5, z: 20.5 },
      speed: 2,
    });
    expect(main!.routine[3]!.args.main).toBe(5);
    expect(main!.routine[0]!.where).toBe('valle/world.yaml:20');
    expect(main!.reactions.map((r) => r.event.definition.name)).toEqual(['interacted', 'near']);
    expect(main!.reactions[1]!).toMatchObject({ every: 30, once: false });
    expect(main!.reactions[1]!.body[0]!.args).toMatchObject({ distance: 3, for: 60 });
    // Characters without a behavior have none.
    expect(result.characters.find((c) => c.id === 'marta')!.behavior).toBeUndefined();
  });

  it('BEHAV-001.c: errors carry the file, the line and the path of the field', () => {
    expect(errors('routine:\n  - wlak_to: piazza')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].wlak_to`,
        message: expect.stringMatching(
          /^unknown instruction \(did you mean "walk_to"\?\): expected one of /,
        ),
      },
    ]);
    expect(errors('routine:\n  - say: Ciao\n    loud: true')).toEqual([
      { line: 20, path: `${B}.routine[0].loud`, message: 'unknown field of say' },
    ]);
    expect(errors('routine:\n  - wait: forever')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].wait`,
        message: 'expected a duration in seconds, such as 5 or "30s" or "2min", got "forever"',
      },
    ]);
    expect(errors('routine:\n  - walk_to: piazza\n    speed: 20')).toEqual([
      { line: 20, path: `${B}.routine[0].speed`, message: '20 is out of range: between 0.5 and 7' },
    ]);
    expect(errors('routine:\n  - follow: player')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].for`,
        message: 'missing required field: a duration',
      },
    ]);
    expect(errors('routine:\n  - say: Ciao {nome}')[0]).toMatchObject({
      path: `${B}.routine[0].say`,
      message: expect.stringContaining('unknown name {nome} in the text'),
    });
    expect(errors('routine:\n  - say: Vado a {answer}')[0]?.message).toBe(
      '{answer} is available only in the branches of a question',
    );
    expect(errors('reactions:\n  - on: interacted\n    do: []\n    often: true')).toEqual([
      {
        line: 21,
        path: `${B}.reactions[0].often`,
        message: 'unknown field of a reaction',
      },
    ]);
    expect(errors('routine: []\nreactoins: []')).toEqual([
      {
        line: 19,
        path: `${B}.reactoins`,
        message: 'unknown field of a behavior (did you mean "reactions"?)',
      },
    ]);
  });

  it('MAP-001.c: the world file refers only to declared ids; not to missing nor generated ones', () => {
    expect(
      errors('routine:\n  - walk_to: piazza\n  - look_at: capanno\n  - follow: marta\n    for: 5s'),
    ).toEqual([]);
    expect(errors('routine:\n  - walk_to: piazz')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].walk_to`,
        message: 'there is no "piazz" in the map (did you mean "piazza"?)',
      },
    ]);
    expect(errors('routine:\n  - walk_to: "pond#1"')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].walk_to`,
        message:
          '"pond#1" is a generated id: give the element an "id" to refer to it in the world file',
      },
    ]);
    // Each field wants the right kind of element.
    expect(errors('routine:\n  - follow: capanno\n    for: 5s')[0]?.message).toBe(
      '"capanno" is not a character nor the player',
    );
    expect(errors('reactions:\n  - on: { enter: piazza }\n    do: []')[0]?.message).toBe(
      '"piazza" is not an area: a place with an "area", or a distribution',
    );
    expect(
      errors(
        'reactions:\n  - on: { enter: orto }\n    do: []\n  - on: { leave: bosco, who: marta }\n    do: []',
      ),
    ).toEqual([]);
  });

  it('BEHAV-004.d: flags and counters are declared in the memory; an undeclared name is an error', () => {
    expect(errors('routine:\n  - set: salutato')).toEqual([
      {
        line: 19,
        path: `${B}.routine[0].set`,
        message: '"salutato" is not declared: add it to memory.flags',
      },
    ]);
    expect(
      errors('memory: { flags: [salutato] }\nroutine:\n  - if: { flag: salutatto }\n    then: []'),
    ).toEqual([
      {
        line: 20,
        path: `${B}.routine[0].if.flag`,
        message: '"salutatto" is not declared: add it to memory.flags (did you mean "salutato"?)',
      },
    ]);
    expect(errors('memory: { counters: [volte] }\nroutine:\n  - count: volte\n    add: 2')).toEqual(
      [],
    );
    expect(errors('memory: { flags: [a], counters: [a] }')[0]?.message).toBe(
      '"a" is already declared',
    );
  });

  it('BEHAV-003.a, BEHAV-003.b: states are declared with the first one; goto names one of them', () => {
    const states = `
start: giro
states:
  giro:
    routine:
      - walk_to: piazza
      - goto: riposo
  riposo:
    routine:
      - wait: 10s
      - goto: giro
reactions:
  - on: interacted
    do:
      - goto: riposo
`;
    const program = compose(withBehavior(states)).characters.find(
      (c) => c.id === 'tobia',
    )!.behavior!;
    expect(program.start).toBe('giro');
    expect(program.states.map((s) => s.name)).toEqual(['giro', 'riposo']);
    expect(program.common).toHaveLength(1);
    expect(errors(states.replace('goto: riposo\n  riposo', 'goto: sonno\n  riposo'))).toEqual([
      {
        line: 23,
        path: `${B}.states.giro.routine[1].goto`,
        message: 'unknown state "sonno": the states are giro, riposo',
      },
    ]);
    expect(errors(states.replace('start: giro', 'start: pranzo'))[0]).toMatchObject({
      path: `${B}.start`,
      message: 'expected the first state: one of giro, riposo',
    });
    expect(errors('routine:\n  - goto: giro')[0]?.message).toBe(
      'there are no states: declare "states" and "start" to change state',
    );
    expect(errors(`routine: []\n${states}`)[0]).toMatchObject({
      path: `${B}.routine`,
      message: 'with states, "routine" goes inside each state',
    });
  });

  it('BEHAV-001.c: questions check their branches against what they expect', () => {
    expect(
      errors(`
routine:
  - ask: Vuoi una mela?
    expect: yes_no
    yes:
      - say: Eccola.
    then:
      - say: Ecco.
`)[0],
    ).toMatchObject({ message: '"then" is for questions that expect a place' });
    expect(
      errors(`
routine:
  - ask: Mela o pera?
    expect: { one_of: [mela, pera] }
    answers:
      mela: [{ say: Eccola. }]
      kiwi: [{ say: Non ne ho. }]
`)[0],
    ).toMatchObject({ message: '"answers" has "kiwi", which is not one of the options' });
    expect(errors('routine:\n  - walk_to: answer')[0]?.message).toBe(
      'answer is available only in the branches of a question',
    );
    expect(
      errors(`
routine:
  - ask: Dove vado?
    then:
      - say: Vado a {answer}.
      - walk_to: answer
    not_understood:
      - say: Non ho capito.
reactions:
  - on: { heard: { from: player, mentions: any } }
    do:
      - say: Hai detto {mentions}, {speaker}?
      - walk_to: heard.mentions
`),
    ).toEqual([]);
  });
});
