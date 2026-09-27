import { describe, expect, it } from 'vitest';
import { HELP_LINES, isCommand, runCommand } from './commands';

describe('commands of the console', () => {
  it('DIALOG-005.f: a line that starts with / is a command; /help describes the console', () => {
    expect(isCommand('/help')).toBe(true);
    expect(isCommand('  /help')).toBe(true);
    expect(isCommand('ciao /help')).toBe(false);
    expect(isCommand('@tobia /help')).toBe(false);
    expect(runCommand('/help')).toEqual({ ok: true, lines: HELP_LINES });
    expect(HELP_LINES.join(' ')).toMatch(/@name/);
    expect(HELP_LINES.join(' ')).toMatch(/Tab/);
  });

  it('DIALOG-005.f: an unknown command is an error that points to /help', () => {
    expect(runCommand('/vola alto')).toEqual({
      ok: false,
      error: 'unknown command "/vola": write /help',
    });
    expect(runCommand('/')).toEqual({ ok: false, error: 'unknown command "/": write /help' });
  });
});
