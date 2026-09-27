import * as THREE from 'three';
import { CHUNK_SIZE } from '../core/world/chunk';
import type { World } from '../core/world/world';
import { meshChunk, meshTranslucent, type MeshData } from './meshing/mesher';
import { copyPaddedChunk, PADDED_VOLUME } from './meshing/padded';
import type { Palette } from './meshing/palette';

export interface ChunkRenderStats {
  /** Chunks in the world. */
  readonly totalChunks: number;
  /** Chunks that currently have visible faces. */
  meshedChunks: number;
  triangles: number;
  /** Duration of the last rebuild of a single chunk, in ms (RENDER-005.c). */
  lastChunkRebuildMs: number;
  /** Chunks rebuilt since the start, initial build excluded. */
  rebuiltChunks: number;
}

/**
 * Keeps one Mesh per chunk in sync with the World (RENDER-005). Changes mark the affected chunks
 * dirty; `update` rebuilds only those. Scene units are blocks.
 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly stats: ChunkRenderStats;

  private readonly meshes = new Map<number, THREE.Mesh>();
  /** Translucent (water) meshes, drawn after the opaque ones (RENDER-007). */
  private readonly translucentMeshes = new Map<number, THREE.Mesh>();
  private readonly dirty = new Set<number>();
  private readonly padded = new Uint8Array(PADDED_VOLUME);
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly palette: Palette,
    private readonly material: THREE.Material,
    private readonly translucentMaterial: THREE.Material = material,
  ) {
    this.group.name = 'chunks';
    this.stats = {
      totalChunks: world.chunksX * world.chunksY * world.chunksZ,
      meshedChunks: 0,
      triangles: 0,
      lastChunkRebuildMs: 0,
      rebuiltChunks: 0,
    };
    this.unsubscribe = world.onChange((x, y, z) => {
      for (const { cx, cy, cz } of world.chunksAffectedBy(x, y, z)) {
        this.dirty.add(this.key(cx, cy, cz));
      }
    });
  }

  /** Meshes every chunk that contains blocks. */
  buildAll(): void {
    const { chunksX, chunksY, chunksZ } = this.world;
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cz = 0; cz < chunksZ; cz++) {
        for (let cx = 0; cx < chunksX; cx++) {
          if (this.world.getChunk(cx, cy, cz)) {
            this.rebuild(cx, cy, cz);
          }
        }
      }
    }
    this.dirty.clear();
  }

  /** Rebuilds the dirty chunks. Returns how many were rebuilt. */
  update(): number {
    const count = this.dirty.size;
    for (const key of this.dirty) {
      const { cx, cy, cz } = this.coords(key);
      const start = performance.now();
      this.rebuild(cx, cy, cz);
      this.stats.lastChunkRebuildMs = performance.now() - start;
      this.stats.rebuiltChunks++;
    }
    this.dirty.clear();
    return count;
  }

  dispose(): void {
    this.unsubscribe();
    for (const key of [...this.meshes.keys()]) {
      this.removeMesh(key);
    }
    for (const key of [...this.translucentMeshes.keys()]) {
      this.removeTranslucentMesh(key);
    }
  }

  private rebuild(cx: number, cy: number, cz: number): void {
    const key = this.key(cx, cy, cz);
    this.removeMesh(key);
    this.removeTranslucentMesh(key);
    const padded = copyPaddedChunk(this.world, cx, cy, cz, this.padded);
    const origin = [cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE] as const;

    const data = meshChunk(padded, this.palette, origin);
    if (data.faceCount > 0) {
      const mesh = this.createMesh(data, this.material, `chunk ${cx},${cy},${cz}`, origin);
      mesh.castShadow = true;
      this.meshes.set(key, mesh);
      this.stats.meshedChunks++;
    }
    const water = meshTranslucent(padded, this.palette, origin);
    if (water.faceCount > 0) {
      const mesh = this.createMesh(
        water,
        this.translucentMaterial,
        `water ${cx},${cy},${cz}`,
        origin,
      );
      this.translucentMeshes.set(key, mesh);
    }
  }

  private createMesh(
    data: MeshData,
    material: THREE.Material,
    name: string,
    origin: readonly [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(createGeometry(data), material);
    mesh.position.set(origin[0], origin[1], origin[2]);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = name;
    this.group.add(mesh);
    this.stats.triangles += data.faceCount * 2;
    return mesh;
  }

  private removeMesh(key: number): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.disposeMesh(mesh);
    this.meshes.delete(key);
    this.stats.meshedChunks--;
  }

  private removeTranslucentMesh(key: number): void {
    const mesh = this.translucentMeshes.get(key);
    if (!mesh) return;
    this.disposeMesh(mesh);
    this.translucentMeshes.delete(key);
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    this.stats.triangles -= (mesh.geometry.index?.count ?? 0) / 3;
    mesh.geometry.dispose();
  }

  private key(cx: number, cy: number, cz: number): number {
    return (cy * this.world.chunksZ + cz) * this.world.chunksX + cx;
  }

  private coords(key: number): { cx: number; cy: number; cz: number } {
    const { chunksX, chunksZ } = this.world;
    return {
      cx: key % chunksX,
      cz: Math.floor(key / chunksX) % chunksZ,
      cy: Math.floor(key / (chunksX * chunksZ)),
    };
  }
}

export function createGeometry(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3, true));
  geometry.setAttribute('sway', new THREE.BufferAttribute(data.sway, 1, true));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
