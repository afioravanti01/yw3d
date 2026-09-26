import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { STEP_SECONDS } from '../physics/constants';
import { PhysicsWorld } from '../physics/physicsWorld';
import { spawnPlayer } from '../player/player';
import { World } from '../world/world';
import { NavGrid } from './navGrid';
import { ARRIVAL_DISTANCE, MAX_REPLANS, PathFollower } from './pathFollower';
import { Pathfinder } from './pathfinding';

const registry = createDefaultRegistry();

function flat(): World {
  const world = new World({ x: 64, y: 32, z: 64 });
  for (let z = 0; z < 64; z++)
    for (let x = 0; x < 64; x++) for (let y = 0; y < 10; y++) world.setBlock(x, y, z, STONE);
  return world;
}

/** Runs a follower in the physics until it stops moving or `seconds` pass. */
function walk(
  physics: PhysicsWorld,
  follower: PathFollower,
  entity: ReturnType<typeof spawnPlayer>,
  seconds: number,
) {
  let time = 0;
  for (let i = 0; i < seconds / STEP_SECONDS && follower.status.kind === 'moving'; i++) {
    time += STEP_SECONDS;
    entity.intent = follower.update(entity.state, time);
    physics.step();
  }
  return time;
}

describe('following a path', () => {
  it('NAV-002.a: the character walks only through intents and arrives within 1 block', () => {
    const world = flat();
    // Some steps and a wall on the way.
    for (let z = 0; z < 64; z++) for (let x = 30; x < 64; x++) world.setBlock(x, 10, z, STONE);
    for (let z = 10; z < 50; z++) for (let y = 11; y < 16; y++) world.setBlock(45, y, z, STONE);
    const physics = new PhysicsWorld(world, registry);
    const finder = new Pathfinder(new NavGrid(world, registry.solid));
    const entity = spawnPlayer(physics, 10, 30);
    physics.step();
    const follower = new PathFollower(
      (f, t) => finder.find(f, t),
      { x: 55, z: 30 },
      entity.state,
      0,
    );
    walk(physics, follower, entity, 30);
    expect(follower.status).toEqual({ kind: 'arrived' });
    expect(Math.hypot(entity.state.x - 55, entity.state.z - 30)).toBeLessThanOrEqual(
      ARRIVAL_DISTANCE,
    );
    expect(entity.state.y).toBe(11);
  });

  it('NAV-002.b: stuck for 2 s the path is searched again; after 3 attempts the action fails', () => {
    const world = flat();
    const physics = new PhysicsWorld(world, registry);
    let finder = new Pathfinder(new NavGrid(world, registry.solid));
    const entity = spawnPlayer(physics, 10, 30);
    physics.step();
    // A wall appears after the path was planned: the old grid does not know it.
    const follower = new PathFollower(
      (f, t) => finder.find(f, t),
      { x: 50, z: 30 },
      entity.state,
      0,
    );
    for (let z = 0; z < 64; z++) for (let y = 10; y < 16; y++) world.setBlock(30, y, z, STONE);
    walk(physics, follower, entity, 30);
    expect(follower.status).toEqual({
      kind: 'failed',
      reason: `stuck on the way, after ${MAX_REPLANS} new paths`,
    });
    expect(follower.replans).toBe(MAX_REPLANS);

    // With a gap in the wall and an updated grid, the new path goes around it.
    for (let y = 10; y < 16; y++) for (let z = 50; z < 53; z++) world.setBlock(30, y, z, 0);
    const again = new PathFollower((f, t) => finder.find(f, t), { x: 50, z: 30 }, entity.state, 0);
    finder = new Pathfinder(new NavGrid(world, registry.solid));
    walk(physics, again, entity, 40);
    expect(again.status).toEqual({ kind: 'arrived' });
    expect(again.replans).toBeGreaterThan(0);
  });
});
