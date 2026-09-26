import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE, WATER } from '../blocks/builtin';
import { World } from '../world/world';
import { NavGrid } from './navGrid';
import { MAX_DROP, MAX_STEP_UP, Pathfinder } from './pathfinding';

const registry = createDefaultRegistry();

/**
 * Flat stone ground (standing height 10) with a water channel across the world at z 30…35,
 * 4 blocks deep, optionally with a dry bridge.
 */
function channelWorld(bridgeAt?: number): Pathfinder {
  const world = new World({ x: 128, y: 32, z: 64 });
  for (let z = 0; z < 64; z++) {
    for (let x = 0; x < 128; x++) {
      const inChannel = z >= 30 && z < 36 && (bridgeAt === undefined || Math.abs(x - bridgeAt) > 2);
      for (let y = 0; y < 10; y++) {
        world.setBlock(x, y, z, inChannel && y >= 6 ? WATER : STONE);
      }
    }
  }
  return new Pathfinder(new NavGrid(world, registry.solid));
}

describe('path search', () => {
  it('NAV-001.b: swims across water only when the dry way is more than twice as long', () => {
    const from = { x: 20, y: 10, z: 20 };
    const to = { x: 20, z: 45 };
    // A bridge close by: walking around is shorter than twice the crossing.
    const near = channelWorld(30).find(from, to);
    expect(near.ok && near.points.every((p) => !p.wet)).toBe(true);
    // The only bridge is far away: swimming.
    const far = channelWorld(110).find(from, to);
    expect(far.ok && far.points.some((p) => p.wet)).toBe(true);
    // No bridge at all: swimming.
    const none = channelWorld().find(from, to);
    expect(none.ok && none.points.some((p) => p.wet)).toBe(true);
  });

  it('NAV-001.c: an unreachable destination fails with its cause, at once', () => {
    const finder = channelWorld(30);
    expect(finder.find({ x: 20, y: 10, z: 20 }, { x: 200, z: 20 })).toEqual({
      ok: false,
      reason: 'the destination is outside the world',
    });
    // A closed stone box around the destination.
    const world = finder.grid.world;
    for (let y = 10; y < 20; y++) {
      for (let z = 50; z <= 56; z++) {
        for (let x = 90; x <= 96; x++) {
          const edge = x === 90 || x === 96 || z === 50 || z === 56;
          if (edge) world.setBlock(x, y, z, STONE);
        }
      }
    }
    const boxed = new Pathfinder(new NavGrid(world, registry.solid));
    const start = performance.now();
    expect(boxed.find({ x: 20, y: 10, z: 20 }, { x: 93, z: 53 })).toEqual({
      ok: false,
      reason: 'there is no path to the destination',
    });
    expect(performance.now() - start).toBeLessThan(1000);
    // Inside solid rock there is no place to stand.
    for (let y = 10; y < 20; y++)
      for (let z = 40; z < 44; z++) for (let x = 60; x < 64; x++) world.setBlock(x, y, z, STONE);
    const rock = new Pathfinder(new NavGrid(world, registry.solid));
    expect(rock.find({ x: 20, y: 10, z: 20 }, { x: 62, z: 42 })).toMatchObject({ ok: false });
    expect(MAX_STEP_UP).toBe(1);
    expect(MAX_DROP).toBe(3);
  });
});
