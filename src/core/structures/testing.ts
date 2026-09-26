import { AIR, PLANKS, SAND } from '../blocks/builtin';
import { int, object } from '../schema/schema';
import { defineStructure, StructureRegistry } from './registry';

/**
 * Test-only structure: a post of planks, `height` blocks tall on a `width` × `width` base
 * anchored at its north-west corner. Simple enough to check positions in tests.
 */
export const testPost = defineStructure({
  name: 'test_post',
  params: object({
    height: int({ min: 1, max: 20, default: 3 }),
    width: int({ min: 1, max: 8, default: 1 }),
  }),
  terrain: 'sit',
  footprint: (p) => ({ minX: 0, minZ: 0, maxX: p.width, maxZ: p.width }),
  generate({ params, builder }) {
    builder.fill(0, 0, 0, params.width, params.height, params.width, PLANKS);
  },
});

/** Test-only `flatten` structure: a plank floor with 5 blocks of cleared space above. */
export const testPad = defineStructure({
  name: 'test_pad',
  params: object({
    width: int({ min: 2, max: 24, default: 10 }),
    depth: int({ min: 2, max: 24, default: 8 }),
  }),
  terrain: 'flatten',
  footprint: (p) => ({ minX: 0, minZ: 0, maxX: p.width, maxZ: p.depth }),
  generate({ params, builder }) {
    builder.fill(0, 0, 0, params.width, 1, params.depth, PLANKS);
    builder.fill(0, 1, 0, params.width, 6, params.depth, AIR);
  },
});

/** Test-only `dig` structure: a square basin `size` wide and `depth` deep, sandy shore. */
export const testBasin = defineStructure({
  name: 'test_basin',
  params: object({
    size: int({ min: 2, max: 20, default: 6 }),
    depth: int({ min: 1, max: 6, default: 2 }),
  }),
  terrain: 'dig',
  footprint: (p) => ({ minX: -2, minZ: -2, maxX: p.size + 2, maxZ: p.size + 2 }),
  basin: ({ params }) => ({
    columns: Array.from(
      { length: params.size * params.size },
      (_, i) => [i % params.size, Math.floor(i / params.size), params.depth] as const,
    ),
    shoreWidth: 2,
    shoreBlock: SAND,
  }),
  generate() {},
});

export function createTestRegistry(): StructureRegistry {
  const registry = new StructureRegistry();
  registry.register(testPost);
  registry.register(testPad);
  registry.register(testBasin);
  return registry;
}
