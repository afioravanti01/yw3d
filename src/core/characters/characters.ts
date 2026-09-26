import type { CharacterStart } from '../compose/composeWorld';
import type { EntityHandle, PhysicsWorld } from '../physics/physicsWorld';
import { spawnPlayer } from '../player/player';

/** A character in the physics: its declaration and its entity (CHAR-001.b). */
export interface Character {
  readonly start: CharacterStart;
  readonly entity: EntityHandle;
}

/**
 * Spawns the declared characters as entities with the size of the player, on the first free
 * space above the ground (CHAR-001.b). They move only through intents (P3).
 */
export function spawnCharacters(
  physics: PhysicsWorld,
  starts: readonly CharacterStart[],
): Character[] {
  return starts.map((start) => ({ start, entity: spawnPlayer(physics, start.x, start.z) }));
}
