import { describe, expect, it } from 'vitest';
import { AIR, WATER } from '../blocks/builtin';
import { composeWorld } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { createRng } from '../math/rng';
import { int, object } from '../schema/schema';
import { rotateColumn, type Rotation } from '../structures/builder';
import { createDefaultStructures } from '../structures/builtin';
import { houseLayout } from '../structures/houses';
import { defineStructure, structureSeed } from '../structures/registry';
import { createTestRegistry, testPost } from '../structures/testing';
import type { Goal, MapEntry } from './worldMap';

const header = (size = '[128, 96, 128]') =>
  `version: 2\nname: Valle di prova\ndescription: Un borgo e un laghetto.\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: ${size} }\n`;

const compose = (body: string, registry = createDefaultStructures()) =>
  composeWorld(header() + body, 'w.yaml', { registry });

const errors = (body: string, registry?: ReturnType<typeof createDefaultStructures>) =>
  compose(body, registry).diagnostics.map((d) => ({
    line: d.line,
    path: d.path,
    message: d.message,
  }));

const VILLAGE = `player: { at: [20, 20], name: Ada }
places:
  - { id: piazza, name: Piazza, at: [30, 30] }
  - { id: prato, name: Prato, description: Erba alta., area: { rect: { from: [80, 10], to: [100, 30] } } }
structures:
  - { type: stone_farmhouse, id: casa_fabbro, name: Casa del fabbro, at: [40, 40] }
  - { type: pond, name: Laghetto, at: [60, 95], params: { radius: 8 } }
  - { type: pond, id: laghetto1, name: Stagno, at: [100, 95], params: { radius: 6 } }
  - { type: oak, name: Quercia, at: [80, 60] }
  - { type: pond, name: Pozza, at: [20, 110], params: { radius: 5 } }
scatter:
  - { name: Boschetto, types: { oak: 1, birch: 1 }, area: { circle: { center: [100, 60], radius: 12 } }, count: 5, minDistance: 5 }
characters:
  - { id: tobia, name: Tobia, description: Il garzone., at: [50, 30] }
`;

const entry = (entries: readonly MapEntry[], id: string) => entries.find((e) => e.id === id)!;

describe('world map', () => {
  it('MAP-001.a: characters, places, structures and distributions share one namespace', () => {
    const body = `places:
  - { id: casa, name: Piazza, at: [30, 30] }
structures:
  - { type: oak, id: casa, name: Quercia, at: [80, 60] }
characters:
  - { id: casa, name: Tobia, at: [50, 30] }
`;
    expect(errors(body)).toEqual([
      {
        line: 8,
        path: 'structures[0].id',
        message: 'the id "casa" is already used by places[0] (line 6)',
      },
      {
        line: 10,
        path: 'characters[0].id',
        message: 'the id "casa" is already used by places[0] (line 6)',
      },
    ]);
    expect(
      errors(
        `scatter:\n  - { id: bosco, name: B, types: { oak: 1 }, count: 1, minDistance: 5, area: { circle: { center: [60, 60], radius: 5 } } }\nplaces:\n  - { id: bosco, name: P, at: [1, 1] }\n`,
      ),
    ).toEqual([
      {
        line: 8,
        path: 'places[0].id',
        message: 'the id "bosco" is already used by scatter[0] (line 6)',
      },
    ]);
  });

  it('MAP-001.a: the id "player" is reserved for the player', () => {
    expect(errors('places:\n  - { id: player, name: P, at: [1, 1] }\n')).toEqual([
      {
        line: 6,
        path: 'places[0].id',
        message: 'the id "player" is reserved for the player',
      },
    ]);
  });

  it('MAP-001.b: structures and distributions without an id get type#n, the same for the same file', () => {
    const { map, diagnostics } = compose(VILLAGE);
    expect(diagnostics).toEqual([]);
    const ids = map!.entries.map((e) => e.id);
    expect(ids).toEqual([
      'piazza',
      'prato',
      'casa_fabbro',
      // n counts by type, only the structures without an id.
      'pond#1',
      'laghetto1',
      'oak#1',
      'pond#2',
      'scatter#1',
      'tobia',
      'player',
    ]);
    expect(compose(VILLAGE).map!.entries.map((e) => e.id)).toEqual(ids);
    // A declared id cannot take the form of a generated one.
    expect(errors('places:\n  - { id: "pond#1", name: P, at: [1, 1] }\n')[0]).toMatchObject({
      path: 'places[0].id',
      message: expect.stringContaining('expected an identifier'),
    });
  });

  it('MAP-002.a: the map has the world and an entry per place, structure, distribution, character and the player', () => {
    const { map } = compose(VILLAGE);
    expect(map).toMatchObject({
      name: 'Valle di prova',
      description: 'Un borgo e un laghetto.',
      size: [128, 96, 128],
    });
    const e = (id: string) => entry(map!.entries, id);
    expect(e('piazza')).toMatchObject({ kind: 'place', name: 'Piazza', description: null });
    expect(e('prato')).toMatchObject({ kind: 'place', description: 'Erba alta.' });
    expect(e('casa_fabbro')).toMatchObject({
      kind: 'structure',
      type: 'stone_farmhouse',
      name: 'Casa del fabbro',
    });
    expect(e('scatter#1')).toMatchObject({
      kind: 'scatter',
      types: ['oak', 'birch'],
      name: 'Boschetto',
    });
    expect(e('tobia')).toMatchObject({
      kind: 'character',
      name: 'Tobia',
      description: 'Il garzone.',
    });
    expect(e('player')).toMatchObject({ kind: 'player', name: 'Ada' });
    expect(entry(compose('').map!.entries, 'player').name).toBe('viandante');
  });

  it('MAP-002.b: positions and footprints; starts for who moves; the base height of structures', () => {
    const result = compose(VILLAGE);
    const e = (id: string) => entry(result.map!.entries, id);
    expect(e('piazza').shape).toEqual({ kind: 'point', x: 30, z: 30 });
    expect(e('prato').shape).toEqual({ kind: 'rect', from: [80, 10], to: [100, 30] });
    expect(e('scatter#1').shape).toEqual({ kind: 'circle', center: [100, 60], radius: 12 });
    const house = result.placements.find((p) => p.source === 'structures[0]')!;
    expect(e('casa_fabbro').shape).toEqual({
      kind: 'rect',
      from: [house.rect.minX, house.rect.minZ],
      to: [house.rect.maxX, house.rect.maxZ],
    });
    // The floor of the house is one block below its base.
    const base = e('casa_fabbro').base_y!;
    expect(result.world!.getBlock(house.x, base - 1, house.z)).not.toBe(AIR);
    expect(result.world!.getBlock(house.x, base, house.z)).toBe(AIR);
    expect(e('tobia').shape).toEqual({ kind: 'point', x: 50, z: 30 });
    expect(e('player').shape).toEqual({ kind: 'point', x: 20, z: 20 });
    // Without a player section, the player starts at the center.
    expect(entry(compose('').map!.entries, 'player').shape).toEqual({
      kind: 'point',
      x: 64,
      z: 64,
    });
    // Nothing in the map says where who moves is now: no position beyond the start.
    expect(Object.keys(e('tobia')).sort()).toEqual(['description', 'id', 'kind', 'name', 'shape']);
  });

  it('MAP-002.c: the structures of a distribution have no entry of their own', () => {
    const result = compose(VILLAGE);
    expect(result.placements.filter((p) => p.source.startsWith('scatter')).length).toBe(5);
    expect(result.map!.entries.filter((e) => e.kind === 'structure')).toHaveLength(5);
    expect(result.map!.entries.filter((e) => e.kind === 'scatter')).toHaveLength(1);
  });

  it('MAP-002.d: the map depends only on the file and the registered code', () => {
    const a = compose(VILLAGE).map!;
    const b = compose(VILLAGE).map!;
    expect(b).toEqual(a);
    // Plain data: what controllers receive is the same map.
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('STRUCT-001.a: a type may declare where characters arrive; houses at the door, trees at the trunk', () => {
    const registry = createDefaultStructures();
    const withApproach = defineStructure({
      ...testPost,
      name: 'test_gate',
      params: object({ width: int({ min: 1, max: 8, default: 3 }) }),
      approach: ({ params }) => [[params.width, 0]],
    });
    registry.register(withApproach);
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const goals = compose(
        `structures:\n  - { type: test_gate, id: g, name: G, at: [40, 40], rotation: ${rotation} }\n`,
        registry,
      ).goals;
      const [rx, rz] = rotateColumn(3, 0, rotation);
      expect(goals.get('g')).toMatchObject({ kind: 'columns', columns: [[40 + rx, 40 + rz]] });
    }

    // Houses: the two columns in front of the door, outside, in every rotation.
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const result = compose(
        `structures:\n  - { type: wooden_hut, id: h, name: H, at: [64, 64], rotation: ${rotation} }\n`,
      );
      const hut = result.placements[0]!;
      const layout = houseLayout(
        'wooden_hut',
        hut.params ? (hut.params as { width: number }).width : 0,
        (hut.params as { depth: number }).depth,
        createRng(structureSeed(5, 64, 64, 'wooden_hut')),
      );
      const expected = [layout.doorX, layout.doorX + 1]
        .map((x) => rotateColumn(x, layout.z1, rotation))
        .map(([x, z]) => [64 + x, 64 + z]);
      const goal = result.goals.get('h') as Extract<Goal, { kind: 'columns' }>;
      expect([...goal.columns].sort()).toEqual(expected.sort());
      // Outside, at the level of the doorway: walkable.
      const base = entry(result.map!.entries, 'h').base_y!;
      for (const [x, z] of goal.columns) expect(result.world!.getBlock(x, base, z)).toBe(AIR);
    }

    // Trees: the columns next to the trunk.
    const tree = compose('structures:\n  - { type: birch, id: b, name: B, at: [50, 50] }\n');
    expect(tree.goals.get('b')).toMatchObject({
      columns: [
        [50, 49],
        [49, 50],
        [51, 50],
        [50, 51],
      ],
    });
  });

  it('MAP-003.b: without a declared arrival, the dry ring around a basin or the ring around the footprint', () => {
    const registry = createTestRegistry();
    const result = compose(
      'structures:\n  - { type: test_basin, id: pool, name: P, at: [40, 40], params: { size: 4 } }\n  - { type: test_post, id: post, name: P, at: [80, 80], params: { width: 2 } }\n',
      registry,
    );
    expect(result.diagnostics).toEqual([]);
    const pool = result.goals.get('pool') as Extract<Goal, { kind: 'columns' }>;
    // 4 × 4 water columns: the ring around them has 20 columns, none of them water.
    expect(pool.columns).toHaveLength(20);
    const level = Math.max(
      ...Array.from({ length: 96 }, (_, y) =>
        result.world!.getBlock(41, y, 41) === WATER ? y : 0,
      ),
    );
    for (const [x, z] of pool.columns) {
      expect(x < 40 || x > 43 || z < 40 || z > 43).toBe(true);
      expect(result.world!.getBlock(x, level, z)).not.toBe(WATER);
    }
    const post = result.goals.get('post') as Extract<Goal, { kind: 'columns' }>;
    expect(post.columns).toHaveLength(12);
    expect(post.columns).toContainEqual([79, 79]);
    expect(post.columns).toContainEqual([82, 81]);
  });
});
