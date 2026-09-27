import type { CharacterStart } from '../compose/composeWorld';
import type { EntityHandle, PhysicsWorld } from '../physics/physicsWorld';
import { MONKEY_SIZE, spawnPlayer } from '../player/player';

/** A character in the physics: its declaration and its entity (CHAR-001.b). */
export interface Character {
  readonly start: CharacterStart;
  readonly entity: EntityHandle;
}

/**
 * Spawns the declared characters as entities with the size of the player, or of their animal
 * body (CHAR-003.a), on the first free space above the ground (CHAR-001.b). They move only
 * through intents (P3).
 */
export function spawnCharacters(
  physics: PhysicsWorld,
  starts: readonly CharacterStart[],
): Character[] {
  return starts.map((start) => ({
    start,
    entity:
      start.body === 'monkey'
        ? physics.spawn(MONKEY_SIZE, start.x, 0, start.z)
        : spawnPlayer(physics, start.x, start.z),
  }));
}
