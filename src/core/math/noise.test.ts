import { describe, expect, it } from 'vitest';
import { createNoise, fbm, warp } from './noise';

function sample(noise: (x: number, z: number) => number): number[] {
  const values: number[] = [];
  for (let i = 0; i < 200; i++) {
    values.push(noise(i * 0.37, i * 0.61));
  }
  return values;
}

describe('noise', () => {
  it('the same seed and salt give the same field', () => {
    expect(sample(createNoise(5, 1))).toEqual(sample(createNoise(5, 1)));
  });

  it('a different seed or salt gives a different field', () => {
    expect(sample(createNoise(5, 1))).not.toEqual(sample(createNoise(6, 1)));
    expect(sample(createNoise(5, 1))).not.toEqual(sample(createNoise(5, 2)));
  });

  it('fbm stays in [-1, 1] and varies smoothly', () => {
    const noise = createNoise(9);
    const options = { wavelength: 64, octaves: 4 };
    let previous = fbm(noise, 0, 0, options);
    for (let x = 1; x < 2000; x++) {
      const value = fbm(noise, x, x * 0.5, options);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.2);
      previous = value;
    }
  });

  it('warp displaces coordinates by at most the amplitude on each axis', () => {
    const nx = createNoise(1, 10);
    const nz = createNoise(1, 11);
    for (let i = 0; i < 500; i++) {
      const [wx, wz] = warp(nx, nz, i, 2 * i, 48, 12);
      expect(Math.abs(wx - i)).toBeLessThanOrEqual(12);
      expect(Math.abs(wz - 2 * i)).toBeLessThanOrEqual(12);
    }
  });
});
