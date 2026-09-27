import { describe, expect, it } from 'vitest';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createDefaultRegistry } from '../blocks/builtin';
import { PhysicsWorld } from '../physics/physicsWorld';
import { MONKEY_SIZE, PLAYER_SIZE } from '../player/player';
import { createDefaultStructures } from '../structures/builtin';
import { loadWorldFile } from '../yaml/worldFile';
import { spawnCharacters } from './characters';

const WORLD = `version: 2
name: T
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
characters:
  - { id: bimba, name: Bimba, at: [30, 30], body: monkey, agent: { mode: fake, initiative: autonomous, every: 20 } }
  - { id: marta, name: Marta, at: [34, 30] }
`;

describe('animals', () => {
  it('CHAR-003.a, CHAR-001.a: a character may have the body of a monkey, smaller than a person; a person when absent', () => {
    const result = composeWorld(WORLD, 'w.yaml', { registry: createDefaultStructures() });
    expect(result.diagnostics).toEqual([]);
    expect(result.characters.map((c) => [c.id, c.body])).toEqual([
      ['bimba', 'monkey'],
      ['marta', 'human'],
    ]);
    const physics = new PhysicsWorld(result.world!, createDefaultRegistry());
    const [bimba, marta] = spawnCharacters(physics, result.characters);
    expect(bimba!.entity.size).toEqual(MONKEY_SIZE);
    expect(marta!.entity.size).toEqual(PLAYER_SIZE);
    expect(MONKEY_SIZE.height).toBeCloseTo(1.4, 5);
    const errors = loadWorldFile(
      WORLD.replace('body: monkey', 'body: dragon'),
      'w.yaml',
    ).diagnostics.map((d) => d.path);
    expect(errors).toEqual(['characters[0].body']);
  });
});
