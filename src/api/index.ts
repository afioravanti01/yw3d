/**
 * Public API of yw3d for the authors of world folders (F04, plan P3):
 *
 *   import { defineStructure, int, object, COBBLESTONE } from 'yw3d';
 *   export default defineStructure({ name: 'tower', ... });
 *
 * Only what authors need is exported here; the rest of the core may change freely.
 */

// Structures (STRUCT-001, STRUCT-008).
export { defineStructure } from '../core/structures/registry';
export type {
  Basin,
  StructureContext,
  StructureType,
  TerrainMode,
} from '../core/structures/registry';
export type { Rect, Rotation, StructureBuilder } from '../core/structures/builder';

// Parameter schemas.
export {
  bool,
  int,
  list,
  number,
  object,
  oneOf,
  optional,
  pair,
  record,
  str,
} from '../core/schema/schema';
export type { Infer, Schema } from '../core/schema/schema';

// Block types.
export {
  AIR,
  BIRCH_LEAVES,
  BIRCH_LOG,
  COBBLESTONE,
  DIRT,
  GRASS,
  GRAVEL,
  OAK_LEAVES,
  OAK_LOG,
  PLANKS,
  ROOF_TILES,
  SAND,
  STONE,
  WATER,
  WILLOW_LEAVES,
  WILLOW_LOG,
} from '../core/blocks/builtin';

// Deterministic randomness for generators: use the `random` of the context, never Math.random.
export { randomInt, randomRange } from '../core/math/rng';
export type { Random } from '../core/math/rng';
