import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';
import { composeWorld } from '../src/core/compose/composeWorld';
import { createRng } from '../src/core/math/rng';
import { IDLE } from '../src/core/physics/entity';
import { PhysicsWorld } from '../src/core/physics/physicsWorld';
import { spawnPlayer } from '../src/core/player/player';
import { createDefaultStructures } from '../src/core/structures/builtin';
import { houseLayout, type HouseStyle } from '../src/core/structures/houses';

/** Turns a point (not a column) around the anchor, like `rotateColumn` does for columns. */
function rotatePoint(x: number, z: number, rotation: number): [number, number] {
  switch (rotation) {
    case 90:
      return [-z, x];
    case 180:
      return [-x, -z];
    case 270:
      return [z, -x];
    default:
      return [x, z];
  }
}

describe('player in the default world', () => {
  it('PLAYER-001.b: the player walks into every house through its door', () => {
    const file = 'worlds/default.yaml';
    const { world, placements } = composeWorld(readFileSync(file, 'utf8'), file, {
      registry: createDefaultStructures(),
    });
    const houses = placements.filter(
      (p) => p.type === 'stone_farmhouse' || p.type === 'wooden_hut',
    );
    expect(houses.length).toBeGreaterThanOrEqual(6);
    for (const house of houses) {
      const { width, depth } = house.params as { width: number; depth: number };
      const layout = houseLayout(house.type as HouseStyle, width, depth, createRng(house.seed));
      const physics = new PhysicsWorld(world!, createDefaultRegistry());
      // Start two blocks outside the door, facing it; the door is in the local south wall.
      const doorCenter = layout.doorX + 1;
      const [ox, oz] = rotatePoint(doorCenter, layout.z1 + 1.5, house.rotation);
      const player = spawnPlayer(physics, house.x + ox, house.z + oz);
      for (let i = 0; i < 30; i++) physics.step();
      const [dx, dz] = rotatePoint(0, -1, house.rotation);
      player.intent = { ...IDLE, moveX: dx, moveZ: dz };
      for (let i = 0; i < 90; i++) physics.step();
      // The center of the player is now inside the walls: back to local coordinates.
      const [lx, lz] = rotatePoint(
        player.state.x - house.x,
        player.state.z - house.z,
        (360 - house.rotation) % 360,
      );
      expect(lx).toBeGreaterThan(layout.x0 + 1);
      expect(lx).toBeLessThan(layout.x1 - 1);
      expect(lz).toBeGreaterThan(layout.z0 + 1);
      expect(lz).toBeLessThan(layout.z1 - 1);
    }
  });
});
