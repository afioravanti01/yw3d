import { describe, expect, it } from 'vitest';
import { STONE, PLANKS } from '../blocks/builtin';
import { randomInt } from '../math/rng';
import { int, object, type Issue } from '../schema/schema';
import { World } from '../world/world';
import { rotateRect, StructureBuilder, type Rotation } from './builder';
import {
  buildStructure,
  defineStructure,
  parseParams,
  StructureRegistry,
  structureSeed,
} from './registry';

/** An L-shaped wall, asymmetric so that rotations are distinguishable. */
const lWall = defineStructure({
  name: 'test_l_wall',
  params: object({ length: int({ min: 2, max: 8, default: 4 }), height: int({ min: 1, max: 6 }) }),
  terrain: 'sit',
  footprint: (p) => ({ minX: 0, minZ: 0, maxX: p.length, maxZ: 2 }),
  generate({ params, random, builder }) {
    const top = params.height + randomInt(random, 0, 2);
    builder.fill(0, 0, 0, params.length, top, 1, STONE);
    builder.set(0, 0, 1, PLANKS);
  },
});

const build = (seed: number, height = 3) => {
  const builder = new StructureBuilder();
  buildStructure(lWall, { length: 4, height }, seed, builder);
  return builder;
};

describe('structure registry', () => {
  it('STRUCT-001.a: a type has name, parameter schema, generator and terrain mode', () => {
    const registry = new StructureRegistry();
    registry.register(lWall);
    const type = registry.get('test_l_wall')!;
    expect(type.name).toBe('test_l_wall');
    expect(type.terrain).toBe('sit');
    expect(type.footprint({ length: 4, height: 1 })).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 4,
      maxZ: 2,
    });
    expect(build(1).size).toBeGreaterThan(0);
    expect(registry.names()).toEqual(['test_l_wall']);
  });

  it('STRUCT-001.b: registering a name twice is an error', () => {
    const registry = new StructureRegistry();
    registry.register(lWall);
    expect(() => registry.register(lWall)).toThrow('"test_l_wall" is already registered');
  });

  it('STRUCT-001.d: parameters are validated with the type schema, with defaults', () => {
    const issues: Issue[] = [];
    const path = ['structures', 2, 'params'];
    expect(parseParams(lWall, { height: 2 }, path, issues)).toEqual({ length: 4, height: 2 });
    expect(parseParams(lWall, { lenght: 3, height: 9 }, path, issues)).toBeUndefined();
    expect(issues).toEqual([
      {
        path: ['structures', 2, 'params', 'lenght'],
        message: 'unknown field (did you mean "length"?)',
      },
      {
        path: ['structures', 2, 'params', 'height'],
        message: '9 is out of range: expected an integer between 1 and 6',
      },
    ]);
  });

  it('STRUCT-002.a: same type, parameters, seed and rotation give the same blocks', () => {
    expect(build(42).entries()).toEqual(build(42).entries());
    const place = (rotation: Rotation) => {
      const world = new World({ x: 32, y: 32, z: 32 });
      build(42).stamp(world, 16, 4, 16, rotation);
      return world.hash();
    };
    expect(place(90)).toBe(place(90));
  });

  it('STRUCT-002.c: a rotated structure is the same structure turned around its anchor', () => {
    const blocksOf = (rotation: Rotation) => {
      const world = new World({ x: 32, y: 32, z: 32 });
      build(7).stamp(world, 16, 4, 16, rotation);
      const out: string[] = [];
      for (let y = 4; y < 12; y++)
        for (let z = 8; z < 24; z++)
          for (let x = 8; x < 24; x++) {
            const b = world.getBlock(x, y, z);
            if (b !== 0) out.push(`${x - 16},${y - 4},${z - 16}:${b}`);
          }
      return out.sort();
    };
    const r0 = blocksOf(0);
    // Turning by 90° maps east (x) to south (z): (x, z) → (-z - 1, x).
    const turned = r0
      .map((s) => {
        const [pos, b] = s.split(':');
        const [x, y, z] = pos!.split(',').map(Number) as [number, number, number];
        return `${-z - 1},${y},${x}:${b}`;
      })
      .sort();
    expect(blocksOf(90)).toEqual(turned);
    expect(blocksOf(90)).not.toEqual(r0);
    // Four quarter turns are the identity; the footprint turns with the blocks.
    const rect = { minX: 0, minZ: 0, maxX: 4, maxZ: 2 };
    expect(rotateRect(rect, 90)).toEqual({ minX: -2, minZ: 0, maxX: 0, maxZ: 4 });
    expect(rotateRect(rotateRect(rect, 180), 180)).toEqual(rect);
  });

  it('YAML-004.d: the seed of a structure depends only on world seed, anchor and type', () => {
    expect(structureSeed(1, 100, 200, 'oak')).toBe(structureSeed(1, 100, 200, 'oak'));
    const others = [
      structureSeed(2, 100, 200, 'oak'),
      structureSeed(1, 101, 200, 'oak'),
      structureSeed(1, 100, 201, 'oak'),
      structureSeed(1, 100, 200, 'birch'),
    ];
    expect(new Set([structureSeed(1, 100, 200, 'oak'), ...others]).size).toBe(5);
  });
});
