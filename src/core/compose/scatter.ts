import { createRng, hash3, randomInt, type Random } from '../math/rng';
import type { Issue } from '../schema/schema';
import { rectsOverlap, type Rect, type Rotation } from '../structures/builder';
import { parseParams, structureSeed, type StructureRegistry } from '../structures/registry';
import type { WorldSize } from '../world/world';
import type { AreaDecl, ScatterDecl } from '../yaml/worldFile';
import { footprintOf, rectInside, type Placement } from './placement';

/** Square blocks in 100 m²: a block is 0.5 m × 0.5 m. */
const BLOCKS_PER_100_M2 = 400;
const ATTEMPTS = 30;
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

function bounds(area: AreaDecl): Rect {
  if (area.kind === 'rect') {
    const { from, to } = area.value;
    return { minX: from[0], minZ: from[1], maxX: to[0], maxZ: to[1] };
  }
  const { center, radius } = area.value;
  return {
    minX: center[0] - radius,
    minZ: center[1] - radius,
    maxX: center[0] + radius,
    maxZ: center[1] + radius,
  };
}

function contains(area: AreaDecl, x: number, z: number): boolean {
  if (area.kind === 'rect') {
    const { from, to } = area.value;
    return x >= from[0] && x < to[0] && z >= from[1] && z < to[1];
  }
  const { center, radius } = area.value;
  return (x - center[0]) ** 2 + (z - center[1]) ** 2 <= radius * radius;
}

function areaInBlocks(area: AreaDecl): number {
  if (area.kind === 'rect') {
    const { from, to } = area.value;
    return (to[0] - from[0]) * (to[1] - from[1]);
  }
  return Math.PI * area.value.radius ** 2;
}

/**
 * Poisson disk sampling on a grid (Bridson), plan F02 P7: points at least `minDistance` apart,
 * in random order. Depends only on the area, the distance and the random source.
 */
export function poissonDisk(
  area: AreaDecl,
  minDistance: number,
  random: Random,
): [number, number][] {
  const box = bounds(area);
  const cell = minDistance / Math.SQRT2;
  const cols = Math.max(1, Math.ceil((box.maxX - box.minX) / cell));
  const rows = Math.max(1, Math.ceil((box.maxZ - box.minZ) / cell));
  const grid = new Int32Array(cols * rows).fill(-1);
  const points: [number, number][] = [];
  const active: number[] = [];
  const cellOf = (x: number, z: number) =>
    [Math.floor((x - box.minX) / cell), Math.floor((z - box.minZ) / cell)] as const;
  const fits = (x: number, z: number) => {
    if (x < box.minX || z < box.minZ || x >= box.maxX || z >= box.maxZ) return false;
    const [cx, cz] = cellOf(x, z);
    for (let j = Math.max(0, cz - 2); j <= Math.min(rows - 1, cz + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(cols - 1, cx + 2); i++) {
        const p = grid[i + j * cols]!;
        if (p >= 0 && (points[p]![0] - x) ** 2 + (points[p]![1] - z) ** 2 < minDistance ** 2) {
          return false;
        }
      }
    }
    return true;
  };
  const add = (x: number, z: number) => {
    const [cx, cz] = cellOf(x, z);
    grid[cx + cz * cols] = points.length;
    active.push(points.length);
    points.push([x, z]);
  };

  add(
    box.minX + Math.floor(random() * (box.maxX - box.minX)),
    box.minZ + Math.floor(random() * (box.maxZ - box.minZ)),
  );
  while (active.length > 0) {
    const slot = randomInt(random, 0, active.length - 1);
    const [px, pz] = points[active[slot]!]!;
    let placed = false;
    for (let k = 0; k < ATTEMPTS; k++) {
      // Uniform in the annulus [r, 2r), without trigonometry (deterministic everywhere).
      let dx: number;
      let dz: number;
      let d2: number;
      do {
        dx = (random() * 2 - 1) * 2 * minDistance;
        dz = (random() * 2 - 1) * 2 * minDistance;
        d2 = dx * dx + dz * dz;
      } while (d2 < minDistance * minDistance || d2 >= 4 * minDistance * minDistance);
      // Integer columns, rounded away from the parent so the distance never shrinks.
      const x = px + (dx < 0 ? Math.floor(dx) : Math.ceil(dx));
      const z = pz + (dz < 0 ? Math.floor(dz) : Math.ceil(dz));
      if (fits(x, z)) {
        add(x, z);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(slot, 1);
  }

  // Random order, so that taking the first n points spreads them over the whole area.
  for (let i = points.length - 1; i > 0; i--) {
    const j = randomInt(random, 0, i);
    [points[i], points[j]] = [points[j]!, points[i]!];
  }
  return points.filter(([x, z]) => contains(area, x, z));
}

function pickType(weights: readonly [string, number][], random: Random): string {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [name, w] of weights) {
    r -= w;
    if (r < 0) return name;
  }
  return weights[weights.length - 1]![0];
}

/**
 * Structures of the distributions (YAML-005). A candidate is dropped when its footprint leaves
 * the world, overlaps an occupied footprint or covers water (YAML-005.c). `occupied` grows with
 * the accepted placements, so later distributions avoid earlier ones.
 */
export function scatterStructures(
  decls: readonly ScatterDecl[],
  registry: StructureRegistry,
  worldSeed: number,
  size: WorldSize,
  occupied: Rect[],
  water: ReadonlySet<number>,
  issues: Issue[],
  warnings: Issue[],
): Placement[] {
  const placements: Placement[] = [];
  decls.forEach((decl, i) => {
    const path = ['scatter', i];
    const weights = Object.entries(decl.types).filter(([, w]) => w > 0);
    let valid = true;
    for (const [name] of weights) {
      if (!registry.get(name)) {
        issues.push({
          path: [...path, 'types', name],
          message: `unknown structure type "${name}"; available: ${registry.names().join(', ')}`,
        });
        valid = false;
      }
    }
    if (!valid) return;

    const random = createRng(decl.seed ?? hash3(i, 0x5ca77e4, 0, worldSeed));
    const wanted =
      decl.count ?? Math.round(((decl.density ?? 0) * areaInBlocks(decl.area)) / BLOCKS_PER_100_M2);
    let placed = 0;
    for (const [x, z] of poissonDisk(decl.area, decl.minDistance, random)) {
      if (placed >= wanted) break;
      const type = registry.get(pickType(weights, random))!;
      const rotation = ROTATIONS[randomInt(random, 0, 3)]!;
      const params = parseParams(type, {}, [...path, 'types', type.name], issues);
      if (params === undefined) return;
      const rect = footprintOf(type, params, x, z, rotation);
      if (!rectInside(rect, size) || occupied.some((o) => rectsOverlap(o, rect))) continue;
      if (coversWater(rect, water, size)) continue;
      occupied.push(rect);
      placements.push({
        path,
        type,
        params,
        x,
        z,
        y: undefined,
        rotation,
        seed: structureSeed(worldSeed, x, z, type.name),
        rect,
      });
      placed++;
    }
    if (placed < wanted) {
      warnings.push({
        path,
        message: `placed ${placed} of ${wanted} structures: the area is too small or too crowded for the minimum distance`,
      });
    }
  });
  return placements;
}

function coversWater(rect: Rect, water: ReadonlySet<number>, size: WorldSize): boolean {
  for (let z = rect.minZ; z < rect.maxZ; z++) {
    for (let x = rect.minX; x < rect.maxX; x++) {
      if (water.has(x + z * size.x)) return true;
    }
  }
  return false;
}
