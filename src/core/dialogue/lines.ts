import type { SpokenLine } from '../sim/simulation';

/**
 * A line of the conversation as the log and the console show it (DIALOG-002.a, DIALOG-004.a):
 * `Tobia: Dove devo andare?`, `Tu → Tobia: laghetto1`. The player's own sentences read «Tu»
 * where the player is the reader, the name elsewhere (A6.2).
 */
export function describeLine(line: SpokenLine, readerIsPlayer: boolean): string {
  const you = (id: string, name: string) => (id === 'player' && readerIsPlayer ? 'Tu' : name);
  const who = you(line.from, line.fromName);
  const to = line.to === null ? '' : ` → ${you(line.to, line.toName ?? line.to)}`;
  return `${who}${to}: ${line.text}`;
}
