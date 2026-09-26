import { fnv1a, hash3 } from '../math/rng';
import type { AppearanceDecl } from '../yaml/worldFile';

/** Colors of a figure, sRGB 0xRRGGBB (CHAR-001.a). */
export interface Appearance {
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly trousers: number;
}

/** Palettes for the colors not declared, in the warm tones of the world (F05 Q2). */
const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68a62, 0x9c6b4a, 0x74492f];
const HAIRS = [0x2e2118, 0x4b3626, 0x6e4a2c, 0xa87a45, 0xc9b28a, 0x8a8a86];
const SHIRTS = [0xa55f3a, 0x5d7d8e, 0x7d8f4a, 0xb38a3e, 0x8a5570, 0x4f6a5a, 0xc2b59b];
const TROUSERS = [0x4a5562, 0x5b4a3a, 0x3f4b3c, 0x6b6257, 0x2f3a4a];

/**
 * The declared colors, with the missing ones derived from the world seed and a name (an
 * identifier, or `player`): the same character always looks the same.
 */
export function resolveAppearance(
  declared: AppearanceDecl | undefined,
  seed: number,
  name: string,
): Appearance {
  const key = fnv1a(Array.from(name, (c) => c.charCodeAt(0)));
  const pick = (list: readonly number[], salt: number) =>
    list[hash3(key | 0, salt, 0, seed) % list.length]!;
  return {
    skin: declared?.skin ?? pick(SKINS, 1),
    hair: declared?.hair ?? pick(HAIRS, 2),
    shirt: declared?.shirt ?? pick(SHIRTS, 3),
    trousers: declared?.trousers ?? pick(TROUSERS, 4),
  };
}
