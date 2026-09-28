import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SpokenLine } from '../../core/sim/simulation';
import type { AgentDecl } from '../../core/yaml/worldFile';
import type { Scenario } from '../../core/yaml/scenarioFile';
import type { AgentActivity } from '../agents/runtime';
import type { ScenarioOutcome } from './scenarioRun';

/**
 * The trace of a run (LAB-005, plan F10 P8): JSON lines in `runs/<run>/trace.jsonl`, a header
 * first and then one line per event, written as the run goes, so that nothing is lost if it
 * stops. A run goes from the start of the scenarios to the end of the last one.
 */

/** The folder of the runs, inside the world folder (F10 Q7). */
export const RUNS_DIR = 'runs';
export const TRACE_FILE = 'trace.jsonl';

/** The first 12 hex digits of the SHA-256 of a text: the fingerprint of a file. */
export function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** How the brain of an agent is written in a trace: never its key (LAB-005.c). */
export interface BrainOfAgent {
  readonly agent: string;
  readonly mode: AgentDecl['mode'];
  readonly cli: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly effort: string | null;
}

export function brainOf(agent: string, decl: AgentDecl): BrainOfAgent {
  return {
    agent,
    mode: decl.mode,
    cli: decl.cli ?? null,
    provider: decl.provider ?? null,
    model: decl.model ?? null,
    effort: decl.effort ?? null,
  };
}

export interface TraceHeader {
  readonly type: 'header';
  /** Version of yw3d that ran. */
  readonly yw3d: string;
  readonly date: string;
  readonly world: { readonly name: string; readonly file: string; readonly fingerprint: string };
  /** Fingerprints of the imported scenario files, by file. */
  readonly scenario_files: Readonly<Record<string, string>>;
  readonly seed: number;
  readonly scenarios: readonly {
    readonly id: string;
    readonly name: string;
    readonly agent: string;
    readonly task: string;
    readonly time_limit: number;
    readonly max_steps: number;
    readonly file: string;
  }[];
  readonly brains: readonly BrainOfAgent[];
  readonly instructions: { readonly name: string; readonly fingerprint: string };
}

/** An event of a trace, at a simulated time `t` in seconds from the start of the run. */
export type TraceEvent = { readonly t: number } & (
  | ({ readonly type: 'agent'; readonly agent: string } & AgentActivity)
  | { readonly type: 'said'; readonly line: SpokenLine }
  | ({ readonly type: 'outcome' } & ScenarioOutcome)
  | { readonly type: 'perturbation'; readonly scenario: string; readonly what: unknown }
  | { readonly type: 'end'; readonly reason: string }
);

export type TraceLine = TraceHeader | TraceEvent;

export function scenarioOfHeader(s: Scenario): TraceHeader['scenarios'][number] {
  return {
    id: s.id,
    name: s.name,
    agent: s.agent,
    task: s.task,
    time_limit: s.time_limit,
    max_steps: s.max_steps,
    file: s.file,
  };
}

/** A name for the folder of a run: the date and time, safe on every file system. */
export function runName(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace('Z', '');
}

export class TraceWriter {
  readonly file: string;

  constructor(
    readonly folder: string,
    header: TraceHeader,
  ) {
    mkdirSync(folder, { recursive: true });
    this.file = path.join(folder, TRACE_FILE);
    appendFileSync(this.file, `${JSON.stringify(header)}\n`);
  }

  write(event: TraceEvent): void {
    appendFileSync(this.file, `${JSON.stringify(event)}\n`);
  }
}

/** Reads a trace: its header and its events (for `yw3d show` and the replay). */
export function readTrace(file: string): { header: TraceHeader; events: TraceEvent[] } {
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as TraceLine);
  const [header, ...events] = lines;
  if (!header || header.type !== 'header') throw new Error(`${file} is not a trace of yw3d`);
  return { header, events: events as TraceEvent[] };
}
