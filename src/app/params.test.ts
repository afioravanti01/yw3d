import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, parseStartParams } from './params';

describe('start parameters', () => {
  it('uses the seed from the URL', () => {
    expect(parseStartParams('?seed=42')).toEqual({ seed: 42 });
    expect(parseStartParams('?seed=0')).toEqual({ seed: 0 });
    expect(parseStartParams('?seed=4294967295')).toEqual({ seed: 4294967295 });
  });

  it('uses the default seed without the parameter', () => {
    expect(parseStartParams('')).toEqual({ seed: DEFAULT_SEED });
    expect(parseStartParams('?other=1')).toEqual({ seed: DEFAULT_SEED });
  });

  it('falls back to the default seed with a warning for invalid values', () => {
    for (const value of ['abc', '-1', '1.5', '4294967296', '']) {
      const result = parseStartParams(`?seed=${value}`);
      expect(result.seed).toBe(DEFAULT_SEED);
      expect(result.warning).toContain(`"${value}"`);
    }
  });
});
