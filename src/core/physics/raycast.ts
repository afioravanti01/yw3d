export type IsBlocking = (x: number, y: number, z: number) => boolean;

/**
 * Walks a ray through the block grid (Amanatides–Woo DDA, plan F03 P8) and returns the
 * distance to the first blocking block, or `maxDistance` if there is none. `direction` must
 * have length 1. Used for the third-person camera and, later, for lines of sight.
 */
export function raycast(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  maxDistance: number,
  isBlocking: IsBlocking,
): number {
  const cell = origin.map(Math.floor) as [number, number, number];
  if (isBlocking(cell[0], cell[1], cell[2])) return 0;
  const step = direction.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0)) as [number, number, number];
  const tDelta = direction.map((d) => (d === 0 ? Infinity : Math.abs(1 / d)));
  const tMax = direction.map((d, i) =>
    d === 0 ? Infinity : (d > 0 ? cell[i]! + 1 - origin[i]! : origin[i]! - cell[i]!) * tDelta[i]!,
  );
  let t = 0;
  while (t <= maxDistance) {
    const axis = tMax[0]! < tMax[1]! ? (tMax[0]! < tMax[2]! ? 0 : 2) : tMax[1]! < tMax[2]! ? 1 : 2;
    t = tMax[axis]!;
    if (t > maxDistance) break;
    cell[axis] += step[axis];
    tMax[axis] = tMax[axis]! + tDelta[axis]!;
    if (isBlocking(cell[0], cell[1], cell[2])) return t;
  }
  return maxDistance;
}
