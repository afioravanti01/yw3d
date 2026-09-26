import { createNoise2D } from 'simplex-noise';
import { createRng } from './rng';

/** 2D noise in [-1, 1]. */
export type Noise2D = (x: number, z: number) => number;

/** Seeded 2D simplex noise. Different `salt` values give independent fields for the same seed. */
export function createNoise(seed: number, salt = 0): Noise2D {
  return createNoise2D(createRng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0));
}

export interface FbmOptions {
  /** Wavelength of the first octave, in blocks. */
  wavelength: number;
  octaves: number;
  /** Frequency multiplier per octave. */
  lacunarity?: number;
  /** Amplitude multiplier per octave. */
  gain?: number;
}

/** Fractal Brownian motion: octaves of noise summed and normalized to [-1, 1]. */
export function fbm(noise: Noise2D, x: number, z: number, options: FbmOptions): number {
  const { wavelength, octaves, lacunarity = 2, gain = 0.5 } = options;
  let frequency = 1 / wavelength;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x * frequency, z * frequency);
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum / norm;
}

/**
 * Domain warping: offsets (x, z) by two independent noise fields, so that shapes sampled at the
 * warped coordinates become sinuous instead of blob-like (P14).
 */
export function warp(
  noiseX: Noise2D,
  noiseZ: Noise2D,
  x: number,
  z: number,
  wavelength: number,
  amplitude: number,
): [number, number] {
  const f = 1 / wavelength;
  return [x + amplitude * noiseX(x * f, z * f), z + amplitude * noiseZ(x * f, z * f)];
}
