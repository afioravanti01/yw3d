import { hash3, createRng, fnv1a, type Random } from '../math/rng';
import type { Issue, Path, Schema } from '../schema/schema';
import { StructureBuilder, type Rect } from './builder';

/**
 * How a structure adapts the terrain (STRUCT-003): `sit` rests on the surface, `flatten`
 * levels the ground under its footprint, `dig` carves a basin.
 */
export type TerrainMode = 'sit' | 'flatten' | 'dig';

export interface StructureContext<P> {
  readonly params: P;
  readonly seed: number;
  /** PRNG seeded with the structure seed: the only source of variation. */
  readonly random: Random;
  readonly builder: StructureBuilder;
}

/**
 * Basin of a `dig` structure (STRUCT-003.d), in local columns before rotation: each column has
 * the depth of its bed below the water level (≥ 1). The composer carves it, fills it with
 * water up to one block below the lowest rim, and covers bed and shore with `shoreBlock`.
 */
export interface Basin {
  readonly columns: readonly (readonly [x: number, z: number, depth: number])[];
  /** Width of the shore band around the water, 1–3 blocks (STRUCT-007.c). */
  readonly shoreWidth: number;
  readonly shoreBlock: number;
}

export interface StructureType<P = unknown> {
  /** Unique name, used in world files. */
  readonly name: string;
  /** Parameters with types, ranges and defaults, validated against the world file. */
  readonly params: Schema<P>;
  readonly terrain: TerrainMode;
  /** Columns covered by the structure, in local coordinates, before rotation. */
  footprint(params: P): Rect;
  /** For `dig` structures: the basin to carve. Must be deterministic. */
  basin?(context: StructureContext<P>): Basin;
  /** Writes the structure in local coordinates. Must be deterministic (STRUCT-002.a). */
  generate(context: StructureContext<P>): void;
}

/** Typed helper to declare a structure type; register it with a StructureRegistry. */
export function defineStructure<P>(type: StructureType<P>): StructureType<P> {
  return type;
}

/**
 * Registry of structure types (STRUCT-001). Types are added with `register` from any module,
 * without changing the core (P5 of the constitution).
 */
export class StructureRegistry {
  private readonly types = new Map<string, StructureType>();

  register<P>(type: StructureType<P>): void {
    if (this.types.has(type.name)) {
      throw new Error(`Structure type "${type.name}" is already registered`);
    }
    this.types.set(type.name, type as StructureType);
  }

  get(name: string): StructureType | undefined {
    return this.types.get(name);
  }

  /** Registered names, sorted. */
  names(): string[] {
    return [...this.types.keys()].sort();
  }
}

/** Validates raw parameters from a world file with the type schema (STRUCT-001.d). */
export function parseParams<P>(
  type: StructureType<P>,
  raw: Record<string, unknown> | undefined,
  path: Path,
  issues: Issue[],
): P | undefined {
  return type.params.parse(raw ?? {}, path, issues);
}

/**
 * Seed of a structure from the world seed, its anchor and its type (plan F02 P6): adding or
 * moving another structure never changes this one (YAML-004.d).
 */
export function structureSeed(worldSeed: number, x: number, z: number, type: string): number {
  return hash3(x, fnv1a(Array.from(type, (c) => c.charCodeAt(0))) | 0, z, worldSeed);
}

/** Runs the generator of a type into a builder. */
export function buildStructure<P>(
  type: StructureType<P>,
  params: P,
  seed: number,
  builder: StructureBuilder,
): void {
  type.generate({ params, seed, random: createRng(seed), builder });
}

/** The basin of a `dig` structure, or undefined for other modes. */
export function basinOf<P>(type: StructureType<P>, params: P, seed: number): Basin | undefined {
  return type.basin?.({ params, seed, random: createRng(seed), builder: new StructureBuilder() });
}
