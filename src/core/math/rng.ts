/** A deterministic source of numbers in [0, 1). */
export type Random = () => number;

const UINT32 = 4294967296;

/** Expands a 32-bit seed into well-mixed 32-bit words (splitmix32). */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * Seeded PRNG (sfc32). Uses only 32-bit integer operations, so the sequence is identical in
 * every JavaScript engine (WORLD-005.d).
 */
export function createRng(seed: number): Random {
  const init = splitmix32(seed);
  let a = init();
  let b = init();
  let c = init();
  let d = init();
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / UINT32;
  };
}

/** Integer in [min, max], both inclusive. */
export function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Float in [min, max). */
export function randomRange(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

export const FNV1A_OFFSET = 0x811c9dc5;

/** 32-bit FNV-1a over bytes. Pass the previous result as `hash` to hash data in pieces. */
export function fnv1a(bytes: ArrayLike<number>, hash: number = FNV1A_OFFSET): number {
  let h = hash >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stateless 32-bit hash of an integer position, for per-block variation. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ z, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Maps a 32-bit hash to [-1, 1). */
export function hashToSigned(hash: number): number {
  return (hash >>> 0) / (UINT32 / 2) - 1;
}
