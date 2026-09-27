import { CLOCK_PATTERN, DEFAULT_DAY_MINUTES, MINUTES_PER_DAY } from '../time/clock';
import { insideFolder } from './paths';
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
 * Behaviors in YAML were replaced by Python programs (D-010): a file that still uses them gets
 * an error that says so (YAML-001.f).
 */
export const BEHAVIORS_REMOVED =
  'behaviors in YAML were replaced by Python programs: see docs/python.md';

/** Brains an agent can use (AGENT-001.a, plan F08 P2). */
export const AGENT_CLIS = ['claude', 'codex', 'opencode'] as const;
export const AGENT_PROVIDERS = ['anthropic', 'openai'] as const;
export const AGENT_EFFORTS = ['low', 'medium', 'high'] as const;

/**
 * An LLM agent that drives a character from the host (AGENT-001, D-012): `headless` with a CLI
 * of the machine, `api` with a provider and a key in the environment, or `fake` without an LLM.
 */
const agentSchema = object(
  {
    mode: oneOf(['headless', 'api', 'fake']),
    cli: optional(oneOf(AGENT_CLIS)),
    provider: optional(oneOf(AGENT_PROVIDERS)),
    base_url: optional(pattern(/^https?:\/\/\S+$/, 'an http or https address')),
    api_key_env: optional(
      pattern(/^[A-Za-z_][A-Za-z0-9_]*$/, 'the name of an environment variable'),
    ),
    model: optional(text({ min: 1, max: 200 })),
    effort: optional(oneOf(AGENT_EFFORTS)),
    persona: optional(text({ max: 2000 })),
    goals: optional(list(text({ min: 1, max: 500 }))),
    initiative: oneOf(['reactive', 'autonomous'], { default: 'reactive' }),
    every: number({ min: 10, max: 3600, default: 60 }),
    fallback: optional(text({ min: 1, max: 500 })),
    answers: oneOf(['short', 'long'], { default: 'short' }),
  },
  (agent, path, issues) => {
    const refuse = (field: string, message: string) =>
      issues.push({ path: [...path, field], message });
    const only = (field: keyof typeof agent, mode: string) => {
      if (agent[field] !== undefined && agent.mode !== mode) {
        refuse(field, `"${field}" is for mode ${mode} only`);
      }
    };
    if (agent.mode === 'headless' && agent.cli === undefined) {
      refuse('cli', `mode headless needs a cli: one of ${AGENT_CLIS.join(', ')}`);
    }
    if (agent.mode === 'api') {
      if (agent.provider === undefined) {
        refuse('provider', `mode api needs a provider: one of ${AGENT_PROVIDERS.join(', ')}`);
      }
      if (agent.model === undefined) refuse('model', 'mode api needs a model');
      if (agent.base_url !== undefined && agent.provider !== 'openai') {
        refuse('base_url', '"base_url" is for the provider openai (and compatible services)');
      }
    }
    only('cli', 'headless');
    for (const field of ['provider', 'base_url', 'api_key_env'] as const) only(field, 'api');
  },
);

/**
 * A character (CHAR-001.a), driven by a Python program of the world folder (PY-003.a), by a
 * command (PROTO-003) or by an LLM agent (AGENT-001): one of them; without any it stands still.
 */
const characterSchema = object(
  {
    id: identifier(),
    name: name(),
    description: description(),
    at: pair(),
    yaw: number({ min: -360, max: 360, default: 0 }),
    appearance: optional(appearanceSchema),
    program: optional(str()),
    agent: optional(agentSchema),
    behavior: optional(unknownValue()),
    controller: optional(object({ command: str() })),
  },
  (character, path, issues) => {
    if (character.behavior !== undefined) {
      issues.push({ path: [...path, 'behavior'], message: BEHAVIORS_REMOVED });
    }
    const drivers = (['program', 'controller', 'agent'] as const).filter(
      (field) => character[field] !== undefined,
    );
    if (drivers.length > 1) {
      issues.push({
        path: [...path, drivers[1]!],
        message: 'a character has one of program, controller or agent, not more',
      });
    }
    if (character.program !== undefined) {
      const inside = insideFolder(character.program);
      if (!inside) {
        issues.push({
          path: [...path, 'program'],
          message: `the program "${character.program}" must be a file inside the world folder`,
        });
      } else if (!inside.endsWith('.py')) {
        issues.push({
          path: [...path, 'program'],
          message: `the program "${character.program}" must be a Python file (.py)`,
        });
      }
    }
  },
);

/** The clock of the world (TIME-001.a): starting hour and real minutes of a day. */
const timeSchema = object({
  start: optional(pattern(CLOCK_PATTERN, 'an hour as HH:MM, e.g. 08:00')),
  day_minutes: number({ min: 1, max: MINUTES_PER_DAY, default: DEFAULT_DAY_MINUTES }),
});

/** Settings shared by the agents of a world (A8.6). */
export const DEFAULT_CONVERSATION_TURNS = 12;
const agentSettingsSchema = object({
  /** Lines of a conversation between agents without the player, in all (AGENT-004.c). */
  conversation_turns: int({ min: 1, max: 200, default: DEFAULT_CONVERSATION_TURNS }),
});

const worldFileSchema = object(
  {
    version: versionSchema,
    name: name(),
    description: description(),
    terrain: terrainSchema,
    player: optional(playerSchema),
    places: optional(list(placeSchema)),
    characters: optional(list(characterSchema)),
    structures: optional(list(structureSchema)),
    scatter: optional(list(scatterSchema)),
    agents: optional(agentSettingsSchema),
    time: optional(timeSchema),
    behaviors: optional(unknownValue()),
  },
  (world, path, issues) => {
    if (world.behaviors !== undefined) {
      issues.push({ path: [...path, 'behaviors'], message: BEHAVIORS_REMOVED });
    }
  },
);

export type WorldFile = Infer<typeof worldFileSchema>;
export type StructureDecl = Infer<typeof structureSchema>;
export type ScatterDecl = Infer<typeof scatterSchema>;
export type PlayerDecl = Infer<typeof playerSchema>;
export type CharacterDecl = Infer<typeof characterSchema>;
export type AgentDecl = Infer<typeof agentSchema>;
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
