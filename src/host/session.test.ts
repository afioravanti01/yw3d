import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import { createModuleServer, viteModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const WORLD = `version: 1
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
structures:
  - { type: tower, at: [20, 20] }
  - { type: oak, at: [40, 40] }
`;

const TOWER = `import { COBBLESTONE, defineStructure, int, object } from 'yw3d';
export default defineStructure({
  name: 'tower',
  params: object({ height: int({ min: 2, max: 12, default: 6 }) }),
  terrain: 'sit',
  footprint: () => ({ minX: 0, minZ: 0, maxX: 2, maxZ: 2 }),
  generate({ params, builder }) {
    builder.fill(0, 0, 0, 2, params.height, 2, COBBLESTONE);
  },
});
`;

let vite: ViteDevServer;
beforeAll(async () => {
  vite = await createModuleServer();
}, 30_000);
afterAll(() => vite.close());

function folderWith(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-session-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const session = new HostSession(
    resolved.folder,
    viteModuleLoader(vite),
    { line: (text) => lines.push(text) },
    { display: (file) => path.relative(root, file) },
  );
  return { session, lines, root };
}

describe('host session', () => {
  it('HOST-001.c: the terminal reports world file, seed, structures and warnings', async () => {
    const { session, lines } = folderWith({
      [WORLD_FILE]: WORLD.replace(`generator: ${TERRAIN_GENERATOR_VERSION}`, 'generator: 99'),
      'structures/tower.ts': TOWER,
    });
    expect(await session.load()).toBe(true);
    const out = lines.join('\n');
    expect(out).toContain('world world.yaml · seed 5');
    expect(out).toContain('2 structures (oak 1, tower 1) · 1 warning');
    expect(out).toContain('world.yaml:2  warning  terrain.generator');
  });

  it('CLI-001.b: with errors the host prints them and waits for a valid file', async () => {
    const { session, lines } = folderWith({
      [WORLD_FILE]: WORLD.replace('type: oak', 'type: oka'),
    });
    expect(await session.load()).toBe(false);
    expect(session.world).toBeUndefined();
    const out = lines.join('\n');
    expect(out).toContain('world.yaml:5  error  structures[1].type');
    expect(out).toContain('waiting for a valid world.yaml');
  });

  it('STRUCT-008.a: structures of the author are usable in the world file', async () => {
    const { session } = folderWith({ [WORLD_FILE]: WORLD, 'structures/tower.ts': TOWER });
    await session.load();
    expect(session.diagnostics).toEqual([]);
    expect(session.world!.result.structureCounts).toEqual({ oak: 1, tower: 1 });
    expect(session.world!.structureFiles.map((f) => path.basename(f))).toEqual(['tower.ts']);
  });

  it('STRUCT-008.b: a broken structure file is reported with file and cause; the host goes on', async () => {
    const { session } = folderWith({
      [WORLD_FILE]: WORLD.replace('  - { type: tower, at: [20, 20] }\n', ''),
      'structures/a-syntax.ts': 'export default defineStructure({ name: ',
      'structures/b-throws.ts': "throw new Error('boom at load');",
      'structures/c-duplicate.ts': TOWER.replace("name: 'tower'", "name: 'oak'"),
      'structures/d-nothing.ts': 'export const x = 1;',
    });
    expect(await session.load()).toBe(false);
    const byFile = Object.fromEntries(session.diagnostics.map((d) => [d.file, d.message]));
    expect(byFile['structures/a-syntax.ts']).toContain('cannot load the structure file');
    expect(byFile['structures/b-throws.ts']).toContain('boom at load');
    expect(byFile['structures/c-duplicate.ts']).toContain('"oak" is already registered');
    expect(byFile['structures/d-nothing.ts']).toContain('must export by default a structure');
    for (const d of session.diagnostics) expect(d.severity).toBe('error');
  });

  it('STRUCT-008.d: the terminal reminds that the code of the folder runs', async () => {
    const withCode = folderWith({ [WORLD_FILE]: WORLD, 'structures/tower.ts': TOWER });
    await withCode.session.load();
    expect(withCode.lines[0]).toBe('yw3d  running the code of this folder: structures/tower.ts');
    const withoutCode = folderWith({
      [WORLD_FILE]: WORLD.replace('  - { type: tower, at: [20, 20] }\n', ''),
    });
    await withoutCode.session.load();
    expect(withoutCode.lines.join('\n')).not.toContain('running the code');
  });
});
