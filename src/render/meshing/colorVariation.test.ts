import { describe, expect, it } from 'vitest';
import { createDefaultRegistry, DIRT, GRASS, STONE } from '../../core/blocks/builtin';
import { blockColor } from './colorVariation';
import { createPalette } from './palette';

const palette = createPalette(createDefaultRegistry());
const luminance = (c: ArrayLike<number>) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

describe('color variation', () => {
  it('RENDER-001.b: the same position always gives the same color', () => {
    const a = blockColor(new Float32Array(3), palette, GRASS, 120, 40, -7);
    const b = blockColor(new Float32Array(3), palette, GRASS, 120, 40, -7);
    expect([...a]).toEqual([...b]);
  });

  it('RENDER-001.b: brightness stays within the variation of the block type', () => {
    for (const block of [GRASS, DIRT, STONE]) {
      const base = luminance(palette.linear.subarray(block * 3, block * 3 + 3));
      const amplitude = palette.variation[block]!;
      let min = Infinity;
      let max = -Infinity;
      const out = new Float32Array(3);
      for (let i = 0; i < 20_000; i++) {
        const x = (i * 7919) % 512;
        const z = (i * 104729) % 512;
        const ratio = luminance(blockColor(out, palette, block, x, i % 96, z)) / base;
        min = Math.min(min, ratio);
        max = Math.max(max, ratio);
      }
      expect(min).toBeGreaterThanOrEqual(1 - amplitude);
      expect(max).toBeLessThanOrEqual(1 + amplitude);
      // The variation is actually visible: it uses a good part of the allowed range.
      expect(max - min).toBeGreaterThan(amplitude);
    }
  });

  it('neighboring blocks differ less than distant ones (broad patches)', () => {
    const out = new Float32Array(3);
    const lum = (x: number, z: number) => luminance(blockColor(out, palette, GRASS, x, 30, z));
    let near = 0;
    let far = 0;
    for (let i = 0; i < 2000; i++) {
      const x = (i * 37) % 480;
      const z = (i * 91) % 480;
      near += Math.abs(lum(x, z) - lum(x + 1, z));
      far += Math.abs(lum(x, z) - lum(x + 29, z + 23));
    }
    expect(near).toBeLessThan(far);
  });
});
