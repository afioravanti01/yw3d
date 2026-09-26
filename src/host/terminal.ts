import { formatDiagnostic, type Diagnostic } from '../core/yaml/report';

/** Where the host writes for the user (HOST-001.c): the terminal, or a list in tests. */
export interface Terminal {
  line(text: string): void;
}

export const consoleTerminal: Terminal = { line: (text) => console.log(text) };

/** Prefix of every line of the host, to tell it apart from other output. */
export const PREFIX = 'yw3d';

export function printDiagnostics(terminal: Terminal, diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) terminal.line(`${PREFIX}  ${formatDiagnostic(d)}`);
}
