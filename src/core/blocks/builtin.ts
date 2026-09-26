import { BlockRegistry } from './registry';

/** Ids of the F01 blocks. Stable forever: they are stored in world data. */
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;

/** Registers the F01 block types, with the warm natural palette (spec Q4). */
export function registerBuiltinBlocks(registry: BlockRegistry): void {
  registry.register({
    id: AIR,
    name: 'air',
    color: 0x000000,
    variation: 0,
    solid: false,
    opaque: false,
  });
  registry.register({
    id: GRASS,
    name: 'grass',
    color: 0x7da453,
    variation: 0.08,
    solid: true,
    opaque: true,
  });
  registry.register({
    id: DIRT,
    name: 'dirt',
    color: 0x8a6a4b,
    variation: 0.06,
    solid: true,
    opaque: true,
  });
  registry.register({
    id: STONE,
    name: 'stone',
    color: 0x8f8b84,
    variation: 0.06,
    solid: true,
    opaque: true,
  });
}

/** A registry with the built-in blocks already registered. */
export function createDefaultRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  registerBuiltinBlocks(registry);
  return registry;
}
