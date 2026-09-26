import {
  BIRCH_LEAVES,
  BIRCH_LOG,
  OAK_LEAVES,
  OAK_LOG,
  WILLOW_LEAVES,
  WILLOW_LOG,
} from '../blocks/builtin';
import { randomInt, randomRange, type Random } from '../math/rng';
import { int, object, optional } from '../schema/schema';
import type { StructureBuilder } from './builder';
import { defineStructure, type StructureType } from './registry';

/**
 * Trees (STRUCT-005). Local origin: the trunk base, on the ground; the anchor column is the
 * trunk (1 × 1) or the south-east quarter of a 2 × 2 trunk, so the tree turns in place.
 */

/** Species data: total height range in blocks and materials (STRUCT-005.a, b). */
export const SPECIES = {
  oak: { height: [12, 20], log: OAK_LOG, leaves: OAK_LEAVES, canopyRadius: [4, 7] },
  birch: { height: [14, 22], log: BIRCH_LOG, leaves: BIRCH_LEAVES, canopyRadius: [2, 3] },
  willow: { height: [10, 16], log: WILLOW_LOG, leaves: WILLOW_LEAVES, canopyRadius: [5, 7] },
} as const;

type Species = keyof typeof SPECIES;

/** Parameters: the height is picked in the species range unless given. */
const treeParams = (species: Species) =>
  object({
    height: optional(int({ min: SPECIES[species].height[0], max: SPECIES[species].height[1] })),
  });

/**
 * Fills an ellipsoid of leaves with a ragged edge: near the surface some blocks are skipped at
 * random, so canopies do not look like cubes or perfect spheres (plan F02 P12).
 */
function canopy(
  builder: StructureBuilder,
  random: Random,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  leaves: number,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1) continue;
        if (d > 0.6 && random() < 0.35) continue;
        if (builder.get(x, y, z) === undefined) builder.set(x, y, z, leaves);
      }
    }
  }
}

/**
 * Removes the leaves not connected to the wood through other leaves or wood (6-connected), so
 * that no leaf floats in the air (STRUCT-005.c).
 */
function pruneFloatingLeaves(builder: StructureBuilder, log: number, leaves: number): void {
  const blocks = builder.entries();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const kinds = new Map(blocks.map(([x, y, z, b]) => [key(x, y, z), b]));
  const reached = new Set<string>();
  const stack: [number, number, number][] = [];
  for (const [x, y, z, b] of blocks) {
    if (b === log) {
      reached.add(key(x, y, z));
      stack.push([x, y, z]);
    }
  }
  while (stack.length > 0) {
    const [x, y, z] = stack.pop()!;
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const k = key(x + dx, y + dy, z + dz);
      if (reached.has(k) || kinds.get(k) !== leaves) continue;
      reached.add(k);
      stack.push([x + dx, y + dy, z + dz]);
    }
  }
  for (const [x, y, z, b] of blocks) {
    if (b === leaves && !reached.has(key(x, y, z))) builder.delete(x, y, z);
  }
}

const NEIGHBORS_6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** A thick trunk: 2 × 2 columns around the anchor, x and z in -1..0. */
function thickTrunk(builder: StructureBuilder, top: number, log: number): void {
  builder.fill(-1, 0, -1, 1, top, 1, log);
}

/** A branch from the trunk towards (dx, dz); a rising branch climbs one block every 2 steps. */
function branch(
  builder: StructureBuilder,
  y: number,
  dx: number,
  dz: number,
  length: number,
  log: number,
  rising = true,
): [number, number, number] {
  let x = 0;
  let z = 0;
  for (let i = 1; i <= length; i++) {
    x = Math.round(dx * i);
    z = Math.round(dz * i);
    if (rising && i % 2 === 0) y++;
    builder.set(x, y, z, log);
  }
  return [x, y, z];
}

/** Four diagonal directions and the four axes, for branches. */
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
] as const;

function pickDirections(random: Random, count: number): (typeof DIRECTIONS)[number][] {
  const pool = [...DIRECTIONS];
  const out: (typeof DIRECTIONS)[number][] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    out.push(pool.splice(randomInt(random, 0, pool.length - 1), 1)[0]!);
  }
  return out;
}

/** Oak: short thick trunk, a few branches, a wide rounded crown of several lobes. */
export const oak = defineStructure({
  name: 'oak',
  params: treeParams('oak'),
  terrain: 'sit',
  footprint: () => ({ minX: -2, minZ: -2, maxX: 2, maxZ: 2 }),
  generate({ params, random, builder }) {
    const s = SPECIES.oak;
    const height = params.height ?? randomInt(random, s.height[0], s.height[1]);
    const radius = Math.min(s.canopyRadius[1], s.canopyRadius[0] + Math.floor((height - 12) / 3));
    const crownRy = Math.max(3, Math.round(height * 0.22));
    const crownY = height - 1 - crownRy;
    const trunkTop = Math.round(height * 0.6);
    thickTrunk(builder, trunkTop, s.log);
    const lobes: [number, number, number][] = [[-0.5, crownY, -0.5]];
    for (const [dx, dz] of pickDirections(random, randomInt(random, 3, 4))) {
      const length = randomInt(random, 2, Math.max(2, radius - 2));
      const end = branch(builder, trunkTop - randomInt(random, 1, 3), dx, dz, length, s.log);
      lobes.push([end[0], Math.min(crownY, end[1] + 1), end[2]]);
    }
    builder.fill(-1, trunkTop, -1, 1, crownY + 1, 1, s.log);
    for (const [i, [x, y, z]] of lobes.entries()) {
      const r = i === 0 ? radius : randomRange(random, radius * 0.55, radius * 0.8);
      const ry = i === 0 ? crownRy : Math.max(2, crownRy - 1);
      canopy(builder, random, x, y, z, r, ry, r * randomRange(random, 0.85, 1.1), s.leaves);
    }
    builder.fill(-1, height - 1, -1, 1, height, 1, s.leaves);
    pruneFloatingLeaves(builder, s.log, s.leaves);
  },
});

/** Birch: thin pale trunk, tall and narrow crown starting half way up. */
export const birch = defineStructure({
  name: 'birch',
  params: treeParams('birch'),
  terrain: 'sit',
  footprint: () => ({ minX: -1, minZ: -1, maxX: 2, maxZ: 2 }),
  generate({ params, random, builder }) {
    const s = SPECIES.birch;
    const height = params.height ?? randomInt(random, s.height[0], s.height[1]);
    const radius = randomRange(random, s.canopyRadius[0], s.canopyRadius[1] + 0.5);
    const crownBottom = Math.round(height * randomRange(random, 0.4, 0.5));
    const crownRy = (height - crownBottom) / 2;
    builder.fill(0, 0, 0, 1, height - 2, 1, s.log);
    canopy(builder, random, 0, crownBottom + crownRy - 0.5, 0, radius, crownRy, radius, s.leaves);
    builder.fill(0, height - 2, 0, 1, height, 1, s.leaves);
    pruneFloatingLeaves(builder, s.log, s.leaves);
  },
});

/** Willow: short thick trunk, broad dome, curtains of leaves hanging close to the ground. */
export const willow = defineStructure({
  name: 'willow',
  params: treeParams('willow'),
  terrain: 'sit',
  footprint: () => ({ minX: -2, minZ: -2, maxX: 2, maxZ: 2 }),
  generate({ params, random, builder }) {
    const s = SPECIES.willow;
    const height = params.height ?? randomInt(random, s.height[0], s.height[1]);
    const radius = randomInt(random, s.canopyRadius[0], s.canopyRadius[1]);
    const domeRy = Math.max(2, Math.round(height * 0.2));
    const domeY = height - 1 - domeRy;
    thickTrunk(builder, domeY + 1, s.log);
    for (const [dx, dz] of pickDirections(random, 4)) {
      branch(builder, domeY - 1, dx, dz, radius - 2, s.log, false);
    }
    canopy(builder, random, -0.5, domeY, -0.5, radius, domeRy, radius, s.leaves);
    builder.fill(-1, domeY + 1, -1, 1, height, 1, s.leaves);
    // Hanging curtains from the lower edge of the dome.
    const minHang = 2;
    for (let z = -radius - 1; z <= radius; z++) {
      for (let x = -radius - 1; x <= radius; x++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d < radius - 2 || d > radius + 0.5 || random() < 0.45) continue;
        let y = domeY + domeRy;
        while (y > domeY - domeRy && builder.get(x, y, z) !== s.leaves) y--;
        if (builder.get(x, y, z) !== s.leaves) continue;
        const bottom = randomInt(random, minHang, Math.max(minHang, Math.floor(domeY * 0.5)));
        for (let k = y - 1; k >= bottom; k--) builder.set(x, k, z, s.leaves);
      }
    }
    pruneFloatingLeaves(builder, s.log, s.leaves);
  },
});

export const TREES: readonly StructureType[] = [oak, birch, willow] as StructureType[];
