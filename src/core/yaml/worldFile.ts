import {
  color,
  int,
  list,
  number,
  object,
  oneOf,
  optional,
  pair,
  pattern,
  record,
  str,
  text,
  unknownValue,
  variant,
  type Infer,
  type Issue,
} from '../schema/schema';
import { parseYaml } from './parse';
import { diagnostic, type Diagnostic } from './report';

/** Versions of the world file schema this code can read (YAML-001.a). */
export const WORLD_FILE_VERSIONS = [2] as const;

/** What a file of version 1 needs to become a version 2 file (YAML-001.e, plan F06 P18). */
export const VERSION_1_MESSAGE =
  'version 1 is no longer supported: write "version: 2", add a "name" to the world and to every structure, distribution and character (a "description" is optional), and give places an "id" (see worlds/README.md)';

/** The player's name when the file gives none (YAML-009.b, F06 Q8). */
export const DEFAULT_PLAYER_NAME = 'viandante';
/** Longest name and description (YAML-009.a, F06 Q8). */
export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Identifiers of characters, places, structures and distributions (MAP-001.a). `#` is not
 * allowed: it marks the identifiers generated for structures without one (MAP-001.b).
 */
export const IDENTIFIER = /^[a-z][a-z0-9_-]{0,31}$/;
const identifier = () =>
  pattern(IDENTIFIER, 'an identifier of lowercase letters, digits, "_" or "-"');
const name = () => text({ min: 1, max: MAX_NAME_LENGTH });
const description = () => optional(text({ max: MAX_DESCRIPTION_LENGTH }));

const versionSchema = (() => {
  const versions = oneOf(WORLD_FILE_VERSIONS);
  return {
    ...versions,
    parse(value: unknown, path: readonly (string | number)[], issues: Issue[]) {
      if (value === 1) {
        issues.push({ path, message: VERSION_1_MESSAGE });
        return undefined;
      }
      return versions.parse(value, path, issues);
    },
  };
})();

const MAX_SEED = 0xffffffff;
const seed = () => int({ min: 0, max: MAX_SEED });

const terrainSchema = object({
  seed: seed(),
  generator: int({ min: 1 }),
  size: optional(list(int(), { min: 3, max: 3 })),
});

const structureSchema = object({
  type: str(),
  id: optional(identifier()),
  name: name(),
  description: description(),
  at: pair(),
  y: optional(int()),
  rotation: oneOf([0, 90, 180, 270], { default: 0 }),
  seed: optional(seed()),
  params: optional(record(unknownValue())),
});

const areaSchema = variant({
  rect: object({ from: pair(), to: pair() }, (rect, path, issues) => {
    if (rect.from[0] >= rect.to[0] || rect.from[1] >= rect.to[1]) {
      issues.push({
        path: [...path, 'to'],
        message: '"to" must be greater than "from" on x and z',
      });
    }
  }),
  circle: object({ center: pair(), radius: int({ min: 1 }) }),
});

const scatterSchema = object(
  {
    id: optional(identifier()),
    name: name(),
    description: description(),
    types: record(number({ min: 0 }), { minEntries: 1 }),
    area: areaSchema,
    density: optional(number({ min: 0 })),
    count: optional(int({ min: 1 })),
    minDistance: number({ min: 1 }),
    seed: optional(seed()),
  },
  (scatter, path, issues) => {
    if ((scatter.density === undefined) === (scatter.count === undefined)) {
      issues.push({ path, message: 'declare exactly one of "density" and "count"' });
    }
    if (Object.values(scatter.types).every((weight) => weight === 0)) {
      issues.push({ path: [...path, 'types'], message: 'at least one weight must be positive' });
    }
  },
);

/** Colors of a figure (CHAR-001.a); the missing ones are derived from the seed. */
const appearanceSchema = object({
  skin: optional(color()),
  hair: optional(color()),
  shirt: optional(color()),
  trousers: optional(color()),
});

/** A named point or area that is not a structure (YAML-010.a). */
const placeSchema = object(
  {
    id: identifier(),
    name: name(),
    description: description(),
    at: optional(pair()),
    area: optional(areaSchema),
  },
  (place, path, issues) => {
    if ((place.at === undefined) === (place.area === undefined)) {
      issues.push({
        path,
        message: 'declare exactly one of "at" (a point) and "area" (rect or circle)',
      });
    }
  },
);

/**
 * Start of the player (YAML-008): column, view direction in degrees (0 = north, 90 = east),
 * colors; name and description (YAML-009.b).
 */
const playerSchema = object({
  name: text({ min: 1, max: MAX_NAME_LENGTH, default: DEFAULT_PLAYER_NAME }),
  description: description(),
  at: pair(),
  yaw: number({ min: -360, max: 360, default: 0 }),
  appearance: optional(appearanceSchema),
});

/**
 * A character (CHAR-001.a), driven by a behavior (BEHAV-001, checked when compiled) or by a
 * command (PROTO-003), not both (BEHAV-001.b).
 */
const characterSchema = object(
  {
    id: identifier(),
    name: name(),
    description: description(),
    at: pair(),
    yaw: number({ min: -360, max: 360, default: 0 }),
    appearance: optional(appearanceSchema),
    behavior: optional(unknownValue()),
    controller: optional(object({ command: str() })),
  },
  (character, path, issues) => {
    if (character.behavior !== undefined && character.controller !== undefined) {
      issues.push({
        path: [...path, 'controller'],
        message: 'a character has either a behavior or a controller, not both',
      });
    }
  },
);

const worldFileSchema = object({
  version: versionSchema,
  name: name(),
  description: description(),
  terrain: terrainSchema,
  player: optional(playerSchema),
  places: optional(list(placeSchema)),
  characters: optional(list(characterSchema)),
  structures: optional(list(structureSchema)),
  scatter: optional(list(scatterSchema)),
  /** Library of behaviors (BEHAV-006), checked when compiled. */
  behaviors: optional(list(unknownValue())),
});

export type WorldFile = Infer<typeof worldFileSchema>;
export type StructureDecl = Infer<typeof structureSchema>;
export type ScatterDecl = Infer<typeof scatterSchema>;
export type PlayerDecl = Infer<typeof playerSchema>;
export type CharacterDecl = Infer<typeof characterSchema>;
export type AppearanceDecl = Infer<typeof appearanceSchema>;
export type AreaDecl = Infer<typeof areaSchema>;
export type PlaceDecl = Infer<typeof placeSchema>;

export interface LoadedWorldFile {
  /** The validated file; undefined when there are errors. */
  readonly world: WorldFile | undefined;
  /**
   * Structure declarations that are valid on their own, with their index, also when other
   * parts of the file have errors: their types and params can still be checked (YAML-002.b).
   */
  readonly validStructures: readonly (readonly [index: number, decl: StructureDecl])[];
  readonly diagnostics: Diagnostic[];
  /** Line of a field, for diagnostics produced later (structure params, conflicts). */
  lineOf(path: readonly (string | number)[]): number | null;
}

/** Parses and validates a world file, collecting every error (YAML-002.b). */
export function loadWorldFile(text: string, file: string): LoadedWorldFile {
  const parsed = parseYaml(text, file);
  if (parsed.diagnostics.length > 0) {
    return {
      world: undefined,
      validStructures: [],
      diagnostics: parsed.diagnostics,
      lineOf: parsed.lineOf,
    };
  }
  if (parsed.value === undefined || parsed.value === null) {
    return {
      world: undefined,
      validStructures: [],
      diagnostics: [diagnostic('error', file, null, '', 'the file is empty')],
      lineOf: parsed.lineOf,
    };
  }
  const issues: Issue[] = [];
  const world = worldFileSchema.parse(parsed.value, [], issues);
  const diagnostics = issues.map((issue) =>
    diagnostic('error', file, parsed.lineOf(issue.path), issue.path, issue.message),
  );
  const validStructures: [number, StructureDecl][] = [];
  const rawStructures = (parsed.value as { structures?: unknown }).structures;
  if (Array.isArray(rawStructures)) {
    rawStructures.forEach((raw, i) => {
      const decl = structureSchema.parse(raw, ['structures', i], []);
      if (decl) validStructures.push([i, decl]);
    });
  }
  return {
    world: diagnostics.length > 0 ? undefined : world,
    validStructures,
    diagnostics,
    lineOf: parsed.lineOf,
  };
}
