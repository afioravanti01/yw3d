import { WATER } from '../blocks/builtin';
import type { World } from '../world/world';

/** Free blocks needed above a standing place: the character is 3.5 blocks tall. */
export const HEADROOM = 4;
/** Standing levels kept per corner: ground, a floor, a roof… (plan F05 P2). */
export const LEVELS = 4;
const NONE = -1;

/**
 * Where characters can stand, on the **corners** of the block grid (plan F05 P1): a corner is
 * the meeting point of 4 columns, and a character centered on it covers those 4 columns. A
 * corner has up to LEVELS standing heights; a level is "wet" when it is in water.
 */
export class NavGrid {
  /** Corners along x and z: one per internal grid line. */
  readonly cornersX: number;
  readonly cornersZ: number;
  /** Standing height of each (corner, slot), NONE when absent. */
  readonly level: Int16Array;
  /** 1 when the (corner, slot) is in water: swimming. */
  readonly wet: Uint8Array;

  constructor(
    readonly world: World,
    private readonly solid: Uint8Array,
  ) {
    const { size } = world;
    this.cornersX = size.x - 1;
    this.cornersZ = size.z - 1;
    const corners = this.cornersX * this.cornersZ;
    this.level = new Int16Array(corners * LEVELS).fill(NONE);
    this.wet = new Uint8Array(corners * LEVELS);
    this.build();
  }

  /** Node index of a corner slot; corner (cx, cz) is the point (cx + 1, cz + 1). */
  node(cx: number, cz: number, slot: number): number {
    return (cx + cz * this.cornersX) * LEVELS + slot;
  }

  /** Position of the point of a node, in blocks: where a character stands. */
  point(node: number): { x: number; y: number; z: number } {
    const corner = Math.floor(node / LEVELS);
    const cx = corner % this.cornersX;
    const cz = (corner - cx) / this.cornersX;
    return { x: cx + 1, y: this.level[node]!, z: cz + 1 };
  }

  /** The slot of corner (cx, cz) whose level is closest to `y`, or NONE. */
  nearestSlot(cx: number, cz: number, y: number): number {
    let best = NONE;
    let distance = Infinity;
    for (let s = 0; s < LEVELS; s++) {
      const l = this.level[this.node(cx, cz, s)]!;
      if (l === NONE) continue;
      const d = Math.abs(l - y);
      if (d < distance) {
        best = s;
        distance = d;
      }
    }
    return best;
  }

  private build(): void {
    const { size } = this.world;
    // Standing levels of every column (not corners yet), with their wetness.
    const columnLevels: number[][] = new Array(size.x * size.z);
    const columnWet: boolean[][] = new Array(size.x * size.z);
    // Free blocks above each level, counted up to HEADROOM + 1: enough to know whether the
    // character still fits when it stands one block higher on a neighbor column.
    const columnFree: number[][] = new Array(size.x * size.z);
    const column = new Uint8Array(size.y);
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        this.world.readColumn(x, z, column);
        const levels: number[] = [];
        const wets: boolean[] = [];
        const frees: number[] = [];
        for (let y = 1; y + HEADROOM <= size.y; y++) {
          const below = column[y - 1]!;
          const onSolid = this.solid[below] === 1;
          // On the water surface: floating, where the block below is water and this one is not.
          const onWater = below === WATER && column[y] !== WATER;
          if (!onSolid && !onWater) continue;
          let free = true;
          for (let k = 0; k < HEADROOM && free; k++) {
            const b = column[y + k]!;
            if (this.solid[b] === 1 || (k > 0 && b === WATER)) free = false;
          }
          if (!free) continue;
          let freeCount = HEADROOM;
          if (y + HEADROOM < size.y && this.solid[column[y + HEADROOM]!] !== 1) freeCount++;
          levels.push(y);
          wets.push(onWater || column[y] === WATER);
          frees.push(freeCount);
        }
        columnLevels[x + z * size.x] = levels;
        columnWet[x + z * size.x] = wets;
        columnFree[x + z * size.x] = frees;
      }
    }
    // A corner level L needs each of its 4 columns to have a level in [L - 1, L], the free space
    // of the highest one above: the character stands on the highest of the four.
    for (let cz = 0; cz < this.cornersZ; cz++) {
      for (let cx = 0; cx < this.cornersX; cx++) {
        const cols = [
          cx + cz * size.x,
          cx + 1 + cz * size.x,
          cx + (cz + 1) * size.x,
          cx + 1 + (cz + 1) * size.x,
        ];
        const candidates = new Set<number>();
        for (const c of cols) for (const l of columnLevels[c]!) candidates.add(l);
        let slot = 0;
        for (const L of [...candidates].sort((a, b) => a - b)) {
          if (slot >= LEVELS) break;
          let ok = true;
          let wet = false;
          let top = false;
          for (const c of cols) {
            const levels = columnLevels[c]!;
            const i = levels.findIndex((l) => l === L || l === L - 1);
            // A column one block lower must stay free one block higher than its own headroom.
            if (i < 0 || (levels[i] === L - 1 && columnFree[c]![i]! <= HEADROOM)) {
              ok = false;
              break;
            }
            if (levels[i] === L) top = true;
            wet ||= columnWet[c]![i]!;
          }
          if (!ok || !top) continue;
          const n = this.node(cx, cz, slot++);
          this.level[n] = L;
          this.wet[n] = wet ? 1 : 0;
        }
      }
    }
  }
}
