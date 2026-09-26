import { describe, expect, it } from 'vitest';
import { StructureBuilder } from './builder';
import { createDefaultStructures } from './builtin';
import { buildStructure, parseParams } from './registry';
import { SPECIES } from './trees';

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);
const NAMES = Object.keys(SPECIES) as (keyof typeof SPECIES)[];
const registry = createDefaultStructures();

function grow(name: keyof typeof SPECIES, seed: number, params: Record<string, unknown> = {}) {
  const type = registry.get(name)!;
  const builder = new StructureBuilder();
  buildStructure(type, parseParams(type, params, [], []), seed, builder);
  return builder.entries();
}

const heightOf = (blocks: [number, number, number, number][]) =>
  Math.max(...blocks.map(([, y]) => y)) + 1;

describe('trees', () => {
  it('STRUCT-005.a: oak, birch and willow are registered with their own materials and size', () => {
    for (const name of NAMES) {
      expect(registry.get(name)).toMatchObject({ name, terrain: 'sit' });
      const species = SPECIES[name];
      for (const seed of SEEDS) {
        const blocks = grow(name, seed);
        const kinds = new Set(blocks.map(([, , , b]) => b));
        expect(kinds).toEqual(new Set([species.log, species.leaves]));
        const reach = Math.max(
          ...blocks.map(([x, , z]) => Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5))),
        );
        expect(reach).toBeLessThanOrEqual(species.canopyRadius[1] + 2);
      }
    }
    // Silhouettes: oaks and willows are much wider than birches.
    const width = (name: keyof typeof SPECIES) =>
      Math.max(...SEEDS.map((seed) => Math.max(...grow(name, seed).map(([x]) => Math.abs(x)))));
    expect(width('oak')).toBeGreaterThan(width('birch') + 2);
    expect(width('willow')).toBeGreaterThan(width('birch') + 2);
  });

  it('STRUCT-005.b: the height stays in the species range and follows the parameter', () => {
    for (const name of NAMES) {
      const [min, max] = SPECIES[name].height;
      const heights = SEEDS.map((seed) => heightOf(grow(name, seed)));
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(min);
        expect(h).toBeLessThanOrEqual(max);
      }
      expect(new Set(heights).size).toBeGreaterThan(1);
      expect(heightOf(grow(name, 5, { height: min }))).toBe(min);
      expect(heightOf(grow(name, 5, { height: max }))).toBe(max);
    }
  });

  it('STRUCT-005.c: a wooden trunk from the ground, leaves all connected to the wood', () => {
    for (const name of NAMES) {
      const { log, leaves } = SPECIES[name];
      for (const seed of SEEDS) {
        const blocks = grow(name, seed);
        const at = new Map(blocks.map(([x, y, z, b]) => [`${x},${y},${z}`, b]));
        expect(blocks.some(([, y, , b]) => y === 0 && b === log)).toBe(true);
        const reached = new Set<string>();
        const stack = blocks.filter(([, , , b]) => b === log).map(([x, y, z]) => [x, y, z]);
        for (const [x, y, z] of stack) reached.add(`${x},${y},${z}`);
        while (stack.length > 0) {
          const [x, y, z] = stack.pop()!;
          for (const [dx, dy, dz] of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]) {
            const k = `${x! + dx!},${y! + dy!},${z! + dz!}`;
            if (!reached.has(k) && at.get(k) === leaves) {
              reached.add(k);
              stack.push([x! + dx!, y! + dy!, z! + dz!]);
            }
          }
        }
        expect(reached.size).toBe(blocks.length);
      }
    }
  });

  it('STRUCT-002.b: different seeds give visibly different shapes, not only colors', () => {
    for (const name of NAMES) {
      const shapes = SEEDS.map((seed) =>
        grow(name, seed)
          .map(([x, y, z]) => `${x},${y},${z}`)
          .join(';'),
      );
      expect(new Set(shapes).size).toBe(SEEDS.length);
    }
  });
});
