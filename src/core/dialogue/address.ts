import { words, type Nameable } from './understand';

/**
 * The addressee of a message of the player (DIALOG-005.d, plan F07 P3): `@` followed by the id
 * or the name of a character, with case and accents ignored. The longest match wins, so that
 * «@Nina la pescatrice» is not «@Nina» when both exist.
 */
export type Addressed =
  | { readonly ok: true; readonly to: string | null; readonly body: string }
  | { readonly ok: false; readonly error: string };

/** A word of the text with where it ends, to cut the body after the addressee. */
interface Token {
  readonly word: string;
  readonly end: number;
}

/** The same words as `words`, with their end in the original text. */
function tokens(text: string): Token[] {
  const found: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[#_-][\p{L}\p{M}\p{N}]+)*/gu)) {
    const [word] = words(m[0]);
    if (word !== undefined) found.push({ word, end: m.index + m[0].length });
  }
  return found;
}

/** How many leading words of `said` the phrase covers, or 0 when it does not match. */
function matchLength(said: readonly Token[], phrase: string): number {
  const wanted = words(phrase);
  if (wanted.length === 0 || wanted.length > said.length) return 0;
  return wanted.every((w, i) => said[i]!.word === w) ? wanted.length : 0;
}

const listOf = (characters: readonly Nameable[]) =>
  characters.map((c) => `${c.name} (${c.id})`).join(', ');

export function address(text: string, characters: readonly Nameable[]): Addressed {
  const trimmed = text.trim();
  if (!trimmed.startsWith('@')) return { ok: true, to: null, body: trimmed };
  const rest = trimmed.slice(1);
  const said = /^\s/.test(rest) ? [] : tokens(rest);
  let best = 0;
  let found: { character: Nameable; byId: boolean }[] = [];
  for (const c of characters) {
    const byId = matchLength(said, c.id);
    const length = Math.max(byId, matchLength(said, c.name));
    if (length === 0 || length < best) continue;
    if (length > best) found = [];
    best = length;
    found.push({ character: c, byId: byId === length });
  }
  // With the same length, an id beats a name (plan F07 P3).
  const byId = found.filter((f) => f.byId);
  if (byId.length === 1) found = byId;
  if (found.length === 0) {
    const written = rest.split(/\s/, 1)[0] ?? '';
    return {
      ok: false,
      error: `no character is called "${written}"; ${
        characters.length === 0
          ? 'there are no characters in this world'
          : `the characters are: ${listOf(characters)}`
      }`,
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      error: `"${rest.slice(0, said[best - 1]!.end)}" may be ${listOf(found.map((f) => f.character))}: write the id`,
    };
  }
  const body = rest
    .slice(said[best - 1]!.end)
    .replace(/^[\s,:;]+/, '')
    .trim();
  return { ok: true, to: found[0]!.character.id, body };
}

/**
 * The characters whose id or name starts with what follows `@` (DIALOG-005.d), by name. The
 * console shows them while the player writes the addressee.
 */
export function suggest(written: string, characters: readonly Nameable[]): Nameable[] {
  const prefix = words(written).join(' ');
  const starts = (text: string) => words(text).join(' ').startsWith(prefix);
  return characters
    .filter((c) => starts(c.id) || starts(c.name))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
