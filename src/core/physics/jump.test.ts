import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { World } from '../world/world';
import { blocksToMeters } from '../world/units';
import { IDLE } from './entity';
import { PhysicsWorld } from './physicsWorld';

const registry = createDefaultRegistry();
const SIZE = { width: 1.2, height: 3.5 };

function floorWorld(): PhysicsWorld {
  const world = new World({ x: 64, y: 64, z: 64 });
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) world.setBlock(x, 9, z, STONE);
  return new PhysicsWorld(world, registry);
}

const steps = (physics: PhysicsWorld, n: number) => {
  for (let i = 0; i < n; i++) physics.step();
};

describe('jump and steps', () => {
  it('PHYS-005.a: a jump starts from the ground and lifts the feet by 2.0–2.4 blocks', () => {
    const physics = floorWorld();
    const entity = physics.spawn(SIZE, 20.5, 10, 20.5);
    steps(physics, 5);
    entity.intent = { ...IDLE, jump: true };
    let top = 10;
    for (let i = 0; i < 90; i++) {
      physics.step();
      entity.intent = IDLE;
      top = Math.max(top, entity.state.y);
    }
    const height = top - 10;
    expect(height).toBeGreaterThanOrEqual(2.0);
    expect(height).toBeLessThanOrEqual(2.4);
    expect(blocksToMeters(height)).toBeGreaterThanOrEqual(1.0);
    expect(entity.state).toMatchObject({ y: 10, onGround: true });
    // No jump in mid-air: dropped from above, the jump intent changes nothing.
    const faller = physics.spawn(SIZE, 30.5, 30, 30.5);
    const reference = physics.spawn(SIZE, 40.5, 30, 40.5);
    faller.intent = { ...IDLE, jump: true };
    steps(physics, 10);
    expect(faller.state.vy).toBe(reference.state.vy);
    expect(faller.state.y).toBe(reference.state.y);
  });

  it('PHYS-005.b: walking into a 1-block step climbs it; a 2-block step stops the entity', () => {
    const physics = floorWorld();
    // A 1-block step from x = 30 on, in the north half; a 2-block step in the south half.
    for (let z = 0; z < 32; z++)
      for (let x = 30; x < 64; x++) physics.world.setBlock(x, 10, z, STONE);
    for (let z = 32; z < 64; z++) {
      for (let x = 30; x < 64; x++) {
        physics.world.setBlock(x, 10, z, STONE);
        physics.world.setBlock(x, 11, z, STONE);
      }
    }
    const climber = physics.spawn(SIZE, 25, 10, 16.5);
    const stopped = physics.spawn(SIZE, 25, 10, 48.5);
    climber.intent = { ...IDLE, moveX: 1 };
    stopped.intent = { ...IDLE, moveX: 1 };
    steps(physics, 120);
    expect(climber.state.x).toBeGreaterThan(35);
    expect(climber.state).toMatchObject({ y: 11, onGround: true });
    expect(stopped.state.x).toBeCloseTo(30 - SIZE.width / 2, 6);
    expect(stopped.state.y).toBe(10);
  });
});
