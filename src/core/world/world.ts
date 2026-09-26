import { AIR } from '../blocks/builtin';
import { MAX_BLOCK_ID } from '../blocks/registry';
import { FNV1A_OFFSET, fnv1a } from '../math/rng';
import {
  CHUNK_MASK,
  CHUNK_SHIFT,
  CHUNK_SIZE,
  CHUNK_VOLUME,
  chunkIndex,
  type ChunkCoord,
} from './chunk';

export interface WorldSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 256 m × 48 m × 256 m (WORLD-002.a, D-003). */
export const DEFAULT_WORLD_SIZE: WorldSize = { x: 512, y: 96, z: 512 };

const HORIZONTAL_LIMITS = [32, 1024] as const;
const VERTICAL_LIMITS = [32, 256] as const;

/** Throws a RangeError naming the value and the violated constraint (WORLD-002.b). */
export function validateWorldSize(size: WorldSize): void {
  checkDimension('x', size.x, HORIZONTAL_LIMITS);
  checkDimension('y', size.y, VERTICAL_LIMITS);
  checkDimension('z', size.z, HORIZONTAL_LIMITS);
}

function checkDimension(axis: string, value: number, [min, max]: readonly [number, number]) {
  if (!Number.isInteger(value) || value % CHUNK_SIZE !== 0 || value < min || value > max) {
    throw new RangeError(
      `Invalid world size: ${axis} = ${value} (must be a multiple of ${CHUNK_SIZE} between ${min} and ${max})`,
    );
  }
}

export type BlockChangeListener = (
  x: number,
  y: number,
  z: number,
  previous: number,
  current: number,
) => void;

/** Fills one column of blocks, from y = 0 upwards. The column is all air when called. */
export type ColumnFiller = (x: number, z: number, column: Uint8Array) => void;

/**
 * The block grid of a finite world (WORLD-002). Coordinates are integers in blocks.
 * Chunks that were never written are all air and take no memory.
 */
export class World {
  readonly size: WorldSize;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunksZ: number;

  private readonly chunks: (Uint8Array | null)[];
  private readonly listeners = new Set<BlockChangeListener>();

  constructor(size: WorldSize = DEFAULT_WORLD_SIZE) {
    validateWorldSize(size);
    this.size = { x: size.x, y: size.y, z: size.z };
    this.chunksX = size.x >> CHUNK_SHIFT;
    this.chunksY = size.y >> CHUNK_SHIFT;
    this.chunksZ = size.z >> CHUNK_SHIFT;
    this.chunks = new Array<Uint8Array | null>(this.chunksX * this.chunksY * this.chunksZ).fill(
      null,
    );
  }

  /**
   * Builds a world column by column, without change notifications: this is the initial state,
   * not a sequence of edits.
   */
  static fromColumns(size: WorldSize, fill: ColumnFiller): World {
    const world = new World(size);
    const column = new Uint8Array(size.y);
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        column.fill(AIR);
        fill(x, z, column);
        world.writeColumn(x, z, column);
      }
    }
    return world;
  }

  isInside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.size.x && y < this.size.y && z < this.size.z;
  }

  /** Block id at a position; `air` outside the world (WORLD-002.c). */
  getBlock(x: number, y: number, z: number): number {
    if (!this.isInside(x, y, z)) {
      return AIR;
    }
    const chunk = this.chunks[this.chunkSlot(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT)];
    return chunk ? chunk[chunkIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)]! : AIR;
  }

  /**
   * Writes a block. Returns false, without changing anything, outside the world (WORLD-002.d).
   * Notifies listeners only when the block actually changes (WORLD-003.b).
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!Number.isInteger(id) || id < 0 || id > MAX_BLOCK_ID) {
      throw new RangeError(`Block id ${id} is not an integer in [0, ${MAX_BLOCK_ID}]`);
    }
    if (!this.isInside(x, y, z)) {
      return false;
    }
    const previous = this.getBlock(x, y, z);
    if (previous === id) {
      return true;
    }
    this.chunkForWrite(x, y, z)[chunkIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)] = id;
    for (const listener of this.listeners) {
      listener(x, y, z, previous, id);
    }
    return true;
  }

  /** Registers a change listener (WORLD-003.c). Returns the function that unregisters it. */
  onChange(listener: BlockChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Raw data of a chunk, or null if it is all air. Read-only: write through `setBlock`. */
  getChunk(cx: number, cy: number, cz: number): Uint8Array | null {
    if (!this.isChunkInside(cx, cy, cz)) {
      return null;
    }
    return this.chunks[this.chunkSlot(cx, cy, cz)]!;
  }

  isChunkInside(cx: number, cy: number, cz: number): boolean {
    return (
      cx >= 0 && cy >= 0 && cz >= 0 && cx < this.chunksX && cy < this.chunksY && cz < this.chunksZ
    );
  }

  /**
   * Chunks whose geometry depends on the block at (x, y, z): its own chunk and, when the block
   * lies on a chunk border, the neighbors that touch it, diagonals included, because face
   * culling and ambient occlusion read the blocks around each face (RENDER-005.a).
   */
  chunksAffectedBy(x: number, y: number, z: number): ChunkCoord[] {
    const range = (v: number) => {
      const c = v >> CHUNK_SHIFT;
      const local = v & CHUNK_MASK;
      if (local === 0) return [c - 1, c];
      if (local === CHUNK_MASK) return [c, c + 1];
      return [c];
    };
    const result: ChunkCoord[] = [];
    for (const cy of range(y)) {
      for (const cz of range(z)) {
        for (const cx of range(x)) {
          if (this.isChunkInside(cx, cy, cz)) {
            result.push({ cx, cy, cz });
          }
        }
      }
    }
    return result;
  }

  /** FNV-1a of the whole block grid in a fixed order, independent of chunk allocation. */
  hash(): number {
    const empty = new Uint8Array(CHUNK_VOLUME);
    let hash = FNV1A_OFFSET;
    for (const chunk of this.chunks) {
      hash = fnv1a(chunk ?? empty, hash);
    }
    return hash;
  }

  /** Copies a full column into the chunks, one chunk lookup per 32-block segment. */
  private writeColumn(x: number, z: number, column: Uint8Array): void {
    const columnOffset = chunkIndex(x & CHUNK_MASK, 0, z & CHUNK_MASK);
    for (let cy = 0; cy < this.chunksY; cy++) {
      const y0 = cy << CHUNK_SHIFT;
      let chunk: Uint8Array | null = null;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const id = column[y0 + ly]!;
        if (id !== AIR) {
          chunk ??= this.chunkForWrite(x, y0, z);
          chunk[columnOffset | chunkIndex(0, ly, 0)] = id;
        }
      }
    }
  }

  private chunkSlot(cx: number, cy: number, cz: number): number {
    return (cy * this.chunksZ + cz) * this.chunksX + cx;
  }

  private chunkForWrite(x: number, y: number, z: number): Uint8Array {
    const slot = this.chunkSlot(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT);
    let chunk = this.chunks[slot];
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_VOLUME);
      this.chunks[slot] = chunk;
    }
    return chunk;
  }
}
