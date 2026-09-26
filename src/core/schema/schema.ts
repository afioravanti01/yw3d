/**
 * A small typed schema library (plan F02 P2), used for world files and structure parameters.
 * Parsing never throws: problems are collected as issues with the path of the offending field.
 */

export type Path = readonly (string | number)[];

export interface Issue {
  readonly path: Path;
  readonly message: string;
}

export interface Schema<T> {
  /** Parses a present value; returns undefined and records issues if it is invalid. */
  parse(value: unknown, path: Path, issues: Issue[]): T | undefined;
  /** Value used when the field is missing; `undefined` with `optional` means "absent is fine". */
  readonly fallback?: { readonly value: T };
  /** Short description of the accepted values, for messages and documentation. */
  readonly description: string;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

/** Formats a path as `structures[3].params.width`. */
export function formatPath(path: Path): string {
  let out = '';
  for (const segment of path) {
    out += typeof segment === 'number' ? `[${segment}]` : out === '' ? segment : `.${segment}`;
  }
  return out;
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function withFallback<T>(schema: Schema<T>, fallback: T | undefined): Schema<T> {
  return fallback === undefined ? schema : { ...schema, fallback: { value: fallback } };
}

interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly default?: number;
}

function rangeText(options: NumberOptions): string {
  const { min, max } = options;
  if (min !== undefined && max !== undefined) return ` between ${min} and ${max}`;
  if (min !== undefined) return ` ≥ ${min}`;
  if (max !== undefined) return ` ≤ ${max}`;
  return '';
}

function numberSchema(integer: boolean, options: NumberOptions): Schema<number> {
  const kind = integer ? 'an integer' : 'a number';
  const description = `${kind}${rangeText(options)}`;
  return withFallback(
    {
      description,
      parse(value, path, issues) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push({ path, message: `expected ${description}, got ${describeValue(value)}` });
          return undefined;
        }
        if (integer && !Number.isInteger(value)) {
          issues.push({ path, message: `${value} is not an integer` });
          return undefined;
        }
        const { min, max } = options;
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          issues.push({ path, message: `${value} is out of range: expected ${description}` });
          return undefined;
        }
        return value;
      },
    },
    options.default,
  );
}

export const int = (options: NumberOptions = {}) => numberSchema(true, options);
export const number = (options: NumberOptions = {}) => numberSchema(false, options);

export function bool(options: { readonly default?: boolean } = {}): Schema<boolean> {
  return withFallback(
    {
      description: 'true or false',
      parse(value, path, issues) {
        if (typeof value !== 'boolean') {
          issues.push({ path, message: `expected true or false, got ${describeValue(value)}` });
          return undefined;
        }
        return value;
      },
    },
    options.default,
  );
}

export function str(): Schema<string> {
  return {
    description: 'a string',
    parse(value, path, issues) {
      if (typeof value !== 'string') {
        issues.push({ path, message: `expected a string, got ${describeValue(value)}` });
        return undefined;
      }
      return value;
    },
  };
}

/** One of a fixed set of strings or numbers. */
export function oneOf<const T extends string | number>(
  values: readonly T[],
  options: { readonly default?: T } = {},
): Schema<T> {
  const description = `one of ${values.join(', ')}`;
  return withFallback(
    {
      description,
      parse(value, path, issues) {
        if (!values.includes(value as T)) {
          const hint = typeof value === 'string' ? didYouMean(value, values.map(String)) : '';
          issues.push({
            path,
            message: `${describeValue(value)} is not valid: expected ${description}${hint}`,
          });
          return undefined;
        }
        return value as T;
      },
    },
    options.default,
  );
}

/** Marks a field as optional without a default: a missing field parses as undefined. */
export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return { ...schema, fallback: { value: undefined } };
}

export function list<T>(
  item: Schema<T>,
  options: { readonly min?: number; readonly max?: number } = {},
): Schema<T[]> {
  return {
    description: `a list of ${item.description}`,
    parse(value, path, issues) {
      if (!Array.isArray(value)) {
        issues.push({ path, message: `expected a list, got ${describeValue(value)}` });
        return undefined;
      }
      const { min, max } = options;
      if ((min !== undefined && value.length < min) || (max !== undefined && value.length > max)) {
        const size = min === max ? `${min}` : rangeText(options).trim();
        issues.push({ path, message: `expected ${size} items, got ${value.length}` });
        return undefined;
      }
      const out: T[] = [];
      let valid = true;
      value.forEach((element, i) => {
        const parsed = item.parse(element, [...path, i], issues);
        if (parsed === undefined) valid = false;
        else out.push(parsed);
      });
      return valid ? out : undefined;
    },
  };
}

/** A list of exactly two integers, such as a horizontal position [x, z]. */
export function pair(options: NumberOptions = {}): Schema<[number, number]> {
  return list(int(options), { min: 2, max: 2 }) as Schema<[number, number]>;
}

type Shape = Record<string, Schema<unknown>>;
export type ObjectOf<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An object with known fields. Unknown fields are errors (YAML-001.b); missing fields take their
 * fallback or are errors. `check` adds rules that involve more than one field.
 */
export function object<S extends Shape>(
  shape: S,
  check?: (value: ObjectOf<S>, path: Path, issues: Issue[]) => void,
): Schema<ObjectOf<S>> {
  const keys = Object.keys(shape);
  return {
    description: 'an object',
    parse(value, path, issues) {
      if (!isPlainObject(value)) {
        issues.push({ path, message: `expected an object, got ${describeValue(value)}` });
        return undefined;
      }
      let valid = true;
      for (const key of Object.keys(value)) {
        if (!(key in shape)) {
          issues.push({
            path: [...path, key],
            message: `unknown field${didYouMean(key, keys)}`,
          });
          valid = false;
        }
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const schema = shape[key]!;
        if (!(key in value) || value[key] === null) {
          if (schema.fallback) {
            out[key] = schema.fallback.value;
          } else {
            issues.push({ path: [...path, key], message: 'missing required field' });
            valid = false;
          }
          continue;
        }
        const parsed = schema.parse(value[key], [...path, key], issues);
        if (parsed === undefined) valid = false;
        else out[key] = parsed;
      }
      if (!valid) return undefined;
      const result = out as ObjectOf<S>;
      const before = issues.length;
      check?.(result, path, issues);
      return issues.length === before ? result : undefined;
    },
  };
}

/** An object with arbitrary keys and values of one schema, e.g. weights by type name. */
export function record<T>(
  valueSchema: Schema<T>,
  options: { readonly minEntries?: number } = {},
): Schema<Record<string, T>> {
  return {
    description: `an object of ${valueSchema.description}`,
    parse(value, path, issues) {
      if (!isPlainObject(value)) {
        issues.push({ path, message: `expected an object, got ${describeValue(value)}` });
        return undefined;
      }
      const entries = Object.entries(value);
      if (options.minEntries !== undefined && entries.length < options.minEntries) {
        issues.push({ path, message: `expected at least ${options.minEntries} entries` });
        return undefined;
      }
      const out: Record<string, T> = {};
      let valid = true;
      for (const [key, element] of entries) {
        const parsed = valueSchema.parse(element, [...path, key], issues);
        if (parsed === undefined) valid = false;
        else out[key] = parsed;
      }
      return valid ? out : undefined;
    },
  };
}

/** Any value, passed through unchecked: validated later by another schema (structure params). */
export function unknownValue(): Schema<unknown> {
  return { description: 'any value', parse: (value) => value };
}

type Variants = Record<string, Schema<unknown>>;
export type VariantOf<V extends Variants> = {
  [K in keyof V]: { readonly kind: K; readonly value: Infer<V[K]> };
}[keyof V];

/** An object with exactly one of the given keys, e.g. `{ circle: {...} }` or `{ rect: {...} }`. */
export function variant<V extends Variants>(variants: V): Schema<VariantOf<V>> {
  const names = Object.keys(variants);
  const description = `an object with one of: ${names.join(', ')}`;
  return {
    description,
    parse(value, path, issues) {
      if (!isPlainObject(value) || Object.keys(value).length !== 1) {
        issues.push({ path, message: `expected ${description}` });
        return undefined;
      }
      const kind = Object.keys(value)[0]!;
      const schema = variants[kind];
      if (!schema) {
        issues.push({
          path: [...path, kind],
          message: `unknown kind: expected one of ${names.join(', ')}${didYouMean(kind, names)}`,
        });
        return undefined;
      }
      const parsed = schema.parse(value[kind], [...path, kind], issues);
      return parsed === undefined ? undefined : ({ kind, value: parsed } as VariantOf<V>);
    },
  };
}

/** Levenshtein distance, for "did you mean" hints. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

/** ` (did you mean "width"?)` when a candidate is close enough, otherwise an empty string. */
export function didYouMean(input: string, candidates: readonly string[]): string {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distance(input.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  const limit = Math.max(1, Math.floor(input.length / 3));
  return best !== undefined && bestDistance <= limit ? ` (did you mean "${best}"?)` : '';
}
