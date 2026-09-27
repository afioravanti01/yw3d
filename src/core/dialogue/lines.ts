import type { SpokenLine } from '../sim/simulation';

/**
 * A line of the conversation as the log and the console show it (DIALOG-002.a, DIALOG-004.a):
 * `Tobia: Dove devo andare?`, `Tu → Tobia: laghetto1`. The player's own sentences read «Tu»
 * where the player is the reader, the name elsewhere (A6.2).
 */
export function describeLine(line: SpokenLine, readerIsPlayer: boolean): string {
  const who = line.from === 'player' && readerIsPlayer ? 'Tu' : line.fromName;
  const to = line.toName === null ? '' : ` → ${line.toName}`;
  return `${who}${to}: ${line.text}`;
}
