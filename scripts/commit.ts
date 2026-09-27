/**
 * Commits only when the checks pass (retro F06, plan F07 P1).
 *
 * Usage: npm run commit -- -m "T7.01: …" [more git commit arguments…]
 *
 * Runs `npm run check`; when it exits with 0 it runs `git commit` with the same arguments,
 * otherwise it prints the end of the output of the check and stops with its exit code.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Lines of the output of a failed check shown in the terminal. */
export const TAIL_LINES = 40;

export interface Run {
  /** Runs a command and returns its exit code and output (stdout and stderr together). */
  (command: string, args: readonly string[]): { readonly code: number; readonly output: string };
}

export function commitIfGreen(
  args: readonly string[],
  run: Run,
  print: (line: string) => void,
): number {
  if (args.length === 0) {
    print('Usage: npm run commit -- -m "<message>" [more git commit arguments…]');
    return 2;
  }
  print('commit: running npm run check…');
  const check = run('npm', ['run', 'check']);
  if (check.code !== 0) {
    const lines = check.output.trimEnd().split('\n');
    for (const line of lines.slice(-TAIL_LINES)) print(line);
    print(`commit: npm run check failed (exit code ${check.code}): nothing committed`);
    return check.code;
  }
  print('commit: npm run check passed');
  const commit = run('git', ['commit', ...args]);
  if (commit.output.trim() !== '') print(commit.output.trimEnd());
  return commit.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = commitIfGreen(
    process.argv.slice(2),
    (command, args) => {
      const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const code = result.status ?? 1;
      return { code, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
    },
    (line) => console.log(line),
  );
}
