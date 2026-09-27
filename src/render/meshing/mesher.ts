import { CHUNK_SIZE } from '../../core/world/chunk';
import { AO_FACTORS, faceAO, shouldFlip } from './ao';
import { blockColor } from './colorVariation';
import { FACES } from './faces';
import { paddedIndex } from './padded';
import type { Palette } from './palette';

/**
 * Geometry of one chunk in compact typed arrays, ready for a BufferGeometry. Pure data with no
 * dependency on three, so that meshing can move to a Web Worker (plan P3).
 */
export interface MeshData {
  /** Chunk-local vertex positions in blocks, 0..32. */
  readonly positions: Uint8Array;
  /** Face normals, normalized Int8 (±127). */
  readonly normals: Int8Array;
  /** Linear RGB vertex colors, normalized Uint16. */
  readonly colors: Uint16Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly faceCount: number;
}

const MAX_FACES = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE * 6;
const UINT16_MAX = 65535;

// Scratch buffers reused across calls: the result is copied out of them.
const scratchPositions = new Uint8Array(MAX_FACES * 4 * 3);
const scratchNormals = new Int8Array(MAX_FACES * 4 * 3);
const scratchColors = new Uint16Array(MAX_FACES * 4 * 3);
const scratchFlips = new Uint8Array(MAX_FACES);
const ao = new Uint8Array(4);
const color = new Float32Array(3);

const NEIGHBOR_OFFSETS = FACES.map(
  (face) => paddedIndex(face.normal[0], face.normal[1], face.normal[2]) - paddedIndex(0, 0, 0),
);

/**
 * Builds the visible faces of a chunk from its padded copy: one quad for every side of an
 * opaque block that touches a non-opaque one, including sides facing outside the world
 * (RENDER-006.a). Vertex colors combine the block color variation and ambient occlusion.
 * `origin` is the world position of the chunk's first block, for the color variation.
 */
export function meshChunk(
  padded: Uint8Array,
  palette: Palette,
  origin: readonly [number, number, number] = [0, 0, 0],
): MeshData {
  let faceCount = 0;
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const index = paddedIndex(x, y, z);
        const block = padded[index]!;
        if (palette.opaque[block] === 0) {
          continue;
        }
        for (let f = 0; f < FACES.length; f++) {
          if (palette.opaque[padded[index + NEIGHBOR_OFFSETS[f]!]!] === 1) {
            continue;
          }
          blockColor(color, palette, block, origin[0] + x, origin[1] + y, origin[2] + z);
          faceAO(padded, palette.opaque, index, f, ao);
          emitFace(faceCount++, f, x, y, z);
        }
      }
    }
  }
  return buildMeshData(faceCount);
}

/**
 * Builds the faces of the translucent blocks of a chunk (water, RENDER-007): one quad for every
 * side facing a block that is neither opaque nor of the same kind, so there are no faces between
 * two water blocks or between water and an opaque block (RENDER-007.a).
 */
export function meshTranslucent(
  padded: Uint8Array,
  palette: Palette,
  origin: readonly [number, number, number] = [0, 0, 0],
): MeshData {
  let faceCount = 0;
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const index = paddedIndex(x, y, z);
        const block = padded[index]!;
        if (palette.translucent[block] === 0) {
          continue;
        }
        for (let f = 0; f < FACES.length; f++) {
          const neighbor = padded[index + NEIGHBOR_OFFSETS[f]!]!;
          if (neighbor === block || palette.opaque[neighbor] === 1) {
            continue;
          }
          blockColor(color, palette, block, origin[0] + x, origin[1] + y, origin[2] + z);
          faceAO(padded, palette.opaque, index, f, ao);
          emitFace(faceCount++, f, x, y, z);
        }
      }
    }
  }
  return buildMeshData(faceCount);
}

/** Writes one quad; reads the block color from `color` and the occlusion levels from `ao`. */
function emitFace(faceIndex: number, f: number, x: number, y: number, z: number): void {
  const face = FACES[f]!;
  scratchFlips[faceIndex] = shouldFlip(ao) ? 1 : 0;
  for (let v = 0; v < 4; v++) {
    const light = AO_FACTORS[ao[v]! as 0 | 1 | 2 | 3];
    const corner = face.corners[v]!;
    const o = (faceIndex * 4 + v) * 3;
    scratchPositions[o] = x + corner[0];
    scratchPositions[o + 1] = y + corner[1];
    scratchPositions[o + 2] = z + corner[2];
    scratchNormals[o] = face.normal[0] * 127;
    scratchNormals[o + 1] = face.normal[1] * 127;
    scratchNormals[o + 2] = face.normal[2] * 127;
    scratchColors[o] = toUint16(color[0]! * light);
    scratchColors[o + 1] = toUint16(color[1]! * light);
    scratchColors[o + 2] = toUint16(color[2]! * light);
  }
}

function toUint16(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * UINT16_MAX);
}

function buildMeshData(faceCount: number): MeshData {
  const vertexCount = faceCount * 4;
  const indices =
    vertexCount > UINT16_MAX + 1 ? new Uint32Array(faceCount * 6) : new Uint16Array(faceCount * 6);
  for (let i = 0; i < faceCount; i++) {
    const v = i * 4;
    const o = i * 6;
    // Triangles (0, 1, 2), (0, 2, 3), or (1, 2, 3), (1, 3, 0) when split along the 1–3 diagonal.
    const first = scratchFlips[i] === 1 ? v + 1 : v;
    const quad = (k: number) => v + ((first - v + k) & 3);
    indices[o] = quad(0);
    indices[o + 1] = quad(1);
    indices[o + 2] = quad(2);
    indices[o + 3] = quad(0);
    indices[o + 4] = quad(2);
    indices[o + 5] = quad(3);
  }
  return {
    positions: scratchPositions.slice(0, vertexCount * 3),
    normals: scratchNormals.slice(0, vertexCount * 3),
    colors: scratchColors.slice(0, vertexCount * 3),
    indices,
    faceCount,
  };
}
