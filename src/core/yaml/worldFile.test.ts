import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './report';
import { DEFAULT_PLAYER_NAME, loadWorldFile, VERSION_1_MESSAGE } from './worldFile';

const FILE = 'worlds/test.yaml';

const VALID = `version: 2
name: Test
terrain:
  seed: 7
  generator: 1
structures:
  - type: oak
    name: Test
    at: [100, 120]
  - type: stone_farmhouse
    name: Test
    at: [200, 210]
    rotation: 90
    params:
      width: 14
scatter:
  - types: { oak: 3, birch: 2 }
    name: Test
    area:
      circle: { center: [300, 300], radius: 40 }
    density: 0.8
    minDistance: 7
`;

const load = (text: string) => loadWorldFile(text, FILE);
const errors = (text: string) =>
  load(text).diagnostics.map((d) => ({ line: d.line, path: d.path, message: d.message }));

describe('world file', () => {
  it('YAML-001.a: a file declares version, terrain, structures and scatter', () => {
    const { world, diagnostics } = load(VALID);
    expect(diagnostics).toEqual([]);
    expect(world).toMatchObject({
      version: 2,
      name: 'Test',
      terrain: { seed: 7, generator: 1 },
      structures: [
        { type: 'oak', at: [100, 120], rotation: 0 },
        { type: 'stone_farmhouse', at: [200, 210], rotation: 90, params: { width: 14 } },
      ],
      scatter: [{ types: { oak: 3, birch: 2 }, density: 0.8, minDistance: 7 }],
    });
    expect(world?.scatter?.[0]?.area).toEqual({
      kind: 'circle',
      value: { center: [300, 300], radius: 40 },
    });
    // structures and scatter are optional.
    expect(
      load('version: 2\nname: Test\nterrain: { seed: 1, generator: 1 }\n').diagnostics,
    ).toEqual([]);
  });

  it('YAML-001.a: version 2 declares name, description, player, places, characters and behaviors', () => {
    const { world, diagnostics } = load(`version: 2
name: La valle
description: Una valle con un borgo.
terrain: { seed: 1, generator: 1 }
player: { at: [10, 10], name: Ada }
places:
  - { id: piazza, name: Piazza, at: [20, 20] }
characters:
  - { id: tobia, name: Tobia, at: [30, 30], behavior: { routine: [] } }
behaviors:
  - { name: giro, routine: [] }
`);
    expect(diagnostics).toEqual([]);
    expect(world).toMatchObject({
      name: 'La valle',
      description: 'Una valle con un borgo.',
      player: { name: 'Ada' },
      places: [{ id: 'piazza', name: 'Piazza', at: [20, 20] }],
      characters: [{ id: 'tobia', name: 'Tobia', behavior: { routine: [] } }],
      behaviors: [{ name: 'giro', routine: [] }],
    });
  });

  it('YAML-001.a: an unsupported schema version is an error', () => {
    expect(errors(VALID.replace('version: 2', 'version: 3'))).toEqual([
      { line: 1, path: 'version', message: expect.stringContaining('3 is not valid') },
    ]);
  });

  it('YAML-001.e: a file of version 1 says what to add for version 2', () => {
    const old = `version: 1
terrain: { seed: 1, generator: 1 }
structures:
  - { type: oak, at: [10, 10] }
`;
    const found = errors(old);
    expect(found[0]).toEqual({ line: 1, path: 'version', message: VERSION_1_MESSAGE });
    expect(VERSION_1_MESSAGE).toContain('version: 2');
    // The other errors point at each missing name.
    expect(found.slice(1).map((e) => e.path)).toEqual(['name', 'structures[0].name']);
  });

  it('YAML-001.b: an unknown field is an error, with a hint for typos', () => {
    expect(errors(VALID.replace('      width: 14', '      widht: 14'))).toEqual([]);
    // Structure params are checked against the structure schema later: here the file level.
    expect(errors(VALID.replace('    rotation: 90', '    rotaton: 90'))).toEqual([
      {
        line: 13,
        path: 'structures[1].rotaton',
        message: 'unknown field (did you mean "rotation"?)',
      },
    ]);
    expect(errors(VALID.replace('terrain:', 'terrain:\n  colour: red'))[0]).toMatchObject({
      path: 'terrain.colour',
      message: 'unknown field',
    });
  });

  it('YAML-002.a: errors carry file, line, field path and cause', () => {
    const { diagnostics } = load(VALID.replace('at: [200, 210]', 'at: [200, "x"]'));
    expect(diagnostics).toHaveLength(1);
    expect(formatDiagnostic(diagnostics[0]!)).toBe(
      'worlds/test.yaml:12  error  structures[1].at[1]  expected an integer, got "x"',
    );
  });

  it('YAML-002.b: all the errors of a file are reported, not only the first', () => {
    const text = VALID.replace('seed: 7', 'seed: -1')
      .replace('    at: [100, 120]', '    at: [100]')
      .replace('density: 0.8', 'density: 0.8\n    count: 5');
    expect(errors(text).map((e) => e.path)).toEqual([
      'terrain.seed',
      'structures[0].at',
      'scatter[0]',
    ]);
  });

  it('YAML-002.c: invalid YAML syntax is an error with its line', () => {
    const result = errors('version: 2\nname: Test\nterrain:\n  seed: [1, 2\n  generator: 1\n');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ path: '', message: expect.stringContaining('invalid YAML') });
    expect(result[0]!.line).toBeGreaterThanOrEqual(3);
    expect(errors('')).toEqual([{ line: null, path: '', message: 'the file is empty' }]);
  });

  it('YAML-002.c: a missing required field is an error', () => {
    expect(errors(VALID.replace('  generator: 1\n', ''))).toEqual([
      { line: 3, path: 'terrain.generator', message: 'missing required field' },
    ]);
    expect(
      errors(VALID.replace('  - type: oak\n    name: Test\n    at', '  - at'))[0],
    ).toMatchObject({
      line: 7,
      path: 'structures[0].type',
      message: 'missing required field',
    });
  });

  it('YAML-002.c: a value of the wrong type or out of range is an error', () => {
    expect(errors(VALID.replace('rotation: 90', 'rotation: 45'))).toEqual([
      {
        line: 13,
        path: 'structures[1].rotation',
        message: '45 is not valid: expected one of 0, 90, 180, 270',
      },
    ]);
    expect(errors(VALID.replace('seed: 7', 'seed: 1.5'))[0]).toMatchObject({
      path: 'terrain.seed',
      message: '1.5 is not an integer',
    });
    expect(errors(VALID.replace('radius: 40', 'radius: 0'))[0]).toMatchObject({
      path: 'scatter[0].area.circle.radius',
      message: '0 is out of range: expected an integer ≥ 1',
    });
    const notAList = errors(VALID.replace('structures:', 'structures: 3\nx:'));
    expect(notAList.find((e) => e.path === 'structures')).toMatchObject({
      path: 'structures',
      message: 'expected a list, got 3',
    });
  });

  it('YAML-009.a: the world, structures, distributions, places and characters need a name', () => {
    const noName = errors(
      VALID.replace('name: Test\nterrain', 'terrain').replace(
        '  - type: oak\n    name: Test\n',
        '  - type: oak\n',
      ),
    );
    expect(noName).toEqual([
      { line: 1, path: 'name', message: 'missing required field' },
      { line: 6, path: 'structures[0].name', message: 'missing required field' },
    ]);
    const header = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1 }\n';
    expect(
      errors(
        `${header}scatter:\n  - { types: { oak: 1 }, count: 1, minDistance: 2, area: { circle: { center: [9, 9], radius: 3 } } }\n`,
      ),
    ).toEqual([{ line: 5, path: 'scatter[0].name', message: 'missing required field' }]);
    expect(errors(`${header}places:\n  - { id: piazza, at: [1, 1] }\n`)[0]?.path).toBe(
      'places[0].name',
    );
    expect(errors(`${header}characters:\n  - { id: tobia, at: [1, 1] }\n`)[0]?.path).toBe(
      'characters[0].name',
    );
  });

  it('YAML-009.a: a name is 1–60 characters, a description at most 1000', () => {
    const named = (name: string) =>
      errors(VALID.replace('name: Test\nterrain', `name: "${name}"\nterrain`));
    expect(named('   ')).toEqual([{ line: 2, path: 'name', message: 'must not be empty' }]);
    expect(named('x'.repeat(61))).toEqual([
      { line: 2, path: 'name', message: 'too long: 61 characters, at most 60' },
    ]);
    expect(named('x'.repeat(60))).toEqual([]);
    const described = (length: number) =>
      errors(
        VALID.replace('  - type: oak\n', `  - type: oak\n    description: ${'d'.repeat(length)}\n`),
      );
    expect(described(1000)).toEqual([]);
    expect(described(1001)).toEqual([
      {
        line: 8,
        path: 'structures[0].description',
        message: 'too long: 1001 characters, at most 1000',
      },
    ]);
  });

  it('YAML-009.b: the player may declare a name and a description; «viandante» by default', () => {
    const header = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1 }\n';
    expect(load(`${header}player: { at: [1, 1] }\n`).world?.player?.name).toBe(DEFAULT_PLAYER_NAME);
    expect(DEFAULT_PLAYER_NAME).toBe('viandante');
    expect(
      load(`${header}player: { at: [1, 1], name: Ada, description: Una viaggiatrice. }\n`).world
        ?.player,
    ).toMatchObject({ name: 'Ada', description: 'Una viaggiatrice.' });
  });

  it('YAML-010.a: a place is a point or an area, with id, name and an optional description', () => {
    const header = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1 }\nplaces:\n';
    expect(
      load(
        `${header}  - { id: piazza, name: Piazza, at: [5, 5] }\n  - { id: bosco, name: Bosco, description: Querce., area: { circle: { center: [50, 50], radius: 10 } } }\n  - { id: orto, name: Orto, area: { rect: { from: [1, 1], to: [4, 4] } } }\n`,
      ).diagnostics,
    ).toEqual([]);
    expect(errors(`${header}  - { id: piazza, name: Piazza }\n`)).toEqual([
      {
        line: 5,
        path: 'places[0]',
        message: 'declare exactly one of "at" (a point) and "area" (rect or circle)',
      },
    ]);
    expect(errors(`${header}  - { name: Piazza, at: [5, 5] }\n`)[0]?.path).toBe('places[0].id');
  });

  it('BEHAV-001.b: a character has either a behavior or a controller, not both', () => {
    const header = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1 }\ncharacters:\n';
    expect(
      errors(
        `${header}  - id: tobia\n    name: Tobia\n    at: [1, 1]\n    behavior: { routine: [] }\n    controller: { command: node t.mjs }\n`,
      ),
    ).toEqual([
      {
        line: 9,
        path: 'characters[0].controller',
        message: 'a character has either a behavior or a controller, not both',
      },
    ]);
  });
});
