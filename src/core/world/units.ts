/** Edge of a block in meters (WORLD-001.b, D-002). The only place where the scale is defined. */
export const BLOCK_SIZE_M = 0.5;

export function blocksToMeters(blocks: number): number {
  return blocks * BLOCK_SIZE_M;
}

export function metersToBlocks(meters: number): number {
  return meters / BLOCK_SIZE_M;
}

/** Integer coordinate of the block containing a point given in blocks: block b spans [b, b + 1). */
export function blockCoord(value: number): number {
  return Math.floor(value);
}
