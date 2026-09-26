import { GRAVEL, SAND } from '../blocks/builtin';
import { createNoise } from '../math/noise';
import { randomInt } from '../math/rng';
import { int, object } from '../schema/schema';
import { defineStructure, type Basin } from './registry';

/** Maximum outward bulge of the shoreline, relative to the radius. */
const IRREGULARITY = 0.3;
const MAX_SHORE = 3;

export interface PondParams {
  readonly radius: number;
  readonly depth: number;
}

/**
 * The water columns of a pond around the anchor, with their depth (plan F02 P10): the radius
 * is modulated by noise along the direction from the center, so the shoreline is irregular;
 * the bed is deepest in the middle and slopes up to 1 block at the shore.
 */
export function pondColumns(params: PondParams, seed: number): [number, number, number][] {
  const noise = createNoise(seed, 1);
  const reach = Math.ceil(params.radius * (1 + IRREGULARITY));
  const columns: [number, number, number][] = [];
  for (let z = -reach; z < reach; z++) {
    for (let x = -reach; x < reach; x++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const distance = Math.sqrt(cx * cx + cz * cz);
      // Two octaves along the unit direction: lobes and small coves.
      const nx = cx / distance;
      const nz = cz / distance;
      const wobble = 0.7 * noise(nx * 1.3, nz * 1.3) + 0.3 * noise(nx * 3.1 + 7, nz * 3.1 + 7);
      const edge = params.radius * (1 + IRREGULARITY * wobble);
      if (distance > edge) continue;
      const t = distance / edge;
      columns.push([x, z, Math.max(1, Math.round(params.depth * (1 - t * t)))]);
    }
  }
  return columns;
}

export const pond = defineStructure({
  name: 'pond',
  params: object({
    radius: int({ min: 5, max: 24, default: 10 }),
    depth: int({ min: 2, max: 6, default: 3 }),
  }),
  terrain: 'dig',
  footprint: ({ radius }) => {
    const r = Math.ceil(radius * (1 + IRREGULARITY)) + MAX_SHORE;
    return { minX: -r, minZ: -r, maxX: r, maxZ: r };
  },
  basin({ params, seed, random }): Basin {
    return {
      columns: pondColumns(params, seed),
      shoreWidth: randomInt(random, 1, MAX_SHORE),
      shoreBlock: random() < 0.7 ? SAND : GRAVEL,
    };
  },
  generate() {},
});
