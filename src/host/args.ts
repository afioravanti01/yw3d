/** Options of the `yw3d` command (CLI-001). */
export interface CliOptions {
  /** World folder as given on the command line. */
  readonly folder: string;
  readonly port: number;
  /** Open the system browser on start (CLI-001.d). */
  readonly open: boolean;
  /** Listen on the local network, not only on this machine (Q4). */
  readonly lan: boolean;
  /** Replaces the terrain seed of the world file. */
  readonly seed: number | undefined;
  /** Runs the commands of the characters without asking (PROTO-005.a). */
  readonly allowCommands: boolean;
  /** Python interpreter of the programs, when not the default one (F07 Q2). */
  readonly python: string | undefined;
}

/** Options of `yw3d run`: a series of runs of the scenarios of a world (LAB-007). */
export interface SeriesCliOptions {
  readonly folder: string;
  readonly runs: number;
  /** Brains to compare, as written: `claude,model=sonnet,effort=low` (plan F10 P11). */
  readonly brains: readonly string[];
  /** Dollars the series may spend (LAB-007.c). */
  readonly budget: number | undefined;
  readonly allowCommands: boolean;
  readonly python: string | undefined;
}

export type ParsedArgs =
  | { readonly kind: 'run'; readonly options: CliOptions }
  | { readonly kind: 'series'; readonly options: SeriesCliOptions }
  /** `yw3d show <run> [--step n]` (LAB-005.d). */
  | { readonly kind: 'show'; readonly run: string; readonly step: number | undefined }
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string };

export const DEFAULT_PORT = 5180;
const MAX_SEED = 0xffffffff;

export const USAGE = `Usage: yw3d <folder> [options]
       yw3d run <folder> [--runs <n>] [--brain <brain>]… [--budget <dollars>] [--allow-commands]
       yw3d show <run> [--step <n>]

Starts a yw3d world from <folder>/world.yaml and opens it in the browser.
Structures in <folder>/structures/*.ts are loaded too: running yw3d on a folder
runs its code.

Options:
  --port <n>     port of the app (default ${DEFAULT_PORT})
  --no-open      do not open the browser
  --lan          accept connections from the local network (default: this machine only)
  --seed <n>     replace the terrain seed of world.yaml (0 … ${MAX_SEED})
  --allow-commands
                 run the commands and programs of the characters without asking
  --python <path>
                 Python interpreter of the programs (default: python3, python on Windows)
  -h, --help     show this help

yw3d run: runs the scenarios of the world again and again, without the browser, and
writes a trace of each run and a report in <folder>/runs.
  --runs <n>     runs of each brain (default 5)
  --brain <b>    a brain to compare, for the agents with a scenario; repeat it for more:
                 fake, claude, codex, opencode, anthropic or openai, with model= and
                 effort= after commas, e.g. claude,model=sonnet,effort=low
                 (default: the brains of world.yaml)
  --budget <d>   stop when the brains have reported this many dollars

yw3d show: the timeline of a run, from the folder of the run or its trace.jsonl.
  --step <n>     the whole context sent and the reply of step n`;

/** Parses the command-line arguments after `yw3d` (plan F04 P12). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv[0] === 'run') return parseSeriesArgs(argv.slice(1));
  if (argv[0] === 'show') return parseShowArgs(argv.slice(1));
  let folder: string | undefined;
  let port = DEFAULT_PORT;
  let open = true;
  let lan = false;
  let seed: number | undefined;
  let allowCommands = false;
  let python: string | undefined;
  const error = (message: string): ParsedArgs => ({ kind: 'error', message });

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => argv[++i];
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
      case '--no-open':
        open = false;
        break;
      case '--lan':
        lan = true;
        break;
      case '--allow-commands':
        allowCommands = true;
        break;
      case '--python': {
        const raw = value();
        if (raw === undefined || raw.trim() === '') {
          return error('--python needs the path of a Python interpreter');
        }
        python = raw;
        break;
      }
      case '--port': {
        const raw = value();
        const n = Number(raw);
        if (raw === undefined || !Number.isInteger(n) || n < 1 || n > 65535) {
          return error(`--port needs an integer between 1 and 65535, got ${raw ?? 'nothing'}`);
        }
        port = n;
        break;
      }
      case '--seed': {
        const raw = value();
        if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) > MAX_SEED) {
          return error(
            `--seed needs an integer between 0 and ${MAX_SEED}, got ${raw ?? 'nothing'}`,
          );
        }
        seed = Number(raw);
        break;
      }
      default:
        if (arg.startsWith('-')) return error(`unknown option ${arg}`);
        if (folder !== undefined)
          return error(`only one folder can be given, got ${folder} and ${arg}`);
        folder = arg;
    }
  }
  if (folder === undefined) return error('missing the world folder');
  return { kind: 'run', options: { folder, port, open, lan, seed, allowCommands, python } };
}

/** Parses `yw3d run <folder> …` (LAB-007.a, CLI-001.c). */
function parseSeriesArgs(argv: readonly string[]): ParsedArgs {
  let folder: string | undefined;
  let runs = 5;
  const brains: string[] = [];
  let budget: number | undefined;
  let allowCommands = false;
  let python: string | undefined;
  const error = (message: string): ParsedArgs => ({ kind: 'error', message });
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => argv[++i];
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
      case '--allow-commands':
        allowCommands = true;
        break;
      case '--python': {
        const raw = value();
        if (raw === undefined || raw.trim() === '') {
          return error('--python needs the path of a Python interpreter');
        }
        python = raw;
        break;
      }
      case '--runs': {
        const raw = value();
        const n = Number(raw);
        if (raw === undefined || !Number.isInteger(n) || n < 1 || n > 1000) {
          return error(`--runs needs an integer between 1 and 1000, got ${raw ?? 'nothing'}`);
        }
        runs = n;
        break;
      }
      case '--brain': {
        const raw = value();
        if (raw === undefined || raw.trim() === '') return error('--brain needs a brain');
        brains.push(raw);
        break;
      }
      case '--budget': {
        const raw = value();
        const n = Number(raw);
        if (raw === undefined || !Number.isFinite(n) || n <= 0) {
          return error(`--budget needs a positive number of dollars, got ${raw ?? 'nothing'}`);
        }
        budget = n;
        break;
      }
      default:
        if (arg.startsWith('-')) return error(`unknown option ${arg} of yw3d run`);
        if (folder !== undefined)
          return error(`only one folder can be given, got ${folder} and ${arg}`);
        folder = arg;
    }
  }
  if (folder === undefined) return error('yw3d run: missing the world folder');
  return { kind: 'series', options: { folder, runs, brains, budget, allowCommands, python } };
}

/** Parses `yw3d show <run> [--step n]` (LAB-005.d). */
function parseShowArgs(argv: readonly string[]): ParsedArgs {
  let run: string | undefined;
  let step: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') return { kind: 'help' };
    if (arg === '--step') {
      const raw = argv[++i];
      const n = Number(raw);
      if (raw === undefined || !Number.isInteger(n) || n < 1) {
        return { kind: 'error', message: `--step needs a step number, got ${raw ?? 'nothing'}` };
      }
      step = n;
    } else if (arg.startsWith('-')) {
      return { kind: 'error', message: `unknown option ${arg} of yw3d show` };
    } else if (run !== undefined) {
      return { kind: 'error', message: `only one run can be given, got ${run} and ${arg}` };
    } else {
      run = arg;
    }
  }
  if (run === undefined) return { kind: 'error', message: 'yw3d show: missing the run' };
  return { kind: 'show', run, step };
}
