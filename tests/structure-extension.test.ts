import { describe, expect, it } from 'vitest';
import { COBBLESTONE } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../src/core/gen/terrain';
import { object } from '../src/core/schema/schema';
import { defineStructure, StructureRegistry } from '../src/core/structures/registry';

describe('structure extension from outside the core', () => {
  it('STRUCT-001.c: code outside the core registers a type, usable at once in a world file', () => {
    const cairn = defineStructure({
      name: 'cairn',
      params: object({}),
      terrain: 'sit',
      footprint: () => ({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 }),
      generate: ({ builder }) => builder.fill(0, 0, 0, 1, 2, 1, COBBLESTONE),
    });
    const registry = new StructureRegistry();
    registry.register(cairn);
    const text = `version: 2\nname: Test\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\nstructures:\n  - type: cairn\n    name: Test\n    at: [20, 20]\n    y: 90\n`;
    const result = composeWorld(text, 'worlds/cairn.yaml', { registry });
    expect(result.diagnostics).toEqual([]);
    expect(result.world!.getBlock(20, 91, 20)).toBe(COBBLESTONE);
    expect(result.structureCounts).toEqual({ cairn: 1 });
  });
});
