import type { BoxSize } from '../physics/entity';
import type { EntityHandle, PhysicsWorld } from '../physics/physicsWorld';
import { metersToBlocks } from '../world/units';

/** The player: 0.6 m wide, 1.75 m tall, eyes at 1.6 m (PLAYER-001.a). */
export const PLAYER_SIZE: BoxSize = { width: metersToBlocks(0.6), height: metersToBlocks(1.75) };
export const EYE_HEIGHT = metersToBlocks(1.6);

/**
 * Spawns the player on the column (x, z), at the first free space above the ground
 * (PLAYER-001.c): the physics raises it out of the terrain from the bottom of the world.
 */
export function spawnPlayer(physics: PhysicsWorld, x: number, z: number): EntityHandle {
  return physics.spawn(PLAYER_SIZE, x, 0, z);
}

/** Default start: the center of the world. */
export function defaultSpawn(physics: PhysicsWorld): EntityHandle {
  const { size } = physics.world;
  return spawnPlayer(physics, size.x / 2, size.z / 2);
}
