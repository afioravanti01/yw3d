import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import { IDLE } from '../core/physics/entity';
import type { HostMessage } from '../protocol/messages';
import type { ModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { affectsWorld, watchWorldFolder, type FileWatcher } from './watch';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('no modules')),
  invalidate: () => {},
};
const header = `version: 1\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\nplayer: { at: [20, 32] }\n`;

function run(s: HostSession, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
}

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-reload-'));
  const file = path.join(root, WORLD_FILE);
  writeFileSync(file, header);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const session = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) });
  await session.load();
  run(session, 1);
  const received: HostMessage[] = [];
  session.connect((m) => received.push(m));
  return { session, file, folder: resolved.folder, received, lines };
}

describe('reloading from the folder', () => {
  it('HOST-003.a: saving the world recomposes it, updates the views and keeps the player', async () => {
    const { session, file, received } = await setup();
    const view = session.connect(() => {});
    view.close();
    const before = session.world!.hash;
    // Walk a little, then change the world.
    const driver = session.connect(() => {});
    driver.receive({ type: 'intent', intent: { ...IDLE, moveX: 1 }, yaw: 0, pitch: 0 });
    run(session, 0.3);
    const moved = session.snapshot()!;
    writeFileSync(file, `${header}structures:\n  - { type: oak, at: [40, 20] }\n`);
    expect(await session.load()).toBe(true);
    expect(session.world!.hash).not.toBe(before);
    const update = received.find((m) => m.type === 'world');
    expect(update).toMatchObject({ type: 'world', world: { hash: session.world!.hash } });
    expect(session.snapshot()!.x).toBe(moved.x);
    expect(session.snapshot()!.z).toBe(moved.z);
  });

  it('HOST-003.b: an invalid save keeps the previous world and reports errors until fixed', async () => {
    const { session, file, received, lines } = await setup();
    const good = session.world!.hash;
    writeFileSync(file, `${header}structures:\n  - { type: oka, at: [40, 20] }\n`);
    expect(await session.load()).toBe(false);
    expect(session.world!.hash).toBe(good);
    const report = received.filter((m) => m.type === 'diagnostics').at(-1);
    expect(report).toMatchObject({
      type: 'diagnostics',
      diagnostics: [expect.objectContaining({ severity: 'error', path: 'structures[0].type' })],
    });
    expect(lines.join('\n')).toContain('keeping the previous one');
    writeFileSync(file, header);
    expect(await session.load()).toBe(true);
    expect(session.diagnostics).toEqual([]);
    expect(received.at(-1)).toMatchObject({ type: 'world', diagnostics: [] });
  });

  it('watches world.yaml and structures/, once per burst of changes', () => {
    vi.useFakeTimers();
    try {
      const root = mkdtempSync(path.join(tmpdir(), 'yw3d-watch-'));
      mkdirSync(path.join(root, 'structures'));
      writeFileSync(path.join(root, WORLD_FILE), header);
      const resolved = resolveWorldFolder(root);
      if (!resolved.ok) throw new Error(resolved.message);
      const folder = resolved.folder;
      expect(affectsWorld(folder, path.join(root, WORLD_FILE))).toBe(true);
      expect(affectsWorld(folder, path.join(root, 'structures', 'tower.ts'))).toBe(true);
      expect(affectsWorld(folder, path.join(root, 'notes.md'))).toBe(false);
      expect(affectsWorld(folder, path.join(root, '..', WORLD_FILE))).toBe(false);

      const emitter = new EventEmitter();
      const added: unknown[] = [];
      const watcher: FileWatcher = {
        add: (p) => added.push(p),
        on: (event, listener) => emitter.on(event, listener),
      };
      const reload = vi.fn();
      watchWorldFolder(watcher, folder, reload);
      expect(added).toEqual([root]);
      emitter.emit('change', path.join(root, WORLD_FILE));
      emitter.emit('change', path.join(root, WORLD_FILE));
      emitter.emit('add', path.join(root, 'structures', 'bridge.ts'));
      emitter.emit('change', path.join(root, 'notes.md'));
      vi.advanceTimersByTime(100);
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
