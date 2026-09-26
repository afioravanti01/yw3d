import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../src/core/blocks/builtin';

describe('block extension from outside the core', () => {
  it('WORLD-004.d: code outside the core can register a new type', () => {
    const registry = createDefaultRegistry();
    const builtinCount = registry.all().length;
    registry.register({
      id: 200,
      name: 'test_crystal',
      color: 0x88ccff,
      variation: 0.1,
      solid: true,
      opaque: false,
    });
    expect(registry.all()).toHaveLength(builtinCount + 1);
    expect(registry.getByName('test_crystal')?.id).toBe(200);
  });
});
