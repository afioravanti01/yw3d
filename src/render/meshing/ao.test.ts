import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, GRASS, STONE } from '../../core/blocks/builtin';
import { World } from '../../core/world/world';
import { AO_FACTORS, faceAO } from './ao';
import { FACES } from './faces';
import { meshChunk } from './mesher';
import { copyPaddedChunk, paddedIndex } from './padded';
import { createPalette, srgbToLinear } from './palette';

const registry = createDefaultRegistry();
const palette = createPalette(registry);
const TOP = FACES.findIndex((f) => f.normal[1] === 1);

/** Occlusion of the top face of a floor block at (5, 10, 5) with extra blocks around it. */
function topAO(extra: [number, number, number][]): number[] {
  const world = new World({ x: 32, y: 32, z: 32 });
  world.setBlock(5, 10, 5, GRASS);
  for (const [x, y, z] of extra) world.setBlock(x, y, z, STONE);
  const padded = copyPaddedChunk(world, 0, 0, 0);
  return [...faceAO(padded, palette.opaque, paddedIndex(5, 10, 5), TOP)];
}

/** Index of the top-face vertex whose corner has the given x and z (0 or 1). */
const vertex = (x: number, z: number) =>
  FACES[TOP]!.corners.findIndex((c) => c[0] === x && c[2] === z);

describe('ambient occlusion', () => {
  it('RENDER-002.a: an open face has no occlusion', () => {
    expect(topAO([])).toEqual([3, 3, 3, 3]);
  });

  it('RENDER-002.a: one side block darkens the two vertices it touches by one level', () => {
    const ao = topAO([[6, 11, 5]]);
    expect(ao[vertex(1, 0)]).toBe(2);
    expect(ao[vertex(1, 1)]).toBe(2);
    expect(ao[vertex(0, 0)]).toBe(3);
    expect(ao[vertex(0, 1)]).toBe(3);
  });

  it('RENDER-002.a: a corner block alone darkens one vertex by one level', () => {
    const ao = topAO([[6, 11, 6]]);
    expect(ao[vertex(1, 1)]).toBe(2);
    expect(ao.filter((level) => level === 3)).toHaveLength(3);
  });

  it('RENDER-002.a: two side blocks give the maximum occlusion regardless of the corner', () => {
    expect(
      topAO([
        [6, 11, 5],
        [5, 11, 6],
      ])[vertex(1, 1)],
    ).toBe(0);
    expect(
      topAO([
        [6, 11, 5],
        [5, 11, 6],
        [6, 11, 6],
      ])[vertex(1, 1)],
    ).toBe(0);
  });

  it('RENDER-002.a: vertex colors are darkened by the occlusion level', () => {
    const custom = createDefaultRegistry();
    custom.register({
      id: 42,
      name: 'flat',
      color: 0x808080,
      variation: 0,
      solid: true,
      opaque: true,
    });
    const world = new World({ x: 32, y: 32, z: 32 });
    world.setBlock(5, 10, 5, 42);
    world.setBlock(6, 11, 5, 42);
    world.setBlock(5, 11, 6, 42);
    const data = meshChunk(copyPaddedChunk(world, 0, 0, 0), createPalette(custom));
    const base = Math.round(srgbToLinear(0x80 / 255) * 65535);
    const levels = new Set<number>();
    for (let v = 0; v < data.faceCount * 4; v++) {
      const factor = data.colors[v * 3]! / base;
      const level = AO_FACTORS.findIndex((f) => Math.abs(f - factor) < 1e-3);
      expect(level).toBeGreaterThanOrEqual(0);
      levels.add(level);
    }
    expect(levels).toEqual(new Set([0, 2, 3]));
  });

  it('RENDER-002.b: the quad is split through the occluded corner, whichever it is', () => {
    for (const [cx, cz] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      const world = new World({ x: 32, y: 32, z: 32 });
      world.setBlock(5, 10, 5, GRASS);
      world.setBlock(cx === 1 ? 6 : 4, 11, cz === 1 ? 6 : 4, STONE);
      const data = meshChunk(copyPaddedChunk(world, 0, 0, 0), palette);
      // The top face of the floor block: all its vertices at y = 11, x and z in {5, 6}.
      const isFloorTop = (f: number) =>
        [0, 1, 2, 3].every((v) => {
          const [x, y, z] = data.positions.subarray((f * 4 + v) * 3, (f * 4 + v) * 3 + 3);
          return y === 11 && (x === 5 || x === 6) && (z === 5 || z === 6);
        });
      const face = Array.from({ length: data.faceCount }, (_, f) => f).find(isFloorTop)!;
      const tri = [...data.indices.slice(face * 6, face * 6 + 6)];
      const diagonal = tri.slice(0, 3).filter((i) => tri.slice(3).includes(i));
      const dark = face * 4 + vertex(cx, cz);
      expect(diagonal).toContain(dark);
    }
  });
});
