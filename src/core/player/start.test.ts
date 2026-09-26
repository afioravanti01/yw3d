import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../blocks/builtin';
import { composeWorld } from '../compose/composeWorld';
import { boxIntersectsSolid, boxOf } from '../physics/collide';
import { PhysicsWorld } from '../physics/physicsWorld';
import { generateHeightmap, TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultStructures } from '../structures/builtin';
import { PLAYER_SIZE, spawnAtStart } from './player';

const header = `version: 1\nterrain: { seed: 3, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }\n`;
const compose = (body: string) =>
  composeWorld(header + body, 'w.yaml', { registry: createDefaultStructures() });

describe('player start', () => {
  it('YAML-008.a: the file declares the start column and the view direction', () => {
    const result = compose('player:\n  at: [30, 40]\n  yaw: 90\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.player).toMatchObject({ x: 30.5, z: 40.5, yaw: -Math.PI / 2 });
    expect(compose('player: { at: [30, 40] }\n').player?.yaw).toBe(-0);
    expect(compose('').player).toBeUndefined();
  });

  it('YAML-008.b: a start outside the world is an error', () => {
    const result = compose('player:\n  at: [130, 40]\n');
    expect(result.world).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', line: 4, path: 'player.at' }),
    ]);
  });

  it('PLAYER-001.c: the player starts on the declared column, or the center, on the ground', () => {
    for (const [body, x, z] of [
      ['player: { at: [30, 40] }\n', 30.5, 40.5],
      ['', 64, 64],
    ] as const) {
      const result = compose(body);
      const physics = new PhysicsWorld(result.world!, createDefaultRegistry());
      const { player } = spawnAtStart(physics, result.player);
      expect(player.state).toMatchObject({ x, z });
      const surface = generateHeightmap(3, { x: 128, y: 96, z: 128 }).heights;
      const column = Math.floor(x) + Math.floor(z) * 128;
      expect(player.state.y).toBeGreaterThanOrEqual(surface[column]! + 1);
      const isSolid = (bx: number, by: number, bz: number) => physics.isSolid(bx, by, bz);
      expect(boxIntersectsSolid(boxOf(player.state, PLAYER_SIZE), isSolid)).toBe(false);
      // Resting on the ground after one step.
      physics.step();
      expect(player.state.onGround).toBe(true);
    }
  });
});
