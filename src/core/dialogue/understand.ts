/**
 * Understanding sentences without an LLM (DIALOG-003, plan F06 P11): deterministic rules on
 * whole words, the same for behaviors and for the protocol.
 */

/** Something a sentence can name: an element of the map. */
export interface Nameable {
  readonly id: string;
  readonly name: string;
}

/** Words that say yes and no, in Italian and English (F06 Q5). «non» is not a no. */
export const YES_WORDS = [
  'sì',
  'si',
  'certo',
  'ok',
  'va bene',
  "d'accordo",
  'volentieri',
  'yes',
  'yeah',
  'sure',
] as const;
export const NO_WORDS = ['no', 'nope', 'nah'] as const;

/**
 * The words of a text: lower case, without accents, punctuation as spaces. `#`, `_` and `-`
 * inside a word keep it whole, so that ids such as `pond#1` or `casa_fabbro` are one word.
 */
export function words(text: string): string[] {
  const plain = text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
  return plain.match(/[\p{L}\p{N}]+(?:[#_-][\p{L}\p{N}]+)*/gu) ?? [];
}

interface Match {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Where each phrase (a key with its texts) occurs in the words, as whole words. A match inside
 * a longer one does not count (DIALOG-003.a): «casa del fabbro» names only that element, even
 * if another one is called «casa».
 */
function matches(
  sentence: readonly string[],
  phrases: readonly (readonly [string, string])[],
): Match[] {
  const found: Match[] = [];
  for (const [key, text] of phrases) {
    const phrase = words(text);
    if (phrase.length === 0) continue;
    for (let i = 0; i + phrase.length <= sentence.length; i++) {
      if (phrase.every((w, j) => sentence[i + j] === w)) {
        found.push({ key, start: i, end: i + phrase.length });
      }
    }
  }
  return found.filter(
    (m) =>
      !found.some(
        (o) => o !== m && o.start <= m.start && o.end >= m.end && o.end - o.start > m.end - m.start,
      ),
  );
}

const distinct = (found: readonly Match[]) => [...new Set(found.map((m) => m.key))];

/** Ids of the elements a sentence names, by id or by name (DIALOG-003.a), in order of id. */
export function mentions(text: string, elements: readonly Nameable[]): string[] {
  const phrases = elements.flatMap((e) => [[e.id, e.id] as const, [e.id, e.name] as const]);
  return distinct(matches(words(text), phrases)).sort();
}

/** The element a sentence names, when it names exactly one (DIALOG-003.b). */
export function understandElement(text: string, elements: readonly Nameable[]): string | undefined {
  const named = mentions(text, elements);
  return named.length === 1 ? named[0] : undefined;
}

/** Yes or no, when the sentence has words of one kind only (DIALOG-003.c). */
export function understandYesNo(text: string): 'yes' | 'no' | undefined {
  const found = distinct(
    matches(words(text), [
      ...YES_WORDS.map((w) => ['yes', w] as const),
      ...NO_WORDS.map((w) => ['no', w] as const),
    ]),
  );
  return found.length === 1 ? (found[0] as 'yes' | 'no') : undefined;
}

/** The option a sentence names, when it names exactly one (DIALOG-003.c). */
export function understandChoice(text: string, options: readonly string[]): string | undefined {
  const found = distinct(
    matches(
      words(text),
      options.map((o) => [o, o] as const),
    ),
  );
  return found.length === 1 ? found[0] : undefined;
}
