import { beforeAll, describe, expect, it } from 'vitest';
import { AIR, DIRT, GRASS, PLANKS, SAND, STONE, WATER } from '../blocks/builtin';
import { generateHeightmap, TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createTestRegistry } from '../structures/testing';
import type { World } from '../world/world';
import { composeWorld } from './composeWorld';

const SIZE = { x: 128, y: 96, z: 128 };
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const PAD = { x: 40, z: 60, width: 10, depth: 8 };
const BASIN = { x: 90, z: 40, size: 6 };
const POSTS = [
  [20, 20],
  [64, 100],
  [100, 90],
] as const;

const TERRAIN = new Set([GRASS, DIRT, STONE, SAND]);

function fileFor(seed: number): string {
  return [
    'version: 1',
    `terrain: { seed: ${seed}, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }`,
    'structures:',
    `  - { type: test_pad, at: [${PAD.x}, ${PAD.z}], params: { width: ${PAD.width}, depth: ${PAD.depth} } }`,
    `  - { type: test_basin, at: [${BASIN.x}, ${BASIN.z}], params: { size: ${BASIN.size} } }`,
    ...POSTS.map(([x, z]) => `  - { type: test_post, at: [${x}, ${z}], params: { width: 2 } }`),
    '',
  ].join('\n');
}

/** y of the topmost terrain block of a column (structures and water excluded). */
function terrainTop(world: World, x: number, z: number): number {
  let y = world.size.y - 1;
  while (y > 0 && !TERRAIN.has(world.getBlock(x, y, z) as never)) y--;
  return y;
}

/** Chebyshev distance of a column from a rectangle. */
const distance = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }) =>
  Math.max(r.x0 - x, 0, x - (r.x1 - 1), r.z0 - z, 0, z - (r.z1 - 1));

const PAD_RECT = { x0: PAD.x, z0: PAD.z, x1: PAD.x + PAD.width, z1: PAD.z + PAD.depth };
const BASIN_RECT = { x0: BASIN.x, z0: BASIN.z, x1: BASIN.x + BASIN.size, z1: BASIN.z + BASIN.size };

describe('terrain adaptation', () => {
  const worlds = new Map<number, World>();

  beforeAll(() => {
    for (const seed of SEEDS) {
      const result = composeWorld(fileFor(seed), 'worlds/adapt.yaml', {
        registry: createTestRegistry(),
      });
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      worlds.set(seed, result.world!);
    }
  }, 120_000);

  it('STRUCT-003.a: a structure resting on the surface has no gaps under its base', () => {
    for (const world of worlds.values()) {
      for (const [x, z] of POSTS) {
        for (const [dx, dz] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          // Walk down the post: planks, then terrain, never air or water in between.
          let y = world.size.y - 1;
          while (world.getBlock(x + dx, y, z + dz) !== PLANKS) y--;
          while (world.getBlock(x + dx, y, z + dz) === PLANKS) y--;
          expect(TERRAIN.has(world.getBlock(x + dx, y, z + dz) as never)).toBe(true);
        }
      }
    }
  });

  it('STRUCT-003.b: the ground under a leveled footprint is flat, with no gaps or terrain inside', () => {
    for (const world of worlds.values()) {
      const levels = new Set<number>();
      for (let z = PAD_RECT.z0; z < PAD_RECT.z1; z++) {
        for (let x = PAD_RECT.x0; x < PAD_RECT.x1; x++) {
          let y = world.size.y - 1;
          while (world.getBlock(x, y, z) !== PLANKS) y--;
          levels.add(y);
          expect(TERRAIN.has(world.getBlock(x, y - 1, z) as never)).toBe(true);
          for (let k = 1; k <= 5; k++) expect(world.getBlock(x, y + k, z)).toBe(AIR);
        }
      }
      expect(levels.size).toBe(1);
    }
  });

  it('STRUCT-003.c: around a leveled footprint the terrain blends in, 1 block per column', () => {
    for (const [seed, world] of worlds) {
      const original = generateHeightmap(seed, SIZE).heights;
      const floor = (() => {
        let y = world.size.y - 1;
        while (world.getBlock(PAD.x, y, PAD.z) !== PLANKS) y--;
        return y - 1;
      })();
      const height = (x: number, z: number) =>
        distance(x, z, PAD_RECT) === 0 ? floor : terrainTop(world, x, z);
      for (let z = PAD_RECT.z0 - 5; z < PAD_RECT.z1 + 5; z++) {
        for (let x = PAD_RECT.x0 - 5; x < PAD_RECT.x1 + 5; x++) {
          for (const [nx, nz] of [
            [x + 1, z],
            [x, z + 1],
          ] as const) {
            const d = Math.min(distance(x, z, PAD_RECT), distance(nx, nz, PAD_RECT));
            if (d > 4 || Math.max(distance(x, z, PAD_RECT), distance(nx, nz, PAD_RECT)) === 0) {
              continue;
            }
            const steepness = Math.abs(original[x + z * SIZE.x]! - original[nx + nz * SIZE.x]!);
            expect(Math.abs(height(x, z) - height(nx, nz))).toBeLessThanOrEqual(
              Math.max(1, steepness),
            );
          }
        }
      }
    }
  });

  it('STRUCT-003.d: a basin is carved with the water below its lowest rim', () => {
    for (const world of worlds.values()) {
      let waterLevel = -1;
      for (let z = BASIN_RECT.z0; z < BASIN_RECT.z1; z++) {
        for (let x = BASIN_RECT.x0; x < BASIN_RECT.x1; x++) {
          let y = world.size.y - 1;
          while (world.getBlock(x, y, z) === AIR) y--;
          expect(world.getBlock(x, y, z)).toBe(WATER);
          waterLevel = Math.max(waterLevel, y);
        }
      }
      for (let z = BASIN_RECT.z0 - 1; z <= BASIN_RECT.z1; z++) {
        for (let x = BASIN_RECT.x0 - 1; x <= BASIN_RECT.x1; x++) {
          if (distance(x, z, BASIN_RECT) === 1) {
            expect(terrainTop(world, x, z)).toBeGreaterThan(waterLevel);
          }
        }
      }
    }
  });

  it('STRUCT-003.e: adapted columns keep the layering, with no floating blocks', () => {
    for (const world of worlds.values()) {
      for (const rect of [PAD_RECT, BASIN_RECT]) {
        for (let z = rect.z0 - 6; z < rect.z1 + 6; z++) {
          for (let x = rect.x0 - 6; x < rect.x1 + 6; x++) {
            const top = terrainTop(world, x, z);
            const surface = world.getBlock(x, top, z);
            let y = top - 1;
            let dirt = 0;
            while (world.getBlock(x, y, z) === DIRT) {
              dirt++;
              y--;
            }
            while (y >= 0 && world.getBlock(x, y, z) === STONE) y--;
            const layered =
              (surface === STONE && dirt === 0) ||
              ((surface === GRASS || surface === SAND) && dirt >= 3 && dirt <= 5);
            expect({ x, z, layered, bottom: y }).toEqual({ x, z, layered: true, bottom: -1 });
          }
        }
      }
    }
  });
});
