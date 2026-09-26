import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PREFIX, type Terminal } from './terminal';

/** A command a world wants to run, and the character it drives. */
export interface DeclaredCommand {
  readonly id: string;
  readonly command: string;
}

/** Answers whether the commands of a world may run (PROTO-005). */
export type CommandConsent = (commands: readonly DeclaredCommand[]) => Promise<boolean>;

/** Where consents are remembered: outside every world folder (PROTO-005.c, plan F05 P11). */
export interface ConsentStore {
  get(folder: string): string | undefined;
  set(folder: string, fingerprint: string): void;
}

/** `~/.yw3d/consent.json`: folder path → fingerprint of its commands. */
export function fileConsentStore(home = homedir()): ConsentStore {
  const file = path.join(home, '.yw3d', 'consent.json');
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };
  return {
    get: (folder) => read()[folder],
    set(folder, fingerprint) {
      const all = read();
      all[folder] = fingerprint;
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
    },
  };
}

/** Fingerprint of a set of commands: any change, or a new command, gives a new one. */
export function fingerprint(commands: readonly DeclaredCommand[]): string {
  const lines = [...new Set(commands.map((c) => c.command))].sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export interface ConsentOptions {
  /** Absolute path of the world folder. */
  readonly folder: string;
  /** `--allow-commands`: consent without asking. */
  readonly allowAll: boolean;
  readonly store: ConsentStore;
  readonly terminal: Terminal;
  /** Asks the user a yes/no question; undefined when there is no interactive terminal. */
  readonly ask: ((question: string) => Promise<string>) | undefined;
}

/**
 * The consent of the user to run the commands of a folder (PROTO-005.a, c): given with
 * `--allow-commands`, remembered for the folder while its commands do not change, or asked in
 * the terminal. Without an interactive terminal nothing is asked and nothing runs.
 */
export function commandConsent(options: ConsentOptions): CommandConsent {
  const refused = new Set<string>();
  return async (commands) => {
    if (commands.length === 0) return true;
    const { terminal, store, folder } = options;
    if (options.allowAll) return true;
    const print = fingerprint(commands);
    if (store.get(folder) === print) {
      terminal.line(`${PREFIX}  running the commands already allowed for this folder`);
      return true;
    }
    if (refused.has(print)) return false;
    terminal.line(`${PREFIX}  this world wants to run these commands:`);
    const width = Math.max(...commands.map((c) => c.id.length));
    for (const c of commands) terminal.line(`        ${c.id.padEnd(width)}  ${c.command}`);
    if (!options.ask) {
      terminal.line(
        `${PREFIX}  not running them: start yw3d from a terminal to allow them, or use --allow-commands`,
      );
      refused.add(print);
      return false;
    }
    const answer = (await options.ask(`${PREFIX}  run them? [y/N] `)).trim().toLowerCase();
    if (
      answer === 'y' ||
      answer === 'yes' ||
      answer === 's' ||
      answer === 'si' ||
      answer === 'sì'
    ) {
      store.set(folder, print);
      terminal.line(`${PREFIX}  allowed; remembered for this folder until its commands change`);
      return true;
    }
    refused.add(print);
    terminal.line(`${PREFIX}  not allowed: the characters with a command stand still`);
    return false;
  };
}

/**
 * Finds the program of a command (its first word) in the world folder or in the PATH (plan
 * F05 P12). Returns undefined when it is not found.
 */
export function findProgram(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const program = command.trim().split(/\s+/)[0] ?? '';
  if (program === '') return undefined;
  const extensions =
    platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')] : [''];
  const executable = (file: string) => {
    try {
      if (!existsSync(file) || !statSync(file).isFile()) return false;
      if (platform !== 'win32') accessSync(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  // A path: relative to the world folder.
  if (program.includes('/') || program.includes('\\')) {
    const file = path.resolve(cwd, program);
    return extensions.map((e) => file + e).find(executable);
  }
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const found = extensions.map((e) => path.join(dir, program + e)).find(executable);
    if (found) return found;
  }
  return undefined;
}

/** Reports the commands whose program is missing (PROTO-005.b); returns the ones that exist. */
export function checkPrograms(
  commands: readonly DeclaredCommand[],
  cwd: string,
  terminal: Terminal,
): DeclaredCommand[] {
  return commands.filter((c) => {
    if (findProgram(c.command, cwd)) return true;
    const program = c.command.trim().split(/\s+/)[0];
    terminal.line(`${PREFIX}  [${c.id}] the program "${program}" of "${c.command}" was not found`);
    return false;
  });
}
