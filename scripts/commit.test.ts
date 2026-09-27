import { describe, expect, it } from 'vitest';
import { commitIfGreen, TAIL_LINES, type Run } from './commit';

function fake(options: { check?: number; e2e?: number; output?: string; staged?: string[] } = {}) {
  const calls: string[] = [];
  const run: Run = (command, args) => {
    const line = [command, ...args].join(' ');
    if (line !== 'git diff --cached --name-only') calls.push(line);
    if (line === 'git diff --cached --name-only') {
      return { code: 0, output: (options.staged ?? ['src/core/x.ts']).join('\n') };
    }
    if (line === 'npm run check') return { code: options.check ?? 0, output: options.output ?? '' };
    if (line === 'npm run e2e') return { code: options.e2e ?? 0, output: options.output ?? '' };
    return { code: 0, output: '[main abc123] T7.01: test' };
  };
  const lines: string[] = [];
  return { run, calls, lines, print: (line: string) => lines.push(line) };
}

describe('commit only with the checks green (plan F07 P1, retro F07)', () => {
  it('commits with the given arguments when npm run check passes', () => {
    const f = fake();
    expect(commitIfGreen(['-m', 'T7.01: test'], f.run, f.print)).toBe(0);
    expect(f.calls).toEqual(['npm run check', 'git commit -m T7.01: test']);
  });

  it('does not commit when npm run check fails, and shows the end of its output', () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const f = fake({ check: 1, output });
    expect(commitIfGreen(['-m', 'T7.01: test'], f.run, f.print)).toBe(1);
    expect(f.calls).toEqual(['npm run check']);
    expect(f.lines).toContain('line 99');
    expect(f.lines).not.toContain(`line ${99 - TAIL_LINES}`);
    expect(f.lines.at(-1)).toMatch(/nothing committed/);
  });

  it('runs the end-to-end tests too when the staged files touch the views, or with --e2e', () => {
    const ui = fake({ staged: ['src/app/main.ts', 'README.md'] });
    expect(commitIfGreen(['-m', 'x'], ui.run, ui.print)).toBe(0);
    expect(ui.calls).toEqual(['npm run check', 'npm run e2e', 'git commit -m x']);
    const red = fake({ staged: ['e2e/smoke.spec.ts'], e2e: 1 });
    expect(commitIfGreen(['-m', 'x'], red.run, red.print)).toBe(1);
    expect(red.calls).toEqual(['npm run check', 'npm run e2e']);
    expect(red.lines.at(-1)).toBe('commit: npm run e2e failed (exit code 1): nothing committed');
    const forced = fake({ staged: ['sdd/roadmap.md'] });
    expect(commitIfGreen(['--e2e', '-m', 'x'], forced.run, forced.print)).toBe(0);
    expect(forced.calls).toEqual(['npm run check', 'npm run e2e', 'git commit -m x']);
  });

  it('needs the arguments of git commit', () => {
    const f = fake();
    expect(commitIfGreen([], f.run, f.print)).toBe(2);
    expect(commitIfGreen(['--e2e'], f.run, f.print)).toBe(2);
    expect(f.calls).toEqual([]);
  });
});
