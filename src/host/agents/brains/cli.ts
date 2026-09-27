import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BrainError } from '../brain';

/**
 * Runs a CLI of the machine for one request (plan F08 P6): the context on stdin, a temporary
 * working folder outside the world folder, the process ended when the request is aborted.
 */
export interface CliRun {
  readonly stdout: string;
  readonly stderr: string;
}

/** A temporary folder where the CLIs of the agents run: never the world folder. */
export function agentWorkFolder(): string {
  return mkdtempSync(path.join(tmpdir(), 'yw3d-agent-'));
}

export function runCli(
  command: string,
  args: readonly string[],
  input: string,
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly signal: AbortSignal },
): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const abort = () => child.kill('SIGTERM');
    options.signal.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => reject(new BrainError(`cannot run ${command}: ${error.message}`)));
    child.on('close', (code) => {
      options.signal.removeEventListener('abort', abort);
      if (options.signal.aborted) return reject(new BrainError(`${command} was stopped`));
      if (code !== 0) {
        const reason = firstLine(stderr) || firstLine(stdout) || `exit code ${code}`;
        return reject(new BrainError(`${command} failed: ${reason}`));
      }
      resolve({ stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** The first non-empty line of an output, short enough for the terminal. */
export function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '') ?? '';
  return line.trim().slice(0, 200);
}
