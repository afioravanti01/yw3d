import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import type { Brain } from '../agents/brain';
import type { HostMessage } from '../../protocol/messages';
import { HostSession } from '../session';
import type { ScenarioOutcome } from './scenarioRun';
import { fingerprint, readTrace, RUNS_DIR, TRACE_FILE } from './trace';
import { stepDetail, timeline, traceFileOf } from './show';
import { ReplayBrain } from '../agents/brains/replay';
import { UNKNOWN_USAGE } from '../agents/brain';
import { AnthropicBrain } from '../agents/brains/anthropic';
import { INSTRUCTIONS_VERSION } from '../agents/context';
import type { AgentDecl } from '../../core/yaml/worldFile';
import { affectsWorld } from '../watch';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
characters:
  - { id: marta, name: Marta, at: [30, 30], agent: { mode: fake } }
scenarios:
  - scenarios/commissione.yaml
`;

const SCENARIO = `id: commissione
name: La commissione
agent: marta
task: Vai alla fontana.
time_limit: 300
`;

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
});

function folderWith(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-lab-'));
  const write = (name: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  };
  for (const [name, text] of Object.entries(files)) write(name, text);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const session = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    { display: (file) => path.relative(root, file) },
  );
  sessions.push(session);
  return { session, lines, root, folder: resolved.folder, write };
}

describe('scenarios in the host', () => {
  it('LAB-001.a: the host reads imported scenarios; their errors name the imported file', async () => {
    const { session, lines, write } = folderWith({
      [WORLD_FILE]: WORLD,
      'scenarios/commissione.yaml': SCENARIO.replace('time_limit: 300', 'time_limit: -1'),
    });
    expect(await session.load()).toBe(false);
    expect(lines.join('\n')).toContain('scenarios/commissione.yaml:5  error  time_limit');
    write('scenarios/commissione.yaml', SCENARIO);
    expect(await session.load()).toBe(true);
    expect(session.world!.result.scenarios.map((s) => [s.id, s.file])).toEqual([
      ['commissione', 'scenarios/commissione.yaml'],
    ]);
  });

  it('LAB-001.c: saving an imported scenario reloads the world with it', async () => {
    const { session, root, folder, write } = folderWith({
      [WORLD_FILE]: WORLD,
      'scenarios/commissione.yaml': SCENARIO,
    });
    await session.load();
    const hash = session.world!.hash;
    expect(affectsWorld(folder, path.join(root, 'scenarios/commissione.yaml'))).toBe(true);
    write('scenarios/commissione.yaml', SCENARIO.replace('Vai alla fontana.', 'Vai al lago.'));
    expect(await session.load()).toBe(true);
    expect(session.world!.result.scenarios[0]!.task).toBe('Vai al lago.');
    expect(session.world!.hash).toBe(hash);
  });
});

const LAB_WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
places:
  - { id: fontana, name: Fontana, at: [36, 30] }
characters:
  - { id: marta, name: Marta, at: [30, 30], agent: { mode: fake } }
  - { id: ugo, name: Ugo, at: [20, 20], agent: { mode: headless, cli: claude } }
scenarios:
`;

const scenario = (fields: string) => `  - { id: prova, name: La prova, agent: marta, ${fields} }\n`;

/** A world with scenarios, run by the host with its simulation (LAB-002). */
async function lab(
  scenarios: string,
  options: {
    brain?: (agent: AgentDecl) => Brain | undefined;
    consent?: boolean;
    env?: NodeJS.ProcessEnv;
    world?: string;
  } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-lab-'));
  writeFileSync(path.join(root, WORLD_FILE), (options.world ?? LAB_WORLD) + scenarios);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const outcomes: ScenarioOutcome[] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    {
      consent: async () => options.consent ?? false,
      ...(options.env ? { env: options.env } : {}),
      scenarioEnded: (o) => outcomes.push(o),
      ...(options.brain
        ? {
            brain: (agent) => {
              const brain = options.brain!(agent);
              if (!brain) throw new Error('no brain');
              return brain;
            },
          }
        : {}),
    },
  );
  sessions.push(s);
  const seen: HostMessage[] = [];
  s.connect((m) => seen.push(m));
  await s.load();
  /** Simulated seconds of the world, with the replies of the agents in between. */
  const run = async (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      s.advance(0.25);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const notices = () => seen.flatMap((m) => (m.type === 'lab' ? [m.text] : []));
  /** The trace of the first run of the world folder (LAB-005). */
  const trace = () => {
    const runs = readdirSync(path.join(root, RUNS_DIR));
    return { file: path.join(root, RUNS_DIR, runs[0]!, TRACE_FILE), runs };
  };
  return { s, lines, outcomes, run, notices, trace, root };
}

describe('the scenarios of a world', () => {
  it('LAB-002.a, LAB-002.c: the agent does its task on its own and declares it done', async () => {
    const { outcomes, run, notices } = await lab(
      scenario('task: "Vai alla Fontana.", time_limit: 120'),
    );
    await run(20);
    expect(outcomes).toEqual([
      expect.objectContaining({ scenario: 'prova', agent: 'marta', result: 'succeeded', steps: 2 }),
    ]);
    expect(outcomes[0]!.seconds).toBeGreaterThan(1);
    expect(notices()[0]).toBe('Scenario «La prova» assegnato a Marta: Vai alla Fontana.');
  });

  it('LAB-002.c: failed, time limit, steps over', async () => {
    const failed = await lab(scenario('task: "Vola sulla luna.", time_limit: 60'));
    await failed.run(2);
    expect(failed.outcomes.map((o) => [o.result, o.reason])).toEqual([
      ['failed', 'the task names no place of the world'],
    ]);
    const timeout = await lab(scenario('task: "Vai alla Fontana.", time_limit: 1'));
    await timeout.run(3);
    expect(timeout.outcomes.map((o) => o.result)).toEqual(['timeout']);
    expect(timeout.outcomes[0]!.seconds).toBeGreaterThanOrEqual(1);
    const steps = await lab(scenario('task: "Vai alla Fontana.", time_limit: 60, max_steps: 1'));
    await steps.run(2);
    expect(steps.outcomes.map((o) => [o.result, o.steps])).toEqual([['steps', 1]]);
  });

  it('LAB-002.c: an agent that cannot run, or whose requests keep failing, ends in an error', async () => {
    const noConsent = await lab(
      '  - { id: ugo1, name: Ugo, agent: ugo, task: "Vai alla Fontana.", time_limit: 60 }\n',
    );
    expect(noConsent.outcomes.map((o) => [o.agent, o.result])).toEqual([['ugo', 'error']]);
    expect(noConsent.outcomes[0]!.reason).toContain('the agent is not running');
    const failing = await lab(scenario('task: "Vai alla Fontana.", time_limit: 600'), {
      brain: () => ({ name: 'broken', think: () => Promise.reject(new Error('HTTP 529')) }),
    });
    await failing.run(2);
    expect(failing.outcomes.map((o) => [o.result, o.reason, o.steps])).toEqual([
      ['error', '3 failed requests in a row: HTTP 529', 3],
    ]);
  });

  it('LAB-002.d: after the outcome the agent is as the world file says, and terminal and console report it', async () => {
    const { s, lines, run, notices } = await lab(
      scenario('task: "Vai alla Fontana.", time_limit: 120'),
    );
    await run(20);
    expect(s.scenarios[0]!.running).toBe(false);
    expect(lines.join('\n')).toMatch(
      /\[marta\] scenario prova: succeeded after [\d.]+ s and 2 steps/,
    );
    expect(notices()[1]).toMatch(
      /^Scenario «La prova» \(Marta\): riuscito dopo [\d.]+ s e 2 passi/,
    );
    // The world goes on; a reload starts the scenario again.
    await run(2);
    await s.load();
    expect(s.scenarios[0]!.running).toBe(true);
  });
});

describe('the trace of a run', () => {
  it('LAB-005.a: a header with what the run depends on, then every request, reply, action, sentence and outcome in order of simulated time', async () => {
    const { run, trace, root, lines } = await lab(
      scenario('task: "Vai alla Fontana.", time_limit: 120'),
    );
    await run(20);
    const { file, runs } = trace();
    expect(runs).toHaveLength(1);
    expect(lines.join('\n')).toContain(
      `trace of this run: ${path.join(path.basename(root), path.relative(root, file))}`,
    );
    const { header, events } = readTrace(file);
    expect(header).toMatchObject({
      yw3d: '0.1.0',
      world: {
        name: 'Borgo',
        fingerprint: fingerprint(readFileSync(path.join(root, WORLD_FILE), 'utf8')),
      },
      seed: 5,
      scenarios: [
        { id: 'prova', agent: 'marta', task: 'Vai alla Fontana.', time_limit: 120, max_steps: 50 },
      ],
      brains: [
        { agent: 'marta', mode: 'fake', cli: null, provider: null, model: null, effort: null },
      ],
      instructions: INSTRUCTIONS_VERSION,
    });
    const kinds = events.map((e) => (e.type === 'agent' ? `${e.agent} ${e.kind}` : e.type));
    expect(kinds).toEqual([
      'marta request',
      'marta reply',
      'marta action',
      'marta action_end',
      'marta request',
      'marta reply',
      'outcome',
      'end',
    ]);
    const [request, reply] = events;
    expect(request).toMatchObject({
      type: 'agent',
      kind: 'request',
      n: 1,
      triggers: [{ kind: 'task' }],
    });
    expect(request!.type === 'agent' && request!.kind === 'request' && request!.context).toContain(
      'YOUR TASK:\nVai alla Fontana.',
    );
    expect(reply).toMatchObject({
      kind: 'reply',
      n: 1,
      raw: { actions: [{ type: 'walk_to', target: 'fontana' }], continue: true },
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
      steps: [{ kind: 'walk_to', target: 'fontana' }],
      discarded: [],
      outcome: null,
    });
    expect(events.find((e) => e.type === 'outcome')).toMatchObject({
      result: 'succeeded',
      steps: 2,
    });
    const times = events.map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.at(-1)).toBeGreaterThan(1);
  });

  it('LAB-005.b: what a brain does not report is written as unknown, never estimated', async () => {
    const { run, trace } = await lab(scenario('task: "Vai alla Fontana.", time_limit: 120'), {
      brain: () => ({
        name: 'silent',
        think: () =>
          Promise.resolve({
            reply: {
              say: { text: 'Non ci vado.', to: null },
              actions: [],
              outcome: { result: 'failed', reason: 'no' },
            },
            usage: UNKNOWN_USAGE,
          }),
      }),
    });
    await run(2);
    const reply = readTrace(trace().file).events.find(
      (e) => e.type === 'agent' && e.kind === 'reply',
    );
    expect(reply).toMatchObject({
      usage: { input_tokens: null, output_tokens: null, cost_usd: null },
    });

    // The sentences said during the run are in the trace too.
    expect(readTrace(trace().file).events.find((e) => e.type === 'said')).toMatchObject({
      line: { from: 'marta', text: 'Non ci vado.' },
    });
  });

  it('LAB-005.c: the key of an API never appears in the trace', async () => {
    const KEY = 'sk-ant-very-secret-4242';
    const server = createServer((_, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const world = LAB_WORLD.replace(
        'agent: { mode: fake }',
        'agent: { mode: api, provider: anthropic, model: claude-haiku-4-5 }',
      );
      const env = { ANTHROPIC_API_KEY: KEY };
      const { run, trace } = await lab(scenario('task: "Vai alla Fontana.", time_limit: 600'), {
        world,
        consent: true,
        env,
        brain: (agent) => new AnthropicBrain(agent, env, url),
      });
      for (let i = 0; i < 20 && !readFileSync(trace().file, 'utf8').includes('"end"'); i++) {
        await run(0.5);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const text = readFileSync(trace().file, 'utf8');
      expect(text).toContain('"type":"end"');
      expect(text).toContain('invalid x-api-key ***');
      expect(text).not.toContain(KEY);
    } finally {
      server.close();
    }
  });
});

describe('the perturbations of a scenario', () => {
  it('LAB-004.a, LAB-004.c: a sentence, a place that moves, new goals, blocks: each once, at its time, in terminal and trace', async () => {
    const { s, lines, outcomes, run, trace } = await lab(
      scenario(`task: "Vai alla Fontana.", time_limit: 120, perturbations: [
      { at: 0, move_place: { place: fontana, to: [34, 32] } },
      { at: 0, goals: { agent: marta, goals: [riposare] } },
      { at: 0.5, say: { by: ugo, text: "Attenta, Marta!" } },
      { at: 1, blocks: { from: [5, 80, 5], to: [6, 81, 5], block: cobblestone } } ]`),
    );
    await run(20);
    expect(outcomes.map((o) => o.result)).toEqual(['succeeded']);
    // The fake agent went to the new place of the fountain.
    const marta = s.agents!.stateOf('marta')!;
    expect(Math.hypot(marta.x - 34.5, marta.z - 32.5)).toBeLessThan(2);
    expect(s.world!.result.map!.entries.find((e) => e.id === 'fontana')!.shape).toEqual({
      kind: 'point',
      x: 34,
      z: 32,
    });
    const out = lines.join('\n');
    expect(out).toMatch(/scenario prova: at [\d.]+ s, the place fontana moves to \[34, 32\]/);
    expect(out).toMatch(/scenario prova: at [\d.]+ s, new goals for marta: riposare/);
    expect(out).toMatch(/scenario prova: at [\d.]+ s, ugo says: Attenta, Marta!/);
    expect(out).toMatch(
      /scenario prova: at [\d.]+ s, 4 blocks set to cobblestone from \[5, 80, 5\]/,
    );
    const { events } = readTrace(trace().file);
    const perturbations = events.flatMap((e) => (e.type === 'perturbation' ? [e] : []));
    expect(perturbations.map((p) => p.perturbation.kind)).toEqual([
      'move_place',
      'goals',
      'say',
      'blocks',
    ]);
    expect(perturbations[3]!.t).toBeGreaterThanOrEqual(1);
    // The next question of the agent carries its new goals.
    const later = events.filter((e) => e.type === 'agent' && e.kind === 'request').at(-1);
    expect(later?.type === 'agent' && later.kind === 'request' && later.context).toContain(
      'Your goals: riposare.',
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'said', line: expect.objectContaining({ from: 'ugo' }) }),
    );
  });

  it('LAB-004.b: the views get the blocks, also the ones that come later; a reload brings back the world of the file', async () => {
    const { s, run } = await lab(
      scenario(`task: "Vola sulla luna.", time_limit: 120, perturbations: [
      { at: 0, blocks: { from: [5, 80, 5], to: [5, 80, 6], block: stone } } ]`),
    );
    const seen: HostMessage[] = [];
    s.connect((m) => seen.push(m));
    await run(1);
    expect(seen).toContainEqual({
      type: 'blocks',
      edits: [
        [5, 80, 5, 3],
        [5, 80, 6, 3],
      ],
    });
    const late: HostMessage[] = [];
    s.connect((m) => late.push(m));
    expect(late[0]).toMatchObject({
      type: 'hello',
      blocks: [
        [5, 80, 5, 3],
        [5, 80, 6, 3],
      ],
    });
    expect(s.world!.result.world.getBlock(5, 80, 5)).toBe(3);
    await s.load();
    expect(s.world!.result.world.getBlock(5, 80, 5)).toBe(0);
    const again: HostMessage[] = [];
    s.connect((m) => again.push(m));
    expect(again[0]).toMatchObject({ type: 'hello', blocks: [] });
  });
});

describe('yw3d show', () => {
  it('LAB-005.d: the timeline of a run, a step per line, and the whole context and reply of a step', async () => {
    const { run, trace } = await lab(
      scenario(`task: "Vai alla Fontana.", time_limit: 120, perturbations: [
      { at: 0.5, say: { by: ugo, text: "Attenta, Marta!" } } ]`),
    );
    await run(20);
    const { file } = trace();
    expect(traceFileOf(path.dirname(file))).toBe(file);
    expect(traceFileOf(file)).toBe(file);
    expect(traceFileOf(path.join(path.dirname(file), 'nothing'))).toBeUndefined();
    const lines = timeline(file);
    expect(lines[0]).toMatch(/^run of .* · world Borgo .* · seed 5$/);
    expect(lines.join('\n')).toMatch(
      /scenario prova \(.*world\.yaml\) for marta: Vai alla Fontana\. · limit 120 s, 50 steps/,
    );
    expect(lines).toContain('brain of marta: fake');
    const body = lines.slice(lines.indexOf('') + 1).join('\n');
    expect(body).toMatch(/0\.\d\d {2}marta {7}asks its brain \[1\]: task/);
    expect(body).toMatch(
      /marta {7}reply \[1\]: walk_to fontana · 0 tokens in, 0 out, \$0\.0000, \d+ ms/,
    );
    expect(body).toMatch(/marta {7}→ walk_to fontana/);
    expect(body).toMatch(/— {11}perturbation of prova: ugo says: Attenta, Marta!/);
    expect(body).toMatch(/ugo {9}says: Attenta, Marta!/);
    expect(body).toMatch(/marta {9}action done/);
    expect(body).toMatch(/marta {7}outcome of prova: succeeded after [\d.]+ s and 2 steps/);
    expect(body).toMatch(/end of the run: every scenario ended$/);
    const detail = stepDetail(file, 1) as string[];
    expect(detail[0]).toMatch(/^step 1 · marta, request 1 at [\d.]+ s$/);
    expect(detail).toContain('CONTEXT SENT:');
    expect(detail.join('\n')).toContain('YOUR TASK:\nVai alla Fontana.');
    expect(detail.join('\n')).toMatch(/REPLY at [\d.]+ s, after \d+ ms:\n\{\n {2}"say": null/);
    expect(stepDetail(file, 9)).toBe('there is no step 9: this run has 2');
  });
});

describe('the replay of a run', () => {
  it('LAB-006.a: the replies of the trace, in order, not before their time; failures fail again; then the agent stands still', async () => {
    let now = 0;
    const logged: string[] = [];
    const brain = new ReplayBrain(
      [
        { t: 2, raw: { say: null, actions: [] }, usage: UNKNOWN_USAGE },
        { t: 3, error: 'HTTP 529' },
      ],
      () => now,
      (l) => logged.push(l),
      () => new Promise((resolve) => setTimeout(resolve, 0)),
    );
    const signal = new AbortController().signal;
    let replied = false;
    const first = brain.think(undefined, signal).then((t) => {
      replied = true;
      return t;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(replied).toBe(false);
    now = 2;
    expect((await first).reply).toEqual({ say: null, actions: [] });
    now = 5;
    await expect(brain.think(undefined, signal)).rejects.toThrow('HTTP 529');
    const stop = new AbortController();
    const over = brain.think(undefined, stop.signal);
    stop.abort();
    await expect(over).rejects.toThrow('no more recorded replies');
    expect(logged).toEqual(['the recorded replies are over: the agent stands still']);
  });

  it('LAB-006.a: a replay gives the agents the recorded replies without calling an LLM, and says which files changed since the run', async () => {
    const original = await lab(scenario('task: "Vai alla Fontana.", time_limit: 120'));
    await original.run(20);
    const file = original.trace().file;
    // The same world, but the agent of Marta would now need Claude Code, which is not there.
    const worldFile = path.join(original.root, WORLD_FILE);
    writeFileSync(
      worldFile,
      readFileSync(worldFile, 'utf8').replace(
        'agent: { mode: fake }',
        'agent: { mode: headless, cli: claude }',
      ),
    );
    const resolved = resolveWorldFolder(original.root);
    if (!resolved.ok) throw new Error(resolved.message);
    const lines: string[] = [];
    const outcomes: ScenarioOutcome[] = [];
    const replay = new HostSession(
      resolved.folder,
      noModules,
      { line: (t) => lines.push(t) },
      {
        consent: async () => false,
        env: { PATH: '' },
        replay: file,
        scenarioEnded: (o) => outcomes.push(o),
      },
    );
    sessions.push(replay);
    await replay.load();
    for (let t = 0; t < 20 && outcomes.length === 0; t += 0.25) {
      replay.advance(0.25);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const out = lines.join('\n');
    expect(out).toContain('replaying the run of');
    expect(out).toMatch(
      /warning: changed since the run: .*world\.yaml; the replay may go differently/,
    );
    expect(outcomes.map((o) => [o.result, o.steps])).toEqual(
      original.outcomes.map((o) => [o.result, o.steps]),
    );
    // No new trace: the folder of the runs still has only the original one.
    expect(readdirSync(path.join(original.root, RUNS_DIR))).toHaveLength(1);
  });
});
