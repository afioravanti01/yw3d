import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseArgs, USAGE } from './args';
import { startHostServer } from './server';
import { consoleTerminal, PREFIX, type Terminal } from './terminal';
import { resolveWorldFolder } from './worldFolder';

/**
 * The `yw3d <folder>` command (CLI-001). Returns the exit code when it ends at once (help,
 * errors); otherwise the host keeps running until the process is stopped.
 */
export async function main(
  argv: readonly string[],
  terminal: Terminal = consoleTerminal,
): Promise<number> {
  const start = performance.now();
  const parsed = parseArgs(argv);
  if (parsed.kind === 'help') {
    terminal.line(USAGE);
    return 0;
  }
  if (parsed.kind === 'error') {
    terminal.line(`${PREFIX}: ${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  const { options } = parsed;
  const resolved = resolveWorldFolder(options.folder);
  if (!resolved.ok) {
    terminal.line(`${PREFIX}: ${resolved.message}`);
    return 1;
  }
  const host = await startHostServer(resolved.folder, options, terminal);
  terminal.line(`${PREFIX}  ready in ${Math.round(performance.now() - start)} ms: ${host.url}`);
  if (!options.lan)
    terminal.line(`${PREFIX}  reachable from this machine only (use --lan for the local network)`);
  if (options.open) openBrowser(host.url);
  const stop = () => {
    void host.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return 0;
}

/** Opens the system browser on a URL (plan F04 P12). */
function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}
