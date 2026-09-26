import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, blockCoord, blocksToMeters, metersToBlocks } from './units';

describe('units', () => {
  it('WORLD-001.a: block b spans [b, b + 1) on each axis', () => {
    expect(blockCoord(3)).toBe(3);
    expect(blockCoord(3.999)).toBe(3);
    expect(blockCoord(4)).toBe(4);
    expect(blockCoord(-0.001)).toBe(-1);
  });

  it('WORLD-001.b: a block is 0.5 m and conversions are consistent', () => {
    expect(BLOCK_SIZE_M).toBe(0.5);
    expect(blocksToMeters(512)).toBe(256);
    expect(metersToBlocks(1.75)).toBe(3.5);
    expect(metersToBlocks(blocksToMeters(37))).toBe(37);
  });
});
