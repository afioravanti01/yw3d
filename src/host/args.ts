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
}

export type ParsedArgs =
  | { readonly kind: 'run'; readonly options: CliOptions }
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string };

export const DEFAULT_PORT = 5180;
const MAX_SEED = 0xffffffff;

export const USAGE = `Usage: yw3d <folder> [options]

Starts a yw3d world from <folder>/world.yaml and opens it in the browser.
Structures in <folder>/structures/*.ts are loaded too: running yw3d on a folder
runs its code.

Options:
  --port <n>     port of the app (default ${DEFAULT_PORT})
  --no-open      do not open the browser
  --lan          accept connections from the local network (default: this machine only)
  --seed <n>     replace the terrain seed of world.yaml (0 … ${MAX_SEED})
  --allow-commands
                 run the commands of the characters without asking
  -h, --help     show this help`;

/** Parses the command-line arguments after `yw3d` (plan F04 P12). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let folder: string | undefined;
  let port = DEFAULT_PORT;
  let open = true;
  let lan = false;
  let seed: number | undefined;
  let allowCommands = false;
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
  return { kind: 'run', options: { folder, port, open, lan, seed, allowCommands } };
}
