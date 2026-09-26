import { describe, expect, it } from 'vitest';
import { AIR, COBBLESTONE, OAK_LOG } from '../blocks/builtin';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createRng, randomInt } from '../math/rng';
import { rotateColumn, StructureBuilder, type Rotation } from './builder';
import { createDefaultStructures } from './builtin';
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  houseLayout,
  STYLES,
  WALL_HEIGHT,
  type HouseLayout,
  type HouseStyle,
} from './houses';
import { buildStructure, structureSeed } from './registry';

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 104729 + 3);
const NAMES = Object.keys(STYLES) as HouseStyle[];
const registry = createDefaultStructures();

interface Built {
  layout: HouseLayout;
  at: (x: number, y: number, z: number) => number | undefined;
  blocks: [number, number, number, number][];
}

/** Builds a house with size drawn from the seed, returning its blocks and layout. */
function build(style: HouseStyle, seed: number): Built {
  const s = STYLES[style];
  const sizes = createRng(seed ^ 0xabcdef);
  const params = {
    width: randomInt(sizes, s.width[0], s.width[1]),
    depth: randomInt(sizes, s.depth[0], s.depth[1]),
  };
  const builder = new StructureBuilder();
  buildStructure(registry.get(style)!, params, seed, builder);
  const layout = houseLayout(style, params.width, params.depth, createRng(seed));
  return { layout, at: (x, y, z) => builder.get(x, y, z), blocks: builder.entries() };
}

const each = (check: (h: Built, style: HouseStyle) => void) => {
  for (const style of NAMES) for (const seed of SEEDS) check(build(style, seed), style);
};

describe('houses', () => {
  it('STRUCT-006.a: stone farmhouse and wooden hut, with width and depth in their ranges', () => {
    for (const style of NAMES) {
      const type = registry.get(style)!;
      expect(type.terrain).toBe('flatten');
      const [min, max] = STYLES[style].width;
      expect(type.params.parse({ width: min - 1 }, [], [])).toBeUndefined();
      expect(type.params.parse({ width: max }, [], [])).toMatchObject({ width: max });
    }
    each(({ layout }, style) => {
      const s = STYLES[style];
      expect(layout.x1 - layout.x0).toBeGreaterThanOrEqual(s.width[0]);
      expect(layout.z1 - layout.z0).toBeLessThanOrEqual(s.depth[1]);
    });
  });

  it('STRUCT-006.b: a door 2 wide and 5 high in the south wall', () => {
    each(({ layout, at }) => {
      for (let x = layout.doorX; x < layout.doorX + DOOR_WIDTH; x++) {
        for (let y = 0; y < DOOR_HEIGHT; y++) expect(at(x, y, layout.z1 - 1)).toBe(AIR);
        expect(at(x, DOOR_HEIGHT, layout.z1 - 1)).not.toBe(AIR);
      }
    });
  });

  it('STRUCT-006.b: the door is reachable from outside at ground level, in every rotation', () => {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      for (const style of NAMES) {
        const [ax, az] = [64, 64];
        const text = `version: 2\nname: Test\nterrain: { seed: 11, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }\nstructures:\n  - { type: ${style}, name: Test, at: [${ax}, ${az}], rotation: ${rotation} }\n`;
        const { world, diagnostics } = composeWorld(text, 'w.yaml', { registry });
        expect(diagnostics).toEqual([]);
        const s = STYLES[style];
        const width = Math.round((s.width[0] + s.width[1]) / 2);
        const depth = Math.round((s.depth[0] + s.depth[1]) / 2);
        const layout = houseLayout(
          style,
          width,
          depth,
          createRng(structureSeed(11, ax, az, style)),
        );
        const toWorld = (x: number, z: number) => {
          const [rx, rz] = rotateColumn(x, z, rotation);
          return [ax + rx, az + rz] as const;
        };
        // Measured two steps outside the door, clear of the roof eaves.
        const [fx, fz] = toWorld(layout.doorX, layout.z1 + 1);
        let ground = world!.size.y - 1;
        while (world!.getBlock(fx, ground, fz) === AIR) ground--;
        // Inside, in the doorway and two steps outside: same floor level, 5 free blocks above.
        for (const z of [layout.z1 - 2, layout.z1 - 1, layout.z1, layout.z1 + 1]) {
          for (let x = layout.doorX; x < layout.doorX + DOOR_WIDTH; x++) {
            const [wx, wz] = toWorld(x, z);
            expect(world!.getBlock(wx, ground, wz)).not.toBe(AIR);
            for (let y = 1; y <= DOOR_HEIGHT; y++) {
              expect(world!.getBlock(wx, ground + y, wz)).toBe(AIR);
            }
          }
        }
      }
    }
  });

  it('STRUCT-006.c: windows on both long sides, a floor and an interior at least 5 high', () => {
    each(({ layout, at }) => {
      expect(layout.northWindows.length).toBeGreaterThan(0);
      expect(layout.southWindows.length).toBeGreaterThan(0);
      for (const [z, windows] of [
        [layout.z0, layout.northWindows],
        [layout.z1 - 1, layout.southWindows],
      ] as const) {
        for (const x of windows) expect(at(x, 2, z)).toBe(AIR);
      }
      for (let z = layout.z0 + 1; z < layout.z1 - 1; z++) {
        for (let x = layout.x0 + 1; x < layout.x1 - 1; x++) {
          expect(at(x, -1, z)).toBeDefined();
          expect(at(x, -1, z)).not.toBe(AIR);
          if (x === layout.chimney[0] && z === layout.chimney[1]) continue;
          for (let y = 0; y < 5; y++) expect(at(x, y, z)).toBe(AIR);
        }
      }
    });
  });

  it('STRUCT-006.d: a pitched roof rising 1 block every 1–2 blocks, ridge along the long side', () => {
    each(({ layout, blocks }, style) => {
      const roof = STYLES[style].roof;
      const top = new Map<string, number>();
      for (const [x, y, z, b] of blocks) {
        if (b !== roof || y < WALL_HEIGHT) continue;
        const key = `${x},${z}`;
        top.set(key, Math.max(top.get(key) ?? -1, y));
      }
      const x = layout.x0;
      const profile: number[] = [];
      for (let z = layout.z0 - 1; z <= layout.z1; z++) profile.push(top.get(`${x},${z}`)!);
      const ridge = Math.max(...profile);
      expect(ridge).toBe(layout.ridgeY);
      // Up to the ridge and down again, one block at a time, every 1–2 blocks.
      const peak = profile.indexOf(ridge);
      const rising = profile.slice(0, peak + 1);
      const falling = profile.slice(peak).reverse();
      for (const slope of [rising, falling]) {
        let run = 1;
        for (let i = 1; i < slope.length; i++) {
          const step = slope[i]! - slope[i - 1]!;
          expect(step === 0 || step === 1).toBe(true);
          if (step === 0) run++;
          else {
            expect(run).toBeLessThanOrEqual(2);
            run = 1;
          }
        }
      }
      // The ridge runs along x, the long side.
      for (let rx = layout.x0 - 1; rx <= layout.x1; rx++) {
        expect(top.get(`${rx},${layout.z0 - 1 + peak}`)).toBe(ridge);
      }
      expect(layout.x1 - layout.x0).toBeGreaterThan(layout.z1 - layout.z0);
    });
  });

  it('STRUCT-006.e: a chimney, dark corner beams and, for the hut, a stone base', () => {
    each(({ layout, at }, style) => {
      const [cx, cz] = layout.chimney;
      for (let y = 0; y <= layout.ridgeY + 2; y++) expect(at(cx, y, cz)).toBe(COBBLESTONE);
      const base = STYLES[style].baseRows;
      for (const [x, z] of [
        [layout.x0, layout.z0],
        [layout.x1 - 1, layout.z0],
        [layout.x0, layout.z1 - 1],
        [layout.x1 - 1, layout.z1 - 1],
      ] as const) {
        for (let y = base; y < WALL_HEIGHT; y++) expect(at(x, y, z)).toBe(OAK_LOG);
      }
      if (style === 'wooden_hut') {
        for (let x = layout.x0; x < layout.x1; x++) {
          expect(at(x, 0, layout.z0)).toBe(COBBLESTONE);
          const inDoor = x >= layout.doorX && x < layout.doorX + DOOR_WIDTH;
          expect(at(x, 0, layout.z1 - 1)).toBe(inDoor ? AIR : COBBLESTONE);
        }
      }
    });
  });
});
