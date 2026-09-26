import { describe, expect, it } from 'vitest';
import { COBBLESTONE, defineStructure, int, object, randomInt } from 'yw3d';
import { StructureBuilder } from '../src/core/structures/builder';
import { buildStructure, StructureRegistry } from '../src/core/structures/registry';

describe('public API for authors', () => {
  it('STRUCT-008.a: a structure written against `yw3d` registers and builds', () => {
    const tower = defineStructure({
      name: 'tower',
      params: object({ height: int({ min: 2, max: 12, default: 6 }) }),
      terrain: 'sit',
      footprint: () => ({ minX: 0, minZ: 0, maxX: 2, maxZ: 2 }),
      generate({ params, random, builder }) {
        const top = params.height + randomInt(random, 0, 1);
        builder.fill(0, 0, 0, 2, top, 2, COBBLESTONE);
      },
    });
    const registry = new StructureRegistry();
    registry.register(tower);
    const builder = new StructureBuilder();
    buildStructure(registry.get('tower')!, { height: 6 }, 1, builder);
    expect(builder.size).toBeGreaterThanOrEqual(24);
  });
});
