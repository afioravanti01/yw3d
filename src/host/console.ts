import { createInterface } from 'node:readline';
import { describeLine } from '../core/dialogue/lines';
import type { HostSession } from './session';
import { PREFIX, type Terminal } from './terminal';

/**
 * Lines typed in the terminal of the host (plan F06 P16). One reader of stdin serves both the
 * question of consent (PROTO-005) and the console: a pending question takes the next line.
 */
export interface LineInput {
  /** Every line typed when no question is waiting. */
  onLine(listener: (line: string) => void): void;
  /** Asks a question: the next line is its answer. */
  question(text: string): Promise<string>;
  close(): void;
}

/** The reader of an interactive terminal, or undefined when it is not one (DIALOG-004.c). */
export function terminalInput(
  input: NodeJS.ReadableStream & { readonly isTTY?: boolean },
  output: NodeJS.WritableStream,
): LineInput | undefined {
  if (!input.isTTY) return undefined;
  const reader = createInterface({ input, terminal: false });
  const listeners: ((line: string) => void)[] = [];
  let answer: ((line: string) => void) | undefined;
  reader.on('line', (line) => {
    if (answer) {
      const take = answer;
      answer = undefined;
      take(line);
    } else {
      for (const listener of listeners) listener(line);
    }
  });
  return {
    onLine: (listener) => listeners.push(listener),
    question: (text) =>
      new Promise((resolve) => {
        output.write(text);
        answer = resolve;
      }),
    close: () => reader.close(),
  };
}

/**
 * The console of the host (DIALOG-004): it prints what the player hears, and a typed line is
 * a sentence of the player, to the character named by `@id` (DIALOG-001.b–c).
 */
export function startConsole(session: HostSession, input: LineInput, terminal: Terminal): void {
  session.listen((line) => terminal.line(`${PREFIX}  ${describeLine(line, true)}`));
  terminal.line(
    `${PREFIX}  write here to speak as the player; @id at the start says it to someone`,
  );
  input.onLine((text) => {
    if (text.trim() === '') return;
    const said = session.playerSays(text);
    if (!said.ok) terminal.line(`${PREFIX}  cannot say it: ${said.error}`);
  });
}
