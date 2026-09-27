/**
 * Commits only when the checks pass (retro F06, plan F07 P1).
 *
 * Usage: npm run commit -- -m "T7.01: …" [more git commit arguments…]
 *
 * Runs `npm run check`, and `npm run e2e` when the staged files touch what the end-to-end
 * tests exercise (or with `--e2e`); when they all exit with 0 it runs `git commit` with the
 * other arguments, otherwise it prints the end of the output of the failing one and stops with
 * its exit code (retro F07).
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Lines of the output of a failed check shown in the terminal. */
export const TAIL_LINES = 40;

export interface Run {
  /** Runs a command and returns its exit code and output (stdout and stderr together). */
  (command: string, args: readonly string[]): { readonly code: number; readonly output: string };
}

/** Staged files that the end-to-end tests exercise: the views and the tests themselves. */
export const E2E_PATHS =
  /^(src\/app\/|src\/render\/|src\/protocol\/|src\/host\/|index\.html$|e2e\/)/;

export function commitIfGreen(
  args: readonly string[],
  run: Run,
  print: (line: string) => void,
): number {
  // `--e2e` asks for the end-to-end tests even when no staged file needs them.
  const forced = args.includes('--e2e');
  const gitArgs = args.filter((a) => a !== '--e2e');
  if (gitArgs.length === 0) {
    print('Usage: npm run commit -- [--e2e] -m "<message>" [more git commit arguments…]');
    return 2;
  }
  const steps: [string, string[]][] = [['npm', ['run', 'check']]];
  const staged = run('git', ['diff', '--cached', '--name-only']).output.split('\n');
  if (forced || staged.some((file) => E2E_PATHS.test(file.trim()))) {
    steps.push(['npm', ['run', 'e2e']]);
  }
  for (const [command, commandArgs] of steps) {
    const name = `${command} ${commandArgs.join(' ')}`;
    print(`commit: running ${name}…`);
    const result = run(command, commandArgs);
    if (result.code !== 0) {
      const lines = result.output.trimEnd().split('\n');
      for (const line of lines.slice(-TAIL_LINES)) print(line);
      print(`commit: ${name} failed (exit code ${result.code}): nothing committed`);
      return result.code;
    }
    print(`commit: ${name} passed`);
  }
  const commit = run('git', ['commit', ...gitArgs]);
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
