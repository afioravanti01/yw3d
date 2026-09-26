import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, GRASS, STONE } from '../core/blocks/builtin';
import { World } from '../core/world/world';
import { ChunkRenderer } from './chunkRenderer';
import { createPalette } from './meshing/palette';

function setup() {
  const world = World.fromColumns({ x: 96, y: 32, z: 96 }, (_x, _z, column) =>
    column.fill(STONE, 0, 10),
  );
  const renderer = new ChunkRenderer(
    world,
    createPalette(createDefaultRegistry()),
    new THREE.MeshBasicMaterial(),
  );
  renderer.buildAll();
  return { world, renderer };
}

describe('ChunkRenderer', () => {
  it('builds one mesh per chunk with blocks', () => {
    const { renderer } = setup();
    expect(renderer.stats.meshedChunks).toBe(9);
    expect(renderer.group.children).toHaveLength(9);
    expect(renderer.stats.triangles).toBeGreaterThan(0);
  });

  it('RENDER-005.a: a change rebuilds only the chunks that depend on the block', () => {
    const { world, renderer } = setup();
    expect(renderer.update()).toBe(0);
    world.setBlock(40, 10, 40, GRASS);
    expect(renderer.update()).toBe(1);
    world.setBlock(32, 10, 40, GRASS);
    expect(renderer.update()).toBe(2);
    world.setBlock(32, 10, 32, GRASS);
    expect(renderer.update()).toBe(4);
    world.setBlock(40, 10, 40, GRASS);
    expect(renderer.update()).toBe(0);
  });

  it('keeps triangle and chunk counts consistent after rebuilds', () => {
    const { world, renderer } = setup();
    const before = renderer.stats.triangles;
    world.setBlock(40, 10, 40, GRASS);
    renderer.update();
    expect(renderer.stats.triangles).toBe(before + 8);
    expect(renderer.stats.meshedChunks).toBe(9);
    expect(renderer.stats.rebuiltChunks).toBe(1);
  });
});
