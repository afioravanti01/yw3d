import { beforeAll, describe, expect, it } from 'vitest';
import { AIR, GRAVEL, SAND, WATER } from '../blocks/builtin';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import type { World } from '../world/world';
import { createDefaultStructures } from './builtin';
import { pondColumns } from './pond';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const CENTER = 64;
const registry = createDefaultStructures();

const NEIGHBORS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

describe('ponds', () => {
  const worlds = new Map<number, World>();

  beforeAll(() => {
    for (const seed of SEEDS) {
      const text = `version: 2\nname: Test\nterrain: { seed: ${seed}, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }\nstructures:\n  - { type: pond, name: Test, at: [${CENTER}, ${CENTER}], params: { radius: 12, depth: 4 } }\n`;
      const { world, diagnostics } = composeWorld(text, 'w.yaml', { registry });
      expect(diagnostics).toEqual([]);
      worlds.set(seed, world!);
    }
  }, 120_000);

  it('STRUCT-007.a: the shape is irregular, sized and deepened by the parameters', () => {
    for (const seed of SEEDS) {
      const columns = pondColumns({ radius: 12, depth: 4 }, seed);
      const inside = new Set(columns.map(([x, z]) => `${x},${z}`));
      // Not a disc: the distance of shoreline columns from the center varies (≈ 0.02 for a
      // pixelated disc).
      const shoreline = columns
        .filter(([x, z]) => NEIGHBORS_4.some(([dx, dz]) => !inside.has(`${x + dx},${z + dz}`)))
        .map(([x, z]) => Math.hypot(x + 0.5, z + 0.5));
      const mean = shoreline.reduce((a, b) => a + b) / shoreline.length;
      const spread = Math.sqrt(
        shoreline.reduce((a, b) => a + (b - mean) ** 2, 0) / shoreline.length,
      );
      expect(spread / mean).toBeGreaterThan(0.06);
      const r = Math.sqrt(columns.length / Math.PI);
      // Not a rectangle: the bounding box has many dry columns.
      const xs = columns.map(([x]) => x);
      const zs = columns.map(([, z]) => z);
      const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...zs) - Math.min(...zs) + 1);
      expect(inside.size / box).toBeLessThan(0.9);
      // Size follows the radius, depth follows the depth parameter.
      expect(r).toBeGreaterThan(12 * 0.8);
      expect(r).toBeLessThan(12 * 1.2);
      expect(Math.max(...columns.map(([, , d]) => d))).toBe(4);
    }
    const small = pondColumns({ radius: 6, depth: 2 }, 1);
    expect(small.length).toBeLessThan(pondColumns({ radius: 12, depth: 4 }, 1).length / 2);
  });

  it('STRUCT-007.b: the water is contained: below and beside it only water or solid blocks', () => {
    for (const world of worlds.values()) {
      let water = 0;
      for (let z = CENTER - 24; z < CENTER + 24; z++) {
        for (let y = 1; y < world.size.y; y++) {
          for (let x = CENTER - 24; x < CENTER + 24; x++) {
            if (world.getBlock(x, y, z) !== WATER) continue;
            water++;
            expect(world.getBlock(x, y - 1, z)).not.toBe(AIR);
            for (const [dx, dz] of NEIGHBORS_4) {
              expect(world.getBlock(x + dx, y, z + dz)).not.toBe(AIR);
            }
          }
        }
      }
      expect(water).toBeGreaterThan(200);
    }
  });

  it('STRUCT-007.c: the shore is sand or gravel, within 1–3 blocks of the water', () => {
    for (const world of worlds.values()) {
      // Surface block of every column around the pond, computed once.
      const R = 28;
      const tops = new Map<string, number>();
      for (let z = CENTER - R; z < CENTER + R; z++) {
        for (let x = CENTER - R; x < CENTER + R; x++) {
          let y = world.size.y - 1;
          while (y > 0 && world.getBlock(x, y, z) === AIR) y--;
          tops.set(`${x},${z}`, world.getBlock(x, y, z));
        }
      }
      const top = (x: number, z: number) => tops.get(`${x},${z}`)!;
      const isWater = (x: number, z: number) => top(x, z) === WATER;
      const shores = new Set<number>();
      for (let z = CENTER - 24; z < CENTER + 24; z++) {
        for (let x = CENTER - 24; x < CENTER + 24; x++) {
          if (isWater(x, z)) continue;
          // Chebyshev distance to the nearest water column, up to 4.
          let d = Infinity;
          for (let dz = -4; dz <= 4; dz++) {
            for (let dx = -4; dx <= 4; dx++) {
              if (isWater(x + dx, z + dz)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dz)));
            }
          }
          const block = top(x, z);
          if (d === 1) expect([SAND, GRAVEL]).toContain(block);
          if (d > 3) expect([SAND, GRAVEL]).not.toContain(block);
          if (d <= 3) shores.add(block);
        }
      }
      expect(shores.has(SAND) || shores.has(GRAVEL)).toBe(true);
    }
  });
});
