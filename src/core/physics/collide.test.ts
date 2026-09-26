import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, OAK_LEAVES, STONE } from '../blocks/builtin';
import { World } from '../world/world';
import { boxIntersectsSolid, boxOf } from './collide';
import { GRAVITY, MAX_FALL_SPEED, RUN_SPEED, STEP_SECONDS } from './constants';
import { IDLE } from './entity';
import { PhysicsWorld } from './physicsWorld';

const registry = createDefaultRegistry();
const SIZE = { width: 1.2, height: 3.5 };

/** A world with a stone floor whose top face is at y = 10. */
function floorWorld(size = { x: 64, y: 64, z: 64 }): PhysicsWorld {
  const world = new World(size);
  for (let z = 0; z < size.z; z++) for (let x = 0; x < size.x; x++) world.setBlock(x, 9, z, STONE);
  return new PhysicsWorld(world, registry);
}

const steps = (physics: PhysicsWorld, n: number) => {
  for (let i = 0; i < n; i++) physics.step();
};

describe('gravity and collisions', () => {
  it('PHYS-003.a: an unsupported entity accelerates downwards up to the maximum speed', () => {
    const physics = new PhysicsWorld(new World({ x: 32, y: 256, z: 32 }), registry);
    const entity = physics.spawn(SIZE, 16, 250, 16);
    steps(physics, 30);
    expect(entity.state.vy).toBeCloseTo(-GRAVITY * 30 * STEP_SECONDS, 6);
    expect(entity.state.onGround).toBe(false);
    steps(physics, 90);
    expect(entity.state.vy).toBe(-MAX_FALL_SPEED);
  });

  it('PHYS-003.b: a falling entity stops on top of the first solid block, on the ground', () => {
    const physics = floorWorld();
    const entity = physics.spawn(SIZE, 20.5, 30, 20.5);
    steps(physics, 120);
    expect(entity.state).toMatchObject({ y: 10, vy: 0, onGround: true });
    // It stays put, exactly on the face, without jitter.
    const ys = new Set<number>();
    for (let i = 0; i < 600; i++) {
      physics.step();
      ys.add(entity.state.y);
    }
    expect([...ys]).toEqual([10]);
  });

  it('PHYS-001.c: spawning inside solid blocks rises to the first free space', () => {
    const physics = floorWorld();
    const entity = physics.spawn(SIZE, 20.5, 8.3, 20.5);
    expect(entity.state.y).toBe(10);
    expect(
      boxIntersectsSolid(boxOf(entity.state, SIZE), (x, y, z) => physics.isSolid(x, y, z)),
    ).toBe(false);
  });

  it('PHYS-004.b: against a wall the entity slides, keeping the parallel movement', () => {
    const physics = floorWorld();
    // A wall along x at z = 30, three blocks high.
    for (let x = 0; x < 64; x++)
      for (let y = 10; y < 13; y++) physics.world.setBlock(x, y, 30, STONE);
    const entity = physics.spawn(SIZE, 20.5, 10, 28);
    entity.intent = { ...IDLE, moveX: Math.SQRT1_2, moveZ: Math.SQRT1_2 };
    steps(physics, 120);
    const { x, z } = entity.state;
    expect(z).toBeCloseTo(30 - SIZE.width / 2, 6);
    expect(x).toBeGreaterThan(20.5 + 5);
  });

  it('PHYS-004.c: at maximum speed nothing crosses a wall or floor one block thick', () => {
    // A thin floor in the air at y = 40, far above the ground.
    const physics = floorWorld({ x: 64, y: 256, z: 64 });
    for (let z = 10; z < 30; z++)
      for (let x = 10; x < 30; x++) physics.world.setBlock(x, 39, z, STONE);
    const faller = physics.spawn(SIZE, 20.5, 250, 20.5);
    steps(physics, 240);
    expect(faller.state.y).toBe(40);
    // Running into a wall one block thick.
    for (let z = 0; z < 64; z++)
      for (let y = 10; y < 14; y++) physics.world.setBlock(50, y, z, STONE);
    const runner = physics.spawn(SIZE, 44, 10, 50.5);
    runner.intent = { ...IDLE, moveX: 1, run: true };
    steps(physics, 120);
    expect(RUN_SPEED * STEP_SECONDS).toBeGreaterThan(0.2);
    expect(runner.state.x).toBeCloseTo(50 - SIZE.width / 2, 6);
  });

  it('PHYS-004.d: non-solid blocks (leaves) do not stop the entity', () => {
    const physics = floorWorld();
    // A hedge of leaves across the path.
    for (let z = 0; z < 64; z++)
      for (let y = 10; y < 16; y++) physics.world.setBlock(30, y, z, OAK_LEAVES);
    const entity = physics.spawn(SIZE, 25, 10, 20.5);
    entity.intent = { ...IDLE, moveX: 1 };
    steps(physics, 120);
    expect(entity.state.x).toBeGreaterThan(35);
  });
});
