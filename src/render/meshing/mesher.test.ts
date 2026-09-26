import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, STONE } from '../../core/blocks/builtin';
import { World, type WorldSize } from '../../core/world/world';
import { meshChunk, type MeshData } from './mesher';
import { copyPaddedChunk } from './padded';
import { createPalette, srgbToLinear } from './palette';

const registry = createDefaultRegistry();
const palette = createPalette(registry);

function mesh(world: World, cx = 0, cy = 0, cz = 0): MeshData {
  return meshChunk(copyPaddedChunk(world, cx, cy, cz), palette);
}

function worldWith(size: WorldSize, blocks: [number, number, number][], id = STONE): World {
  const world = new World(size);
  for (const [x, y, z] of blocks) world.setBlock(x, y, z, id);
  return world;
}

const small: WorldSize = { x: 64, y: 64, z: 64 };

describe('mesher', () => {
  it('an isolated block has 6 faces', () => {
    const data = mesh(worldWith(small, [[10, 10, 10]]));
    expect(data.faceCount).toBe(6);
    expect(data.positions.length).toBe(6 * 4 * 3);
    expect(data.indices.length).toBe(6 * 6);
  });

  it('two adjacent blocks hide the faces they share', () => {
    const data = mesh(
      worldWith(small, [
        [10, 10, 10],
        [11, 10, 10],
      ]),
    );
    expect(data.faceCount).toBe(10);
  });

  it('faces on chunk borders are culled using the neighbor chunk', () => {
    const world = worldWith(small, [
      [31, 5, 5],
      [32, 5, 5],
    ]);
    expect(mesh(world, 0, 0, 0).faceCount).toBe(5);
    expect(mesh(world, 1, 0, 0).faceCount).toBe(5);
  });

  it('a buried chunk has no faces', () => {
    const world = World.fromColumns({ x: 96, y: 96, z: 96 }, (_x, _z, c) => c.fill(STONE));
    expect(mesh(world, 1, 1, 1).faceCount).toBe(0);
  });

  it('RENDER-006.a: faces towards the outside of the world are generated', () => {
    expect(mesh(worldWith(small, [[0, 0, 0]])).faceCount).toBe(6);
    const solid = World.fromColumns({ x: 32, y: 32, z: 32 }, (_x, _z, c) => c.fill(STONE));
    expect(mesh(solid).faceCount).toBe(6 * 32 * 32);
  });

  it('every face is wound counter-clockwise around its normal', () => {
    const data = mesh(worldWith(small, [[10, 10, 10]]));
    for (let f = 0; f < data.faceCount; f++) {
      const p = (i: number) =>
        [0, 1, 2].map((k) => data.positions[data.indices[f * 6 + i]! * 3 + k]!);
      const [a, b, c] = [p(0), p(1), p(2)] as [number[], number[], number[]];
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const cross = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const n = data.indices[f * 6]! * 3;
      expect(cross.map((v) => v + 0)).toEqual(
        [...data.normals.slice(n, n + 3)].map((v) => v / 127),
      );
    }
  });

  it('RENDER-001.a: vertex colors come from the base block color, without textures', () => {
    const custom = createDefaultRegistry();
    custom.register({
      id: 42,
      name: 'flat',
      color: 0x336699,
      variation: 0,
      solid: true,
      opaque: true,
    });
    const data = meshChunk(
      copyPaddedChunk(worldWith(small, [[10, 10, 10]], 42), 0, 0, 0),
      createPalette(custom),
    );
    expect(Object.keys(data)).not.toContain('uvs');
    const expected = [0x33, 0x66, 0x99].map((c) => Math.round(srgbToLinear(c / 255) * 65535));
    for (let v = 0; v < data.faceCount * 4; v++) {
      expect([...data.colors.slice(v * 3, v * 3 + 3)]).toEqual(expected);
    }
  });
});
