import { describe, expect, it, vi } from 'vitest';
import { AIR, DIRT, GRASS, STONE } from '../blocks/builtin';
import { blockCoord, blocksToMeters } from './units';
import { DEFAULT_WORLD_SIZE, World } from './world';

const small = { x: 64, y: 32, z: 64 };

describe('World', () => {
  it('WORLD-001.a: a point inside a block cube reads that block', () => {
    const world = new World(small);
    world.setBlock(2, 3, 4, STONE);
    const point = [2.5, 3.99, 4.0];
    const [x, y, z] = point.map(blockCoord) as [number, number, number];
    expect(world.getBlock(x, y, z)).toBe(STONE);
    expect(world.getBlock(blockCoord(3.0), y, z)).toBe(AIR);
  });

  it('WORLD-002.a: the default world is 512 × 96 × 512 blocks (256 m × 48 m × 256 m)', () => {
    const world = new World();
    expect(world.size).toEqual({ x: 512, y: 96, z: 512 });
    expect(DEFAULT_WORLD_SIZE).toEqual({ x: 512, y: 96, z: 512 });
    expect([world.size.x, world.size.y, world.size.z].map(blocksToMeters)).toEqual([256, 48, 256]);
    expect(new World({ x: 32, y: 256, z: 1024 }).size).toEqual({ x: 32, y: 256, z: 1024 });
  });

  it('WORLD-002.b: invalid sizes fail naming the value and the constraint', () => {
    expect(() => new World({ x: 100, y: 96, z: 512 })).toThrow(
      'Invalid world size: x = 100 (must be a multiple of 32 between 32 and 1024)',
    );
    expect(() => new World({ x: 512, y: 288, z: 512 })).toThrow(/y = 288 .*between 32 and 256/);
    expect(() => new World({ x: 512, y: 96, z: 0 })).toThrow(/z = 0/);
    expect(() => new World({ x: 2048, y: 96, z: 512 })).toThrow(/x = 2048/);
    expect(() => new World({ x: 32.5, y: 96, z: 512 })).toThrow(RangeError);
  });

  it('WORLD-002.c: reading outside the world returns air', () => {
    const world = World.fromColumns(small, (_x, _z, column) => column.fill(STONE));
    expect(world.getBlock(0, 0, 0)).toBe(STONE);
    for (const [x, y, z] of [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [64, 0, 0],
      [0, 32, 0],
      [0, 0, 64],
    ] as const) {
      expect(world.getBlock(x, y, z)).toBe(AIR);
    }
  });

  it('WORLD-002.d: writing outside the world changes nothing and returns false', () => {
    const world = new World(small);
    const before = world.hash();
    const listener = vi.fn();
    world.onChange(listener);
    expect(world.setBlock(-1, 0, 0, STONE)).toBe(false);
    expect(world.setBlock(0, 32, 0, STONE)).toBe(false);
    expect(world.setBlock(64, 0, 64, STONE)).toBe(false);
    expect(world.hash()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('WORLD-003.a: a written block is read back', () => {
    const world = new World(small);
    expect(world.setBlock(10, 20, 30, GRASS)).toBe(true);
    expect(world.getBlock(10, 20, 30)).toBe(GRASS);
    world.setBlock(10, 20, 30, DIRT);
    expect(world.getBlock(10, 20, 30)).toBe(DIRT);
    expect(world.getBlock(11, 20, 30)).toBe(AIR);
  });

  it('WORLD-003.b: only actual changes are notified, with the position', () => {
    const world = new World(small);
    const listener = vi.fn();
    world.onChange(listener);
    world.setBlock(5, 6, 7, STONE);
    expect(listener).toHaveBeenCalledExactlyOnceWith(5, 6, 7, AIR, STONE);
    world.setBlock(5, 6, 7, STONE);
    world.setBlock(1, 1, 1, AIR);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('WORLD-003.c: listeners can subscribe and unsubscribe', () => {
    const world = new World(small);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = world.onChange(first);
    world.onChange(second);
    world.setBlock(0, 0, 0, STONE);
    unsubscribeFirst();
    world.setBlock(0, 0, 0, DIRT);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid block ids', () => {
    const world = new World(small);
    expect(() => world.setBlock(0, 0, 0, 256)).toThrow(RangeError);
    expect(() => world.setBlock(0, 0, 0, -1)).toThrow(RangeError);
  });

  it('fromColumns builds the initial state without notifications', () => {
    const world = World.fromColumns(small, (x, z, column) => {
      column.fill(STONE, 0, 10);
      column[10] = x === z ? GRASS : DIRT;
    });
    expect(world.getBlock(3, 9, 5)).toBe(STONE);
    expect(world.getBlock(4, 10, 4)).toBe(GRASS);
    expect(world.getBlock(4, 10, 5)).toBe(DIRT);
    expect(world.getBlock(4, 11, 5)).toBe(AIR);
    expect(world.getChunk(0, 0, 0)).not.toBeNull();
    expect(world.getChunk(0, 0, 1)).not.toBeNull();
  });

  it('readColumn returns a column bottom-up, and air outside the world', () => {
    const world = World.fromColumns(small, (x, _z, column) =>
      column.fill(x === 3 ? STONE : DIRT, 0, 5),
    );
    const column = world.readColumn(3, 7);
    expect([...column.subarray(0, 6)]).toEqual([STONE, STONE, STONE, STONE, STONE, AIR]);
    expect(column).toHaveLength(32);
    expect(world.readColumn(-1, 0).every((id) => id === AIR)).toBe(true);
  });

  it('hash depends on content only, not on how chunks were allocated', () => {
    const fresh = new World(small);
    const edited = new World(small);
    edited.setBlock(40, 20, 40, STONE);
    expect(edited.hash()).not.toBe(fresh.hash());
    edited.setBlock(40, 20, 40, AIR);
    expect(edited.hash()).toBe(fresh.hash());
  });

  it('RENDER-005.a: a block change affects its chunk and the chunks touching it', () => {
    const world = new World({ x: 128, y: 96, z: 128 });
    const coords = (x: number, y: number, z: number) =>
      world.chunksAffectedBy(x, y, z).map((c) => `${c.cx},${c.cy},${c.cz}`);
    expect(coords(40, 40, 40)).toEqual(['1,1,1']);
    expect(coords(32, 40, 40)).toEqual(['0,1,1', '1,1,1']);
    expect(coords(63, 40, 40)).toEqual(['1,1,1', '2,1,1']);
    expect(coords(32, 40, 63)).toHaveLength(4);
    expect(coords(32, 32, 32)).toHaveLength(8);
    // World borders: no chunk outside the world.
    expect(coords(0, 0, 0)).toEqual(['0,0,0']);
    expect(coords(127, 95, 127)).toEqual(['3,2,3']);
  });
});
