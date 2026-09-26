import { describe, expect, it } from 'vitest';
import { WATER } from '../blocks/builtin';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { rectsOverlap } from '../structures/builder';
import { createDefaultStructures } from '../structures/builtin';
import { composeWorld, type PlacedStructure } from './composeWorld';

const registry = createDefaultStructures();

function compose(body: string, seed = 4, size = '[128, 96, 128]') {
  const text = `version: 1\nterrain: { seed: ${seed}, generator: ${TERRAIN_GENERATOR_VERSION}, size: ${size} }\n${body}`;
  return composeWorld(text, 'w.yaml', { registry });
}

const scattered = (placements: readonly PlacedStructure[]) =>
  placements.filter((p) => p.source.startsWith('scatter'));

describe('distributions', () => {
  it('YAML-005.a: types with weights, rectangle or circle, density or count', () => {
    const byCount = compose(
      'scatter:\n  - types: { oak: 3, birch: 1 }\n    area: { rect: { from: [10, 10], to: [118, 118] } }\n    count: 80\n    minDistance: 6\n',
    );
    expect(byCount.diagnostics).toEqual([]);
    const trees = scattered(byCount.placements);
    expect(trees).toHaveLength(80);
    const oaks = trees.filter((t) => t.type === 'oak').length;
    expect(oaks / trees.length).toBeGreaterThan(0.6);
    expect(oaks / trees.length).toBeLessThan(0.9);
    for (const t of trees) {
      expect(t.x >= 10 && t.x < 118 && t.z >= 10 && t.z < 118).toBe(true);
    }
    // Density: structures per 100 m², i.e. per 400 square blocks.
    const byDensity = compose(
      'scatter:\n  - types: { birch: 1 }\n    area: { circle: { center: [64, 64], radius: 40 } }\n    density: 0.5\n    minDistance: 5\n',
    );
    const expected = Math.round((0.5 * Math.PI * 40 * 40) / 400);
    const birches = scattered(byDensity.placements);
    expect(birches).toHaveLength(expected);
    for (const b of birches) expect((b.x - 64) ** 2 + (b.z - 64) ** 2).toBeLessThanOrEqual(1600);
    // Asking for more than fits gives a warning, not an error.
    const crowded = compose(
      'scatter:\n  - types: { oak: 1 }\n    area: { circle: { center: [64, 64], radius: 10 } }\n    count: 50\n    minDistance: 8\n',
    );
    expect(crowded.world).toBeDefined();
    expect(crowded.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', path: 'scatter[0]', line: 4 }),
    ]);
  });

  it('YAML-005.b: positions depend on the declaration and seed, not on the terrain', () => {
    const body =
      'scatter:\n  - types: { oak: 1, willow: 1 }\n    area: { rect: { from: [20, 20], to: [100, 100] } }\n    count: 30\n    minDistance: 7\n';
    const positions = (size: string) =>
      scattered(compose(body, 4, size).placements).map((p) => [p.type, p.x, p.z, p.rotation]);
    // A different world size gives a different terrain, but the same positions.
    expect(positions('[256, 96, 256]')).toEqual(positions('[128, 96, 128]'));
    expect(positions('[128, 96, 128]')).toEqual(positions('[128, 96, 128]'));
    expect(scattered(compose(body, 5).placements)).not.toEqual(
      scattered(compose(body, 4).placements),
    );
  });

  it('YAML-005.c: distributed structures avoid each other, single structures and water', () => {
    const result = compose(
      [
        'structures:',
        '  - { type: stone_farmhouse, at: [40, 40] }',
        '  - { type: pond, at: [85, 80], params: { radius: 12 } }',
        'scatter:',
        '  - types: { oak: 2, birch: 1, wooden_hut: 1 }',
        '    area: { rect: { from: [4, 4], to: [124, 124] } }',
        '    density: 2',
        '    minDistance: 6',
        '  - types: { willow: 1 }',
        '    area: { circle: { center: [85, 80], radius: 30 } }',
        '    count: 12',
        '    minDistance: 5',
        '',
      ].join('\n'),
    );
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const all = result.placements;
    const spread = scattered(all);
    expect(spread.length).toBeGreaterThan(30);
    for (const s of spread) {
      for (const other of all) {
        if (other !== s) expect(rectsOverlap(s.rect, other.rect)).toBe(false);
      }
      for (let z = s.rect.minZ; z < s.rect.maxZ; z++) {
        for (let x = s.rect.minX; x < s.rect.maxX; x++) {
          for (let y = 0; y < 96; y++) expect(result.world!.getBlock(x, y, z)).not.toBe(WATER);
        }
      }
    }
  });

  it('YAML-005.d: every distributed structure keeps the minimum distance', () => {
    for (const seed of [1, 2, 3]) {
      const trees = scattered(
        compose(
          'scatter:\n  - types: { oak: 1, birch: 1 }\n    area: { circle: { center: [64, 64], radius: 60 } }\n    density: 3\n    minDistance: 7\n',
          seed,
        ).placements,
      );
      expect(trees.length).toBeGreaterThan(50);
      for (let i = 0; i < trees.length; i++) {
        for (let j = i + 1; j < trees.length; j++) {
          const d = Math.hypot(trees[i]!.x - trees[j]!.x, trees[i]!.z - trees[j]!.z);
          expect(d).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });
});
