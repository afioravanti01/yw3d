import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { HostSession } from '../session';
import { PREFIX, type Terminal } from '../terminal';
import { ControllerLink } from './link';

export interface RunningController {
  readonly characterId: string;
  stop(): void;
}

/** How a process ended: by itself with code 0, or with an error (plan F07 P15). */
export type ProcessEnd = 'stopped' | 'error';

export interface StdioOptions {
  /** A Python program of the world folder (PY-003): a client may take it over (PROTO-004.a). */
  readonly program?: boolean;
  /** Environment of the process; the host's own when absent. */
  readonly env?: NodeJS.ProcessEnv;
  /** The process ended on its own, not stopped by the host. */
  readonly ended?: (end: ProcessEnd) => void;
}

/**
 * Starts the controller of a character as a process of the world folder (PROTO-003.a, plan
 * F05 P9): JSON lines on stdin and stdout, stderr in the terminal with the character's name.
 * When the process ends, the character stops and the terminal says so (PROTO-003.b).
 */
export function startStdioController(
  characterId: string,
  command: string,
  cwd: string,
  session: HostSession,
  terminal: Terminal,
  now: () => number,
  options: StdioOptions = {},
): RunningController {
  const tag = `${PREFIX}  [${characterId}]`;
  const what = options.program ? 'program' : 'controller';
  const child = spawn(command, {
    shell: true,
    cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stopping = false;
  const link = new ControllerLink(
    characterId,
    session,
    {
      send: (text) => {
        if (!child.stdin.writable) return true;
        return child.stdin.write(`${text}\n`);
      },
    },
    terminal,
    now,
    options.program === true,
  );
  child.stdin.on('drain', () => link.drained());
  // A controller that closes its input early must not break the host.
  child.stdin.on('error', () => {});
  terminal.line(`${tag} ${what} started: ${command}`);
  link.start();

  createInterface({ input: child.stdout }).on('line', (line) => link.receive(line));
  createInterface({ input: child.stderr }).on('line', (line) => terminal.line(`${tag} ${line}`));
  child.on('error', (error) => {
    terminal.line(`${tag} cannot start the ${what}: ${error.message}`);
    link.close();
    if (!stopping) options.ended?.('error');
  });
  child.on('exit', (code, signal) => {
    link.close();
    if (stopping) return;
    terminal.line(
      `${tag} ${what} ended (${signal ? `signal ${signal}` : `exit code ${code}`}): the character stops`,
    );
    options.ended?.(code === 0 ? 'stopped' : 'error');
  });

  return {
    characterId,
    stop() {
      stopping = true;
      link.close();
      child.stdin.end();
      child.kill();
    },
  };
}
