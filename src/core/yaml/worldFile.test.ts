import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './report';
import { loadWorldFile } from './worldFile';

const FILE = 'worlds/test.yaml';

const VALID = `version: 1
terrain:
  seed: 7
  generator: 1
structures:
  - type: oak
    at: [100, 120]
  - type: stone_farmhouse
    at: [200, 210]
    rotation: 90
    params:
      width: 14
scatter:
  - types: { oak: 3, birch: 2 }
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
      version: 1,
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
    expect(load('version: 1\nterrain: { seed: 1, generator: 1 }\n').diagnostics).toEqual([]);
  });

  it('YAML-001.a: an unsupported schema version is an error', () => {
    expect(errors(VALID.replace('version: 1', 'version: 2'))).toEqual([
      { line: 1, path: 'version', message: expect.stringContaining('2 is not valid') },
    ]);
  });

  it('YAML-001.b: an unknown field is an error, with a hint for typos', () => {
    expect(errors(VALID.replace('      width: 14', '      widht: 14'))).toEqual([]);
    // Structure params are checked against the structure schema later: here the file level.
    expect(errors(VALID.replace('    rotation: 90', '    rotaton: 90'))).toEqual([
      {
        line: 10,
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
      'worlds/test.yaml:9  error  structures[1].at[1]  expected an integer, got "x"',
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
    const result = errors('version: 1\nterrain:\n  seed: [1, 2\n  generator: 1\n');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ path: '', message: expect.stringContaining('invalid YAML') });
    expect(result[0]!.line).toBeGreaterThanOrEqual(3);
    expect(errors('')).toEqual([{ line: null, path: '', message: 'the file is empty' }]);
  });

  it('YAML-002.c: a missing required field is an error', () => {
    expect(errors(VALID.replace('  generator: 1\n', ''))).toEqual([
      { line: 2, path: 'terrain.generator', message: 'missing required field' },
    ]);
    expect(errors(VALID.replace('  - type: oak\n    at', '  - at'))[0]).toMatchObject({
      line: 6,
      path: 'structures[0].type',
      message: 'missing required field',
    });
  });

  it('YAML-002.c: a value of the wrong type or out of range is an error', () => {
    expect(errors(VALID.replace('rotation: 90', 'rotation: 45'))).toEqual([
      {
        line: 10,
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
});
