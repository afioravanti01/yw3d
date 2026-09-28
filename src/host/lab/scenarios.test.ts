import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import { HostSession } from '../session';
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
