import { describe, expect, it } from 'vitest';
import { AIR, PLANKS } from '../blocks/builtin';
import { generateHeightmap, TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createTestRegistry } from '../structures/testing';
import { DEFAULT_WORLD_SIZE, type World } from '../world/world';
import { composeWorld } from './composeWorld';

const SMALL = { x: 128, y: 96, z: 128 };
const header = (seed = 3, size = '[128, 96, 128]') =>
  `version: 2\nname: Test\nterrain:\n  seed: ${seed}\n  generator: ${TERRAIN_GENERATOR_VERSION}\n  size: ${size}\n`;

const compose = (text: string, seedOverride?: number) =>
  composeWorld(text, 'worlds/test.yaml', { registry: createTestRegistry(), seedOverride });

const surface = (seed: number, x: number, z: number) =>
  generateHeightmap(seed, SMALL).heights[x + z * SMALL.x]!;

/** Blocks of a column from y0 up, as ids. */
const column = (world: World, x: number, z: number, y0: number, n: number) =>
  Array.from({ length: n }, (_, i) => world.getBlock(x, y0 + i, z));

describe('world composition', () => {
  it('YAML-001.c: the same file and code give an identical world', () => {
    const text = `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 50]\n`;
    const a = compose(text);
    const b = compose(text);
    expect(a.diagnostics).toEqual([]);
    expect(a.world!.hash()).toBe(b.world!.hash());
  });

  it('YAML-003.a: seed and size come from the file, with default size', () => {
    const a = compose(header(3));
    const b = compose(header(4));
    expect(a.seed).toBe(3);
    expect(a.world!.size).toEqual(SMALL);
    expect(a.world!.hash()).not.toBe(b.world!.hash());
    const noSize = compose(
      `version: 2\nname: Test\nterrain: { seed: 3, generator: ${TERRAIN_GENERATOR_VERSION} }\n`,
    );
    expect(noSize.world!.size).toEqual(DEFAULT_WORLD_SIZE);
    expect(compose(header(3, '[100, 96, 128]')).diagnostics[0]).toMatchObject({
      severity: 'error',
      path: 'terrain.size',
      line: 6,
    });
  });

  it('YAML-003.b: a different generator version gives a warning with both versions', () => {
    const text = header().replace(
      `generator: ${TERRAIN_GENERATOR_VERSION}`,
      `generator: ${TERRAIN_GENERATOR_VERSION + 1}`,
    );
    const result = compose(text);
    expect(result.world).toBeDefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        line: 5,
        path: 'terrain.generator',
        message: expect.stringContaining(
          `terrain generator ${TERRAIN_GENERATOR_VERSION + 1}, the current one is ${TERRAIN_GENERATOR_VERSION}`,
        ),
      }),
    ]);
  });

  it('YAML-004.a, YAML-004.b: structures rest on the surface at their position, or at an explicit y', () => {
    const text = `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 50]\n    params: { height: 4 }\n  - type: test_post\n    name: Test\n    at: [60, 70]\n    y: 80\n`;
    const { world, structureCounts } = compose(text);
    const h = surface(3, 40, 50);
    expect(column(world!, 40, 50, h + 1, 5)).toEqual([PLANKS, PLANKS, PLANKS, PLANKS, AIR]);
    expect(column(world!, 60, 70, 79, 5)).toEqual([AIR, PLANKS, PLANKS, PLANKS, AIR]);
    expect(structureCounts).toEqual({ test_post: 2 });
  });

  it('YAML-004.a: rotation turns the footprint around the anchor', () => {
    const text = (rotation: number) =>
      `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 40]\n    y: 90\n    rotation: ${rotation}\n    params: { width: 2 }\n`;
    // A 2 × 2 base at the anchor covers x 40..41, z 40..41; turned by 180° it covers 38..39.
    expect(compose(text(0)).world!.getBlock(41, 90, 41)).toBe(PLANKS);
    const turned = compose(text(180)).world!;
    expect(turned.getBlock(38, 90, 38)).toBe(PLANKS);
    expect(turned.getBlock(41, 90, 41)).toBe(AIR);
  });

  it('YAML-004.c: omitted parameters take the defaults of the type', () => {
    const { world } = compose(
      `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 50]\n`,
    );
    const h = surface(3, 40, 50);
    expect(column(world!, 40, 50, h + 1, 4)).toEqual([PLANKS, PLANKS, PLANKS, AIR]);
  });

  it('YAML-004.d: adding or moving another structure does not change this one', () => {
    const base = `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 50]\n`;
    const withOther = `${base}  - type: test_post\n    name: Test\n    at: [90, 90]\n    params: { height: 9 }\n`;
    const a = compose(base).world!;
    const b = compose(withOther).world!;
    const h = surface(3, 40, 50);
    expect(column(b, 40, 50, h, 6)).toEqual(column(a, 40, 50, h, 6));
  });

  it('YAML-002.c: an unregistered type is an error listing the available types', () => {
    const result = compose(
      `${header()}structures:\n  - type: test_pots\n    name: Test\n    at: [40, 50]\n`,
    );
    expect(result.world).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        line: 8,
        path: 'structures[0].type',
        message:
          'unknown structure type "test_pots" (did you mean "test_post"?); available: test_basin, test_pad, test_post',
      }),
    ]);
  });

  it('YAML-002.c, STRUCT-004.b: a structure outside the world is an error', () => {
    const result = compose(
      `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [127, 20]\n    params: { width: 2 }\n`,
    );
    expect(result.world).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      path: 'structures[0].at',
      message: expect.stringContaining('outside the world'),
    });
  });

  it('STRUCT-001.d: invalid structure parameters are errors with line and path', () => {
    const result = compose(
      `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 50]\n    params:\n      heigth: 4\n`,
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        line: 12,
        path: 'structures[0].params.heigth',
        message: 'unknown field (did you mean "height"?)',
      }),
    ]);
  });

  it('STRUCT-004.a: overlapping structures give a warning citing both; the later one wins', () => {
    const text = `${header()}structures:\n  - type: test_post\n    name: Test\n    at: [40, 40]\n    y: 60\n    params: { width: 3, height: 1 }\n  - type: test_post\n    name: Test\n    at: [41, 41]\n    y: 60\n    params: { width: 1, height: 5 }\n`;
    const result = compose(text);
    expect(result.world).toBeDefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        line: 13,
        path: 'structures[1]',
        message: 'overlaps structures[0] (test_post, line 8): structures[1] (test_post) wins',
      }),
    ]);
    expect(result.world!.getBlock(41, 64, 41)).toBe(PLANKS);
  });

  it('APP-001.a: a seed override replaces the seed of the file', () => {
    const result = compose(header(3), 9);
    expect(result.seed).toBe(9);
    expect(result.world!.hash()).toBe(compose(header(9)).world!.hash());
  });

  it('YAML-009.a, YAML-009.b: names and descriptions of the world and of the player', () => {
    const result = compose(
      header().replace('name: Test\n', 'name: La valle\ndescription: Un borgo e un laghetto.\n'),
    );
    expect(result).toMatchObject({
      name: 'La valle',
      description: 'Un borgo e un laghetto.',
      playerName: 'viandante',
      playerDescription: undefined,
    });
    const withPlayer = compose(
      `${header()}player: { at: [10, 10], name: Ada, description: Viaggia. }\n`,
    );
    expect(withPlayer).toMatchObject({ playerName: 'Ada', playerDescription: 'Viaggia.' });
  });

  it('YAML-010.a: a place outside the world is an error', () => {
    const places = (place: string) => compose(`${header()}places:\n  - ${place}\n`).diagnostics;
    expect(places('{ id: a, name: A, at: [127, 127] }')).toEqual([]);
    expect(places('{ id: a, name: A, area: { rect: { from: [0, 0], to: [128, 128] } } }')).toEqual(
      [],
    );
    expect(
      places('{ id: a, name: A, area: { circle: { center: [64, 64], radius: 63 } } }'),
    ).toEqual([]);
    for (const outside of [
      '{ id: a, name: A, at: [128, 10] }',
      '{ id: a, name: A, area: { rect: { from: [0, 0], to: [129, 10] } } }',
      '{ id: a, name: A, area: { circle: { center: [64, 64], radius: 64 } } }',
    ]) {
      expect(places(outside)).toEqual([
        expect.objectContaining({
          severity: 'error',
          line: 8,
          message: expect.stringContaining('the place is outside the world'),
        }),
      ]);
    }
  });

  it('YAML-010.b: places do not change the world', () => {
    const text = `${header()}structures:\n  - { type: test_post, name: Palo, at: [40, 50] }\n`;
    const withPlaces = `${text}places:\n  - { id: piazza, name: Piazza, at: [30, 30] }\n  - { id: prato, name: Prato, area: { circle: { center: [60, 60], radius: 20 } } }\n`;
    const result = compose(withPlaces);
    expect(result.diagnostics).toEqual([]);
    expect(result.places.map((p) => p.id)).toEqual(['piazza', 'prato']);
    expect(result.world!.hash()).toBe(compose(text).world!.hash());
  });
});
