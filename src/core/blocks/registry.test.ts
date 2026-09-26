import { describe, expect, it } from 'vitest';
import { AIR, createDefaultRegistry, DIRT, GRASS, STONE } from './builtin';
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

  it('WORLD-004.c: the F01 block types are registered', () => {
    const registry = createDefaultRegistry();
    expect(registry.all().map((b) => [b.id, b.name])).toEqual([
      [AIR, 'air'],
      [GRASS, 'grass'],
      [DIRT, 'dirt'],
      [STONE, 'stone'],
    ]);
    expect(registry.get(AIR)).toMatchObject({ id: 0, solid: false, opaque: false });
    for (const id of [GRASS, DIRT, STONE]) {
      expect(registry.get(id)).toMatchObject({ solid: true, opaque: true });
    }
  });
});
