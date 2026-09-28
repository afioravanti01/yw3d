import {
  int,
  list,
  number,
  object,
  optional,
  pair,
  str,
  text,
  type Infer,
  type Issue,
  type Path,
  type Schema,
} from '../schema/schema';
import { description, identifier, name } from './fields';
import { parseYaml } from './parse';
import { insideFolder } from './paths';
import { diagnostic, type Diagnostic } from './report';

/**
 * Scenarios of the laboratory (LAB-001, plan F10 P2): a task given to an agent when the world
 * starts, with a time limit, a number of steps and perturbations. Written in the world file, or
 * in YAML files of the folder that the world file names.
 */

/** Steps of a scenario when the file gives none (LAB-001.a). */
export const DEFAULT_MAX_STEPS = 50;
/** Largest box of blocks a perturbation may change: a wall or a pit, not a landscape. */
export const MAX_PERTURBATION_BLOCKS = 4096;
const TASK_LENGTH = 4000;

const point = () => list(int(), { min: 3, max: 3 });

const PERTURBATION_KINDS = ['say', 'move_place', 'blocks', 'goals'] as const;

const perturbationFields = object(
  {
    /** Seconds of simulated time from the start of the scenario. */
    at: number({ min: 0 }),
    say: optional(
      object({ by: identifier(), text: text({ min: 1, max: 500 }), to: optional(identifier()) }),
    ),
    move_place: optional(object({ place: identifier(), to: pair() })),
    blocks: optional(object({ from: point(), to: point(), block: str() })),
    goals: optional(object({ agent: identifier(), goals: list(text({ min: 1, max: 500 })) })),
  },
  (p, path, issues) => {
    const kinds = PERTURBATION_KINDS.filter((kind) => p[kind] !== undefined);
    if (kinds.length !== 1) {
      issues.push({
        path,
        message: `a perturbation has "at" and exactly one of ${PERTURBATION_KINDS.join(', ')}`,
      });
    }
  },
);

type Triple = readonly [number, number, number];
/** A point of three numbers, already checked by `point()`. */
const triple = (v: readonly number[]): Triple => [v[0]!, v[1]!, v[2]!];

/** Something that happens during a scenario, once (LAB-004.a). */
export type Perturbation = { readonly at: number } & (
  | {
      readonly kind: 'say';
      readonly by: string;
      readonly text: string;
      readonly to: string | undefined;
    }
  | { readonly kind: 'move_place'; readonly place: string; readonly to: readonly [number, number] }
  | { readonly kind: 'blocks'; readonly from: Triple; readonly to: Triple; readonly block: string }
  | { readonly kind: 'goals'; readonly agent: string; readonly goals: readonly string[] }
);

const perturbationSchema: Schema<Perturbation> = {
  description: perturbationFields.description,
  parse(value, path, issues) {
    const p = perturbationFields.parse(value, path, issues);
    if (!p) return undefined;
    const { at } = p;
    if (p.say) return { at, kind: 'say', ...p.say };
    if (p.move_place) return { at, kind: 'move_place', ...p.move_place };
    if (p.blocks) {
      const { from, to, block } = p.blocks;
      return { at, kind: 'blocks', from: triple(from), to: triple(to), block };
    }
    return { at, kind: 'goals', ...p.goals! };
  },
};

const scenarioSchema = object({
  id: identifier(),
  name: name(),
  description: description(),
  /** The character whose agent does the task. */
  agent: identifier(),
  task: text({ min: 1, max: TASK_LENGTH }),
  /** Seconds of simulated time. */
  time_limit: number({ min: 1, max: 24 * 3600 }),
  max_steps: int({ min: 1, max: 1000, default: DEFAULT_MAX_STEPS }),
  perturbations: optional(list(perturbationSchema)),
});

export type ScenarioDecl = Infer<typeof scenarioSchema>;

/** An item of `scenarios`: a scenario written there, or a YAML file of the folder with one. */
export type ScenarioEntry =
  | { readonly kind: 'inline'; readonly scenario: ScenarioDecl }
  | { readonly kind: 'import'; readonly path: string };

export const scenarioEntrySchema: Schema<ScenarioEntry> = {
  description: 'a scenario, or the path of a YAML file of the world folder that holds one',
  parse(value, path, issues) {
    if (typeof value === 'string') {
      const inside = insideFolder(value);
      if (!inside || !/\.ya?ml$/.test(inside)) {
        issues.push({
          path,
          message: `the scenario file "${value}" must be a YAML file inside the world folder`,
        });
        return undefined;
      }
      return { kind: 'import', path: inside };
    }
    const scenario = scenarioSchema.parse(value, path, issues);
    return scenario && { kind: 'inline', scenario };
  },
};

/** A scenario and where it was written, for its diagnostics. */
export interface ScenarioSource {
  readonly scenario: ScenarioDecl;
  /** The file shown in diagnostics: the world file or the imported one. */
  readonly file: string;
  /** Path of the scenario inside its file: `scenarios[1]` in the world file, empty in its own. */
  readonly path: Path;
  lineOf(path: Path): number | null;
}

/** A scenario ready to run, with the file it comes from (LAB-001). */
export type Scenario = ScenarioDecl & { readonly file: string };

/** Parses a YAML file that holds one scenario (LAB-001.a). */
export function loadScenarioFile(
  text: string,
  file: string,
): { readonly source: ScenarioSource | undefined; readonly diagnostics: Diagnostic[] } {
  const parsed = parseYaml(text, file);
  if (parsed.diagnostics.length > 0) return { source: undefined, diagnostics: parsed.diagnostics };
  if (parsed.value === undefined || parsed.value === null) {
    return {
      source: undefined,
      diagnostics: [diagnostic('error', file, null, '', 'the file is empty')],
    };
  }
  const issues: Issue[] = [];
  const scenario = scenarioSchema.parse(parsed.value, [], issues);
  const diagnostics = issues
    .map((i) => diagnostic('error', file, parsed.lineOf(i.path), i.path, i.message))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return {
    source:
      scenario && diagnostics.length === 0
        ? { scenario, file, path: [], lineOf: parsed.lineOf }
        : undefined,
    diagnostics,
  };
}

/** What the checks of the scenarios need to know of the world. */
export interface ScenarioWorld {
  readonly characters: readonly { readonly id: string; readonly agent: boolean }[];
  /** Places with a point: the ones a perturbation can move. */
  readonly places: readonly { readonly id: string; readonly point: boolean }[];
  readonly blockNames: ReadonlySet<string>;
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Checks the scenarios against the world (LAB-001.b): the agent exists and has an agent, one
 * scenario per agent, and perturbations name what the world has.
 */
export function checkScenarios(
  sources: readonly ScenarioSource[],
  world: ScenarioWorld,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const characters = new Map(world.characters.map((c) => [c.id, c]));
  const places = new Map(world.places.map((p) => [p.id, p]));
  const ids = new Set<string>();
  const agents = new Map<string, string>();
  for (const source of sources) {
    const { scenario } = source;
    const fail = (path: Path, message: string) => {
      const full = [...source.path, ...path];
      diagnostics.push(diagnostic('error', source.file, source.lineOf(full), full, message));
    };
    if (ids.has(scenario.id)) fail(['id'], `another scenario has the id "${scenario.id}"`);
    ids.add(scenario.id);
    const character = characters.get(scenario.agent);
    if (!character) {
      fail(['agent'], `there is no character "${scenario.agent}"`);
    } else if (!character.agent) {
      fail(['agent'], `the character "${scenario.agent}" has no agent: give it "agent:" first`);
    } else if (agents.has(scenario.agent)) {
      fail(
        ['agent'],
        `the agent of "${scenario.agent}" already has the scenario "${agents.get(scenario.agent)}": one scenario per agent`,
      );
    } else {
      agents.set(scenario.agent, scenario.id);
    }
    (scenario.perturbations ?? []).forEach((p, i) => {
      const at = (field: string, more: (string | number)[] = []) => [
        'perturbations',
        i,
        p.kind,
        field,
        ...more,
      ];
      const speaker = (id: string) => id === 'player' || characters.has(id);
      if (p.kind === 'say') {
        if (!speaker(p.by)) fail(at('by'), `there is no character "${p.by}"`);
        if (p.to !== undefined && !speaker(p.to)) fail(at('to'), `there is no character "${p.to}"`);
      } else if (p.kind === 'move_place') {
        const place = places.get(p.place);
        if (!place) fail(at('place'), `there is no place "${p.place}"`);
        else if (!place.point)
          fail(at('place'), `the place "${p.place}" is an area: only a place with "at" can move`);
      } else if (p.kind === 'goals') {
        if (!characters.get(p.agent)?.agent)
          fail(at('agent'), `"${p.agent}" is not a character with an agent`);
      } else {
        if (!world.blockNames.has(p.block)) {
          fail(
            at('block'),
            `unknown block "${p.block}": one of ${[...world.blockNames].join(', ')}`,
          );
        }
        const { size } = world;
        const limits = [size.x, size.y, size.z];
        for (const field of ['from', 'to'] as const) {
          if (p[field].some((v, axis) => v < 0 || v >= limits[axis]!)) {
            fail(at(field), `the point is outside the world (${size.x} × ${size.y} × ${size.z})`);
          }
        }
        const volume = [0, 1, 2].reduce(
          (n, axis) => n * (Math.abs(p.to[axis]! - p.from[axis]!) + 1),
          1,
        );
        if (volume > MAX_PERTURBATION_BLOCKS) {
          fail(
            at('to'),
            `${volume} blocks: a perturbation changes at most ${MAX_PERTURBATION_BLOCKS}`,
          );
        }
      }
    });
  }
  return diagnostics;
}
