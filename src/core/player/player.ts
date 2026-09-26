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

/**
 * Spawns the player at the start declared by the world file, or at the center of the world
 * (PLAYER-001.c). Returns the player and the initial view direction.
 */
export function spawnAtStart(
  physics: PhysicsWorld,
  start: { readonly x: number; readonly z: number; readonly yaw: number } | undefined,
): { player: EntityHandle; yaw: number } {
  const { size } = physics.world;
  const { x, z, yaw } = start ?? { x: size.x / 2, z: size.z / 2, yaw: 0 };
  return { player: spawnPlayer(physics, x, z), yaw };
}
