import type { BoxSize, EntityState } from './entity';

/** Tolerance for faces that touch without overlapping. */
export const EPSILON = 1e-7;

export type Axis = 0 | 1 | 2;
export type IsSolid = (x: number, y: number, z: number) => boolean;

export interface Box {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

export function boxOf(state: Pick<EntityState, 'x' | 'y' | 'z'>, size: BoxSize): Box {
  const half = size.width / 2;
  return {
    min: [state.x - half, state.y, state.z - half],
    max: [state.x + half, state.y + size.height, state.z + half],
  };
}

/** Whether any solid block overlaps the box (faces that only touch do not count). */
export function boxIntersectsSolid(box: Box, isSolid: IsSolid): boolean {
  for (let y = Math.floor(box.min[1] + EPSILON); y <= Math.floor(box.max[1] - EPSILON); y++) {
    for (let z = Math.floor(box.min[2] + EPSILON); z <= Math.floor(box.max[2] - EPSILON); z++) {
      for (let x = Math.floor(box.min[0] + EPSILON); x <= Math.floor(box.max[0] - EPSILON); x++) {
        if (isSolid(x, y, z)) return true;
      }
    }
  }
  return false;
}

/** Whether the cross-section of the box perpendicular to `axis`, at layer `k`, has a solid. */
function layerBlocked(box: Box, axis: Axis, k: number, isSolid: IsSolid): boolean {
  const a = axis === 0 ? 1 : 0;
  const b = axis === 2 ? 1 : 2;
  const cell: [number, number, number] = [0, 0, 0];
  cell[axis] = k;
  for (let i = Math.floor(box.min[a] + EPSILON); i <= Math.floor(box.max[a] - EPSILON); i++) {
    for (let j = Math.floor(box.min[b] + EPSILON); j <= Math.floor(box.max[b] - EPSILON); j++) {
      cell[a] = i;
      cell[b] = j;
      if (isSolid(cell[0], cell[1], cell[2])) return true;
    }
  }
  return false;
}

export interface AxisMove {
  /** Distance actually moved, with the sign of the request. */
  readonly moved: number;
  readonly blocked: boolean;
}

/**
 * Moves a box along one axis by `delta`, checking every layer of blocks it sweeps through and
 * stopping against the first solid one (plan F03 P3). No speed can skip a layer (PHYS-004.c).
 * When blocked, the leading face lands exactly on the block face.
 */
export function moveAlongAxis(box: Box, axis: Axis, delta: number, isSolid: IsSolid): AxisMove {
  if (delta > 0) {
    const face = box.max[axis];
    const first = Math.floor(face - EPSILON) + 1;
    const last = Math.floor(face + delta - EPSILON);
    for (let k = first; k <= last; k++) {
      if (layerBlocked(box, axis, k, isSolid))
        return { moved: Math.max(0, k - face), blocked: true };
    }
  } else if (delta < 0) {
    const face = box.min[axis];
    const first = Math.floor(face + EPSILON) - 1;
    const last = Math.floor(face + delta + EPSILON);
    for (let k = first; k >= last; k--) {
      if (layerBlocked(box, axis, k, isSolid))
        return { moved: Math.min(0, k + 1 - face), blocked: true };
    }
  }
  return { moved: delta, blocked: false };
}
