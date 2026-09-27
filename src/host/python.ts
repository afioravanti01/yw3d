import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Python programs of the world folder (PY-001, PY-003, plan F07 P7): which interpreter, whether
 * it is recent enough, the command that runs a program and the environment that gives it the
 * `yw3d` library without installing anything.
 */

/** Oldest Python the library works with (PY-001.b). */
export const MIN_PYTHON: readonly [number, number] = [3, 10];

/** The folder that holds the `yw3d` package of the library, in this project. */
export const LIBRARY_PATH = fileURLToPath(new URL('../../python', import.meta.url));

/** `python3` from the PATH, `python` on Windows (F07 Q2). */
export function defaultPython(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'python' : 'python3';
}

export type PythonCheck =
  { readonly ok: true; readonly version: string } | { readonly ok: false; readonly error: string };

/** Runs a command and returns its exit code and output, for the version check. */
export type RunSync = (
  command: string,
  args: readonly string[],
) => { readonly status: number | null; readonly stdout: string; readonly error?: Error };

const runSync: RunSync = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10_000 });
  return { status: result.status, stdout: result.stdout ?? '', error: result.error };
};

/** Whether the interpreter runs and is Python 3.10 or later (PY-003.b). */
export function checkPython(python: string, run: RunSync = runSync): PythonCheck {
  const result = run(python, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
  const version = /^(\d+)\.(\d+)/.exec(result.stdout.trim());
  if (result.error || result.status !== 0 || !version) {
    return {
      ok: false,
      error: `Python was not found ("${python}"): install Python ${MIN_PYTHON.join('.')} or later, or give its path with --python`,
    };
  }
  const [major, minor] = [Number(version[1]), Number(version[2])];
  if (major < MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor < MIN_PYTHON[1])) {
    return {
      ok: false,
      error: `Python ${major}.${minor} ("${python}") is older than ${MIN_PYTHON.join('.')}: install a newer one, or give its path with --python`,
    };
  }
  return { ok: true, version: `${major}.${minor}` };
}

/** Quotes a word for the shell when it needs it. */
function quoted(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `"${word.replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * The command that runs a program, as the consent shows it and as it runs (PY-003.a): the
 * interpreter, `-u` for unbuffered lines, the file relative to the world folder.
 */
export function programCommand(python: string, program: string): string {
  return `${quoted(python)} -u ${quoted(program)}`;
}

/** The environment of a program: the library on the import path, no `__pycache__` written. */
export function programEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const paths = [LIBRARY_PATH, ...(base.PYTHONPATH ? [base.PYTHONPATH] : [])];
  return {
    ...base,
    PYTHONPATH: paths.join(path.delimiter),
    // Written bytecode would reload the world at every start (plan F07 P7).
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
    // Plain tracebacks: Python 3.13 colors them when FORCE_COLOR is set, and the host prefixes
    // every line of the program in its own terminal (PY-003.c).
    PYTHON_COLORS: '0',
  };
}
