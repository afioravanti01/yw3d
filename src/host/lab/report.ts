import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PREFIX, type Terminal } from '../terminal';
import type { ScenarioResult } from './scenarioRun';
import type { SeriesResult } from './series';
import { readTrace, type TraceHeader } from './trace';

/**
 * The report of a series (LAB-007.e–f, plan F10 T10.10): for each condition and scenario, the
 * outcomes and the mean and spread of what the runs measured, read from their traces; in the
 * terminal and in `report.json`.
 */

export const REPORT_FILE = 'report.json';

/** Said in every report: the laboratory does not check what the agents declare (F10 Q3). */
export const DECLARED =
  'Outcomes are declared by the agents, not checked: replay some runs to see whether they are true.';

/** Mean and sample standard deviation of the known values; null when none is known. */
export interface Stat {
  readonly mean: number;
  readonly sd: number;
  /** Values known: runs, or requests for the latency. */
  readonly n: number;
  /** For the latency: the slowest request. */
  readonly max?: number;
}

export interface ScenarioReport {
  readonly scenario: string;
  readonly runs: number;
  readonly outcomes: Readonly<Record<ScenarioResult, number>>;
  readonly steps: Stat | null;
  readonly actions: Stat | null;
  readonly seconds: Stat | null;
  readonly input_tokens: Stat | null;
  readonly output_tokens: Stat | null;
  readonly cost_usd: Stat | null;
  readonly latency_ms: Stat | null;
  readonly discarded: Stat | null;
}

export interface Report {
  readonly type: 'report';
  readonly folder: string;
  readonly note: string;
  /** What the runs depend on, from the first trace (LAB-005.a). */
  readonly header: Omit<TraceHeader, 'type' | 'date' | 'brains'> | null;
  /** Differences among the traces of the series, e.g. a file changed while it ran. */
  readonly warnings: readonly string[];
  readonly spent_usd: number;
  readonly unknown_cost: boolean;
  readonly capped: boolean;
  readonly conditions: readonly {
    readonly condition: string;
    readonly scenarios: readonly ScenarioReport[];
  }[];
  readonly runs: readonly {
    readonly condition: string;
    readonly index: number;
    /** Relative to the folder of the series. */
    readonly trace: string | null;
    readonly outcomes: readonly { readonly scenario: string; readonly result: ScenarioResult }[];
  }[];
}

export function stat(values: readonly (number | null)[], withMax = false): Stat | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const sd =
    known.length > 1
      ? Math.sqrt(known.reduce((a, b) => a + (b - mean) ** 2, 0) / (known.length - 1))
      : 0;
  return { mean, sd, n: known.length, ...(withMax ? { max: Math.max(...known) } : {}) };
}

/** What a run measured for the agent of a scenario, from its trace. */
interface RunMeasures {
  readonly actions: number;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cost_usd: number | null;
  readonly latencies: number[];
  readonly discarded: number;
}

function measures(file: string | undefined, agent: string): RunMeasures | undefined {
  if (!file) return undefined;
  const { events } = readTrace(file);
  let actions = 0;
  let discarded = 0;
  const latencies: number[] = [];
  const sums = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };
  // A value the brain did not report makes the total of the run unknown (LAB-005.b).
  const unknown = { input_tokens: false, output_tokens: false, cost_usd: false };
  for (const e of events) {
    if (e.type !== 'agent' || e.agent !== agent) continue;
    if (e.kind === 'action') actions++;
    if (e.kind === 'failed') latencies.push(e.latency_ms);
    if (e.kind !== 'reply') continue;
    latencies.push(e.latency_ms);
    discarded += e.discarded.length;
    for (const key of ['input_tokens', 'output_tokens', 'cost_usd'] as const) {
      const value = e.usage[key];
      if (value === null) unknown[key] = true;
      else sums[key] += value;
    }
  }
  return {
    actions,
    discarded,
    latencies,
    input_tokens: unknown.input_tokens ? null : sums.input_tokens,
    output_tokens: unknown.output_tokens ? null : sums.output_tokens,
    cost_usd: unknown.cost_usd ? null : sums.cost_usd,
  };
}

export function buildReport(series: SeriesResult): Report {
  const conditions = [...new Set(series.runs.map((r) => r.condition))];
  const headers = series.runs.flatMap((r) => (r.trace ? [readTrace(r.trace).header] : []));
  const first = headers[0];
  const warnings: string[] = [];
  if (first) {
    const same = (h: TraceHeader) =>
      h.world.fingerprint === first.world.fingerprint &&
      JSON.stringify(h.scenario_files) === JSON.stringify(first.scenario_files) &&
      h.instructions.fingerprint === first.instructions.fingerprint;
    if (!headers.every(same)) {
      warnings.push('the world, the scenarios or the instructions changed during the series');
    }
  }
  return {
    type: 'report',
    folder: series.folder,
    note: DECLARED,
    header: first
      ? {
          yw3d: first.yw3d,
          world: first.world,
          scenario_files: first.scenario_files,
          seed: first.seed,
          scenarios: first.scenarios,
          instructions: first.instructions,
        }
      : null,
    warnings,
    spent_usd: series.spent,
    unknown_cost: series.unknownCost,
    capped: series.capped,
    conditions: conditions.map((condition) => {
      const runs = series.runs.filter((r) => r.condition === condition);
      const scenarios = [...new Set(runs.flatMap((r) => r.outcomes.map((o) => o.scenario)))];
      return {
        condition,
        scenarios: scenarios.map((scenario) => {
          const rows = runs.flatMap((run) => {
            const outcome = run.outcomes.find((o) => o.scenario === scenario);
            return outcome ? [{ outcome, measured: measures(run.trace, outcome.agent) }] : [];
          });
          const outcomes: Record<ScenarioResult, number> = {
            succeeded: 0,
            failed: 0,
            timeout: 0,
            steps: 0,
            error: 0,
          };
          for (const { outcome } of rows) outcomes[outcome.result]++;
          const of = (key: keyof Omit<RunMeasures, 'latencies'>) =>
            stat(rows.map((r) => (r.measured ? r.measured[key] : null)));
          return {
            scenario,
            runs: rows.length,
            outcomes,
            steps: stat(rows.map((r) => r.outcome.steps)),
            actions: of('actions'),
            seconds: stat(rows.map((r) => r.outcome.seconds)),
            input_tokens: of('input_tokens'),
            output_tokens: of('output_tokens'),
            cost_usd: of('cost_usd'),
            latency_ms: stat(
              rows.flatMap((r) => r.measured?.latencies ?? []),
              true,
            ),
            discarded: of('discarded'),
          };
        }),
      };
    }),
    runs: series.runs.map((r) => ({
      condition: r.condition,
      index: r.index,
      trace: r.trace ? path.relative(series.folder, r.trace) : null,
      outcomes: r.outcomes.map((o) => ({ scenario: o.scenario, result: o.result })),
    })),
  };
}

export function writeReport(report: Report): string {
  const file = path.join(report.folder, REPORT_FILE);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

const fixed = (v: number, digits: number) => v.toFixed(digits);
function show(s: Stat | null, digits = 1): string {
  if (!s) return 'unknown';
  return `${fixed(s.mean, digits)} ± ${fixed(s.sd, digits)}${s.max !== undefined ? ` (max ${fixed(s.max, digits)})` : ''}`;
}

/** The report in the terminal: a table for each condition, then what to keep in mind. */
export function printReport(terminal: Terminal, report: Report, file: string): void {
  const line = (text: string) => terminal.line(`${PREFIX}  ${text}`);
  line('report of the series');
  const columns = [
    'scenario',
    'succeeded',
    'failed',
    'time out',
    'steps over',
    'errors',
    'steps',
    'actions',
    'seconds',
    'tokens in',
    'tokens out',
    'cost $',
    'latency ms',
  ];
  for (const { condition, scenarios } of report.conditions) {
    line('');
    line(`brain: ${condition}`);
    const rows = scenarios.map((s) => [
      s.scenario,
      `${s.outcomes.succeeded}/${s.runs}`,
      String(s.outcomes.failed),
      String(s.outcomes.timeout),
      String(s.outcomes.steps),
      String(s.outcomes.error),
      show(s.steps),
      show(s.actions),
      show(s.seconds),
      show(s.input_tokens, 0),
      show(s.output_tokens, 0),
      show(s.cost_usd, 4),
      show(s.latency_ms, 0),
    ]);
    const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i]!.length)));
    const format = (cells: readonly string[]) =>
      cells
        .map((cell, i) => cell.padEnd(widths[i]!))
        .join('  ')
        .trimEnd();
    line(format(columns));
    for (const row of rows) line(format(row));
  }
  line('');
  line(`mean ± standard deviation over the runs; latency over every request`);
  line(
    `spent: $${report.spent_usd.toFixed(4)}${
      report.unknown_cost ? ' (some brains report no cost: those requests are not counted)' : ''
    }${report.capped ? ' · stopped at the spending cap' : ''}`,
  );
  for (const warning of report.warnings) line(`warning: ${warning}`);
  line(report.note);
  if (report.header) {
    line(
      `instructions ${report.header.instructions.name} (${report.header.instructions.fingerprint}) · world ${report.header.world.fingerprint} · yw3d ${report.header.yw3d}`,
    );
  }
  line(`report: ${file}`);
}
