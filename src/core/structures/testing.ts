import { PLANKS } from '../blocks/builtin';
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

export function createTestRegistry(): StructureRegistry {
  const registry = new StructureRegistry();
  registry.register(testPost);
  return registry;
}
