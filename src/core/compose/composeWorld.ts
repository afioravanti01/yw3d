import { DEFAULT_DAY_MINUTES, DEFAULT_START, parseClock, type ClockSettings } from '../time/clock';
import {
  cloneHeightmap,
  DEFAULT_TERRAIN_PARAMS,
  fillColumns,
  generateHeightmap,
  TERRAIN_GENERATOR_VERSION,
} from '../gen/terrain';
import { formatPath, type Issue } from '../schema/schema';
import { WATER } from '../blocks/builtin';
import { resolveAppearance, type Appearance } from '../characters/appearance';
import { rotateColumn, StructureBuilder, type Rect } from '../structures/builder';
import { basinOf, buildStructure, type StructureRegistry } from '../structures/registry';
import { dig, flatten, type DugBasin } from './adapt';
import { DEFAULT_WORLD_SIZE, validateWorldSize, World, type WorldSize } from '../world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../yaml/report';
import {
  DEFAULT_PLAYER_NAME,
  loadWorldFile,
  DEFAULT_CONVERSATION_TURNS,
  type AgentDecl,
  type Body,
  type PlaceDecl,
} from '../yaml/worldFile';
import { insideFolder } from '../yaml/paths';
import { areaInsideWorld } from './areas';
import { buildWorldMap, checkIds, type Goal, type WorldMap } from '../map/worldMap';
import { checkStructureTypes, findConflicts, placeStructures, type Placement } from './placement';
import { scatterStructures } from './scatter';

export interface ComposeOptions {
  readonly registry: StructureRegistry;
  /**
   * Whether a file of the world folder exists, by its path relative to the folder: the host
   * checks the programs of the characters with it (PY-003.b); without it they are not checked.
   */
  readonly programExists?: (path: string) => boolean;
  /** Replaces the terrain seed of the file (APP-001.a). */
  readonly seedOverride?: number;
  /** Clock for the step timings, e.g. `performance.now`; the core has no clock of its own. */
  readonly now?: () => number;
}

/** A character as declared, ready to be spawned (CHAR-001). */
export interface CharacterStart {
  readonly id: string;
  /** Name and description from the file (YAML-009.a). */
  readonly name: string;
  readonly description: string | undefined;
  /** Center of the declared column. */
  readonly x: number;
  readonly z: number;
  /** View direction in radians, 0 looks north. */
  readonly yaw: number;
  readonly appearance: Appearance;
  /** Command of the controller that drives it, if any (PROTO-003). */
  readonly command: string | undefined;
  /** Its Python program, relative to the world folder, if any (PY-003.a). */
  readonly program: string | undefined;
  /** Its LLM agent, if any (AGENT-001). */
  readonly agent?: AgentDecl;
  /** A person or an animal (CHAR-003.a); a person when absent. */
  readonly body?: Body;
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
  /** Name and description of the world (YAML-009.a); undefined when the file has errors. */
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly diagnostics: Diagnostic[];
  /** Terrain seed actually used. */
  readonly seed: number | undefined;
  /** Number of structures built, by type name (DEBUG-001.a). */
  readonly structureCounts: Record<string, number>;
  /**
   * Start of the player from the file (YAML-008): center of the declared column and view
   * direction in radians (0 looks north, towards -z); undefined when the file has none.
   */
  readonly player:
    | {
        readonly x: number;
        readonly z: number;
        readonly yaw: number;
        readonly appearance: Appearance;
      }
    | undefined;
  /** Colors of the player, declared or derived from the seed (YAML-008.a). */
  readonly playerAppearance: Appearance | undefined;
  /** Name and description of the player, «viandante» by default (YAML-009.b). */
  readonly playerName: string | undefined;
  readonly playerDescription: string | undefined;
  /** Named points and areas (YAML-010.a), in order. */
  readonly places: readonly PlaceDecl[];
  /** Lines of a conversation between agents without the player (AGENT-004.c, A8.6). */
  readonly conversationTurns?: number;
  /** The clock of the world (TIME-001.a). */
  readonly clock?: ClockSettings;
  /** The map of the world (MAP-002); undefined when the file has errors. */
  readonly map: WorldMap | undefined;
  /** Where a character goes for each id of the map (MAP-003). */
  readonly goals: ReadonlyMap<string, Goal>;
  /** Characters declared in the file (CHAR-001.a), in order. */
  readonly characters: readonly CharacterStart[];
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
    name: undefined,
    description: undefined,
    diagnostics,
    seed,
    structureCounts: {},
    player: undefined,
    playerAppearance: undefined,
    playerName: undefined,
    playerDescription: undefined,
    places: [],
    map: undefined,
    goals: new Map(),
    characters: [],
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
  (decl.places ?? []).forEach((place, i) => {
    const inside = place.at
      ? place.at[0] >= 0 && place.at[1] >= 0 && place.at[0] < size.x && place.at[1] < size.z
      : areaInsideWorld(place.area!, size);
    if (!inside) {
      issues.push({
        path: ['places', i, place.at ? 'at' : 'area'],
        message: `the place is outside the world: x and z must be within 0..${size.x - 1} and 0..${size.z - 1}`,
      });
    }
  });
  checkIds(decl, loaded.lineOf, issues);
  (decl.characters ?? []).forEach((character, i) => {
    const [cx, cz] = character.at;
    if (cx < 0 || cz < 0 || cx >= size.x || cz >= size.z) {
      issues.push({
        path: ['characters', i, 'at'],
        message: `the character is outside the world: x and z must be within 0..${size.x - 1} and 0..${size.z - 1}`,
      });
    }
    // The file of a program is checked where there is a disk: in the host (PY-003.b).
    const program = character.program && insideFolder(character.program);
    if (program && options.programExists && !options.programExists(program)) {
      issues.push({
        path: ['characters', i, 'program'],
        message: `the program "${character.program}" does not exist in the world folder`,
      });
    }
  });
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
  const baseY = new Map<Placement, number>();
  for (const placement of placements) {
    const ground = map.heights[placement.x + placement.z * size.x]! + 1;
    const y = placement.y ?? anchors.get(placement) ?? ground;
    baseY.set(placement, y);
    stamp(world, placement, y);
    structureCounts[placement.type.name] = (structureCounts[placement.type.name] ?? 0) + 1;
  }
  lap('structures');

  const built = buildWorldMap({
    decl,
    size,
    structures: singles.map((p) => ({
      index: p.path[1] as number,
      type: p.type,
      params: p.params,
      seed: p.seed,
      x: p.x,
      z: p.z,
      rotation: p.rotation,
      rect: p.rect,
      baseY: baseY.get(p)!,
      water: basinColumns.get(p)?.columns.map(([x, z]) => [x, z] as const),
    })),
  });

  const diagnostics = toDiagnostics();
  return {
    world: hasErrors(diagnostics) ? undefined : world,
    name: decl.name,
    description: decl.description,
    diagnostics,
    seed,
    structureCounts,
    player: decl.player && {
      x: decl.player.at[0] + 0.5,
      z: decl.player.at[1] + 0.5,
      yaw: (-decl.player.yaw * Math.PI) / 180,
      appearance: resolveAppearance(decl.player.appearance, seed, 'player'),
    },
    playerAppearance: resolveAppearance(decl.player?.appearance, seed, 'player'),
    playerName: decl.player?.name ?? DEFAULT_PLAYER_NAME,
    playerDescription: decl.player?.description,
    places: decl.places ?? [],
    conversationTurns: decl.agents?.conversation_turns ?? DEFAULT_CONVERSATION_TURNS,
    clock: {
      startMinutes: parseClock(decl.time?.start ?? DEFAULT_START)!,
      dayMinutes: decl.time?.day_minutes ?? DEFAULT_DAY_MINUTES,
    },
    map: built.map,
    goals: built.goals,
    characters: (decl.characters ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      x: c.at[0] + 0.5,
      z: c.at[1] + 0.5,
      yaw: (-c.yaw * Math.PI) / 180,
      appearance: resolveAppearance(c.appearance, seed, c.id),
      command: c.controller?.command,
      program: c.program === undefined ? undefined : insideFolder(c.program),
      agent: c.agent,
      body: c.body,
    })),
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
