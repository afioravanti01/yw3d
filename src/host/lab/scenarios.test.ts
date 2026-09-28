import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import type { Brain } from '../agents/brain';
import type { HostMessage } from '../../protocol/messages';
import { HostSession } from '../session';
import type { ScenarioOutcome } from './scenarioRun';
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
  options: { brain?: (mode: string) => Brain | undefined } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-lab-'));
  writeFileSync(path.join(root, WORLD_FILE), LAB_WORLD + scenarios);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const outcomes: ScenarioOutcome[] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    {
      consent: async () => false,
      scenarioEnded: (o) => outcomes.push(o),
      ...(options.brain
        ? {
            brain: (agent) => {
              const brain = options.brain!(agent.mode);
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
  return { s, lines, outcomes, run, notices };
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
