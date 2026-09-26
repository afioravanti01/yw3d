import { describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../src/core/gen/terrain';
import { checkWorlds } from './world-check';

const HEADER = `version: 2\nname: Test\nterrain: { seed: 2, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\n`;
const FILES: Record<string, string> = {
  'good.yaml': `${HEADER}structures:\n  - { type: oak, name: Test, at: [30, 30] }\n`,
  'bad.yaml': `${HEADER}structures:\n  - { type: oka, name: Test, at: [30, 30] }\n  - { type: birch, name: Test, at: [30] }\n`,
};

function run(files: string[]) {
  const lines: string[] = [];
  const code = checkWorlds(
    files,
    (file) => {
      if (!(file in FILES)) throw new Error('ENOENT');
      return FILES[file]!;
    },
    (line) => lines.push(line),
  );
  return { code, lines };
}

describe('world:check', () => {
  it('YAML-002.e: a valid file passes with exit code 0', () => {
    expect(run(['good.yaml'])).toEqual({
      code: 0,
      lines: ['good.yaml: ok, 1 structures, 0 warnings'],
    });
  });

  it('YAML-002.e: errors are printed in the core format and the exit code is not 0', () => {
    const { code, lines } = run(['good.yaml', 'bad.yaml']);
    expect(code).toBe(1);
    expect(lines).toEqual([
      'good.yaml: ok, 1 structures, 0 warnings',
      'bad.yaml:5  error  structures[0].type  unknown structure type "oka" (did you mean "oak"?); available: birch, oak, pond, stone_farmhouse, willow, wooden_hut',
      'bad.yaml:6  error  structures[1].at  expected 2 items, got 1',
    ]);
    expect(run(['missing.yaml']).code).toBe(1);
    expect(run([]).code).toBe(2);
  });
});
