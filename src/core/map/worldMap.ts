import type { Issue, Path } from '../schema/schema';
import { rotateColumn, type Rect, type Rotation } from '../structures/builder';
import { approachOf, type StructureType } from '../structures/registry';
import type { WorldSize } from '../world/world';
import { DEFAULT_PLAYER_NAME, type AreaDecl, type WorldFile } from '../yaml/worldFile';

/**
 * The map of the world (MAP-002): every place, structure declared one by one, distribution,
 * character and the player, with id, name, description, kind and where it is. Built by the
 * composition, so the host and the views have the same one (plan F06 P9). Field names are
 * `snake_case`, as controllers receive them (F05 Q8).
 */

/** Where an element is: a point, or an area in columns (`to` exclusive, as in world files). */
export type MapShape =
  | { readonly kind: 'point'; readonly x: number; readonly z: number }
  | {
      readonly kind: 'rect';
      readonly from: readonly [number, number];
      readonly to: readonly [number, number];
    }
  | {
      readonly kind: 'circle';
      readonly center: readonly [number, number];
      readonly radius: number;
    };

export type MapEntryKind = 'place' | 'structure' | 'scatter' | 'character' | 'player';

export interface MapEntry {
  readonly id: string;
  readonly kind: MapEntryKind;
  /** Structure type; for a distribution, its types. */
  readonly type?: string;
  readonly types?: readonly string[];
  readonly name: string;
  readonly description: string | null;
  /** Footprint of a structure, area of a place or distribution; start of who moves (MAP-002.b). */
  readonly shape: MapShape;
  /** Height of the base of a structure, blocks. */
  readonly base_y?: number;
}

export interface WorldMap {
  readonly name: string;
  readonly description: string | null;
  readonly size: readonly [number, number, number];
  readonly entries: readonly MapEntry[];
}

/**
 * Where a character goes when an element of the map is its destination (MAP-003). Entities
 * (characters and the player) move, so their position is looked up when needed.
 */
export type Goal =
  | { readonly kind: 'entity' }
  | { readonly kind: 'point'; readonly x: number; readonly z: number }
  | {
      /** Arrival columns of a structure; `center` is where `look_at` looks. */
      readonly kind: 'columns';
      readonly columns: readonly (readonly [number, number])[];
      readonly center: { readonly x: number; readonly z: number };
    }
  | {
      /** The columns of an area; already inside means already arrived (MAP-003.c). */
      readonly kind: 'area';
      readonly area: AreaDecl;
      readonly center: { readonly x: number; readonly z: number };
    };

/** Id of the player in the map and in the protocol (MAP-001.a). */
export const PLAYER_ID = 'player';

/** Id generated for an element without one: type and 1-based count by type (MAP-001.b, F06 Q10). */
export const generatedId = (type: string, n: number) => `${type}#${n}`;

/**
 * Checks the declared ids (MAP-001.a): one namespace for characters, places, structures and
 * distributions, and `player` reserved. The first declaration in the file keeps its id.
 */
export function checkIds(
  decl: WorldFile,
  lineOf: (path: Path) => number | null,
  issues: Issue[],
): void {
  const declared: { id: string; path: Path; line: number }[] = [];
  const add = (id: string | undefined, path: Path) => {
    if (id !== undefined) declared.push({ id, path, line: lineOf(path) ?? 0 });
  };
  (decl.places ?? []).forEach((p, i) => add(p.id, ['places', i, 'id']));
  (decl.structures ?? []).forEach((s, i) => add(s.id, ['structures', i, 'id']));
  (decl.scatter ?? []).forEach((s, i) => add(s.id, ['scatter', i, 'id']));
  (decl.characters ?? []).forEach((c, i) => add(c.id, ['characters', i, 'id']));
  declared.sort((a, b) => a.line - b.line);
  const first = new Map<string, { path: Path; line: number }>();
  for (const { id, path, line } of declared) {
    if (id === PLAYER_ID) {
      issues.push({ path, message: `the id "${PLAYER_ID}" is reserved for the player` });
      continue;
    }
    const earlier = first.get(id);
    if (earlier) {
      issues.push({
        path,
        message: `the id "${id}" is already used by ${formatOwner(earlier.path)} (line ${earlier.line})`,
      });
    } else {
      first.set(id, { path, line });
    }
  }
}

/** `characters[0]` for the path `characters[0].id`. */
function formatOwner(path: Path): string {
  return `${String(path[0])}[${String(path[1])}]`;
}

/** A structure declared one by one, as built by the composition. */
export interface MappedStructure {
  /** Index in `structures` of the world file. */
  readonly index: number;
  readonly type: StructureType;
  readonly params: unknown;
  readonly seed: number;
  readonly x: number;
  readonly z: number;
  readonly rotation: Rotation;
  readonly rect: Rect;
  readonly baseY: number;
  /** Water columns of a basin, in world coordinates. */
  readonly water: readonly (readonly [number, number])[] | undefined;
}

export interface MapInput {
  readonly decl: WorldFile;
  readonly size: WorldSize;
  readonly structures: readonly MappedStructure[];
}

/** The map and the goal of every id in it (generated ids included). */
export interface BuiltMap {
  readonly map: WorldMap;
  readonly goals: ReadonlyMap<string, Goal>;
}

export function buildWorldMap({ decl, size, structures }: MapInput): BuiltMap {
  const entries: MapEntry[] = [];
  const goals = new Map<string, Goal>();
  const description = (d: string | undefined) => d ?? null;

  for (const place of decl.places ?? []) {
    const shape = place.at ? point(place.at) : areaShape(place.area!);
    entries.push({
      id: place.id,
      kind: 'place',
      name: place.name,
      description: description(place.description),
      shape,
    });
    goals.set(
      place.id,
      place.at
        ? { kind: 'point', x: place.at[0] + 0.5, z: place.at[1] + 0.5 }
        : { kind: 'area', area: place.area!, center: areaCenter(place.area!) },
    );
  }

  const byType = new Map<string, number>();
  for (const s of structures) {
    const d = decl.structures![s.index]!;
    let id = d.id;
    if (id === undefined) {
      const n = (byType.get(s.type.name) ?? 0) + 1;
      byType.set(s.type.name, n);
      id = generatedId(s.type.name, n);
    }
    entries.push({
      id,
      kind: 'structure',
      type: s.type.name,
      name: d.name,
      description: description(d.description),
      shape: { kind: 'rect', from: [s.rect.minX, s.rect.minZ], to: [s.rect.maxX, s.rect.maxZ] },
      base_y: s.baseY,
    });
    goals.set(id, {
      kind: 'columns',
      columns: arrivalColumns(s, size),
      center: { x: (s.rect.minX + s.rect.maxX) / 2, z: (s.rect.minZ + s.rect.maxZ) / 2 },
    });
  }

  let scatterCount = 0;
  for (const d of decl.scatter ?? []) {
    const id = d.id ?? generatedId('scatter', ++scatterCount);
    entries.push({
      id,
      kind: 'scatter',
      types: Object.keys(d.types).filter((t) => d.types[t]! > 0),
      name: d.name,
      description: description(d.description),
      shape: areaShape(d.area),
    });
    goals.set(id, { kind: 'area', area: d.area, center: areaCenter(d.area) });
  }

  for (const c of decl.characters ?? []) {
    entries.push({
      id: c.id,
      kind: 'character',
      name: c.name,
      description: description(c.description),
      shape: point(c.at),
    });
    goals.set(c.id, { kind: 'entity' });
  }
  const start = decl.player?.at ?? [Math.floor(size.x / 2), Math.floor(size.z / 2)];
  entries.push({
    id: PLAYER_ID,
    kind: 'player',
    name: decl.player?.name ?? DEFAULT_PLAYER_NAME,
    description: description(decl.player?.description),
    shape: point(start),
  });
  goals.set(PLAYER_ID, { kind: 'entity' });

  return {
    map: {
      name: decl.name,
      description: description(decl.description),
      size: [size.x, size.y, size.z],
      entries,
    },
    goals,
  };
}

const point = ([x, z]: readonly [number, number]): MapShape => ({ kind: 'point', x, z });

function areaShape(area: AreaDecl): MapShape {
  return area.kind === 'rect'
    ? { kind: 'rect', from: area.value.from, to: area.value.to }
    : { kind: 'circle', center: area.value.center, radius: area.value.radius };
}

function areaCenter(area: AreaDecl): { x: number; z: number } {
  if (area.kind === 'circle') {
    return { x: area.value.center[0] + 0.5, z: area.value.center[1] + 0.5 };
  }
  const { from, to } = area.value;
  return { x: (from[0] + to[0]) / 2, z: (from[1] + to[1]) / 2 };
}

/**
 * Where a character arrives at a structure (MAP-003.b, plan F06 P10): the columns declared by
 * its type; otherwise the dry ring around a basin, or the ring around the footprint. Only
 * columns inside the world, sorted, so that the result does not depend on the order of work.
 */
function arrivalColumns(s: MappedStructure, size: WorldSize): [number, number][] {
  const declared = approachOf(s.type, s.params, s.seed);
  const columns = new Set<number>();
  const key = (x: number, z: number) => x + z * size.x;
  const add = (x: number, z: number) => {
    if (x >= 0 && z >= 0 && x < size.x && z < size.z) columns.add(key(x, z));
  };
  if (declared) {
    for (const [lx, lz] of declared) {
      const [rx, rz] = rotateColumn(lx, lz, s.rotation);
      add(s.x + rx, s.z + rz);
    }
  } else if (s.water) {
    const water = new Set(s.water.map(([x, z]) => key(x, z)));
    for (const [x, z] of s.water) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!water.has(key(x + dx, z + dz))) add(x + dx, z + dz);
        }
      }
    }
  } else {
    const { minX, minZ, maxX, maxZ } = s.rect;
    for (let x = minX - 1; x <= maxX; x++) {
      add(x, minZ - 1);
      add(x, maxZ);
    }
    for (let z = minZ; z < maxZ; z++) {
      add(minX - 1, z);
      add(maxX, z);
    }
  }
  return [...columns].sort((a, b) => a - b).map((k) => [k % size.x, Math.floor(k / size.x)]);
}
