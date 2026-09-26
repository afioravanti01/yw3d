import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD, parseStartParams } from './params';

describe('start parameters', () => {
  it('reads the world name, with a default', () => {
    expect(parseStartParams('')).toEqual({ world: DEFAULT_WORLD });
    expect(parseStartParams('?world=valley')).toEqual({ world: 'valley' });
    expect(parseStartParams('?world=')).toEqual({ world: DEFAULT_WORLD });
  });

  it('reads a seed that replaces the seed of the world file', () => {
    expect(parseStartParams('?seed=42')).toEqual({ world: DEFAULT_WORLD, seedOverride: 42 });
    expect(parseStartParams('?seed=0').seedOverride).toBe(0);
    expect(parseStartParams('?seed=4294967295').seedOverride).toBe(4294967295);
  });

  it('ignores an invalid seed with a warning', () => {
    for (const value of ['abc', '-1', '1.5', '4294967296', '']) {
      const result = parseStartParams(`?seed=${value}`);
      expect(result.seedOverride).toBeUndefined();
      expect(result.warning).toContain(`"${value}"`);
    }
  });
});
