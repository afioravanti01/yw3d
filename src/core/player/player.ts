import type { BoxSize } from '../physics/entity';
import { raycast, type IsBlocking } from '../physics/raycast';
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

/** Distance of the third-person camera behind the eyes: 4 m (PLAYER-003.b). */
export const THIRD_PERSON_DISTANCE = metersToBlocks(4);
/** Space kept between the camera and the first block in the way. */
const CAMERA_MARGIN = 0.3;

/** Unit view direction for a yaw and pitch (yaw 0 looks north, towards -z). */
export function viewDirection(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/**
 * Position of the third-person camera: behind the eyes, opposite to the view direction, at
 * THIRD_PERSON_DISTANCE, or closer when a block is in the way (PLAYER-003.b).
 */
export function thirdPersonCamera(
  eye: readonly [number, number, number],
  yaw: number,
  pitch: number,
  isBlocking: IsBlocking,
): [number, number, number] {
  const [dx, dy, dz] = viewDirection(yaw, pitch);
  const back: [number, number, number] = [-dx, -dy, -dz];
  const hit = raycast(eye, back, THIRD_PERSON_DISTANCE + CAMERA_MARGIN, isBlocking);
  const distance = Math.max(0, Math.min(THIRD_PERSON_DISTANCE, hit - CAMERA_MARGIN));
  return [eye[0] + back[0] * distance, eye[1] + back[1] * distance, eye[2] + back[2] * distance];
}
