import { AIR } from '../blocks/builtin';
import type { World } from './world';

/**
 * Blocks set or removed during the simulation (LAB-004.b): a box of one block, never where an
 * entity stands (P3). Only the blocks that really change are written and returned.
 */

/** A block that changed: its position and its new id. */
export type BlockEdit = readonly [x: number, y: number, z: number, block: number];

export function editBox(
  world: World,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  block: number,
  occupied: (x: number, y: number, z: number) => boolean,
): { readonly edits: BlockEdit[]; readonly skipped: number } {
  const edits: BlockEdit[] = [];
  let skipped = 0;
  const [x0, x1] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
  const [y0, y1] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
  const [z0, z1] = [Math.min(from[2], to[2]), Math.max(from[2], to[2])];
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!world.isInside(x, y, z) || world.getBlock(x, y, z) === block) continue;
        // Removing is always possible; a block never appears inside someone (P3).
        if (block !== AIR && occupied(x, y, z)) {
          skipped++;
          continue;
        }
        world.setBlock(x, y, z, block);
        edits.push([x, y, z, block]);
      }
    }
  }
  return { edits, skipped };
}
