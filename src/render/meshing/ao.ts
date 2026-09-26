import { FACES } from './faces';
import { paddedIndex } from './padded';

/** Brightness per occlusion level: 0 = most occluded, 3 = open (RENDER-002.a). */
export const AO_FACTORS = [0.5, 0.68, 0.84, 1] as const;

/**
 * For each face and vertex, padded-index offsets from the block to the three blocks that touch
 * the vertex on the face side: side along the first tangent, side along the second, and the
 * diagonal corner.
 */
const AO_OFFSETS: readonly (readonly [number, number, number][])[] = FACES.map((face) => {
  const [nx, ny, nz] = face.normal;
  const tangents = [0, 1, 2].filter((axis) => face.normal[axis] === 0) as [number, number];
  return face.corners.map((corner) => {
    const front = [nx, ny, nz];
    const side = (axis: number) => {
      const d = [...front];
      d[axis]! += corner[axis]! * 2 - 1;
      return d;
    };
    const s1 = side(tangents[0]);
    const s2 = side(tangents[1]);
    const c = [...s1];
    c[tangents[1]]! += corner[tangents[1]]! * 2 - 1;
    const offset = (d: number[]) => paddedIndex(d[0]!, d[1]!, d[2]!) - paddedIndex(0, 0, 0);
    return [offset(s1), offset(s2), offset(c)] as [number, number, number];
  });
});

/**
 * Occlusion levels of the 4 vertices of face `f` of the block at padded index `index`,
 * in the order of the face corners.
 */
export function faceAO(
  padded: Uint8Array,
  opaque: Uint8Array,
  index: number,
  f: number,
  out: Uint8Array = new Uint8Array(4),
): Uint8Array {
  const offsets = AO_OFFSETS[f]!;
  for (let v = 0; v < 4; v++) {
    const [s1, s2, c] = offsets[v]!;
    const side1 = opaque[padded[index + s1]!]!;
    const side2 = opaque[padded[index + s2]!]!;
    const corner = opaque[padded[index + c]!]!;
    out[v] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
  }
  return out;
}

/**
 * Whether to split the quad along the 1–3 diagonal instead of 0–2. The split follows the darker
 * diagonal, so the result is the same whichever corner is occluded (RENDER-002.b).
 */
export function shouldFlip(ao: Uint8Array): boolean {
  return ao[0]! + ao[2]! > ao[1]! + ao[3]!;
}
