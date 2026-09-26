import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { HostSession } from '../session';
import { PREFIX, type Terminal } from '../terminal';
import { ControllerLink } from './link';

export interface RunningController {
  readonly characterId: string;
  stop(): void;
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
): RunningController {
  const tag = `${PREFIX}  [${characterId}]`;
  const child = spawn(command, { shell: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
  );
  child.stdin.on('drain', () => link.drained());
  // A controller that closes its input early must not break the host.
  child.stdin.on('error', () => {});
  terminal.line(`${tag} controller started: ${command}`);
  link.start();

  createInterface({ input: child.stdout }).on('line', (line) => link.receive(line));
  createInterface({ input: child.stderr }).on('line', (line) => terminal.line(`${tag} ${line}`));
  child.on('error', (error) => {
    terminal.line(`${tag} cannot start the controller: ${error.message}`);
    link.close();
  });
  child.on('exit', (code, signal) => {
    link.close();
    if (stopping) return;
    terminal.line(
      `${tag} controller ended (${signal ? `signal ${signal}` : `exit code ${code}`}): the character stops`,
    );
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
