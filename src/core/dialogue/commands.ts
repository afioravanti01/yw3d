/**
 * Commands of the message console (DIALOG-005.f, plan F07 P5): a line that starts with `/` is
 * for the console, not said in the world. F07 has only `/help`; the programming commands of
 * later phases go here.
 */
export type CommandResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly error: string };

export const HELP_LINES: readonly string[] = [
  'Write a message and press Enter: the characters within 16 blocks of you hear it.',
  '@name message: to one character, wherever it is (id or name; Tab completes it).',
  'Esc closes the box; the button at the top of the console collapses it.',
  '/help: this help.',
];

export function isCommand(text: string): boolean {
  return text.trimStart().startsWith('/');
}

export function runCommand(text: string): CommandResult {
  const [name = ''] = text.trim().slice(1).split(/\s+/, 1);
  if (name === 'help') return { ok: true, lines: HELP_LINES };
  return { ok: false, error: `unknown command "/${name}": write /help` };
}
