import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import { NavGrid } from '../src/core/nav/navGrid';
import { Pathfinder } from '../src/core/nav/pathfinding';
import { createDefaultStructures } from '../src/core/structures/builtin';

// Time budgets run alone, after the other tests (plan F06, T6.19+).
const file = 'worlds/default.yaml';
const { world } = composeWorld(readFileSync(file, 'utf8'), file, {
  registry: createDefaultStructures(),
});
const finder = new Pathfinder(new NavGrid(world!, createDefaultRegistry().solid));

describe('path search time in the default world', () => {
  it('NAV-001.d: a path across the whole world takes at most 50 ms', () => {
    const from = finder.grid.point(finder.nearestNode(20, 40, 20));
    finder.find(from, { x: 490, z: 490 });
    const start = performance.now();
    const runs = 5;
    for (let i = 0; i < runs; i++) {
      expect(finder.find(from, { x: 490 - i, z: 490 }).ok).toBe(true);
    }
    expect((performance.now() - start) / runs).toBeLessThanOrEqual(50);
  });
});
