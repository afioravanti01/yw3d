import { DIRT, GRASS, STONE } from '../blocks/builtin';
import { createNoise, fbm, warp } from '../math/noise';
import { createRng, randomInt, randomRange } from '../math/rng';
import { DEFAULT_WORLD_SIZE, World, type WorldSize } from '../world/world';

/** Tunable parameters of the terrain generator. Lengths and heights are in blocks. */
export interface TerrainParams {
  /** Mean surface height. */
  readonly base: number;
  /** Broad valleys and highlands: a single very long wave. */
  readonly valleyAmplitude: number;
  readonly valleyWavelength: number;
  /** Rolling hills: amplitude, wavelength of the first octave, octaves. */
  readonly hillAmplitude: number;
  readonly hillWavelength: number;
  readonly hillOctaves: number;
  /** Domain warping of hills and mounds (plan P14). */
  readonly warpAmplitude: number;
  readonly warpWavelength: number;
  /** Mounds ("poggi"): smooth bumps that guarantee relief and rocky areas. */
  readonly moundCount: readonly [number, number];
  readonly moundHeight: readonly [number, number];
  readonly moundRadius: readonly [number, number];
  /** Plains (A1.2): a large-scale mask where hills and detail flatten out; mounds are kept. */
  readonly plainsWavelength: number;
  /** Mask noise value (-1..1) at the middle of the transition between hills and plains. */
  readonly plainsThreshold: number;
  /** Width of the transition, in mask noise units. */
  readonly plainsTransition: number;
  /** Fraction of hills and detail left where the mask is fully plain. */
  readonly plainsRoughness: number;
  /** Small-scale unevenness. */
  readonly detailAmplitude: number;
  readonly detailWavelength: number;
  /** A column is rocky if the height difference with a neighbor reaches this value (WORLD-006.e). */
  readonly rockSlope: number;
  /** On mounds, rock outcrops where the mound is at least this strong (0..1)… */
  readonly outcropMinMound: number;
  /** …and the outcrop noise exceeds this threshold (-1..1). */
  readonly outcropThreshold: number;
  readonly outcropWavelength: number;
  /** Outcrops rise above the grass by up to this height, so that rock visibly sticks out. */
  readonly outcropLift: number;
  /** Dirt layer thickness under grass, inclusive range (WORLD-006.d). */
  readonly dirtDepth: readonly [number, number];
  readonly dirtWavelength: number;
  /** Surface height limits, inclusive (WORLD-006.a). */
  readonly minSurface: number;
  readonly maxSurface: number;
}

export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  base: 36,
  valleyAmplitude: 8,
  valleyWavelength: 420,
  hillAmplitude: 14,
  hillWavelength: 110,
  hillOctaves: 4,
  warpAmplitude: 28,
  warpWavelength: 180,
  moundCount: [3, 6],
  moundHeight: [18, 30],
  moundRadius: [44, 88],
  plainsWavelength: 200,
  plainsThreshold: -0.1,
  plainsTransition: 0.3,
  plainsRoughness: 0.05,
  detailAmplitude: 2,
  detailWavelength: 22,
  rockSlope: 3,
  outcropMinMound: 0.45,
  outcropThreshold: 0.15,
  outcropWavelength: 18,
  outcropLift: 3,
  dirtDepth: [3, 5],
  dirtWavelength: 40,
  minSurface: 16,
  maxSurface: 72,
};

interface Mound {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Independent noise fields derived from the seed. */
const SALT = {
  hills: 1,
  warpX: 2,
  warpZ: 3,
  detail: 4,
  outcrop: 5,
  dirt: 6,
  valley: 7,
  plains: 8,
} as const;

export interface Heightmap {
  readonly sizeX: number;
  readonly sizeZ: number;
  /** Surface height per column, index x + z * sizeX: the y of the topmost solid block. */
  readonly heights: Uint8Array;
  /** 1 where the column is a rock outcrop on a mound. */
  readonly outcrops: Uint8Array;
}

function placeMounds(seed: number, size: WorldSize, params: TerrainParams): Mound[] {
  const random = createRng(seed ^ 0x5eed0001);
  const count = randomInt(random, params.moundCount[0], params.moundCount[1]);
  const mounds: Mound[] = [];
  for (let i = 0; i < count; i++) {
    const radius = randomRange(random, params.moundRadius[0], params.moundRadius[1]);
    const margin = radius * 0.5;
    mounds.push({
      x: randomRange(random, margin, size.x - margin),
      z: randomRange(random, margin, size.z - margin),
      radius,
      height: randomRange(random, params.moundHeight[0], params.moundHeight[1]),
    });
  }
  return mounds;
}

/**
 * Compresses heights beyond `soft` towards `hard` without reaching it, so that summits and
 * valley floors round off instead of being cut flat. Only basic arithmetic: see WORLD-005.d.
 */
function softLimit(h: number, softMin: number, softMax: number, min: number, max: number): number {
  if (h > softMax) {
    const t = (h - softMax) / (max - softMax);
    return softMax + ((max - softMax) * t) / (1 + t);
  }
  if (h < softMin) {
    const t = (softMin - h) / (softMin - min);
    return softMin - ((softMin - min) * t) / (1 + t);
  }
  return h;
}

/** Clamps t to 0..1 and eases it, with zero slope at both ends. */
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Smooth radial bump: 1 at the center, 0 from the radius on, with zero slope at both ends. */
function bump(dx: number, dz: number, radius: number): number {
  const t = (dx * dx + dz * dz) / (radius * radius);
  return t >= 1 ? 0 : (1 - t) * (1 - t);
}

export function generateHeightmap(
  seed: number,
  size: WorldSize = DEFAULT_WORLD_SIZE,
  params: TerrainParams = DEFAULT_TERRAIN_PARAMS,
): Heightmap {
  const hills = createNoise(seed, SALT.hills);
  const warpX = createNoise(seed, SALT.warpX);
  const warpZ = createNoise(seed, SALT.warpZ);
  const detail = createNoise(seed, SALT.detail);
  const valley = createNoise(seed, SALT.valley);
  const plains = createNoise(seed, SALT.plains);
  const outcrop = createNoise(seed, SALT.outcrop);
  const mounds = placeMounds(seed, size, params);
  const heights = new Uint8Array(size.x * size.z);
  const outcrops = new Uint8Array(size.x * size.z);
  const hillOptions = { wavelength: params.hillWavelength, octaves: params.hillOctaves };
  const detailFrequency = 1 / params.detailWavelength;
  const valleyFrequency = 1 / params.valleyWavelength;
  const outcropFrequency = 1 / params.outcropWavelength;
  const plainsFrequency = 1 / params.plainsWavelength;

  for (let z = 0; z < size.z; z++) {
    for (let x = 0; x < size.x; x++) {
      const [wx, wz] = warp(warpX, warpZ, x, z, params.warpWavelength, params.warpAmplitude);
      let strength = 0;
      let moundHeight = 0;
      for (const m of mounds) {
        // Overlapping mounds merge instead of stacking, so peaks stay within the height limits.
        const b = bump(wx - m.x, wz - m.z, m.radius);
        moundHeight = Math.max(moundHeight, b * m.height);
        strength = Math.max(strength, b);
      }
      const plain = smoothstep(
        (plains(x * plainsFrequency, z * plainsFrequency) - params.plainsThreshold) /
          params.plainsTransition +
          0.5,
      );
      const roughness = 1 - (1 - params.plainsRoughness) * plain;
      let h =
        params.base +
        params.valleyAmplitude * valley(x * valleyFrequency, z * valleyFrequency) +
        roughness * params.hillAmplitude * fbm(hills, wx, wz, hillOptions) +
        moundHeight +
        roughness * params.detailAmplitude * detail(x * detailFrequency, z * detailFrequency);
      const i = x + z * size.x;
      if (strength >= params.outcropMinMound) {
        const excess =
          outcrop(x * outcropFrequency, z * outcropFrequency) - params.outcropThreshold;
        if (excess > 0) {
          outcrops[i] = 1;
          h += params.outcropLift * Math.min(1, excess / 0.25);
        }
      }
      const soft = softLimit(
        h,
        params.minSurface + 8,
        params.maxSurface - 8,
        params.minSurface,
        params.maxSurface,
      );
      heights[i] = Math.min(params.maxSurface, Math.max(params.minSurface, Math.round(soft)));
    }
  }
  return { sizeX: size.x, sizeZ: size.z, heights, outcrops };
}

/** Largest height difference between a column and its 4 neighbors inside the map. */
export function maxNeighborDrop(map: Heightmap, x: number, z: number): number {
  const h = map.heights[x + z * map.sizeX]!;
  let max = 0;
  if (x > 0) max = Math.max(max, Math.abs(h - map.heights[x - 1 + z * map.sizeX]!));
  if (x < map.sizeX - 1) max = Math.max(max, Math.abs(h - map.heights[x + 1 + z * map.sizeX]!));
  if (z > 0) max = Math.max(max, Math.abs(h - map.heights[x + (z - 1) * map.sizeX]!));
  if (z < map.sizeZ - 1) max = Math.max(max, Math.abs(h - map.heights[x + (z + 1) * map.sizeX]!));
  return max;
}

/**
 * Generates the F01 terrain: plains and rolling hills with mounds and rock outcrops (WORLD-006).
 * Deterministic: the same seed, size and params always give the same world (WORLD-005).
 */
export function generateTerrain(
  seed: number,
  size: WorldSize = DEFAULT_WORLD_SIZE,
  params: TerrainParams = DEFAULT_TERRAIN_PARAMS,
): World {
  const map = generateHeightmap(seed, size, params);
  const dirt = createNoise(seed, SALT.dirt);
  const dirtFrequency = 1 / params.dirtWavelength;
  const [minDirt, maxDirt] = params.dirtDepth;

  return World.fromColumns(size, (x, z, column) => {
    const i = x + z * size.x;
    const h = map.heights[i]!;
    const rocky = map.outcrops[i] === 1 || maxNeighborDrop(map, x, z) >= params.rockSlope;
    if (rocky) {
      column.fill(STONE, 0, h + 1);
      return;
    }
    const t = (dirt(x * dirtFrequency, z * dirtFrequency) + 1) / 2;
    const depth = Math.min(maxDirt, minDirt + Math.floor(t * (maxDirt - minDirt + 1)));
    column.fill(STONE, 0, h - depth);
    column.fill(DIRT, h - depth, h);
    column[h] = GRASS;
  });
}
