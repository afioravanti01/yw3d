import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { DeclaredCommand } from '../consent';
import type { ModuleLoader } from '../moduleLoader';
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
});
