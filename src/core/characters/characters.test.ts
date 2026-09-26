import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../blocks/builtin';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { IDLE } from '../physics/entity';
import { PhysicsWorld } from '../physics/physicsWorld';
import { PLAYER_SIZE } from '../player/player';
import { createDefaultStructures } from '../structures/builtin';
import { resolveAppearance } from './appearance';
import { spawnCharacters } from './characters';

const header = `version: 2\nname: Test\nterrain: { seed: 3, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\n`;
const compose = (body: string) =>
  composeWorld(header + body, 'w.yaml', { registry: createDefaultStructures() });

const CHARACTERS = `characters:
  - id: guardiano
    name: Guardiano
    description: Il guardiano del borgo.
    at: [20, 30]
    yaw: 90
    appearance: { shirt: "#3a5f8e" }
    controller: { command: python guardiano.py }
  - id: marta
    name: Marta
    at: [40, 12]
`;

describe('characters', () => {
  it('CHAR-001.a: characters declare id, name, description, start, orientation, colors and controller', () => {
    const result = compose(CHARACTERS);
    expect(result.diagnostics).toEqual([]);
    expect(result.characters).toEqual([
      {
        id: 'guardiano',
        name: 'Guardiano',
        description: 'Il guardiano del borgo.',
        x: 20.5,
        z: 30.5,
        yaw: -Math.PI / 2,
        appearance: expect.objectContaining({ shirt: 0x3a5f8e }),
        command: 'python guardiano.py',
      },
      expect.objectContaining({
        id: 'marta',
        name: 'Marta',
        description: undefined,
        command: undefined,
      }),
    ]);
    // Missing colors come from the seed: stable for a character, different between characters.
    const marta = result.characters[1]!.appearance;
    expect(marta).toEqual(resolveAppearance(undefined, 3, 'marta'));
    expect(compose(CHARACTERS).characters[1]!.appearance).toEqual(marta);
  });

  it('CHAR-001.a: repeated ids, bad colors and starts outside the world are errors', () => {
    const errors = (body: string) =>
      compose(body).diagnostics.map((d) => ({ line: d.line, path: d.path, message: d.message }));
    expect(errors(CHARACTERS.replace('id: marta', 'id: guardiano'))).toEqual([
      {
        line: 12,
        path: 'characters[1].id',
        message: 'the id "guardiano" is already used by characters[0] (line 5)',
      },
    ]);
    expect(errors(CHARACTERS.replace('[40, 12]', '[40, 64]'))[0]).toMatchObject({
      path: 'characters[1].at',
      message: expect.stringContaining('outside the world'),
    });
    expect(errors(CHARACTERS.replace('"#3a5f8e"', 'blue'))[0]).toMatchObject({
      path: 'characters[0].appearance.shirt',
      message: 'expected a color like "#a55f3a", got "blue"',
    });
    expect(errors(CHARACTERS.replace('id: marta', 'id: Marta Rossi'))[0]).toMatchObject({
      path: 'characters[1].id',
    });
  });

  it('CHAR-001.b: characters are entities with the size of the player, on the ground', () => {
    const result = compose(CHARACTERS);
    const physics = new PhysicsWorld(result.world!, createDefaultRegistry());
    const characters = spawnCharacters(physics, result.characters);
    expect(characters.map((c) => c.start.id)).toEqual(['guardiano', 'marta']);
    for (const { entity } of characters) {
      expect(entity.size).toEqual(PLAYER_SIZE);
    }
    physics.step();
    for (const { entity } of characters) expect(entity.state.onGround).toBe(true);
    // Only intents move them.
    characters[0]!.entity.intent = { ...IDLE, moveX: 1 };
    const x = characters[0]!.entity.state.x;
    for (let i = 0; i < 30; i++) physics.step();
    expect(characters[0]!.entity.state.x).toBeGreaterThan(x);
  });

  it('CHAR-001.c: a character without controller stands still', () => {
    const result = compose(CHARACTERS);
    const physics = new PhysicsWorld(result.world!, createDefaultRegistry());
    const [, marta] = spawnCharacters(physics, result.characters);
    physics.step();
    const start = marta!.entity.state;
    for (let i = 0; i < 300; i++) physics.step();
    expect(marta!.entity.state).toEqual(start);
  });

  it('YAML-008.a: the player can declare its colors too', () => {
    const result = compose('player: { at: [10, 10], appearance: { hair: "#c9b28a" } }\n');
    expect(result.player?.appearance).toMatchObject({ hair: 0xc9b28a });
    expect(result.playerAppearance).toEqual(result.player?.appearance);
    // Without a player section the player still has colors.
    expect(compose('').playerAppearance).toEqual(resolveAppearance(undefined, 3, 'player'));
  });
});
