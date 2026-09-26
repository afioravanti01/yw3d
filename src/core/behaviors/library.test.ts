import { describe, expect, it } from 'vitest';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultStructures } from '../structures/builtin';
import type { TargetValue } from './registry';

const HEADER = `version: 2
name: Test
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }
places:
  - { id: piazza, name: Piazza, at: [30, 30] }
  - { id: pozzo, name: Pozzo, at: [40, 50] }
  - { id: orto, name: Orto, area: { rect: { from: [80, 20], to: [90, 30] } } }
`;

const GIRO = `  - name: giro
    description: Un giro tra alcune tappe.
    params:
      tappe: { type: list, of: id }
      pausa: { type: duration, default: 3s }
      velocita: { type: number, default: 1.5, min: 0.5, max: 7 }
    routine:
      - walk_to: $tappe
        speed: $velocita
      - wait: $pausa
`;

const compose = (text: string, files: Record<string, string> = {}) =>
  composeWorld(text, 'valle/world.yaml', {
    registry: createDefaultStructures(),
    readFile: (path) => files[path],
  });

const names = (text: string, files?: Record<string, string>) =>
  compose(text, files).characters.map((c) =>
    c.behavior?.states[0]!.routine.map((i) =>
      i.definition.name === 'walk_to' ? (i.args.main as TargetValue) : i.definition.name,
    ),
  );

const messages = (text: string, files?: Record<string, string>) =>
  compose(text, files).diagnostics.map((d) => `${d.file}:${d.line}  ${d.path}  ${d.message}`);

describe('behaviors: inline, in files, from the library', () => {
  it('BEHAV-001.a: a behavior written in the character, in an external file, or from the library', () => {
    const text = `${HEADER}behaviors:
${GIRO}characters:
  - id: anna
    name: Anna
    at: [20, 20]
    behavior:
      routine: [{ walk_to: piazza }]
  - id: bruno
    name: Bruno
    at: [22, 20]
    behavior: { file: comportamenti/bruno.yaml }
  - id: carla
    name: Carla
    at: [24, 20]
    behavior: { use: giro, params: { tappe: [pozzo] } }
`;
    const files = { 'comportamenti/bruno.yaml': 'routine:\n  - walk_to: orto\n  - say: Eccomi.\n' };
    expect(compose(text, files).diagnostics).toEqual([]);
    expect(names(text, files)).toEqual([
      [{ kind: 'id', id: 'piazza' }],
      [{ kind: 'id', id: 'orto' }, 'say'],
      [{ kind: 'id', id: 'pozzo' }, 'wait'],
    ]);
  });

  it('BEHAV-001.a: a path that leaves the world folder is an error; so is a missing file', () => {
    const character = (file: string) =>
      `${HEADER}characters:\n  - id: anna\n    name: Anna\n    at: [20, 20]\n    behavior: { file: "${file}" }\n`;
    expect(messages(character('../altro/anna.yaml'))).toEqual([
      'valle/world.yaml:12  characters[0].behavior.file  the path "../altro/anna.yaml" leaves the folder of the world',
    ]);
    expect(messages(character('/etc/anna.yaml'))[0]).toContain('leaves the folder of the world');
    expect(messages(character('comportamenti/../../anna.yaml'))[0]).toContain(
      'leaves the folder of the world',
    );
    expect(messages(character('anna.yaml'))).toEqual([
      'valle/world.yaml:12  characters[0].behavior.file  cannot read the file "anna.yaml" of the world folder',
    ]);
  });

  it('BEHAV-001.c: errors in an external file carry that file, its line and path', () => {
    const text = `${HEADER}behaviors:\n  - file: comportamenti/comuni.yaml\ncharacters:\n  - id: anna\n    name: Anna\n    at: [20, 20]\n    behavior: { file: comportamenti/anna.yaml }\n`;
    const files = {
      'comportamenti/anna.yaml': 'routine:\n  - walk_to: piazza\n  - sya: Ciao\n',
      'comportamenti/comuni.yaml':
        '- name: saluto\n  routine:\n    - say: Ciao\n    - wait: presto\n',
    };
    expect(messages(text, files)).toEqual([
      'valle/comportamenti/comuni.yaml:4  [0].routine[1].wait  expected a duration in seconds, such as 5 or "30s" or "2min", got "presto"',
      expect.stringMatching(
        /^valle\/comportamenti\/anna\.yaml:3 {2}routine\[1\]\.sya {2}unknown instruction \(did you mean "say"\?\)/,
      ),
    ]);
    expect(
      messages(text, { ...files, 'comportamenti/anna.yaml': 'routine: [walk_to: piazza' }).find(
        (m) => m.includes('anna.yaml'),
      ),
    ).toMatch(/^valle\/comportamenti\/anna\.yaml:\d+ +invalid YAML/);
  });

  it('BEHAV-006.a: the library declares behaviors with typed parameters, in the world file or in files it names', () => {
    const text = `${HEADER}behaviors:
${GIRO}  - file: comportamenti/comuni.yaml
characters:
  - id: anna
    name: Anna
    at: [20, 20]
    behavior: { use: saluto }
`;
    const files = { 'comportamenti/comuni.yaml': '- name: saluto\n  routine: [{ say: Ciao }]\n' };
    expect(compose(text, files).diagnostics).toEqual([]);
    // A repeated name; a parameter of an unknown type; a parameter used where it does not fit.
    expect(messages(`${HEADER}behaviors:\n${GIRO}${GIRO}`)[0]).toBe(
      'valle/world.yaml:19  behaviors[1].name  the behavior "giro" is already declared (valle/world.yaml:9)',
    );
    expect(
      messages(
        `${HEADER}behaviors:\n  - name: x\n    params: { n: { type: colour } }\n    routine: []\n`,
      ),
    ).toEqual([
      'valle/world.yaml:10  behaviors[0].params.n.type  expected a type: one of number, text, duration, point, id, list',
    ]);
    expect(
      messages(
        `${HEADER}behaviors:\n  - name: x\n    params: { n: { type: number } }\n    routine: [{ say: $n }]\n`,
      ),
    ).toEqual([
      'valle/world.yaml:11  behaviors[0].routine[0].say  the parameter "$n" is a number: here a text is needed',
    ]);
    expect(messages(`${HEADER}behaviors:\n  - name: x\n    routine: [{ wait: $pausa }]\n`)).toEqual(
      [
        'valle/world.yaml:10  behaviors[0].routine[0].wait  unknown parameter "$pausa": this behavior has no parameters',
      ],
    );
  });

  it('BEHAV-006.b: a character uses a library behavior by name; defaults, unknown, missing and wrong values', () => {
    const use = (params: string) =>
      `${HEADER}behaviors:\n${GIRO}characters:\n  - id: anna\n    name: Anna\n    at: [20, 20]\n    behavior: { use: giro, params: ${params} }\n`;
    const program = compose(use('{ tappe: [piazza, pozzo] }')).characters[0]!.behavior!;
    const [first, second, wait] = program.states[0]!.routine;
    expect(first!.args).toMatchObject({ main: { kind: 'id', id: 'piazza' }, speed: 1.5 });
    expect(second!.args.main).toEqual({ kind: 'id', id: 'pozzo' });
    expect(wait!.args.main).toBe(3);
    // A list holds values of one type: here ids.
    expect(messages(use('{ tappe: [piazza, [50, 60]] }'))).toEqual([
      'valle/world.yaml:23  characters[0].behavior.params.tappe[1]  expected an id of the map, got a list',
    ]);
    expect(
      compose(
        use('{ tappe: [piazza], pausa: 10s, velocita: 3 }'),
      ).characters[0]!.behavior!.states[0]!.routine.map((i) => i.args.main),
    ).toEqual([{ kind: 'id', id: 'piazza' }, 10]);
    expect(messages(use('{ tappe: [piazza], passo: 2 }'))).toEqual([
      'valle/world.yaml:23  characters[0].behavior.params.passo  unknown parameter of giro',
    ]);
    expect(messages(use('{}'))).toEqual([
      'valle/world.yaml:23  characters[0].behavior.params  missing parameter "tappe" of giro (list of id)',
    ]);
    expect(messages(use('{ tappe: [piazza], velocita: 9 }'))).toEqual([
      'valle/world.yaml:23  characters[0].behavior.params.velocita  9 is out of range: between 0.5 and 7',
    ]);
    expect(messages(use('{ tappe: [piaza] }'))).toEqual([
      'valle/world.yaml:23  characters[0].behavior.params.tappe[0]  there is no "piaza" in the map (did you mean "piazza"?)',
    ]);
    expect(
      messages(
        `${HEADER}characters:\n  - id: anna\n    name: Anna\n    at: [20, 20]\n    behavior: { use: giro }\n`,
      ),
    ).toEqual([
      'valle/world.yaml:12  characters[0].behavior.use  there is no behavior "giro" in the library',
    ]);
  });

  it('BEHAV-002.b: walk_to with a list of destinations visits them in order (A6.1)', () => {
    const text = `${HEADER}characters:\n  - id: anna\n    name: Anna\n    at: [20, 20]\n    behavior:\n      routine:\n        - walk_to: [piazza, [50, 60], pozzo]\n          speed: 2\n        - say: Finito.\n`;
    expect(names(text)).toEqual([
      [
        { kind: 'id', id: 'piazza' },
        { kind: 'point', x: 50.5, z: 60.5 },
        { kind: 'id', id: 'pozzo' },
        'say',
      ],
    ]);
    // Each visit keeps the options of the instruction.
    const routine = compose(text).characters[0]!.behavior!.states[0]!.routine;
    expect(routine.slice(0, 3).map((i) => i.args.speed)).toEqual([2, 2, 2]);
    // A single point stays one destination.
    expect(names(text.replace('[piazza, [50, 60], pozzo]', '[50, 60]'))[0]![0]).toEqual({
      kind: 'point',
      x: 50.5,
      z: 60.5,
    });
  });
});
