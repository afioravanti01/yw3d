import { describe, expect, it } from 'vitest';
import { commitIfGreen, TAIL_LINES, type Run } from './commit';

function fake(checkCode: number, checkOutput = '') {
  const calls: string[] = [];
  const run: Run = (command, args) => {
    calls.push([command, ...args].join(' '));
    if (command === 'npm') return { code: checkCode, output: checkOutput };
    return { code: 0, output: '[main abc123] T7.01: test' };
  };
  const lines: string[] = [];
  return { run, calls, lines, print: (line: string) => lines.push(line) };
}

describe('commit only with the checks green (plan F07 P1)', () => {
  it('commits with the given arguments when npm run check passes', () => {
    const f = fake(0);
    expect(commitIfGreen(['-m', 'T7.01: test'], f.run, f.print)).toBe(0);
    expect(f.calls).toEqual(['npm run check', 'git commit -m T7.01: test']);
  });

  it('does not commit when npm run check fails, and shows the end of its output', () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const f = fake(1, output);
    expect(commitIfGreen(['-m', 'T7.01: test'], f.run, f.print)).toBe(1);
    expect(f.calls).toEqual(['npm run check']);
    expect(f.lines).toContain('line 99');
    expect(f.lines).not.toContain(`line ${99 - TAIL_LINES}`);
    expect(f.lines.at(-1)).toMatch(/nothing committed/);
  });

  it('needs the arguments of git commit', () => {
    const f = fake(0);
    expect(commitIfGreen([], f.run, f.print)).toBe(2);
    expect(f.calls).toEqual([]);
  });
});
