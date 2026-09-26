import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import { regionOf } from '../src/core/map/goals';
import type { Goal } from '../src/core/map/worldMap';
import { NavGrid } from '../src/core/nav/navGrid';
import { Pathfinder } from '../src/core/nav/pathfinding';
import { createDefaultStructures } from '../src/core/structures/builtin';

// Time budgets run alone, after the other tests (plan F06, T6.19+).
const file = 'worlds/default.yaml';
const result = composeWorld(readFileSync(file, 'utf8'), file, {
  registry: createDefaultStructures(),
});
const finder = new Pathfinder(new NavGrid(result.world!, createDefaultRegistry().solid));

describe('search time towards the elements of the map', () => {
  it('MAP-003.c: the search towards a large area far away stays within the budget of NAV-001.d', () => {
    // The eastern woods, 300 blocks from the village; the meadows of the whole valley; a pond.
    for (const id of ['scatter#1', 'scatter#5', 'pond#2']) {
      const goal = result.goals.get(id) as Extract<Goal, { kind: 'columns' | 'area' }>;
      const region = regionOf(goal);
      const start = performance.now();
      const runs = 3;
      for (let i = 0; i < runs; i++) {
        expect(finder.findRegion({ x: 158.5, y: 34, z: 66.5 }, region).ok, id).toBe(true);
      }
      expect((performance.now() - start) / runs, id).toBeLessThanOrEqual(50);
    }
  });
});
