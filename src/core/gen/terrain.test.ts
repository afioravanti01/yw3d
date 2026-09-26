import { beforeAll, describe, expect, it } from 'vitest';
import { AIR, DIRT, GRASS, STONE } from '../blocks/builtin';
import type { World } from '../world/world';
import { generateTerrain } from './terrain';

const TEST_SEEDS = [1, 2, 3, 4, 5];

interface Analysis {
  world: World;
  /** y of the topmost non-air block per column, index x + z * sizeX. */
  heights: Int32Array;
  /** Block id at the surface per column. */
  tops: Uint8Array;
}

function analyze(world: World): Analysis {
  const { x: sx, y: sy, z: sz } = world.size;
  const heights = new Int32Array(sx * sz);
  const tops = new Uint8Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      let y = sy - 1;
      while (y >= 0 && world.getBlock(x, y, z) === AIR) y--;
      heights[x + z * sx] = y;
      tops[x + z * sx] = world.getBlock(x, y, z);
    }
  }
  return { world, heights, tops };
}

function maxDrop(a: Analysis, x: number, z: number): number {
  const { x: sx, z: sz } = a.world.size;
  const h = a.heights[x + z * sx]!;
  let max = 0;
  for (const [nx, nz] of [
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1],
  ] as const) {
    if (nx >= 0 && nz >= 0 && nx < sx && nz < sz) {
      max = Math.max(max, Math.abs(h - a.heights[nx + nz * sx]!));
    }
  }
  return max;
}

function percentile(values: Int32Array, p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))]!;
}

describe('terrain generation', () => {
  const analyses = new Map<number, Analysis>();

  beforeAll(() => {
    for (const seed of TEST_SEEDS) {
      analyses.set(seed, analyze(generateTerrain(seed)));
    }
  }, 120_000);

  const each = (check: (a: Analysis, seed: number) => void) => {
    for (const seed of TEST_SEEDS) {
      check(analyses.get(seed)!, seed);
    }
  };

  it('WORLD-005.a: the same seed and configuration give an identical world', () => {
    expect(generateTerrain(1).hash()).toBe(analyses.get(1)!.world.hash());
  });

  it('WORLD-005.b: the hash of the reference seed is fixed', () => {
    // Changing the generator output requires updating this value and logging a plan deviation.
    expect(analyses.get(1)!.world.hash().toString(16)).toMatchInlineSnapshot(`"decee4b7"`);
  });

  it('WORLD-005.c: 10 different seeds give 10 different worlds', () => {
    const size = { x: 64, y: 96, z: 64 };
    const hashes = new Set(
      Array.from({ length: 10 }, (_, i) => generateTerrain(i + 1, size).hash()),
    );
    expect(hashes.size).toBe(10);
  });

  it('WORLD-006.a: every surface height is between 16 and 72 blocks', () => {
    each((a) => {
      const [min, max] = a.heights.reduce(
        ([lo, hi], h) => [Math.min(lo, h), Math.max(hi, h)],
        [Infinity, -Infinity],
      );
      expect(min).toBeGreaterThanOrEqual(16);
      expect(max).toBeLessThanOrEqual(72);
    });
  });

  it('WORLD-006.b: at least 85% of adjacent column pairs differ by at most 1 block', () => {
    each((a) => {
      const { x: sx, z: sz } = a.world.size;
      let gentle = 0;
      let pairs = 0;
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const h = a.heights[x + z * sx]!;
          if (x + 1 < sx) {
            pairs++;
            if (Math.abs(h - a.heights[x + 1 + z * sx]!) <= 1) gentle++;
          }
          if (z + 1 < sz) {
            pairs++;
            if (Math.abs(h - a.heights[x + (z + 1) * sx]!) <= 1) gentle++;
          }
        }
      }
      expect(gentle / pairs).toBeGreaterThanOrEqual(0.85);
    });
  });

  it('WORLD-006.c: the 95th and 5th height percentiles differ by at least 16 blocks', () => {
    each((a) => {
      expect(percentile(a.heights, 0.95) - percentile(a.heights, 0.05)).toBeGreaterThanOrEqual(16);
    });
  });

  it('WORLD-006.d: grassy columns are stone, 3–5 dirt, grass; rocky columns are all stone', () => {
    each((a) => {
      const { x: sx, z: sz } = a.world.size;
      const problems: string[] = [];
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const h = a.heights[x + z * sx]!;
          const top = a.world.getBlock(x, h, z);
          // Walk down from the surface: [grass, dirt × 3–5] or nothing, then stone to y = 0.
          let y = h;
          let dirt = 0;
          if (top === GRASS) {
            y--;
            while (y >= 0 && a.world.getBlock(x, y, z) === DIRT) {
              dirt++;
              y--;
            }
          }
          while (y >= 0 && a.world.getBlock(x, y, z) === STONE) y--;
          const valid = y === -1 && (top === STONE || (top === GRASS && dirt >= 3 && dirt <= 5));
          if (!valid && problems.length < 5) {
            problems.push(`column ${x},${z}: top ${top}, dirt ${dirt}, stopped at y ${y}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  });

  it('WORLD-006.e: columns with a drop of 3 or more blocks to a neighbor are rocky', () => {
    each((a) => {
      const { x: sx, z: sz } = a.world.size;
      let steepGrass = 0;
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          if (maxDrop(a, x, z) >= 3 && a.tops[x + z * sx] !== STONE) steepGrass++;
        }
      }
      expect(steepGrass).toBe(0);
    });
  });

  it('WORLD-006.f: at least 60% grass and 1% rock at the surface', () => {
    each((a) => {
      const n = a.tops.length;
      const grass = a.tops.filter((id) => id === GRASS).length;
      const rock = a.tops.filter((id) => id === STONE).length;
      expect(grass / n).toBeGreaterThanOrEqual(0.6);
      expect(rock / n).toBeGreaterThanOrEqual(0.01);
    });
  });
});
