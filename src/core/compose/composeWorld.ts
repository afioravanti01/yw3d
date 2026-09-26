import {
  cloneHeightmap,
  DEFAULT_TERRAIN_PARAMS,
  fillColumns,
  generateHeightmap,
  TERRAIN_GENERATOR_VERSION,
} from '../gen/terrain';
import { formatPath, type Issue } from '../schema/schema';
import { WATER } from '../blocks/builtin';
import { rotateColumn, StructureBuilder, type Rect } from '../structures/builder';
import { basinOf, buildStructure, type StructureRegistry } from '../structures/registry';
import { dig, flatten, type DugBasin } from './adapt';
import { DEFAULT_WORLD_SIZE, validateWorldSize, World, type WorldSize } from '../world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../yaml/report';
import { loadWorldFile } from '../yaml/worldFile';
import { checkStructureTypes, findConflicts, placeStructures, type Placement } from './placement';
import { scatterStructures } from './scatter';

export interface ComposeOptions {
  readonly registry: StructureRegistry;
  /** Replaces the terrain seed of the file (APP-001.a). */
  readonly seedOverride?: number;
  /** Clock for the step timings, e.g. `performance.now`; the core has no clock of its own. */
  readonly now?: () => number;
}

export interface PlacedStructure {
  readonly type: string;
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  /** Where it comes from, e.g. `structures[2]` or `scatter[0]`. */
  readonly source: string;
  readonly rect: Rect;
  /** Validated parameters and seed, to rebuild the structure layout (e.g. its door). */
  readonly params: unknown;
  readonly seed: number;
}

export interface ComposeResult {
  /** The world, or undefined when the file has errors (YAML-002.d). */
  readonly world: World | undefined;
  readonly diagnostics: Diagnostic[];
  /** Terrain seed actually used. */
  readonly seed: number | undefined;
  /** Number of structures built, by type name (DEBUG-001.a). */
  readonly structureCounts: Record<string, number>;
  /**
   * Start of the player from the file (YAML-008): center of the declared column and view
   * direction in radians (0 looks north, towards -z); undefined when the file has none.
   */
  readonly player: { readonly x: number; readonly z: number; readonly yaw: number } | undefined;
  /** Structures built, in order: declared one by one first, then distributed. */
  readonly placements: readonly PlacedStructure[];
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
    player: undefined,
    placements: [],
    timings,
  });

  const loaded = loadWorldFile(text, file);
  const { world: decl } = loaded;
  if (!decl) {
    const more: Issue[] = [];
    checkStructureTypes(loaded.validStructures, options.registry, more);
    const extra = more.map((i) =>
      diagnostic('error', file, loaded.lineOf(i.path), i.path, i.message),
    );
    const all = [...loaded.diagnostics, ...extra];
    all.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    return failed(all);
  }
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

  if (decl.player) {
    const [px, pz] = decl.player.at;
    if (px < 0 || pz < 0 || px >= size.x || pz >= size.z) {
      issues.push({
        path: ['player', 'at'],
        message: `the player start is outside the world: x and z must be within 0..${size.x - 1} and 0..${size.z - 1}`,
      });
    }
  }
  const singles = placeStructures(decl.structures ?? [], options.registry, seed, size, issues);
  for (const [a, b] of findConflicts(singles)) {
    warnings.push({
      path: b.path,
      message: `overlaps ${formatPath(a.path)} (${a.type.name}, line ${loaded.lineOf(a.path)}): ${formatPath(b.path)} (${b.type.name}) wins`,
    });
  }
  if (issues.length > 0) return failed(toDiagnostics(), seed);

  // Basins are known before the distributions, which must avoid the water (YAML-005.c).
  const basinColumns = new Map<Placement, BasinColumns>();
  const water = new Set<number>();
  const addBasin = (placement: Placement) => {
    const columns = basinColumnsOf(placement);
    if (!columns) return;
    basinColumns.set(placement, columns);
    for (const [x, z] of columns.columns) water.add(x + z * size.x);
  };
  singles.forEach(addBasin);
  const scattered = scatterStructures(
    decl.scatter ?? [],
    options.registry,
    seed,
    size,
    singles.map((p) => p.rect),
    water,
    issues,
    warnings,
  );
  scattered.forEach(addBasin);
  const placements = [...singles, ...scattered];
  lap('placement');
  if (issues.length > 0) return failed(toDiagnostics(), seed);

  const map = cloneHeightmap(generateHeightmap(seed, size, DEFAULT_TERRAIN_PARAMS));
  lap('heightmap');

  // Terrain adaptation (STRUCT-003): basins first, then leveling, in declaration order.
  const surface = new Uint8Array(size.x * size.z);
  const anchors = new Map<Placement, number>();
  const basins: DugBasin[] = [];
  for (const [placement, basin] of basinColumns) {
    const dug = dig(
      map,
      surface,
      basin.columns,
      basin.shoreWidth,
      basin.shoreBlock,
      placement.y === undefined ? Infinity : placement.y - 1,
    );
    basins.push(dug);
    anchors.set(placement, dug.waterLevel + 1);
  }
  for (const placement of placements) {
    if (placement.type.terrain !== 'flatten') continue;
    const level = flatten(
      map,
      placement.rect,
      placement.y === undefined ? undefined : placement.y - 1,
    );
    anchors.set(placement, level + 1);
  }
  lap('adaptation');

  const world = fillColumns(map, seed, size, DEFAULT_TERRAIN_PARAMS, surface);
  for (const { waterLevel, water } of basins) {
    for (const [x, z, bed] of water) {
      for (let y = bed + 1; y <= waterLevel; y++) world.setBlock(x, y, z, WATER);
    }
  }
  lap('columns');

  const structureCounts: Record<string, number> = {};
  for (const placement of placements) {
    const ground = map.heights[placement.x + placement.z * size.x]! + 1;
    stamp(world, placement, placement.y ?? anchors.get(placement) ?? ground);
    structureCounts[placement.type.name] = (structureCounts[placement.type.name] ?? 0) + 1;
  }
  lap('structures');

  const diagnostics = toDiagnostics();
  return {
    world: hasErrors(diagnostics) ? undefined : world,
    diagnostics,
    seed,
    structureCounts,
    player: decl.player && {
      x: decl.player.at[0] + 0.5,
      z: decl.player.at[1] + 0.5,
      yaw: (-decl.player.yaw * Math.PI) / 180,
    },
    placements: placements.map((p) => ({
      type: p.type.name,
      x: p.x,
      z: p.z,
      rotation: p.rotation,
      source: formatPath(p.path),
      rect: p.rect,
      params: p.params,
      seed: p.seed,
    })),
    timings,
  };
}

interface BasinColumns {
  readonly columns: (readonly [x: number, z: number, depth: number])[];
  readonly shoreWidth: number;
  readonly shoreBlock: number;
}

/** World columns of the basin of a `dig` placement, or undefined for other structures. */
function basinColumnsOf(placement: Placement): BasinColumns | undefined {
  if (placement.type.terrain !== 'dig') return undefined;
  const basin = basinOf(placement.type, placement.params, placement.seed);
  if (!basin) return undefined;
  return {
    columns: basin.columns.map(([lx, lz, depth]) => {
      const [rx, rz] = rotateColumn(lx, lz, placement.rotation);
      return [placement.x + rx, placement.z + rz, depth] as const;
    }),
    shoreWidth: basin.shoreWidth,
    shoreBlock: basin.shoreBlock,
  };
}

function stamp(world: World, placement: Placement, y: number): void {
  const builder = new StructureBuilder();
  buildStructure(placement.type, placement.params, placement.seed, builder);
  // An explicit y is kept as is: only structures resting on the surface extend their base.
  const groundFill = placement.type.terrain === 'sit' && placement.y === undefined;
  builder.stamp(world, placement.x, y, placement.z, placement.rotation, groundFill);
}
