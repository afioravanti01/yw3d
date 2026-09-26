import { createNoise } from '../../core/math/noise';
import { hash3, hashToSigned } from '../../core/math/rng';
import type { Palette } from './palette';

/** Fixed seed: the variation depends on the block position only (RENDER-001.b). */
const VARIATION_SEED = 0x51ad3;
const PATCH_WAVELENGTH = 32;
/** Share of the block variation given to broad patches and to per-block grain (plan P5). */
const PATCH_SHARE = 0.6;
const GRAIN_SHARE = 0.3;
/** Patches also shift the hue slightly: brighter patches are warmer, like drier grass. */
const HUE_SHIFT = 0.5;

const patchNoise = createNoise(VARIATION_SEED, 1);
const patchFrequency = 1 / PATCH_WAVELENGTH;

/**
 * Writes the linear RGB color of block `block` at world position (x, y, z) into out[0..2].
 * Brightness stays within ± the block variation (RENDER-001.b).
 */
export function blockColor(
  out: Float32Array,
  palette: Palette,
  block: number,
  x: number,
  y: number,
  z: number,
): Float32Array {
  const amplitude = palette.variation[block]!;
  let r = palette.linear[block * 3]!;
  let g = palette.linear[block * 3 + 1]!;
  let b = palette.linear[block * 3 + 2]!;
  if (amplitude > 0) {
    const patch = patchNoise((x + 0.5 * y) * patchFrequency, z * patchFrequency);
    const grain = hashToSigned(hash3(x, y, z, VARIATION_SEED));
    const brightness = 1 + amplitude * (PATCH_SHARE * patch + GRAIN_SHARE * grain);
    const hue = HUE_SHIFT * amplitude * patch;
    r *= brightness * (1 + hue);
    g *= brightness;
    b *= brightness * (1 - hue);
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}
