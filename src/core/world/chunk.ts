/** Chunks are cubes of 32 blocks (plan P1). */
export const CHUNK_SHIFT = 5;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
}

/** Index of a block inside a chunk's data, from local coordinates in [0, 32): x, then z, then y. */
export function chunkIndex(lx: number, ly: number, lz: number): number {
  return (ly << (2 * CHUNK_SHIFT)) | (lz << CHUNK_SHIFT) | lx;
}
