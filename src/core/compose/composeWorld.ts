import {
  cloneHeightmap,
  DEFAULT_TERRAIN_PARAMS,
  fillColumns,
  generateHeightmap,
  TERRAIN_GENERATOR_VERSION,
} from '../gen/terrain';
import { formatPath, type Issue } from '../schema/schema';
import { StructureBuilder } from '../structures/builder';
import { buildStructure, type StructureRegistry } from '../structures/registry';
import { DEFAULT_WORLD_SIZE, validateWorldSize, World, type WorldSize } from '../world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../yaml/report';
import { loadWorldFile } from '../yaml/worldFile';
import { findConflicts, placeStructures, type Placement } from './placement';

export interface ComposeOptions {
  readonly registry: StructureRegistry;
  /** Replaces the terrain seed of the file (APP-001.a). */
  readonly seedOverride?: number;
  /** Clock for the step timings, e.g. `performance.now`; the core has no clock of its own. */
  readonly now?: () => number;
}

export interface ComposeResult {
  /** The world, or undefined when the file has errors (YAML-002.d). */
  readonly world: World | undefined;
  readonly diagnostics: Diagnostic[];
  /** Terrain seed actually used. */
  readonly seed: number | undefined;
  /** Number of structures built, by type name (DEBUG-001.a). */
  readonly structureCounts: Record<string, number>;
  /** Duration of each step in milliseconds. */
  readonly timings: Record<string, number>;
}

/**
 * Builds the world described by a world file (plan F02 P3): positions, terrain adaptation,
 * column filling, then structures stamped in declaration order.
 */
export function composeWorld(text: string, file: string, options: ComposeOptions): ComposeResult {
  const now = options.now ?? Date.now;
  const timings: Record<string, number> = {};
  let start = now();
  const lap = (name: string) => {
    const t = now();
    timings[name] = t - start;
    start = t;
  };
  const failed = (diagnostics: Diagnostic[], seed?: number): ComposeResult => ({
    world: undefined,
    diagnostics,
    seed,
    structureCounts: {},
    timings,
  });

  const loaded = loadWorldFile(text, file);
  const { world: decl } = loaded;
  if (!decl) return failed(loaded.diagnostics);
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const toDiagnostics = () => [
    ...issues.map((i) => diagnostic('error', file, loaded.lineOf(i.path), i.path, i.message)),
    ...warnings.map((w) => diagnostic('warning', file, loaded.lineOf(w.path), w.path, w.message)),
  ];

  const size: WorldSize = decl.terrain.size
    ? { x: decl.terrain.size[0]!, y: decl.terrain.size[1]!, z: decl.terrain.size[2]! }
    : DEFAULT_WORLD_SIZE;
  try {
    validateWorldSize(size);
  } catch (error) {
    issues.push({ path: ['terrain', 'size'], message: (error as Error).message });
    return failed(toDiagnostics());
  }

  const seed = options.seedOverride ?? decl.terrain.seed;
  if (decl.terrain.generator !== TERRAIN_GENERATOR_VERSION) {
    warnings.push({
      path: ['terrain', 'generator'],
      message: `the file was written for terrain generator ${decl.terrain.generator}, the current one is ${TERRAIN_GENERATOR_VERSION}: the terrain may differ`,
    });
  }

  const placements = placeStructures(decl.structures ?? [], options.registry, seed, size, issues);
  for (const [a, b] of findConflicts(placements)) {
    warnings.push({
      path: b.path,
      message: `overlaps ${formatPath(a.path)} (${a.type.name}, line ${loaded.lineOf(a.path)}): ${formatPath(b.path)} (${b.type.name}) wins`,
    });
  }
  lap('placement');
  if (issues.length > 0) return failed(toDiagnostics(), seed);

  const map = cloneHeightmap(generateHeightmap(seed, size, DEFAULT_TERRAIN_PARAMS));
  lap('heightmap');
  const world = fillColumns(map, seed, size, DEFAULT_TERRAIN_PARAMS);
  lap('columns');

  const structureCounts: Record<string, number> = {};
  for (const placement of placements) {
    stamp(world, placement, map.heights[placement.x + placement.z * size.x]! + 1);
    structureCounts[placement.type.name] = (structureCounts[placement.type.name] ?? 0) + 1;
  }
  lap('structures');

  const diagnostics = toDiagnostics();
  return {
    world: hasErrors(diagnostics) ? undefined : world,
    diagnostics,
    seed,
    structureCounts,
    timings,
  };
}

function stamp(world: World, placement: Placement, groundY: number): void {
  const builder = new StructureBuilder();
  buildStructure(placement.type, placement.params, placement.seed, builder);
  builder.stamp(world, placement.x, placement.y ?? groundY, placement.z, placement.rotation);
}
