import type { World } from '../world/world';

/** Rotation around the vertical axis, clockwise seen from above (x east, z south). */
export type Rotation = 0 | 90 | 180 | 270;

/** Axis-aligned rectangle of columns, min inclusive, max exclusive. */
export interface Rect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/**
 * Rotates the column (x, z) around the anchor point (0, 0), the corner of column (0, 0): a
 * structure centered on the anchor rotates in place (STRUCT-002.c).
 */
export function rotateColumn(x: number, z: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0:
      return [x, z];
    case 90:
      return [-z - 1, x];
    case 180:
      return [-x - 1, -z - 1];
    case 270:
      return [z, -x - 1];
  }
}

export function rotateRect(rect: Rect, rotation: Rotation): Rect {
  const [ax, az] = rotateColumn(rect.minX, rect.minZ, rotation);
  const [bx, bz] = rotateColumn(rect.maxX - 1, rect.maxZ - 1, rotation);
  return {
    minX: Math.min(ax, bx),
    minZ: Math.min(az, bz),
    maxX: Math.max(ax, bx) + 1,
    maxZ: Math.max(az, bz) + 1,
  };
}

export const translateRect = (rect: Rect, x: number, z: number): Rect => ({
  minX: rect.minX + x,
  minZ: rect.minZ + z,
  maxX: rect.maxX + x,
  maxZ: rect.maxZ + z,
});

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

/**
 * Collects the blocks of one structure in its own coordinates: (0, 0, 0) is the anchor column,
 * y = 0 the first layer above the ground. Later writes to the same position win.
 */
export class StructureBuilder {
  private readonly blocks = new Map<string, [number, number, number, number]>();

  set(x: number, y: number, z: number, block: number): void {
    this.blocks.set(`${x},${y},${z}`, [x, y, z, block]);
  }

  get(x: number, y: number, z: number): number | undefined {
    return this.blocks.get(`${x},${y},${z}`)?.[3];
  }

  /** Fills the box [x0, x1) × [y0, y1) × [z0, z1). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: number) {
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          this.set(x, y, z, block);
        }
      }
    }
  }

  get size(): number {
    return this.blocks.size;
  }

  /** Local blocks, sorted by position so that the order never depends on write history. */
  entries(): [number, number, number, number][] {
    return [...this.blocks.values()].sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  }

  /**
   * Writes the blocks into the world, rotated and moved so that the local origin lands on
   * (x, y, z). Blocks outside the world are skipped; returns how many were written.
   */
  stamp(world: World, x: number, y: number, z: number, rotation: Rotation): number {
    let written = 0;
    for (const [lx, ly, lz, block] of this.entries()) {
      const [rx, rz] = rotateColumn(lx, lz, rotation);
      if (world.isInside(x + rx, y + ly, z + rz)) {
        world.setBlock(x + rx, y + ly, z + rz, block);
        written++;
      }
    }
    return written;
  }
}
