import type { Rect } from '../structures/builder';
import type { WorldSize } from '../world/world';
import type { AreaDecl } from '../yaml/worldFile';

/** Rectangle of columns around an area (rect or circle), min inclusive, max exclusive. */
export function areaBounds(area: AreaDecl): Rect {
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

/** Whether the column (x, z) is inside an area. */
export function areaContains(area: AreaDecl, x: number, z: number): boolean {
  if (area.kind === 'rect') {
    const { from, to } = area.value;
    return x >= from[0] && x < to[0] && z >= from[1] && z < to[1];
  }
  const { center, radius } = area.value;
  return (x - center[0]) ** 2 + (z - center[1]) ** 2 <= radius * radius;
}

/** Surface of an area in square blocks. */
export function areaInBlocks(area: AreaDecl): number {
  if (area.kind === 'rect') {
    const { from, to } = area.value;
    return (to[0] - from[0]) * (to[1] - from[1]);
  }
  return Math.PI * area.value.radius ** 2;
}

/** Whether an area lies entirely within the world. */
export function areaInsideWorld(area: AreaDecl, size: WorldSize): boolean {
  const box = areaBounds(area);
  // A circle reaches its bounds only on the axes: `radius` blocks from the center, inclusive.
  const extra = area.kind === 'circle' ? 1 : 0;
  return box.minX >= 0 && box.minZ >= 0 && box.maxX + extra <= size.x && box.maxZ + extra <= size.z;
}
