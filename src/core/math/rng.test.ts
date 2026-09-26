import { describe, expect, it } from 'vitest';
import { createRng, fnv1a, hash3, hashToSigned, randomInt } from './rng';

const take = (n: number, next: () => number) => Array.from({ length: n }, next);

describe('rng', () => {
  it('the same seed gives the same sequence', () => {
    expect(take(100, createRng(42))).toEqual(take(100, createRng(42)));
  });

  it('different seeds give different sequences', () => {
    expect(take(10, createRng(1))).not.toEqual(take(10, createRng(2)));
  });

  it('the sequence for a reference seed is stable', () => {
    const values = take(3, createRng(1)).map((v) => Math.floor(v * 2 ** 32));
    expect(values).toMatchInlineSnapshot(`
      [
        587941090,
        3698788925,
        2524488572,
      ]
    `);
  });

  it('produces values in [0, 1) with a roughly uniform mean', () => {
    const values = take(10_000, createRng(7));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it('randomInt covers the inclusive range', () => {
    const random = createRng(3);
    const seen = new Set(take(1000, () => randomInt(random, 3, 5)));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });
});

describe('hashes', () => {
  it('fnv1a matches the reference vectors and can be chained', () => {
    const bytes = (s: string) => new TextEncoder().encode(s);
    expect(fnv1a(bytes(''))).toBe(0x811c9dc5);
    expect(fnv1a(bytes('a'))).toBe(0xe40c292c);
    expect(fnv1a(bytes('foobar'))).toBe(0xbf9cf968);
    expect(fnv1a(bytes('bar'), fnv1a(bytes('foo')))).toBe(fnv1a(bytes('foobar')));
  });

  it('hash3 is deterministic and sensitive to every coordinate and to the seed', () => {
    const h = hash3(10, 20, 30, 1);
    expect(hash3(10, 20, 30, 1)).toBe(h);
    expect(
      new Set([
        h,
        hash3(11, 20, 30, 1),
        hash3(10, 21, 30, 1),
        hash3(10, 20, 31, 1),
        hash3(10, 20, 30, 2),
      ]).size,
    ).toBe(5);
  });

  it('hashToSigned maps to [-1, 1)', () => {
    expect(hashToSigned(0)).toBe(-1);
    expect(hashToSigned(0xffffffff)).toBeLessThan(1);
    expect(hashToSigned(0x80000000)).toBe(0);
  });
});
