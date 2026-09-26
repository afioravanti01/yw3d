import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeWorld } from '../src/core/compose/composeWorld';
import { createDefaultStructures } from '../src/core/structures/builtin';

const FILE = 'worlds/default.yaml';

describe('default world', () => {
  it('PERF-002.b: the default world has at least 150 trees, 6 houses and 2 ponds', () => {
    const result = composeWorld(readFileSync(FILE, 'utf8'), FILE, {
      registry: createDefaultStructures(),
    });
    expect(result.diagnostics).toEqual([]);
    const count = (...types: string[]) =>
      types.reduce((sum, t) => sum + (result.structureCounts[t] ?? 0), 0);
    expect(count('oak', 'birch', 'willow')).toBeGreaterThanOrEqual(150);
    expect(count('stone_farmhouse', 'wooden_hut')).toBeGreaterThanOrEqual(6);
    expect(count('stone_farmhouse')).toBeGreaterThan(0);
    expect(count('wooden_hut')).toBeGreaterThan(0);
    expect(count('pond')).toBeGreaterThanOrEqual(2);
  });
});
