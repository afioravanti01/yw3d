import { AIR, COBBLESTONE, OAK_LOG, PLANKS, ROOF_TILES } from '../blocks/builtin';
import { randomInt, type Random } from '../math/rng';
import { int, object } from '../schema/schema';
import type { Rect, StructureBuilder } from './builder';
import { defineStructure, type StructureType } from './registry';

/**
 * Houses (STRUCT-006). Local coordinates: the walls span x0 … x1 − 1 (the long side, along x)
 * and z0 … z1 − 1, centered on the anchor; y = 0 is the ground level outside. The floor
 * replaces the top ground layer (y = −1), so the door opens at ground level.
 */

/** Door size in blocks: 1 m × 2.5 m (STRUCT-006.b). */
export const DOOR_WIDTH = 2;
export const DOOR_HEIGHT = 5;
/** Wall height: the interior is 6 blocks (3 m) high up to the eaves (STRUCT-006.c). */
export const WALL_HEIGHT = 6;
const WINDOW_SIZE = 2;
const WINDOW_BOTTOM = 2;
/** Flat ground kept around the walls, so that the door is reachable from outside. */
const APRON = 2;

interface Style {
  readonly wall: number;
  /** Lowest rows of the walls in stone (the base of STRUCT-006.e), 0 for none. */
  readonly baseRows: number;
  readonly floor: number;
  readonly roof: number;
  /** Horizontal blocks per block of rise of the roof slopes (STRUCT-006.d). */
  readonly roofRun: 1 | 2;
  readonly width: readonly [number, number];
  readonly depth: readonly [number, number];
}

export const STYLES = {
  stone_farmhouse: {
    wall: COBBLESTONE,
    baseRows: 0,
    floor: PLANKS,
    roof: ROOF_TILES,
    roofRun: 2,
    width: [12, 18],
    depth: [8, 10],
  },
  wooden_hut: {
    wall: PLANKS,
    baseRows: 1,
    floor: PLANKS,
    roof: PLANKS,
    roofRun: 1,
    width: [8, 11],
    depth: [6, 7],
  },
} as const satisfies Record<string, Style>;

export type HouseStyle = keyof typeof STYLES;

/** Where the openings and the chimney go: pure data, shared by the generator and the tests. */
export interface HouseLayout {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** First x of the door, in the south wall (z = z1 − 1). */
  readonly doorX: number;
  /** First x of each window in the north wall (z = z0) and in the south wall. */
  readonly northWindows: readonly number[];
  readonly southWindows: readonly number[];
  /** Chimney column, inside the north wall. */
  readonly chimney: readonly [x: number, z: number];
  /** y of the ridge (top roof layer). */
  readonly ridgeY: number;
}

export function houseLayout(
  style: HouseStyle,
  width: number,
  depth: number,
  random: Random,
): HouseLayout {
  const x0 = -Math.floor(width / 2);
  const z0 = -Math.floor(depth / 2);
  const x1 = x0 + width;
  const z1 = z0 + depth;
  // The door keeps room for a window between it and the west corner beam.
  const doorX = randomInt(random, x0 + 2 + WINDOW_SIZE, x1 - DOOR_WIDTH - 2);
  const windowsIn = (taken: [number, number] | undefined) => {
    const out: number[] = [];
    for (let x = x0 + 2; x + WINDOW_SIZE <= x1 - 2; x += WINDOW_SIZE + 2) {
      if (taken && x + WINDOW_SIZE > taken[0] - 1 && x < taken[1] + 1) continue;
      out.push(x);
    }
    return out;
  };
  let southWindows = windowsIn([doorX, doorX + DOOR_WIDTH]);
  if (southWindows.length === 0) {
    // Narrow walls: one window right next to the door, on the west side.
    southWindows = [doorX - 1 - WINDOW_SIZE];
  }
  const northWindows = windowsIn(undefined);
  const chimneyX = random() < 0.5 ? x0 + 2 : x1 - 3;
  const halfSpan = Math.ceil((depth + 2) / 2);
  const ridgeY = WALL_HEIGHT + Math.floor((halfSpan - 1) / STYLES[style].roofRun);
  return {
    x0,
    z0,
    x1,
    z1,
    doorX,
    northWindows,
    southWindows,
    chimney: [chimneyX, z0 + 1],
    ridgeY,
  };
}

function buildHouse(builder: StructureBuilder, style: HouseStyle, layout: HouseLayout): void {
  const s: Style = STYLES[style];
  const { x0, z0, x1, z1 } = layout;

  // Floor in place of the top ground layer; interior cleared up to the roof.
  builder.fill(x0, -1, z0, x1, 0, z1, s.floor);
  builder.fill(x0, 0, z0, x1, layout.ridgeY + 1, z1, AIR);

  // Walls, with a stone base for wooden houses.
  for (let y = 0; y < WALL_HEIGHT; y++) {
    const block = y < s.baseRows ? COBBLESTONE : s.wall;
    builder.fill(x0, y, z0, x1, y + 1, z0 + 1, block);
    builder.fill(x0, y, z1 - 1, x1, y + 1, z1, block);
    builder.fill(x0, y, z0, x0 + 1, y + 1, z1, block);
    builder.fill(x1 - 1, y, z0, x1, y + 1, z1, block);
  }
  // Exposed dark beams at the corners (STRUCT-006.e).
  for (const [x, z] of [
    [x0, z0],
    [x1 - 1, z0],
    [x0, z1 - 1],
    [x1 - 1, z1 - 1],
  ] as const) {
    builder.fill(x, s.baseRows, z, x + 1, WALL_HEIGHT, z + 1, OAK_LOG);
  }

  // Pitched roof with the ridge along x, eaves overhanging by one block; gables in wall material.
  const span = z1 - z0 + 2;
  for (let i = 0; i < span; i++) {
    const z = z0 - 1 + i;
    const fromEave = Math.min(i, span - 1 - i);
    const y = WALL_HEIGHT + Math.floor(fromEave / s.roofRun);
    builder.fill(x0 - 1, y, z, x1 + 1, y + 1, z + 1, s.roof);
    if (z >= z0 && z < z1) {
      for (const x of [x0, x1 - 1]) builder.fill(x, WALL_HEIGHT, z, x + 1, y, z + 1, s.wall);
    }
  }

  // Openings.
  builder.fill(layout.doorX, 0, z1 - 1, layout.doorX + DOOR_WIDTH, DOOR_HEIGHT, z1, AIR);
  for (const [z, windows] of [
    [z0, layout.northWindows],
    [z1 - 1, layout.southWindows],
  ] as const) {
    for (const x of windows) {
      builder.fill(x, WINDOW_BOTTOM, z, x + WINDOW_SIZE, WINDOW_BOTTOM + WINDOW_SIZE, z + 1, AIR);
    }
  }

  // Chimney through the roof, two blocks above the ridge.
  const [cx, cz] = layout.chimney;
  builder.fill(cx, 0, cz, cx + 1, layout.ridgeY + 3, cz + 1, COBBLESTONE);
}

function house(style: HouseStyle): StructureType<{ width: number; depth: number }> {
  const s = STYLES[style];
  return defineStructure({
    name: style,
    params: object({
      width: int({
        min: s.width[0],
        max: s.width[1],
        default: Math.round((s.width[0] + s.width[1]) / 2),
      }),
      depth: int({
        min: s.depth[0],
        max: s.depth[1],
        default: Math.round((s.depth[0] + s.depth[1]) / 2),
      }),
    }),
    terrain: 'flatten',
    footprint: ({ width, depth }): Rect => {
      const x0 = -Math.floor(width / 2) - APRON;
      const z0 = -Math.floor(depth / 2) - APRON;
      return { minX: x0, minZ: z0, maxX: x0 + width + 2 * APRON, maxZ: z0 + depth + 2 * APRON };
    },
    generate({ params, random, builder }) {
      buildHouse(builder, style, houseLayout(style, params.width, params.depth, random));
    },
  });
}

export const stoneFarmhouse = house('stone_farmhouse');
export const woodenHut = house('wooden_hut');
export const HOUSES: readonly StructureType[] = [stoneFarmhouse, woodenHut] as StructureType[];
