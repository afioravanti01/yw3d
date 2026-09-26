import {
  int,
  list,
  number,
  object,
  oneOf,
  optional,
  pair,
  record,
  str,
  unknownValue,
  variant,
  type Infer,
  type Issue,
} from '../schema/schema';
import { parseYaml } from './parse';
import { diagnostic, type Diagnostic } from './report';

/** Versions of the world file schema this code can read (YAML-001.a). */
export const WORLD_FILE_VERSIONS = [1] as const;

const MAX_SEED = 0xffffffff;
const seed = () => int({ min: 0, max: MAX_SEED });

const terrainSchema = object({
  seed: seed(),
  generator: int({ min: 1 }),
  size: optional(list(int(), { min: 3, max: 3 })),
});

const structureSchema = object({
  type: str(),
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

/** Start of the player (YAML-008): column and view direction in degrees, 0 = north, 90 = east. */
const playerSchema = object({
  at: pair(),
  yaw: number({ min: -360, max: 360, default: 0 }),
});

const worldFileSchema = object({
  version: oneOf(WORLD_FILE_VERSIONS),
  terrain: terrainSchema,
  player: optional(playerSchema),
  structures: optional(list(structureSchema)),
  scatter: optional(list(scatterSchema)),
});

export type WorldFile = Infer<typeof worldFileSchema>;
export type StructureDecl = Infer<typeof structureSchema>;
export type ScatterDecl = Infer<typeof scatterSchema>;
export type PlayerDecl = Infer<typeof playerSchema>;
export type AreaDecl = Infer<typeof areaSchema>;

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
