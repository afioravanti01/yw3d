import type { Heightmap } from '../gen/terrain';
import type { Rect } from '../structures/builder';

/**
 * Terrain adaptation on the heightmap (plan F02 P3, P9, P10). Operating on column heights keeps
 * the layering of WORLD-006.d for free: the columns are filled afterwards.
 */

/** Farthest distance at which leveling may still reshape the terrain. */
const MAX_REACH = 64;

/** Chebyshev distance from a column to a rectangle of columns (0 inside). */
function distanceToRect(x: number, z: number, rect: Rect): number {
  const dx = Math.max(rect.minX - x, 0, x - (rect.maxX - 1));
  const dz = Math.max(rect.minZ - z, 0, z - (rect.maxZ - 1));
  return Math.max(dx, dz);
}

function median(values: number[]): number {
  const sorted = values.sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * Levels the ground under a footprint (STRUCT-003.b) at `level`, or at the median height of
 * the footprint. Around it each column stays within `d` blocks of the level, `d` being its
 * distance from the footprint: adjacent columns then differ by at most 1 block, unless the
 * original terrain was already steeper (STRUCT-003.c). Returns the level.
 */
export function flatten(map: Heightmap, rect: Rect, level?: number): number {
  const { sizeX, sizeZ, heights } = map;
  if (level === undefined) {
    const inside: number[] = [];
    for (let z = rect.minZ; z < rect.maxZ; z++) {
      for (let x = rect.minX; x < rect.maxX; x++) inside.push(heights[x + z * sizeX]!);
    }
    level = median(inside);
  }
  const x0 = Math.max(0, rect.minX - MAX_REACH);
  const x1 = Math.min(sizeX, rect.maxX + MAX_REACH);
  const z0 = Math.max(0, rect.minZ - MAX_REACH);
  const z1 = Math.min(sizeZ, rect.maxZ + MAX_REACH);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const d = distanceToRect(x, z, rect);
      const i = x + z * sizeX;
      const offset = heights[i]! - level;
      heights[i] = level + Math.max(-d, Math.min(d, offset));
      if (d === 0) map.outcrops[i] = 0;
    }
  }
  return level;
}

export interface DugBasin {
  /** Height of the topmost water block. */
  readonly waterLevel: number;
  /** Water columns with their bed height: water fills bed + 1 … waterLevel. */
  readonly water: readonly (readonly [x: number, z: number, bed: number])[];
}

const NEIGHBORS_8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * Carves a basin (STRUCT-003.d): the water level is one block below the lowest column around
 * it, the bed is `depth` blocks below the water level, and the shore within `shoreWidth`
 * columns slopes down to one block above the water. Bed and shore get `shoreBlock` as surface.
 * `columns` are world columns with their depth; the ones outside the map are ignored.
 */
export function dig(
  map: Heightmap,
  surface: Uint8Array,
  columns: readonly (readonly [x: number, z: number, depth: number])[],
  shoreWidth: number,
  shoreBlock: number,
  maxWaterLevel = Infinity,
): DugBasin {
  const { sizeX, sizeZ, heights } = map;
  const inMap = (x: number, z: number) => x >= 0 && z >= 0 && x < sizeX && z < sizeZ;
  const mask = new Map<number, number>();
  for (const [x, z, depth] of columns) {
    if (inMap(x, z)) mask.set(x + z * sizeX, depth);
  }

  // Shore distances by breadth-first search from the basin, 8-connected.
  const distance = new Map<number, number>();
  let frontier = [...mask.keys()];
  for (let d = 1; d <= shoreWidth; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % sizeX;
      const z = (i - x) / sizeX;
      for (const [dx, dz] of NEIGHBORS_8) {
        const j = x + dx + (z + dz) * sizeX;
        if (!inMap(x + dx, z + dz) || mask.has(j) || distance.has(j)) continue;
        distance.set(j, d);
        next.push(j);
      }
    }
    frontier = next;
  }

  let rim = Infinity;
  for (const [i, d] of distance) {
    if (d === 1) rim = Math.min(rim, heights[i]!);
  }
  const waterLevel = Math.min(rim - 1, maxWaterLevel);

  const water: [number, number, number][] = [];
  for (const [i, depth] of mask) {
    const bed = Math.max(1, Math.min(heights[i]!, waterLevel - depth));
    heights[i] = bed;
    map.outcrops[i] = 0;
    surface[i] = shoreBlock;
    const x = i % sizeX;
    water.push([x, (i - x) / sizeX, bed]);
  }
  for (const [i, d] of distance) {
    heights[i] = Math.max(waterLevel + 1, Math.min(heights[i]!, waterLevel + d));
    map.outcrops[i] = 0;
    surface[i] = shoreBlock;
  }
  water.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { waterLevel, water };
}
