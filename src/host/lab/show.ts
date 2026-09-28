import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentTrigger } from '../agents/context';
import type { Step } from '../agents/reply';
import { readTrace, TRACE_FILE, type TraceEvent, type TraceHeader } from './trace';

/**
 * `yw3d show` (LAB-005.d): the timeline of a run, one step per line, and on request the whole
 * context and reply of a step, from its trace.
 */

/** The trace of a run: its folder, or the file itself. */
export function traceFileOf(given: string): string | undefined {
  const file =
    existsSync(given) && statSync(given).isDirectory() ? path.join(given, TRACE_FILE) : given;
  return existsSync(file) ? file : undefined;
}

type AgentEvent = Extract<TraceEvent, { type: 'agent' }>;
type Request = Extract<AgentEvent, { kind: 'request' }>;
type Reply = Extract<AgentEvent, { kind: 'reply' }>;

/** The requests of a trace in order, numbered from 1 across all the agents, with their replies. */
export function steps(events: readonly TraceEvent[]): {
  readonly request: Request;
  readonly answer: Reply | Extract<AgentEvent, { kind: 'failed' }> | undefined;
}[] {
  const requests = events.filter((e): e is Request => e.type === 'agent' && e.kind === 'request');
  return requests.map((request) => ({
    request,
    answer: events.find(
      (e): e is Reply | Extract<AgentEvent, { kind: 'failed' }> =>
        e.type === 'agent' &&
        e.agent === request.agent &&
        (e.kind === 'reply' || e.kind === 'failed') &&
        e.n === request.n,
    ),
  }));
}

function trigger(t: AgentTrigger): string {
  switch (t.kind) {
    case 'message':
      return `${t.from} says: ${t.text}`;
    case 'continue':
      return t.failed ? `continue after: ${t.failed}` : `continue after: ${t.done}`;
    case 'near':
      return `${t.who} came near`;
    default:
      return t.kind;
  }
}

function step(s: Step): string {
  switch (s.kind) {
    case 'say':
      return `say${s.to ? ` to ${s.to}` : ''}: ${s.text}`;
    case 'walk_to':
    case 'look_at':
      return 'target' in s ? `${s.kind} ${s.target}` : `${s.kind} [${s.x}, ${s.z}]`;
    case 'follow':
      return `follow ${s.target}`;
    case 'wait':
      return `wait ${s.seconds} s`;
    case 'stop':
      return 'stop';
  }
}

const money = (v: number | null) => (v === null ? 'cost unknown' : `$${v.toFixed(4)}`);
const tokens = (v: number | null) => (v === null ? '?' : String(v));

function header(h: TraceHeader): string[] {
  return [
    `run of ${h.date} · yw3d ${h.yw3d} · world ${h.world.name} (${h.world.file}, ${h.world.fingerprint}) · seed ${h.seed}`,
    ...h.scenarios.map(
      (s) =>
        `scenario ${s.id} (${s.file}) for ${s.agent}: ${s.task} · limit ${s.time_limit} s, ${s.max_steps} steps`,
    ),
    ...h.brains.map(
      (b) =>
        `brain of ${b.agent}: ${b.mode}${b.cli ? ` ${b.cli}` : ''}${b.provider ? ` ${b.provider}` : ''}${
          b.model ? `, model ${b.model}` : ''
        }${b.effort ? `, effort ${b.effort}` : ''}`,
    ),
    `instructions ${h.instructions.name} (${h.instructions.fingerprint})`,
  ];
}

/** The timeline of a run: one line per event, with its simulated time and who. */
export function timeline(file: string): string[] {
  const { header: h, events } = readTrace(file);
  const numbers = new Map(steps(events).map((s, i) => [s.request, i + 1]));
  const byAgent = new Map<string, number>();
  const lines = header(h);
  lines.push('', `${'t (s)'.padStart(8)}  ${'who'.padEnd(10)}  what`);
  const row = (t: number, who: string, what: string) =>
    lines.push(`${t.toFixed(2).padStart(8)}  ${who.padEnd(10)}  ${what}`);
  for (const e of events) {
    switch (e.type) {
      case 'agent': {
        if (e.kind === 'request') {
          const k = numbers.get(e)!;
          byAgent.set(`${e.agent} ${e.n}`, k);
          row(e.t, e.agent, `asks its brain [${k}]: ${e.triggers.map(trigger).join('; ')}`);
        } else if (e.kind === 'reply') {
          const k = byAgent.get(`${e.agent} ${e.n}`) ?? '?';
          const what = [
            e.steps.map(step).join(', ') || 'nothing to do',
            ...(e.outcome ? [`outcome ${e.outcome.result}: ${e.outcome.reason}`] : []),
            ...(e.discarded.length ? [`set aside: ${e.discarded.join('; ')}`] : []),
          ].join(' · ');
          row(
            e.t,
            e.agent,
            `reply [${k}]: ${what} · ${tokens(e.usage.input_tokens)} tokens in, ${tokens(
              e.usage.output_tokens,
            )} out, ${money(e.usage.cost_usd)}, ${e.latency_ms} ms`,
          );
        } else if (e.kind === 'failed') {
          row(
            e.t,
            e.agent,
            `request [${byAgent.get(`${e.agent} ${e.n}`) ?? '?'}] failed: ${e.reason}`,
          );
        } else if (e.kind === 'action') {
          row(e.t, e.agent, `→ ${step(e.request as Step)}`);
        } else {
          const ev = e.event;
          const what =
            ev.type === 'action_done'
              ? 'done'
              : ev.type === 'action_failed'
                ? `failed: ${ev.reason}`
                : 'replaced';
          row(e.t, e.agent, `  action ${what}`);
        }
        break;
      }
      case 'said':
        row(e.t, e.line.from, `says${e.line.to ? ` to ${e.line.to}` : ''}: ${e.line.text}`);
        break;
      case 'perturbation':
        row(e.t, '—', `perturbation of ${e.scenario}: ${e.result}`);
        break;
      case 'outcome':
        row(
          e.t,
          e.agent,
          `outcome of ${e.scenario}: ${e.result} after ${e.seconds} s and ${e.steps} steps${
            e.reason ? `: ${e.reason}` : ''
          }`,
        );
        break;
      case 'end':
        row(e.t, '—', `end of the run: ${e.reason}`);
        break;
    }
  }
  return lines;
}

/** The whole context and reply of a step of the timeline (1 for the first request). */
export function stepDetail(file: string, k: number): string[] | string {
  const all = steps(readTrace(file).events);
  const found = all[k - 1];
  if (!found) return `there is no step ${k}: this run has ${all.length}`;
  const { request, answer } = found;
  return [
    `step ${k} · ${request.agent}, request ${request.n} at ${request.t.toFixed(2)} s`,
    '',
    'CONTEXT SENT:',
    request.context,
    '',
    answer === undefined
      ? 'NO REPLY: the run ended first'
      : answer.kind === 'failed'
        ? `FAILED after ${answer.latency_ms} ms: ${answer.reason}`
        : `REPLY at ${answer.t.toFixed(2)} s, after ${answer.latency_ms} ms:`,
    ...(answer?.kind === 'reply'
      ? [typeof answer.raw === 'string' ? answer.raw : JSON.stringify(answer.raw, null, 2)]
      : []),
  ];
}
