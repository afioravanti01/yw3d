import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { DeclaredCommand } from '../consent';
import { UNKNOWN_USAGE } from './brain';
import type { ModuleLoader } from '../moduleLoader';
import { startConsole } from '../console';
import { HostSession } from '../session';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
characters:
  - { id: marta, name: Marta, at: [30, 30], agent: { mode: headless, cli: claude, model: claude-haiku-4-5 } }
  - { id: ugo, name: Ugo, at: [32, 30], agent: { mode: headless, cli: opencode } }
  - { id: anna, name: Anna, at: [34, 30], agent: { mode: api, provider: anthropic, model: claude-haiku-4-5 } }
  - { id: prova, name: Prova, at: [36, 30], agent: { mode: fake } }
`;

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
});

async function session(allow: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-agents-'));
  writeFileSync(path.join(root, WORLD_FILE), WORLD);
  // Only claude is on this PATH; no key in this environment.
  writeFileSync(path.join(root, 'claude'), '#!/bin/sh\n');
  chmodSync(path.join(root, 'claude'), 0o755);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const asked: DeclaredCommand[][] = [];
  const started: string[] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    {
      consent: async (commands) => {
        asked.push([...commands]);
        return allow;
      },
      env: { PATH: root },
    },
  );
  s.agentStarted = (id) => started.push(id);
  sessions.push(s);
  await s.load();
  return { lines, asked, started };
}

describe('agents in the host', () => {
  it('PROTO-005.a, AGENT-001.d, HOST-001.c: the consent lists the agents; a missing CLI or key is reported and the character stands still', async () => {
    const { lines, asked, started } = await session(true);
    expect(asked[0]!.map((c) => [c.id, c.command])).toEqual([
      ['marta', 'agent claude (claude-haiku-4-5)'],
      ['ugo', 'agent opencode (default model)'],
      ['anna', 'agent anthropic api (claude-haiku-4-5, key from ANTHROPIC_API_KEY)'],
    ]);
    expect(lines).toContain(
      'yw3d  characters: marta (agent claude (claude-haiku-4-5)), ugo (agent opencode (default model)), anna (agent anthropic api (claude-haiku-4-5, key from ANTHROPIC_API_KEY)), prova (agent fake (no LLM))',
    );
    expect(lines).toContain(
      'yw3d  [ugo] cannot start the agent: the CLI "opencode" was not found in the PATH',
    );
    expect(lines).toContain(
      'yw3d  [anna] cannot start the agent: the key is missing: set the environment variable ANTHROPIC_API_KEY',
    );
    expect(started).toEqual(['marta', 'prova']);
  });

  it('AGENT-001.d, CHAR-001.c: without consent only the fake agents start', async () => {
    const { started } = await session(false);
    expect(started).toEqual(['prova']);
  });

  it('AGENT-002.a, AGENT-003.a: a fake agent answers from the console, says what it sees and goes where it is told', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yw3d-fake-'));
    writeFileSync(
      path.join(root, WORLD_FILE),
      `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 26], name: Ada }
places:
  - { id: pozzo, name: Pozzo vecchio, at: [40, 30] }
characters:
  - { id: prova, name: Prova, at: [30, 30], agent: { mode: fake } }
`,
    );
    const resolved = resolveWorldFolder(root);
    if (!resolved.ok) throw new Error(resolved.message);
    const lines: string[] = [];
    const s = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) }, {});
    sessions.push(s);
    const said: string[] = [];
    s.listen((l) => said.push(`${l.from}: ${l.text}`));
    await s.load();
    expect(lines).toContain('yw3d  [prova] agent started: agent fake (no LLM)');
    const run = async (done: () => boolean) => {
      for (let i = 0; i < 2000 && !done(); i++) {
        s.advance(1 / 60);
        if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    };
    // A quarter of a second: the agent perceives the world first.
    for (let i = 0; i < 20; i++) s.advance(1 / 60);
    s.playerSays('@prova cosa vedi?');
    await run(() => said.some((l) => l.startsWith('prova: Vedo')));
    expect(said.find((l) => l.startsWith('prova: Vedo'))).toMatch(/Ada \(north, 2 m\)/);
    s.playerSays('@prova vai al pozzo vecchio');
    await run(() => {
      const p = s.agents!.stateOf('prova')!;
      return Math.hypot(p.x - 40.5, p.z - 30.5) <= 1.8;
    });
    expect(said).toContain('prova: Vado a Pozzo vecchio.');
    for (let i = 0; i < 30; i++) s.advance(1 / 60);
    expect(s.agentOf('prova')).toMatchObject({ mode: 'fake', brain: 'fake', state: 'idle' });
    expect(s.characterSnapshots()[0]!.agent).toMatchObject({ brain: 'fake' });
    // Its technical data, as /describe shows them in the terminal (A8.3).
    const typed: ((line: string) => void)[] = [];
    startConsole(
      s,
      { onLine: (l) => typed.push(l), question: () => Promise.resolve(''), close: () => {} },
      { line: (t) => lines.push(t) },
    );
    typed.forEach((listener) => listener('/describe @prova'));
    expect(lines).toContain('yw3d  - Driven by: LLM agent, fake (fake)');
    expect(lines).toContain('yw3d  - Settings: default model · default effort · short answers');
    expect(lines).toContainEqual(
      expect.stringMatching(/^yw3d {2}- State: idle · last request \d+\.\d s$/),
    );
  });

  it('AGENT-006.a: the world does not wait for a brain that does not answer', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yw3d-slow-'));
    writeFileSync(
      path.join(root, WORLD_FILE),
      `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 26] }
characters:
  - { id: lenta, name: Lenta, at: [30, 30], agent: { mode: fake } }
`,
    );
    const resolved = resolveWorldFolder(root);
    if (!resolved.ok) throw new Error(resolved.message);
    const s = new HostSession(
      resolved.folder,
      noModules,
      { line: () => {} },
      {
        brain: () => ({ name: 'never', think: () => new Promise(() => {}) }),
      },
    );
    sessions.push(s);
    await s.load();
    for (let i = 0; i < 20; i++) s.advance(1 / 60);
    s.playerSays('@lenta ciao');
    expect(s.agentOf('lenta')!.state).toBe('thinking');
    const before = s.agents!.time;
    const start = performance.now();
    for (let i = 0; i < 120; i++) s.advance(1 / 60);
    expect(s.agents!.time - before).toBeCloseTo(2, 1);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('HOST-001.c: the terminal says when a request of an agent fails, and what of a reply is set aside', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yw3d-log-'));
    writeFileSync(
      path.join(root, WORLD_FILE),
      `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 26] }
characters:
  - { id: rotta, name: Rotta, at: [30, 30], agent: { mode: fake } }
`,
    );
    const resolved = resolveWorldFolder(root);
    if (!resolved.ok) throw new Error(resolved.message);
    const lines: string[] = [];
    let answer = (): Promise<unknown> => Promise.reject(new Error('HTTP 529: overloaded'));
    const s = new HostSession(
      resolved.folder,
      noModules,
      { line: (t) => lines.push(t) },
      {
        brain: () => ({
          name: 'test',
          think: () => answer().then((reply) => ({ reply, usage: UNKNOWN_USAGE })),
        }),
      },
    );
    sessions.push(s);
    await s.load();
    const run = async () => {
      for (let i = 0; i < 20; i++) s.advance(1 / 60);
      await new Promise((r) => setTimeout(r, 10));
    };
    await run();
    s.playerSays('@rotta ciao');
    await run();
    expect(lines).toContain('yw3d  [rotta] the request to test failed: HTTP 529: overloaded');
    expect(s.agentOf('rotta')!.state).toBe('error');
    answer = () => Promise.resolve({ say: null, actions: [{ type: 'teleport' }] });
    s.playerSays('@rotta riprova');
    await run();
    expect(lines).toContain('yw3d  [rotta] reply set aside: actions[0]: unknown action "teleport"');
  });
});
