import { createInterface } from 'node:readline';
import { isCommand, runCommand } from '../core/dialogue/commands';
import { describeLine } from '../core/dialogue/lines';
import { markdownToText } from '../core/dialogue/markdown';
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
 * The console of the host (DIALOG-004): it prints every message of the world, as the console
 * of the views does; a typed line is a message of the player, to the character named by `@`
 * (id or name), or a command that starts with `/` (DIALOG-005.d, DIALOG-005.f).
 */
export function startConsole(session: HostSession, input: LineInput, terminal: Terminal): void {
  session.listen((line) => terminal.line(`${PREFIX}  ${describeLine(line, true)}`));
  terminal.line(
    `${PREFIX}  write here to speak as the player; @name to one character; /help for more`,
  );
  input.onLine((text) => {
    if (text.trim() === '') return;
    if (isCommand(text)) {
      const map = session.world?.result.map;
      const result = runCommand(
        text,
        map && { map, position: (id) => session.agents?.stateOf(id) },
      );
      if (result.ok) {
        for (const line of markdownToText(result.text)) terminal.line(`${PREFIX}  ${line}`);
      } else terminal.line(`${PREFIX}  ${result.error}`);
      return;
    }
    const said = session.playerSays(text);
    if (!said.ok) terminal.line(`${PREFIX}  cannot say it: ${said.error}`);
  });
}
