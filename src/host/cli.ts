import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseArgs, USAGE, type SeriesCliOptions } from './args';
import { parseBrain, runSeries, type BrainCondition } from './lab/series';
import { buildReport, printReport, writeReport } from './lab/report';
import { createModuleServer, viteModuleLoader } from './moduleLoader';
import { startConsole, terminalInput } from './console';
import { commandConsent, fileConsentStore } from './consent';
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
  if (parsed.kind === 'series') return series(parsed.options, terminal);
  const { options } = parsed;
  const resolved = resolveWorldFolder(options.folder);
  if (!resolved.ok) {
    terminal.line(`${PREFIX}: ${resolved.message}`);
    return 1;
  }
  // One reader of an interactive stdin, for the consent and then the console (plan F06 P16).
  const input = terminalInput(process.stdin, process.stdout);
  const consent = commandConsent({
    folder: resolved.folder.root,
    allowAll: options.allowCommands,
    store: fileConsentStore(),
    terminal,
    // Ask only on an interactive terminal: tests and scripts must never hang (plan F05 P11).
    ask: input ? (question) => input.question(question) : undefined,
  });
  const host = await startHostServer(resolved.folder, options, terminal, consent);
  if (input) startConsole(host.session, input, terminal);
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

/** `yw3d run <folder>`: a series of runs of the scenarios, without views (LAB-007). */
async function series(options: SeriesCliOptions, terminal: Terminal): Promise<number> {
  const resolved = resolveWorldFolder(options.folder);
  if (!resolved.ok) {
    terminal.line(`${PREFIX}: ${resolved.message}`);
    return 1;
  }
  const brains: BrainCondition[] = [];
  for (const spec of options.brains) {
    const brain = parseBrain(spec);
    if (typeof brain === 'string') {
      terminal.line(`${PREFIX}: ${brain}\n\n${USAGE}`);
      return 2;
    }
    brains.push(brain);
  }
  const input = terminalInput(process.stdin, process.stdout);
  const consent = commandConsent({
    folder: resolved.folder.root,
    allowAll: options.allowCommands,
    store: fileConsentStore(),
    terminal,
    ask: input ? (question) => input.question(question) : undefined,
  });
  const vite = await createModuleServer();
  try {
    const result = await runSeries({
      folder: resolved.folder,
      loader: viteModuleLoader(vite),
      terminal,
      consent,
      runs: options.runs,
      brains,
      ...(options.budget !== undefined ? { budget: options.budget } : {}),
      ...(options.python ? { python: options.python } : {}),
    });
    const report = buildReport(result);
    printReport(terminal, report, writeReport(report));
    return 0;
  } catch (error) {
    terminal.line(`${PREFIX}: ${(error as Error).message}`);
    return 1;
  } finally {
    input?.close?.();
    await vite.close();
  }
}
