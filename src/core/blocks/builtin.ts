import { BlockRegistry, type BlockDef } from './registry';

/** Ids of the built-in blocks. Stable forever: they are stored in world data. */
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
// F02 (WORLD-004.c)
export const WATER = 4;
export const SAND = 5;
export const GRAVEL = 6;
export const OAK_LOG = 7;
export const BIRCH_LOG = 8;
export const WILLOW_LOG = 9;
export const OAK_LEAVES = 10;
export const BIRCH_LEAVES = 11;
export const WILLOW_LEAVES = 12;
export const PLANKS = 13;
export const COBBLESTONE = 14;
export const ROOF_TILES = 15;

const solid = { solid: true, opaque: true } as const;
/** Foliage hides what is behind it but can be walked through (F03 spec Q5). */
const foliage = { solid: false, opaque: true } as const;

/** Built-in block types, with the warm, slightly desaturated palette (F01 spec Q4). */
export const BUILTIN_BLOCKS: readonly BlockDef[] = [
  { id: AIR, name: 'air', color: 0x000000, variation: 0, solid: false, opaque: false },
  { id: GRASS, name: 'grass', color: 0x7da453, variation: 0.08, ...solid },
  { id: DIRT, name: 'dirt', color: 0x8a6a4b, variation: 0.06, ...solid },
  { id: STONE, name: 'stone', color: 0x8f8b84, variation: 0.06, ...solid },
  { id: WATER, name: 'water', color: 0x4f8a9c, variation: 0.03, solid: false, opaque: false },
  { id: SAND, name: 'sand', color: 0xd6c496, variation: 0.05, ...solid },
  { id: GRAVEL, name: 'gravel', color: 0x9a9489, variation: 0.1, ...solid },
  { id: OAK_LOG, name: 'oak_log', color: 0x5b4331, variation: 0.06, ...solid },
  { id: BIRCH_LOG, name: 'birch_log', color: 0xdad4c4, variation: 0.06, ...solid },
  { id: WILLOW_LOG, name: 'willow_log', color: 0x6e5a45, variation: 0.06, ...solid },
  { id: OAK_LEAVES, name: 'oak_leaves', color: 0x5d7d3a, variation: 0.1, ...foliage },
  { id: BIRCH_LEAVES, name: 'birch_leaves', color: 0x93ab4c, variation: 0.1, ...foliage },
  { id: WILLOW_LEAVES, name: 'willow_leaves', color: 0x7f9c5b, variation: 0.1, ...foliage },
  { id: PLANKS, name: 'planks', color: 0xa67f56, variation: 0.05, ...solid },
  { id: COBBLESTONE, name: 'cobblestone', color: 0x847e75, variation: 0.12, ...solid },
  { id: ROOF_TILES, name: 'roof_tiles', color: 0xa5563c, variation: 0.07, ...solid },
];

/** Registers the built-in block types. */
export function registerBuiltinBlocks(registry: BlockRegistry): void {
  for (const block of BUILTIN_BLOCKS) {
    registry.register(block);
  }
}

/** A registry with the built-in blocks already registered. */
export function createDefaultRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  registerBuiltinBlocks(registry);
  return registry;
}
