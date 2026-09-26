import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { RUN_SPEED, STEP_SECONDS, WALK_SPEED } from '../physics/constants';
import { IDLE } from '../physics/entity';
import { PhysicsWorld } from '../physics/physicsWorld';
import { World } from '../world/world';
import { blocksToMeters } from '../world/units';
import { EYE_HEIGHT, PLAYER_SIZE, spawnPlayer } from './player';

const registry = createDefaultRegistry();

describe('player', () => {
  it('PLAYER-001.a: 1.2 blocks wide, 3.5 tall, eyes at 3.2 blocks', () => {
    expect(PLAYER_SIZE).toEqual({ width: 1.2, height: 3.5 });
    expect(EYE_HEIGHT).toBe(3.2);
    expect(blocksToMeters(PLAYER_SIZE.height)).toBe(1.75);
  });

  it('PLAYER-002.a: walks at 4 m/s and runs at 7 m/s', () => {
    const world = new World({ x: 64, y: 64, z: 64 });
    for (let z = 0; z < 64; z++) {
      for (let x = 0; x < 64; x++) for (let y = 0; y < 10; y++) world.setBlock(x, y, z, STONE);
    }
    const physics = new PhysicsWorld(world, registry);
    const walker = spawnPlayer(physics, 10.5, 10.5);
    const runner = spawnPlayer(physics, 10.5, 30.5);
    expect(walker.state.y).toBe(10);
    for (let i = 0; i < 10; i++) physics.step();
    walker.intent = { ...IDLE, moveX: 1 };
    runner.intent = { ...IDLE, moveX: 1, run: true };
    const start = [walker.state.x, runner.state.x];
    for (let i = 0; i < 60; i++) physics.step();
    expect(blocksToMeters(walker.state.x - start[0]!)).toBeCloseTo(4, 6);
    expect(blocksToMeters(runner.state.x - start[1]!)).toBeCloseTo(7, 6);
    expect(WALK_SPEED * STEP_SECONDS * 60).toBe(8);
    expect(RUN_SPEED).toBe(14);
  });
});
