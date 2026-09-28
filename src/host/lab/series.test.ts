import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { AgentDecl } from '../../core/yaml/worldFile';
import type { Brain, Usage } from '../agents/brain';
import { FakeBrain } from '../agents/brains/fake';
import type { DeclaredCommand } from '../consent';
import { PROJECT_ROOT, type ModuleLoader } from '../moduleLoader';
import type { HostSession } from '../session';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';
import { parseBrain, runSeries, type BrainCondition } from './series';
import { readTrace, TRACE_FILE } from './trace';
import { buildReport, DECLARED, printReport, REPORT_FILE, stat, writeReport } from './report';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
places:
  - { id: fontana, name: Fontana, at: [34, 30] }
characters:
  - id: marta
    name: Marta
    at: [30, 30]
    agent: { mode: fake, persona: Burbera ma gentile., goals: [pescare] }
  - { id: ugo, name: Ugo, at: [20, 20] }
scenarios:
  - { id: prova, name: La prova, agent: marta, task: "Vai alla Fontana.", time_limit: 60 }
`;

/** The world goes on four times faster than a step at a time: the tests do not wait. */
async function fast(session: HostSession, over: () => boolean): Promise<void> {
  for (let i = 0; i < 2000 && !over(); i++) {
    session.advance(0.25);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A fake brain that reports a price for each reply, or none. */
function priced(cost: number | null): Brain {
  const fake = new FakeBrain();
  return {
    name: 'priced',
    think: async (request, signal) => {
      const thought = await fake.think(request);
      const usage: Usage = { input_tokens: 100, output_tokens: 10, cost_usd: cost };
      void signal;
      return { ...thought, usage };
    },
  };
}

/** CLIs that exist on the PATH of the tests: the brains in their place never call them. */
function fakeClis(): string {
  const bin = mkdtempSync(path.join(tmpdir(), 'yw3d-series-bin-'));
  for (const cli of ['claude', 'codex', 'opencode']) {
    writeFileSync(path.join(bin, cli), '#!/bin/sh\n');
    chmodSync(path.join(bin, cli), 0o755);
  }
  return bin;
}

function folder() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-series-'));
  writeFileSync(path.join(root, WORLD_FILE), WORLD);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  return resolved.folder;
}

async function series(
  brains: BrainCondition[],
  options: { runs?: number; budget?: number; cost?: number | null } = {},
) {
  const lines: string[] = [];
  const asked: DeclaredCommand[][] = [];
  const world = folder();
  const result = await runSeries({
    folder: world,
    loader: noModules,
    terminal: { line: (t) => lines.push(t) },
    consent: async (commands) => {
      asked.push([...commands]);
      return true;
    },
    runs: options.runs ?? 2,
    brains,
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    drive: fast,
    brain: (agent: AgentDecl) =>
      agent.mode === 'fake'
        ? new FakeBrain()
        : priced(options.cost === undefined ? 0.01 : options.cost),
    env: { PATH: fakeClis() },
  });
  return { result, lines, asked, world };
}

const brain = (spec: string) => {
  const parsed = parseBrain(spec);
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
};

describe('the brains of a series', () => {
  it('LAB-007.a: a brain is a name with model and effort after commas; it replaces only the brain', () => {
    const marta = {
      mode: 'api',
      provider: 'openai',
      base_url: 'http://localhost:11434/v1',
      model: 'llama3',
      persona: 'Burbera.',
      goals: ['pescare'],
      initiative: 'reactive',
      every: 60,
      answers: 'short',
    } as AgentDecl;
    expect(brain('claude,model=sonnet,effort=low').apply(marta)).toEqual({
      mode: 'headless',
      cli: 'claude',
      model: 'sonnet',
      effort: 'low',
      persona: 'Burbera.',
      goals: ['pescare'],
      initiative: 'reactive',
      every: 60,
      answers: 'short',
    });
    // A model with a colon, as Ollama writes them; the address stays for the same provider.
    const local = brain('openai,model=llama3.1:8b');
    expect(local.label).toBe('openai,model=llama3.1:8b');
    expect(local.apply(marta)).toMatchObject({
      mode: 'api',
      provider: 'openai',
      model: 'llama3.1:8b',
      base_url: 'http://localhost:11434/v1',
    });
    expect(brain('anthropic,model=claude-haiku-4-5').apply(marta).base_url).toBeUndefined();
    expect(brain('fake').apply(marta)).toMatchObject({ mode: 'fake', persona: 'Burbera.' });
    expect(parseBrain('gemini')).toMatch(/unknown brain "gemini"/);
    expect(parseBrain('anthropic')).toMatch(/needs a model/);
    expect(parseBrain('claude,temperature=0')).toMatch(/write model=<name> or effort=/);
    expect(parseBrain('claude,effort=max')).toMatch(/write model=<name> or effort=/);
  });
});

describe('a series of runs', () => {
  it('LAB-007.a, LAB-007.d: each brain runs the scenarios the given times, from the world of the file, each run with its trace', async () => {
    const { result, lines } = await series([brain('fake'), brain('claude,model=sonnet')]);
    expect(result.runs.map((r) => [r.condition, r.index, r.outcomes.map((o) => o.result)])).toEqual(
      [
        ['fake', 1, ['succeeded']],
        ['fake', 2, ['succeeded']],
        ['claude,model=sonnet', 1, ['succeeded']],
        ['claude,model=sonnet', 2, ['succeeded']],
      ],
    );
    expect(readdirSync(result.folder).sort()).toEqual([
      '1-fake-1',
      '1-fake-2',
      '2-claude_model=sonnet-1',
      '2-claude_model=sonnet-2',
    ]);
    const trace = readTrace(path.join(result.folder, '2-claude_model=sonnet-2', TRACE_FILE));
    expect(trace.header.brains).toEqual([
      {
        agent: 'marta',
        mode: 'headless',
        cli: 'claude',
        provider: null,
        model: 'sonnet',
        effort: null,
      },
    ]);
    // A new world for every run: the first request of the agent has an empty memory.
    const first = trace.events.find((e) => e.type === 'agent' && e.kind === 'request');
    expect(first?.type === 'agent' && first.kind === 'request' && first.context).toContain(
      '"memory":[]',
    );
    expect(first?.type === 'agent' && first.kind === 'request' && first.context).toContain(
      'Burbera ma gentile.',
    );
    const progress = lines.filter((l) => / run \d\/4 /.test(l));
    expect(progress).toHaveLength(4);
    expect(progress[3]).toMatch(
      /run 4\/4 · claude,model=sonnet · prova: succeeded \([\d.]+ s, 2 steps\) · spent so far \$0\.0400/,
    );
  });

  it('LAB-007.b: the consent is asked once, with the brains of every condition', async () => {
    const { asked } = await series([brain('fake'), brain('claude,model=sonnet'), brain('codex')]);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.map((c) => [c.id, c.command])).toEqual([
      ['marta', 'agent claude (sonnet)'],
      ['marta', 'agent codex (default model)'],
    ]);
  });

  it('LAB-007.c: at the spending cap the running scenarios end in an error and no run starts; unknown costs are said', async () => {
    const capped = await series([brain('claude,model=sonnet')], { runs: 3, budget: 0.015 });
    expect(capped.result.capped).toBe(true);
    expect(capped.result.runs).toHaveLength(1);
    expect(capped.result.runs[0]!.outcomes).toEqual([
      expect.objectContaining({
        result: 'error',
        reason: 'the spending cap of the series ($0.015) was reached',
      }),
    ]);
    expect(capped.lines).toContain('yw3d  the spending cap stopped the series');
    const unknown = await series([brain('claude')], { runs: 1, budget: 1, cost: null });
    expect(unknown.result.unknownCost).toBe(true);
    expect(unknown.result.spent).toBe(0);
    expect(unknown.lines.join('\n')).toContain('spent so far $0.0000 + unknown');
  });
});

describe('the report of a series', () => {
  it('LAB-007.e: mean and sample standard deviation of the known values; unknown when none is known', () => {
    expect(stat([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mean: 5, sd: Math.sqrt(32 / 7), n: 8 });
    expect(stat([3])).toEqual({ mean: 3, sd: 0, n: 1 });
    expect(stat([null, 2, null, 4], true)).toEqual({ mean: 3, sd: Math.SQRT2, n: 2, max: 4 });
    expect(stat([null, null])).toBeNull();
  });

  it('LAB-007.e, LAB-007.f: for each brain and scenario, outcomes and measures; in the terminal and in report.json, with the reminder that outcomes are declared', async () => {
    const { result } = await series([brain('fake'), brain('claude,model=sonnet')], {
      runs: 2,
    });
    const report = buildReport(result);
    expect(report.note).toBe(DECLARED);
    expect(report.header).toMatchObject({ yw3d: '0.1.0', seed: 5, scenarios: [{ id: 'prova' }] });
    expect(report.warnings).toEqual([]);
    const [fake, claude] = report.conditions;
    expect(fake!.condition).toBe('fake');
    expect(fake!.scenarios[0]).toMatchObject({
      scenario: 'prova',
      runs: 2,
      outcomes: { succeeded: 2, failed: 0, timeout: 0, steps: 0, error: 0 },
      steps: { mean: 2, sd: 0, n: 2 },
      actions: { mean: 1, sd: 0, n: 2 },
      cost_usd: { mean: 0, sd: 0, n: 2 },
      discarded: { mean: 0, sd: 0, n: 2 },
    });
    expect(claude!.scenarios[0]).toMatchObject({
      input_tokens: { mean: 200, sd: 0, n: 2 },
      output_tokens: { mean: 20, sd: 0, n: 2 },
      cost_usd: { mean: 0.02, n: 2 },
    });
    expect(claude!.scenarios[0]!.latency_ms).toMatchObject({ n: 4 });
    expect(report.runs.map((r) => r.trace)).toEqual([
      '1-fake-1/trace.jsonl',
      '1-fake-2/trace.jsonl',
      '2-claude_model=sonnet-1/trace.jsonl',
      '2-claude_model=sonnet-2/trace.jsonl',
    ]);
    const file = writeReport(report);
    expect(file).toBe(path.join(result.folder, REPORT_FILE));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(report)));
    const lines: string[] = [];
    printReport({ line: (t) => lines.push(t) }, report, file);
    const text = lines.join('\n');
    expect(text).toContain('brain: claude,model=sonnet');
    expect(text).toMatch(/prova\s+2\/2\s+0\s+0\s+0\s+0\s+2\.0 ± 0\.0/);
    expect(text).toContain('0.0200 ± 0.0000');
    expect(text).toContain(DECLARED);
    expect(text).toContain(`report: ${file}`);
  });

  it('LAB-007.e: costs a brain does not report are unknown in the report', async () => {
    const { result } = await series([brain('codex')], { runs: 1, cost: null });
    const report = buildReport(result);
    expect(report.unknown_cost).toBe(true);
    expect(report.conditions[0]!.scenarios[0]!.cost_usd).toBeNull();
    const lines: string[] = [];
    printReport({ line: (t) => lines.push(t) }, report, 'r.json');
    expect(lines.join('\n')).toContain('some brains report no cost');
  });
});

describe('the example of the laboratory', () => {
  it('LAB-009.a: the three scenarios of examples/laboratorio run with the fake brain', async () => {
    const resolved = resolveWorldFolder(path.join(PROJECT_ROOT, 'examples', 'laboratorio'));
    if (!resolved.ok) throw new Error(resolved.message);
    const result = await runSeries({
      folder: resolved.folder,
      loader: noModules,
      terminal: { line: () => {} },
      consent: async () => true,
      runs: 1,
      brains: [brain('fake')],
      drive: fast,
      seriesFolder: mkdtempSync(path.join(tmpdir(), 'yw3d-example-')),
    });
    const outcomes = result.runs[0]!.outcomes;
    expect(outcomes.map((o) => o.scenario).sort()).toEqual([
      'commissione',
      'esplorazione',
      'in-due',
    ]);
    // The fake brain goes only where a task names a single place: a reference at no cost.
    for (const o of outcomes) expect(['succeeded', 'failed']).toContain(o.result);
  });
});
