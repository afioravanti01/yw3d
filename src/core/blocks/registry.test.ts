import { describe, expect, it } from 'vitest';
import {
  AIR,
  BIRCH_LEAVES,
  BIRCH_LOG,
  COBBLESTONE,
  createDefaultRegistry,
  DIRT,
  GRASS,
  GRAVEL,
  OAK_LEAVES,
  OAK_LOG,
  PLANKS,
  ROOF_TILES,
  SAND,
  STONE,
  WATER,
  WILLOW_LEAVES,
  WILLOW_LOG,
} from './builtin';
import { BlockRegistry, type BlockDef } from './registry';

const crystal: BlockDef = {
  id: 200,
  name: 'test_crystal',
  color: 0x88ccff,
  variation: 0.1,
  solid: true,
  opaque: false,
};

describe('BlockRegistry', () => {
  it('WORLD-004.a: a block type has id, name, color, variation, solid and opaque', () => {
    const registry = new BlockRegistry();
    const def = registry.register(crystal);
    expect(def).toEqual(crystal);
    expect(registry.get(200)).toEqual(crystal);
    expect(registry.getByName('test_crystal')).toEqual(crystal);
    expect(registry.idOf('test_crystal')).toBe(200);
    expect(registry.solid[200]).toBe(1);
    expect(registry.opaque[200]).toBe(0);
  });

  it('WORLD-004.b: registering a used id or name fails', () => {
    const registry = new BlockRegistry();
    registry.register(crystal);
    expect(() => registry.register({ ...crystal, name: 'other' })).toThrow(/already used/);
    expect(() => registry.register({ ...crystal, id: 201 })).toThrow(/already registered/);
  });

  it('rejects invalid definitions', () => {
    const registry = new BlockRegistry();
    expect(() => registry.register({ ...crystal, id: 256 })).toThrow(RangeError);
    expect(() => registry.register({ ...crystal, id: 1.5 })).toThrow(RangeError);
    expect(() => registry.register({ ...crystal, name: ' ' })).toThrow(/empty name/);
    expect(() => registry.register({ ...crystal, color: 0x1000000 })).toThrow(RangeError);
    expect(() => registry.register({ ...crystal, variation: 2 })).toThrow(RangeError);
    expect(() => registry.idOf('missing')).toThrow(/Unknown block/);
  });

  it('WORLD-004.c: the F01 and F02 block types are registered with stable ids', () => {
    const registry = createDefaultRegistry();
    expect(registry.all().map((b) => [b.id, b.name])).toEqual([
      [AIR, 'air'],
      [GRASS, 'grass'],
      [DIRT, 'dirt'],
      [STONE, 'stone'],
      [WATER, 'water'],
      [SAND, 'sand'],
      [GRAVEL, 'gravel'],
      [OAK_LOG, 'oak_log'],
      [BIRCH_LOG, 'birch_log'],
      [WILLOW_LOG, 'willow_log'],
      [OAK_LEAVES, 'oak_leaves'],
      [BIRCH_LEAVES, 'birch_leaves'],
      [WILLOW_LEAVES, 'willow_leaves'],
      [PLANKS, 'planks'],
      [COBBLESTONE, 'cobblestone'],
      [ROOF_TILES, 'roof_tiles'],
    ]);
    // F01 ids never change: they are stored in world data.
    expect([AIR, GRASS, DIRT, STONE]).toEqual([0, 1, 2, 3]);
    for (const id of [AIR, WATER]) {
      expect(registry.get(id)).toMatchObject({ solid: false, opaque: false });
    }
    for (const block of registry.all().filter((b) => b.id !== AIR && b.id !== WATER)) {
      expect(block).toMatchObject({ solid: true, opaque: true });
    }
  });
});
