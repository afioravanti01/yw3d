import type { Goal, WorldMap } from '../map/worldMap';
import { didYouMean, type Path } from '../schema/schema';
import { parseYaml } from '../yaml/parse';
import { diagnostic, type Diagnostic } from '../yaml/report';
import { IDENTIFIER, type WorldFile } from '../yaml/worldFile';
import type {
  Args,
  BehaviorRegistry,
  BehaviorState,
  Condition,
  FieldKind,
  FieldSpec,
  Instruction,
  Program,
  Question,
  Reaction,
  TargetValue,
} from './registry';

/**
 * From the YAML of behaviors to programs (BEHAV-001, plan F06 P4): every reference is checked
 * when the world file is loaded, so that nothing wrong reaches the runner. Errors carry the
 * file, the line and the path of the field (BEHAV-001.c), also for external files.
 */

export interface CompileInput {
  readonly decl: WorldFile;
  /** The world file as shown in diagnostics, e.g. `valle/world.yaml`. */
  readonly file: string;
  readonly lineOf: (path: Path) => number | null;
  readonly registry: BehaviorRegistry;
  readonly map: WorldMap;
  readonly goals: ReadonlyMap<string, Goal>;
  /** Reads a file of the world folder by its path relative to it (plan F06 P14). */
  readonly readFile: ((path: string) => string | undefined) | undefined;
}

export interface CompileOutput {
  /** The program of each character with a behavior. */
  readonly programs: ReadonlyMap<string, Program>;
  readonly diagnostics: Diagnostic[];
}

/** Where some YAML comes from: the world file or an external file. */
interface Source {
  readonly file: string;
  readonly lineOf: (path: Path) => number | null;
}

type ParamType = 'number' | 'text' | 'duration' | 'point' | 'id' | 'list';
const PARAM_TYPES: readonly ParamType[] = ['number', 'text', 'duration', 'point', 'id', 'list'];

interface ParamSpec {
  readonly type: ParamType;
  readonly of: Exclude<ParamType, 'list'> | undefined;
  readonly min: number | undefined;
  readonly max: number | undefined;
  /** The default as written, with where it was written. */
  readonly fallback:
    { readonly raw: unknown; readonly source: Source; readonly path: Path } | undefined;
}

interface LibraryEntry {
  readonly name: string;
  readonly raw: Record<string, unknown>;
  readonly source: Source;
  readonly path: Path;
  readonly params: ReadonlyMap<string, ParamSpec>;
}

/** A parameter while compiling: its type and, for a character, its value (raw, with origin). */
interface ParamBinding {
  readonly spec: ParamSpec;
  readonly value:
    { readonly raw: unknown; readonly source: Source; readonly path: Path } | undefined;
}

interface Scope {
  readonly source: Source;
  readonly params: ReadonlyMap<string, ParamBinding>;
  readonly flags: ReadonlySet<string>;
  readonly counters: ReadonlySet<string>;
  /** Declared states; undefined in the simple form, without states. */
  readonly states: ReadonlySet<string> | undefined;
  /** Inside the branches of a question: what it expects (for `answer`). */
  readonly answer: Question['expect']['kind'] | undefined;
  /** Inside a reaction to a sentence (for `heard.from`, `heard.mentions`). */
  readonly heard: boolean;
}

const PLACEHOLDERS = ['player', 'speaker', 'answer', 'mentions'] as const;
const DEFINITION_KEYS = ['memory', 'routine', 'repeat', 'reactions', 'states', 'start'];
const LIBRARY_KEYS = ['name', 'description', 'params', ...DEFINITION_KEYS];
const REACTION_KEYS = ['on', 'when', 'every', 'once', 'do'];
const STATE_KEYS = ['routine', 'repeat', 'reactions'];
/** Name of the only state of the simple form. */
export const MAIN_STATE = 'main';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function compileBehaviors(input: CompileInput): CompileOutput {
  const diagnostics: Diagnostic[] = [];
  const world: Source = { file: input.file, lineOf: input.lineOf };
  const error = (source: Source, path: Path, message: string) =>
    diagnostics.push(diagnostic('error', source.file, source.lineOf(path), path, message));

  const declared = new Map<string, (typeof input.map.entries)[number]>();
  for (const entry of input.map.entries) declared.set(entry.id, entry);
  const declaredIds = input.map.entries.filter((e) => !e.id.includes('#')).map((e) => e.id);
  const entityIds = new Set(
    input.map.entries.filter((e) => e.kind === 'character' || e.kind === 'player').map((e) => e.id),
  );
  const areaIds = new Set([...input.goals].filter(([, g]) => g.kind === 'area').map(([id]) => id));

  // External files, read once each (plan F06 P14).
  const files = new Map<string, { source: Source; value: unknown } | undefined>();
  const readExternal = (relative: unknown, from: Source, path: Path) => {
    if (typeof relative !== 'string' || relative.trim() === '') {
      error(from, path, 'expected the path of a YAML file, relative to the folder of the world');
      return undefined;
    }
    const inside = insideFolder(relative);
    if (!inside) {
      error(from, path, `the path "${relative}" leaves the folder of the world`);
      return undefined;
    }
    if (!files.has(inside)) {
      const text = input.readFile?.(inside);
      if (text === undefined) {
        files.set(inside, undefined);
      } else {
        const file = siblingOf(input.file, inside);
        const parsed = parseYaml(text, file);
        diagnostics.push(...parsed.diagnostics);
        files.set(
          inside,
          parsed.diagnostics.length > 0
            ? undefined
            : { source: { file, lineOf: parsed.lineOf }, value: parsed.value },
        );
        if (parsed.diagnostics.length > 0) return undefined;
      }
    }
    const loaded = files.get(inside);
    if (!loaded) error(from, path, `cannot read the file "${relative}" of the world folder`);
    return loaded;
  };

  // The library (BEHAV-006.a): entries of the world file and of the files it names.
  const library = new Map<string, LibraryEntry>();
  const addEntry = (raw: unknown, source: Source, path: Path) => {
    if (!isObject(raw))
      return error(source, path, 'expected a behavior with a "name", or { file: … }');
    if (typeof raw.name !== 'string' || !IDENTIFIER.test(raw.name)) {
      return error(
        source,
        [...path, 'name'],
        'expected the name of the behavior: lowercase letters, digits, "_" or "-"',
      );
    }
    for (const key of Object.keys(raw)) {
      if (!LIBRARY_KEYS.includes(key))
        error(source, [...path, key], `unknown field${didYouMean(key, LIBRARY_KEYS)}`);
    }
    if (library.has(raw.name)) {
      const first = library.get(raw.name)!;
      return error(
        source,
        [...path, 'name'],
        `the behavior "${raw.name}" is already declared (${first.source.file}:${first.source.lineOf(first.path)})`,
      );
    }
    const params = paramSpecs(raw.params, source, [...path, 'params']);
    library.set(raw.name, { name: raw.name, raw, source, path, params });
  };
  (input.decl.behaviors ?? []).forEach((raw, i) => {
    const path = ['behaviors', i];
    if (isObject(raw) && 'file' in raw) {
      for (const key of Object.keys(raw)) {
        if (key !== 'file') error(world, [...path, key], 'a file of behaviors takes only "file"');
      }
      const loaded = readExternal(raw.file, world, [...path, 'file']);
      if (!loaded) return;
      if (!Array.isArray(loaded.value)) {
        return error(loaded.source, [], 'expected a list of behaviors, each with a "name"');
      }
      loaded.value.forEach((entry, j) => addEntry(entry, loaded.source, [j]));
    } else {
      addEntry(raw, world, path);
    }
  });

  function paramSpecs(raw: unknown, source: Source, path: Path): Map<string, ParamSpec> {
    const specs = new Map<string, ParamSpec>();
    if (raw === undefined) return specs;
    if (!isObject(raw)) {
      error(source, path, 'expected the parameters, e.g. { tappe: { type: list, of: id } }');
      return specs;
    }
    for (const [name, spec] of Object.entries(raw)) {
      const at = [...path, name];
      if (!IDENTIFIER.test(name)) {
        error(source, at, 'a parameter name has lowercase letters, digits, "_" or "-"');
        continue;
      }
      if (
        !isObject(spec) ||
        typeof spec.type !== 'string' ||
        !PARAM_TYPES.includes(spec.type as ParamType)
      ) {
        error(source, [...at, 'type'], `expected a type: one of ${PARAM_TYPES.join(', ')}`);
        continue;
      }
      for (const key of Object.keys(spec)) {
        if (!['type', 'of', 'default', 'min', 'max'].includes(key))
          error(source, [...at, key], 'unknown field');
      }
      const type = spec.type as ParamType;
      let of: ParamSpec['of'];
      if (type === 'list') {
        if (
          typeof spec.of !== 'string' ||
          !PARAM_TYPES.includes(spec.of as ParamType) ||
          spec.of === 'list'
        ) {
          error(
            source,
            [...at, 'of'],
            'a list declares the type of its items: number, text, duration, point or id',
          );
          continue;
        }
        of = spec.of as ParamSpec['of'];
      }
      specs.set(name, {
        type,
        of,
        min: typeof spec.min === 'number' ? spec.min : undefined,
        max: typeof spec.max === 'number' ? spec.max : undefined,
        fallback:
          'default' in spec ? { raw: spec.default, source, path: [...at, 'default'] } : undefined,
      });
    }
    return specs;
  }

  // Values of the fields (plan F06 P5): `$name` takes the value of a parameter.

  function field(spec: FieldSpec, raw: unknown, path: Path, scope: Scope): unknown {
    if (typeof raw === 'string' && raw.startsWith('$'))
      return param(spec, raw.slice(1), path, scope);
    return value(spec, raw, path, scope);
  }

  function param(spec: FieldSpec, name: string, path: Path, scope: Scope): unknown {
    const binding = scope.params.get(name);
    if (!binding) {
      const known = [...scope.params.keys()];
      error(
        scope.source,
        path,
        `unknown parameter "$${name}"${known.length > 0 ? `; the parameters are: ${known.map((k) => `$${k}`).join(', ')}` : ': this behavior has no parameters'}`,
      );
      return undefined;
    }
    if (!fits(binding.spec, spec)) {
      error(
        scope.source,
        path,
        `the parameter "$${name}" is a ${describeParam(binding.spec)}: here ${describeKind(spec)} is needed`,
      );
      return undefined;
    }
    // Without a value the definition is only checked: any value of the right kind will do.
    if (!binding.value) return placeholder(spec, name);
    const { raw, source, path: at } = binding.value;
    return value(spec, raw, at, { ...scope, source });
  }

  function value(spec: FieldSpec, raw: unknown, path: Path, scope: Scope): unknown {
    const fail = (message: string) => {
      error(scope.source, path, message);
      return undefined;
    };
    switch (spec.kind) {
      case 'number': {
        if (typeof raw !== 'number' || !Number.isFinite(raw))
          return fail(`expected a number, got ${show(raw)}`);
        return inRange(raw, spec) ? raw : fail(`${raw} is out of range: ${rangeOf(spec)}`);
      }
      case 'duration': {
        const seconds = durationOf(raw);
        if (seconds === undefined)
          return fail(
            `expected a duration in seconds, such as 5 or "30s" or "2min", got ${show(raw)}`,
          );
        return inRange(seconds, spec)
          ? seconds
          : fail(`${seconds} s is out of range: ${rangeOf(spec)} seconds`);
      }
      case 'boolean':
        return typeof raw === 'boolean' ? raw : fail(`expected true or false, got ${show(raw)}`);
      case 'text': {
        if (typeof raw !== 'string') return fail(`expected a text, got ${show(raw)}`);
        if (raw.trim() === '') return fail('the text must not be empty');
        if (spec.maxLength !== undefined && raw.length > spec.maxLength) {
          return fail(`too long: ${raw.length} characters, at most ${spec.maxLength}`);
        }
        for (const [, name] of raw.matchAll(/\{([^}]*)\}/g)) {
          if (!(PLACEHOLDERS as readonly string[]).includes(name!)) {
            return fail(
              `unknown name {${name}} in the text: the names are ${PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}`,
            );
          }
          if (name === 'answer' && !scope.answer)
            return fail('{answer} is available only in the branches of a question');
          if ((name === 'speaker' || name === 'mentions') && !scope.heard) {
            return fail(`{${name}} is available only in a reaction to a sentence (on: heard)`);
          }
        }
        return raw;
      }
      case 'target': {
        if (spec.list && Array.isArray(raw) && raw.length > 0 && typeof raw[0] !== 'number') {
          const items = raw.map((item, i) =>
            field({ ...spec, list: false }, item, [...path, i], scope),
          );
          return items.every((t) => t !== undefined) ? items : undefined;
        }
        return target(raw, path, scope, fail);
      }
      case 'entity': {
        if (raw === 'heard.from') {
          return scope.heard
            ? { kind: 'ref', ref: 'heard.from' }
            : fail('heard.from is available only in a reaction to a sentence (on: heard)');
        }
        if (typeof raw !== 'string')
          return fail(`expected a character or "player", got ${show(raw)}`);
        if (!checkId(raw, path, scope)) return undefined;
        return entityIds.has(raw)
          ? { kind: 'id', id: raw }
          : fail(`"${raw}" is not a character nor the player`);
      }
      case 'area': {
        if (typeof raw !== 'string') return fail(`expected the id of an area, got ${show(raw)}`);
        if (!checkId(raw, path, scope)) return undefined;
        return areaIds.has(raw)
          ? raw
          : fail(`"${raw}" is not an area: a place with an "area", or a distribution`);
      }
      case 'mention': {
        if (raw === 'any') return raw;
        if (typeof raw !== 'string')
          return fail(`expected "any" or an id of the map, got ${show(raw)}`);
        return checkId(raw, path, scope) ? raw : undefined;
      }
      case 'flag':
      case 'counter': {
        const names = spec.kind === 'flag' ? scope.flags : scope.counters;
        if (typeof raw !== 'string')
          return fail(`expected the name of a ${spec.kind}, got ${show(raw)}`);
        if (names.has(raw)) return raw;
        return fail(
          `"${raw}" is not declared: add it to memory.${spec.kind === 'flag' ? 'flags' : 'counters'}${didYouMean(raw, [...names])}`,
        );
      }
      case 'state': {
        if (!scope.states)
          return fail('there are no states: declare "states" and "start" to change state');
        if (typeof raw === 'string' && scope.states.has(raw)) return raw;
        return fail(`unknown state ${show(raw)}: the states are ${[...scope.states].join(', ')}`);
      }
      case 'instructions':
        return instructions(raw, path, scope);
      case 'conditions': {
        const list = Array.isArray(raw) ? raw : [raw];
        const conditions = list.map((c, i) =>
          condition(c, Array.isArray(raw) ? [...path, i] : path, scope),
        );
        return conditions.every((c) => c !== undefined) ? conditions : undefined;
      }
      case 'expect': {
        if (raw === 'place' || raw === 'yes_no') return { kind: raw };
        if (isObject(raw) && Object.keys(raw).length === 1 && Array.isArray(raw.one_of)) {
          const options = raw.one_of;
          if (
            options.length < 2 ||
            !options.every((o) => typeof o === 'string' && o.trim() !== '')
          ) {
            return fail('one_of lists at least two options, as texts');
          }
          return { kind: 'one_of', options };
        }
        return fail(`expected place, yes_no or { one_of: [...] }, got ${show(raw)}`);
      }
      case 'answers': {
        if (!isObject(raw))
          return fail('expected a branch for each option: { option: [instructions] }');
        const out: Record<string, readonly Instruction[]> = {};
        for (const [option, body] of Object.entries(raw)) {
          const compiled = instructions(body, [...path, option], scope);
          if (compiled) out[option] = compiled;
        }
        return out;
      }
    }
  }

  /** Whether an id may be written in the world file: declared, not generated (MAP-001.c). */
  function checkId(id: string, path: Path, scope: Scope): boolean {
    const entry = declared.get(id);
    if (entry && !id.includes('#')) return true;
    error(
      scope.source,
      path,
      entry
        ? `"${id}" is a generated id: give the element an "id" to refer to it in the world file`
        : `there is no "${id}" in the map${didYouMean(id, declaredIds)}`,
    );
    return false;
  }

  function target(
    raw: unknown,
    path: Path,
    scope: Scope,
    fail: (m: string) => undefined,
  ): TargetValue | undefined {
    if (Array.isArray(raw)) {
      if (raw.length === 2 && raw.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        return { kind: 'point', x: (raw[0] as number) + 0.5, z: (raw[1] as number) + 0.5 };
      }
      return fail('expected [x, z], an id of the map, or a reference');
    }
    if (typeof raw !== 'string')
      return fail(`expected [x, z], an id of the map, or a reference, got ${show(raw)}`);
    if (raw === 'answer' && !declared.has('answer')) {
      if (scope.answer === 'place') return { kind: 'ref', ref: 'answer' };
      return fail(
        scope.answer
          ? 'the answer is a place only when the question expects one (expect: place)'
          : 'answer is available only in the branches of a question',
      );
    }
    if (raw === 'heard.from' || raw === 'heard.mentions') {
      return scope.heard
        ? { kind: 'ref', ref: raw }
        : fail(`${raw} is available only in a reaction to a sentence (on: heard)`);
    }
    if (raw === 'player') return { kind: 'id', id: 'player' };
    return checkId(raw, path, scope) ? { kind: 'id', id: raw } : undefined;
  }

  // Instructions, conditions and reactions: an object with one main key (plan F06 P2).

  function instructions(raw: unknown, path: Path, scope: Scope): Instruction[] | undefined {
    if (!Array.isArray(raw)) {
      error(scope.source, path, 'expected a list of instructions');
      return undefined;
    }
    const out: Instruction[] = [];
    let valid = true;
    raw.forEach((item, i) => {
      const compiled = instruction(item, [...path, i], scope);
      if (compiled) out.push(...compiled);
      else valid = false;
    });
    return valid ? out : undefined;
  }

  function mainKey(
    raw: unknown,
    path: Path,
    scope: Scope,
    kind: 'instruction' | 'event' | 'condition',
    allowed: (key: string) => boolean,
  ): string | undefined {
    const names = input.registry.names(kind);
    if (!isObject(raw)) {
      error(
        scope.source,
        path,
        `expected ${kind === 'instruction' ? 'an instruction' : `a ${kind}`}: one of ${names.join(', ')}`,
      );
      return undefined;
    }
    const keys = Object.keys(raw).filter((k) => names.includes(k));
    if (keys.length === 1) return keys[0];
    if (keys.length > 1) {
      error(scope.source, path, `one ${kind} per item: found ${keys.join(' and ')}`);
      return undefined;
    }
    const first = Object.keys(raw).find((k) => !allowed(k)) ?? Object.keys(raw)[0] ?? '';
    error(
      scope.source,
      [...path, first],
      `unknown ${kind}${didYouMean(first, names)}: expected one of ${names.join(', ')}`,
    );
    return undefined;
  }

  function argsOf(
    definition: {
      readonly name: string;
      readonly main: FieldSpec;
      readonly options?: Readonly<Record<string, FieldSpec>>;
    },
    raw: Record<string, unknown>,
    path: Path,
    scope: Scope,
    extra: readonly string[],
  ): Args | undefined {
    const options = definition.options ?? {};
    const args: Record<string, unknown> = {};
    let valid = true;
    // Without a value of its own (`heard`), the options may also go inside the key:
    // `{ heard: { from: player } }` is `{ heard: true, from: player }`.
    if (definition.main.kind === 'boolean' && isObject(raw[definition.name])) {
      raw = {
        ...(raw[definition.name] as Record<string, unknown>),
        [definition.name]: null,
        ...without(raw, definition.name),
      };
      path = [...path, definition.name];
    }
    const main = raw[definition.name];
    if (main === null || main === undefined) {
      if (definition.main.default === undefined && !definition.main.optional) {
        error(
          scope.source,
          [...path, definition.name],
          `${definition.name} needs ${describeKind(definition.main)}`,
        );
        valid = false;
      }
      args.main = definition.main.default;
    } else {
      const parsed = field(definition.main, main, [...path, definition.name], scope);
      if (parsed === undefined) valid = false;
      args.main = parsed;
    }
    for (const key of Object.keys(raw)) {
      if (key === definition.name || key in options || extra.includes(key)) continue;
      error(
        scope.source,
        [...path, key],
        `unknown field of ${definition.name}${didYouMean(key, [...Object.keys(options), ...extra])}`,
      );
      valid = false;
    }
    for (const [key, spec] of Object.entries(options)) {
      const given = raw[key];
      if (given === undefined || given === null) {
        if (spec.default === undefined && !spec.optional) {
          error(scope.source, [...path, key], `missing required field: ${describeKind(spec)}`);
          valid = false;
        }
        args[key] = spec.default;
        continue;
      }
      const parsed = field(
        spec,
        given,
        [...path, key],
        branchScope(definition.name, key, args, scope),
      );
      if (parsed === undefined) valid = false;
      args[key] = parsed;
    }
    return valid ? args : undefined;
  }

  /** The branches of a question know what it expects (for `answer`). */
  function branchScope(
    definition: string,
    key: string,
    args: Record<string, unknown>,
    scope: Scope,
  ): Scope {
    if (definition !== 'ask' || !['then', 'yes', 'no', 'answers'].includes(key)) return scope;
    const expect = (args.expect as Question['expect'] | undefined) ?? { kind: 'place' };
    return { ...scope, answer: expect.kind };
  }

  function instruction(raw: unknown, path: Path, scope: Scope): Instruction[] | undefined {
    const name = mainKey(raw, path, scope, 'instruction', () => false);
    if (!name) return undefined;
    const definition = input.registry.instruction(name)!;
    const object = raw as Record<string, unknown>;
    // `expect` comes first: the branches depend on it.
    const ordered = orderOptions(object);
    const args = argsOf(definition, ordered, path, scope, definition.instant ? [] : ['on_fail']);
    const onFail =
      !definition.instant && object.on_fail !== undefined
        ? instructions(object.on_fail, [...path, 'on_fail'], scope)
        : undefined;
    if (!args || (object.on_fail !== undefined && !onFail)) return undefined;
    const problem = definition.check?.(args);
    if (problem) {
      error(scope.source, path, problem);
      return undefined;
    }
    const where = `${scope.source.file}:${scope.source.lineOf(path) ?? '?'}`;
    // A list of destinations visits them in order (A6.1).
    if (definition.main.list && Array.isArray(args.main)) {
      return (args.main as unknown[]).map((main) => ({
        definition,
        args: { ...args, main },
        onFail,
        where,
      }));
    }
    return [{ definition, args, onFail, where }];
  }

  function condition(raw: unknown, path: Path, scope: Scope): Condition | undefined {
    const name = mainKey(raw, path, scope, 'condition', () => false);
    if (!name) return undefined;
    const definition = input.registry.condition(name)!;
    const args = argsOf(definition, raw as Record<string, unknown>, path, scope, []);
    return args ? { definition, args } : undefined;
  }

  function reactions(raw: unknown, path: Path, scope: Scope): Reaction[] | undefined {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      error(scope.source, path, 'expected a list of reactions, each with "on" and "do"');
      return undefined;
    }
    const out: Reaction[] = [];
    let valid = true;
    raw.forEach((item, i) => {
      const at = [...path, i];
      if (!isObject(item)) {
        error(scope.source, at, 'expected a reaction with "on" and "do"');
        valid = false;
        return;
      }
      for (const key of Object.keys(item)) {
        if (!REACTION_KEYS.includes(key)) {
          error(
            scope.source,
            [...at, key],
            `unknown field of a reaction${didYouMean(key, REACTION_KEYS)}`,
          );
          valid = false;
        }
      }
      const eventRaw = typeof item.on === 'string' ? { [item.on]: null } : item.on;
      if (item.on === undefined) {
        error(
          scope.source,
          [...at, 'on'],
          'missing required field: the event, e.g. on: interacted',
        );
        valid = false;
        return;
      }
      const eventName = mainKey(eventRaw, [...at, 'on'], scope, 'event', () => false);
      if (!eventName) {
        valid = false;
        return;
      }
      const definition = input.registry.event(eventName)!;
      const eventArgs = argsOf(
        definition,
        eventRaw as Record<string, unknown>,
        [...at, 'on'],
        scope,
        [],
      );
      const inner = { ...scope, heard: definition.signal === 'heard' };
      const when =
        item.when === undefined
          ? []
          : (value({ kind: 'conditions' }, item.when, [...at, 'when'], inner) as
              Condition[] | undefined);
      const every =
        item.every === undefined
          ? undefined
          : (value({ kind: 'duration', min: 0 }, item.every, [...at, 'every'], scope) as
              number | undefined);
      const once =
        item.once === undefined
          ? false
          : value({ kind: 'boolean' }, item.once, [...at, 'once'], scope);
      if (item.do === undefined) {
        error(
          scope.source,
          [...at, 'do'],
          'missing required field: the instructions of the reaction',
        );
        valid = false;
        return;
      }
      const body = instructions(item.do, [...at, 'do'], inner);
      if (
        !eventArgs ||
        !when ||
        (item.every !== undefined && every === undefined) ||
        once === undefined ||
        !body
      ) {
        valid = false;
        return;
      }
      out.push({
        event: { definition, args: eventArgs },
        when,
        every,
        once: once as boolean,
        body,
        where: `${scope.source.file}:${scope.source.lineOf(at) ?? '?'}`,
      });
    });
    return valid ? out : undefined;
  }

  /** A behavior definition: memory, routine and reactions, or states (BEHAV-002, BEHAV-003). */
  function definition(
    raw: Record<string, unknown>,
    source: Source,
    path: Path,
    params: ReadonlyMap<string, ParamBinding>,
    allowed: readonly string[],
  ): Program | undefined {
    for (const key of Object.keys(raw)) {
      if (!allowed.includes(key))
        error(source, [...path, key], `unknown field of a behavior${didYouMean(key, allowed)}`);
    }
    const memory = memoryOf(raw.memory, source, [...path, 'memory']);
    const stateNames = isObject(raw.states) ? new Set(Object.keys(raw.states)) : undefined;
    const scope: Scope = {
      source,
      params,
      flags: memory.flags,
      counters: memory.counters,
      states: stateNames,
      answer: undefined,
      heard: false,
    };
    const repeatOf = (value: unknown, at: Path) => {
      if (value === undefined) return true;
      if (typeof value === 'boolean') return value;
      error(source, at, `expected true or false, got ${show(value)}`);
      return undefined;
    };
    if (raw.states === undefined) {
      if (raw.start !== undefined) error(source, [...path, 'start'], '"start" needs "states"');
      const routine =
        raw.routine === undefined ? [] : instructions(raw.routine, [...path, 'routine'], scope);
      const own = reactions(raw.reactions, [...path, 'reactions'], scope);
      const repeat = repeatOf(raw.repeat, [...path, 'repeat']);
      if (!routine || !own || repeat === undefined || raw.start !== undefined) return undefined;
      return {
        states: [{ name: MAIN_STATE, routine, repeat, reactions: own }],
        start: MAIN_STATE,
        common: [],
        flags: [...memory.flags],
        counters: [...memory.counters],
      };
    }
    if (!isObject(raw.states) || Object.keys(raw.states).length === 0) {
      error(
        source,
        [...path, 'states'],
        'expected the states by name: { giro: { routine: [...] }, … }',
      );
      return undefined;
    }
    let valid = true;
    for (const key of ['routine', 'repeat']) {
      if (raw[key] !== undefined) {
        error(source, [...path, key], `with states, "${key}" goes inside each state`);
        valid = false;
      }
    }
    if (typeof raw.start !== 'string' || !stateNames!.has(raw.start)) {
      error(
        source,
        [...path, 'start'],
        `expected the first state: one of ${[...stateNames!].join(', ')}`,
      );
      valid = false;
    }
    const states: BehaviorState[] = [];
    for (const [name, state] of Object.entries(raw.states)) {
      const at = [...path, 'states', name];
      if (!IDENTIFIER.test(name)) {
        error(source, at, 'a state name has lowercase letters, digits, "_" or "-"');
        valid = false;
        continue;
      }
      if (!isObject(state)) {
        error(source, at, 'expected a state: { routine: [...], reactions: [...] }');
        valid = false;
        continue;
      }
      for (const key of Object.keys(state)) {
        if (!STATE_KEYS.includes(key)) {
          error(source, [...at, key], `unknown field of a state${didYouMean(key, STATE_KEYS)}`);
          valid = false;
        }
      }
      const routine =
        state.routine === undefined ? [] : instructions(state.routine, [...at, 'routine'], scope);
      const own = reactions(state.reactions, [...at, 'reactions'], scope);
      const repeat = repeatOf(state.repeat, [...at, 'repeat']);
      if (!routine || !own || repeat === undefined) {
        valid = false;
        continue;
      }
      states.push({ name, routine, repeat, reactions: own });
    }
    const common = reactions(raw.reactions, [...path, 'reactions'], scope);
    if (!valid || !common) return undefined;
    return {
      states,
      start: raw.start as string,
      common,
      flags: [...memory.flags],
      counters: [...memory.counters],
    };
  }

  function memoryOf(raw: unknown, source: Source, path: Path) {
    const flags = new Set<string>();
    const counters = new Set<string>();
    if (raw === undefined) return { flags, counters };
    if (!isObject(raw)) {
      error(source, path, 'expected { flags: [...], counters: [...] }');
      return { flags, counters };
    }
    for (const key of Object.keys(raw)) {
      if (key !== 'flags' && key !== 'counters')
        error(
          source,
          [...path, key],
          `unknown field of the memory${didYouMean(key, ['flags', 'counters'])}`,
        );
    }
    for (const [key, names] of [
      ['flags', flags],
      ['counters', counters],
    ] as const) {
      const list = raw[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        error(source, [...path, key], 'expected a list of names');
        continue;
      }
      list.forEach((name, i) => {
        if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
          error(source, [...path, key, i], 'a name has lowercase letters, digits, "_" or "-"');
        } else if (flags.has(name) || counters.has(name)) {
          error(source, [...path, key, i], `"${name}" is already declared`);
        } else {
          names.add(name);
        }
      });
    }
    return { flags, counters };
  }

  // Every library behavior is checked once, also when no character uses it.
  for (const entry of library.values()) {
    const bindings = new Map(
      [...entry.params].map(([name, spec]) => [name, { spec, value: undefined }]),
    );
    definition(entry.raw, entry.source, entry.path, bindings, LIBRARY_KEYS);
  }

  const programs = new Map<string, Program>();
  (input.decl.characters ?? []).forEach((character, i) => {
    const raw = character.behavior;
    if (raw === undefined) return;
    const path = ['characters', i, 'behavior'];
    let program: Program | undefined;
    if (isObject(raw) && 'use' in raw) {
      program = useOf(raw, path);
    } else if (isObject(raw) && 'file' in raw) {
      for (const key of Object.keys(raw)) {
        if (key !== 'file')
          error(
            world,
            [...path, key],
            'a behavior in a file takes only "file"; for parameters, use a library behavior',
          );
      }
      const loaded = readExternal(raw.file, world, [...path, 'file']);
      if (loaded) {
        if (!isObject(loaded.value))
          error(loaded.source, [], 'expected a behavior: { routine: [...], reactions: [...] }');
        else program = definition(loaded.value, loaded.source, [], new Map(), DEFINITION_KEYS);
      }
    } else if (isObject(raw)) {
      program = definition(raw, world, path, new Map(), DEFINITION_KEYS);
    } else {
      error(
        world,
        path,
        'expected a behavior: { routine: [...], reactions: [...] }, { file: … } or { use: … }',
      );
    }
    if (program) programs.set(character.id, program);
  });

  /** A library behavior with the parameters of a character (BEHAV-006.b). */
  function useOf(raw: Record<string, unknown>, path: Path): Program | undefined {
    for (const key of Object.keys(raw)) {
      if (key !== 'use' && key !== 'params')
        error(world, [...path, key], `unknown field${didYouMean(key, ['use', 'params'])}`);
    }
    const entry = typeof raw.use === 'string' ? library.get(raw.use) : undefined;
    if (!entry) {
      error(
        world,
        [...path, 'use'],
        `there is no behavior "${String(raw.use)}" in the library${didYouMean(String(raw.use), [...library.keys()])}`,
      );
      return undefined;
    }
    const given = raw.params ?? {};
    if (!isObject(given)) {
      error(world, [...path, 'params'], 'expected the values of the parameters: { name: value }');
      return undefined;
    }
    let valid = true;
    for (const key of Object.keys(given)) {
      if (!entry.params.has(key)) {
        error(
          world,
          [...path, 'params', key],
          `unknown parameter of ${entry.name}${didYouMean(key, [...entry.params.keys()])}`,
        );
        valid = false;
      }
    }
    const bindings = new Map<string, ParamBinding>();
    for (const [name, spec] of entry.params) {
      const at = [...path, 'params', name];
      const value = name in given ? { raw: given[name], source: world, path: at } : spec.fallback;
      if (!value) {
        error(
          world,
          [...path, 'params'],
          `missing parameter "${name}" of ${entry.name} (${describeParam(spec)})`,
        );
        valid = false;
        continue;
      }
      if (!checkParam(spec, value.raw, value.source, value.path)) valid = false;
      bindings.set(name, { spec, value });
    }
    if (!valid) return undefined;
    return definition(entry.raw, entry.source, entry.path, bindings, LIBRARY_KEYS);
  }

  /** A value of a parameter against its type and range (BEHAV-006.b). */
  function checkParam(spec: ParamSpec, raw: unknown, source: Source, path: Path): boolean {
    const scope: Scope = {
      source,
      params: new Map(),
      flags: new Set(),
      counters: new Set(),
      states: undefined,
      answer: undefined,
      heard: false,
    };
    const single = (type: Exclude<ParamType, 'list'>, v: unknown, at: Path): boolean => {
      const kind: FieldKind = type === 'id' ? 'mention' : type === 'point' ? 'target' : type;
      if (type === 'point' && !(Array.isArray(v) && v.length === 2)) {
        error(source, at, `expected a point [x, z], got ${show(v)}`);
        return false;
      }
      if (type === 'id') {
        if (typeof v === 'string' && v !== 'any') return checkId(v, at, scope);
        error(source, at, `expected an id of the map, got ${show(v)}`);
        return false;
      }
      return value({ kind, min: spec.min, max: spec.max }, v, at, scope) !== undefined;
    };
    if (spec.type !== 'list') return single(spec.type, raw, path);
    if (!Array.isArray(raw) || raw.length === 0) {
      error(source, path, `expected a list of ${spec.of}, got ${show(raw)}`);
      return false;
    }
    return raw.map((v, i) => single(spec.of!, v, [...path, i])).every(Boolean);
  }

  return { programs, diagnostics: dedupe(diagnostics) };
}

/** Options in the order that lets branches know what their question expects. */
function orderOptions(raw: Record<string, unknown>) {
  if (!('expect' in raw)) return raw;
  const { expect, ...rest } = raw;
  return { expect, ...rest };
}

/** Which parameters fit where (plan F06 P5). */
function fits(param: ParamSpec, field: FieldSpec): boolean {
  switch (field.kind) {
    case 'number':
      return param.type === 'number';
    case 'duration':
      return param.type === 'duration' || param.type === 'number';
    case 'text':
      return param.type === 'text';
    case 'target':
      return (
        param.type === 'id' ||
        param.type === 'point' ||
        (field.list === true &&
          param.type === 'list' &&
          (param.of === 'id' || param.of === 'point'))
      );
    case 'entity':
    case 'area':
    case 'mention':
      return param.type === 'id';
    default:
      return false;
  }
}

/** A value of the right kind for checking a definition without its parameters. */
function placeholder(field: FieldSpec, name: string): unknown {
  switch (field.kind) {
    case 'number':
    case 'duration':
      return field.min ?? 0;
    case 'text':
      return `$${name}`;
    case 'target':
    case 'entity':
      return { kind: 'id', id: `$${name}` };
    default:
      return `$${name}`;
  }
}

function describeParam(spec: ParamSpec): string {
  return spec.type === 'list' ? `list of ${spec.of}` : spec.type;
}

function describeKind(spec: FieldSpec): string {
  const names: Record<FieldKind, string> = {
    number: 'a number',
    text: 'a text',
    duration: 'a duration',
    boolean: 'true or false',
    target: 'a destination: an id of the map, [x, z] or a reference',
    entity: 'a character or the player',
    area: 'an area of the map',
    flag: 'a flag',
    counter: 'a counter',
    state: 'a state',
    instructions: 'a list of instructions',
    conditions: 'a condition',
    expect: 'place, yes_no or { one_of: [...] }',
    answers: 'a branch for each option',
    mention: '"any" or an id of the map',
  };
  return names[spec.kind];
}

function inRange(value: number, spec: FieldSpec): boolean {
  return (
    (spec.min === undefined || value >= spec.min) && (spec.max === undefined || value <= spec.max)
  );
}

function rangeOf(spec: FieldSpec): string {
  if (spec.min !== undefined && spec.max !== undefined)
    return `between ${spec.min} and ${spec.max}`;
  if (spec.min !== undefined) return `at least ${spec.min}`;
  return `at most ${spec.max}`;
}

/** Seconds of a duration: a number, or a text like `30s`, `1.5min`. */
export function durationOf(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(s|min)\s*$/.exec(raw);
  if (!match) return undefined;
  return Number(match[1]) * (match[2] === 'min' ? 60 : 1);
}

function show(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) return 'a list';
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'object') return 'an object';
  return String(value);
}

/**
 * The path of a file inside the world folder, with `/` and without `.`, or undefined when it
 * leaves the folder (BEHAV-001.a).
 */
export function insideFolder(relative: string): string | undefined {
  const normalized = relative.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return undefined;
  const parts: string[] = [];
  for (const part of normalized.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts.join('/') : undefined;
}

/** A file next to the world file, as shown in diagnostics: `valle/world.yaml` → `valle/x.yaml`. */
function siblingOf(worldFile: string, relative: string): string {
  const slash = worldFile.lastIndexOf('/');
  return slash < 0 ? relative : `${worldFile.slice(0, slash)}/${relative}`;
}

function dedupe(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.file}|${d.line}|${d.path}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function without(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[key];
  return rest;
}
