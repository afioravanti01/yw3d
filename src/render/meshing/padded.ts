import { CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE, chunkIndex } from '../../core/world/chunk';
import type { World } from '../../core/world/world';

/** Edge of a chunk copy with a 1-block border on every side (plan P3). */
export const PADDED_SIZE = CHUNK_SIZE + 2;
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;

/** Index in a padded copy, from chunk-local coordinates in [-1, CHUNK_SIZE]. */
export function paddedIndex(x: number, y: number, z: number): number {
  return ((y + 1) * PADDED_SIZE + (z + 1)) * PADDED_SIZE + (x + 1);
}

/**
 * Copies chunk (cx, cy, cz) and the blocks around it into `out`, so that the mesher can read
 * every neighbor without special cases. Blocks outside the world read as air.
 */
export function copyPaddedChunk(
  world: World,
  cx: number,
  cy: number,
  cz: number,
  out: Uint8Array = new Uint8Array(PADDED_VOLUME),
): Uint8Array {
  const ox = cx << CHUNK_SHIFT;
  const oy = cy << CHUNK_SHIFT;
  const oz = cz << CHUNK_SHIFT;
  const chunk = world.getChunk(cx, cy, cz);
  for (let y = -1; y <= CHUNK_SIZE; y++) {
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      const interiorRow = y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
      if (interiorRow) {
        const row = paddedIndex(0, y, z);
        if (chunk) {
          const src = chunkIndex(0, y & CHUNK_MASK, z & CHUNK_MASK);
          out.set(chunk.subarray(src, src + CHUNK_SIZE), row);
        } else {
          out.fill(0, row, row + CHUNK_SIZE);
        }
        out[row - 1] = world.getBlock(ox - 1, oy + y, oz + z);
        out[row + CHUNK_SIZE] = world.getBlock(ox + CHUNK_SIZE, oy + y, oz + z);
      } else {
        for (let x = -1; x <= CHUNK_SIZE; x++) {
          out[paddedIndex(x, y, z)] = world.getBlock(ox + x, oy + y, oz + z);
        }
      }
    }
  }
  return out;
}
