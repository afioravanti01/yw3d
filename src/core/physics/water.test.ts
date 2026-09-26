import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE, WATER } from '../blocks/builtin';
import { World } from '../world/world';
import { STEP_SECONDS, WALK_SPEED } from './constants';
import { IDLE } from './entity';
import { PhysicsWorld } from './physicsWorld';

const registry = createDefaultRegistry();
const SIZE = { width: 1.2, height: 3.5 };
/** Top face of the water: water blocks fill y = 2 … 11. */
const SURFACE = 12;

/**
 * A pool: stone bed at y = 1, water up to y = 11 for x < 40, and a stone bank for x ≥ 40
 * whose top face is at y = 13, one block above the water surface.
 */
function pool(): PhysicsWorld {
  const world = new World({ x: 64, y: 64, z: 64 });
  for (let z = 0; z < 64; z++) {
    for (let x = 0; x < 64; x++) {
      world.setBlock(x, 1, z, STONE);
      for (let y = 2; y <= 12; y++) {
        if (x >= 40) world.setBlock(x, y, z, STONE);
        else if (y < SURFACE) world.setBlock(x, y, z, WATER);
      }
    }
  }
  return new PhysicsWorld(world, registry);
}

const steps = (physics: PhysicsWorld, n: number) => {
  for (let i = 0; i < n; i++) physics.step();
};
const SECOND = Math.round(1 / STEP_SECONDS);

describe('water', () => {
  it('PHYS-006.a: in water the horizontal speed is at most half of the speed on land', () => {
    const physics = pool();
    const swimmer = physics.spawn(SIZE, 20.5, 6, 20.5);
    steps(physics, SECOND);
    swimmer.intent = { ...IDLE, moveX: 1 };
    physics.step();
    expect(swimmer.state.submerged).toBeGreaterThanOrEqual(0.5);
    expect(swimmer.state.vx).toBeLessThanOrEqual(WALK_SPEED / 2);
    expect(swimmer.state.vx).toBeGreaterThan(0);
  });

  it('PHYS-006.b: without intents an entity floats with its top above the water within 3 s', () => {
    const physics = pool();
    // Dropped from above, and released under water.
    const dropped = physics.spawn(SIZE, 10.5, 30, 10.5);
    const released = physics.spawn(SIZE, 20.5, 3, 20.5);
    steps(physics, 3 * SECOND);
    for (const entity of [dropped, released]) {
      for (let i = 0; i < SECOND; i++) {
        physics.step();
        expect(entity.state.y + SIZE.height).toBeGreaterThan(SURFACE);
        expect(entity.state.y).toBeLessThan(SURFACE);
      }
      expect(Math.abs(entity.state.vy)).toBeLessThan(0.2);
    }
  });

  it('PHYS-006.c: swimming up and down moves the entity up or towards the bottom', () => {
    const physics = pool();
    const diver = physics.spawn(SIZE, 10.5, 8, 10.5);
    const riser = physics.spawn(SIZE, 20.5, 8, 20.5);
    const floater = physics.spawn(SIZE, 30.5, 8, 30.5);
    steps(physics, 3 * SECOND);
    diver.intent = { ...IDLE, swim: -1 };
    riser.intent = { ...IDLE, swim: 1 };
    steps(physics, 3 * SECOND);
    expect(diver.state.y).toBeLessThan(floater.state.y - 3);
    expect(diver.state.y).toBe(2);
    expect(riser.state.y).toBeGreaterThan(floater.state.y + 1);
  });

  it('PHYS-006.d: from the water an entity climbs onto a bank one block above the surface', () => {
    const physics = pool();
    const swimmer = physics.spawn(SIZE, 30.5, 6, 20.5);
    steps(physics, 3 * SECOND);
    swimmer.intent = { ...IDLE, moveX: 1, swim: 1 };
    steps(physics, 4 * SECOND);
    expect(swimmer.state.x).toBeGreaterThan(41);
    expect(swimmer.state).toMatchObject({ y: SURFACE + 1, onGround: true });
  });
});
