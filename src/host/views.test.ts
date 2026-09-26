import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import { IDLE } from '../core/physics/entity';
import type { HostMessage } from '../protocol/messages';
import type { ModuleLoader } from './moduleLoader';
import { HostSession, INTENT_TIMEOUT_SECONDS } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

/** Advances a session like the server does: in small real-time ticks, not all at once. */
function run(s: HostSession, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
}

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('no modules')),
  invalidate: () => {},
};

async function session() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-views-'));
  writeFileSync(
    path.join(root, WORLD_FILE),
    `version: 2\nname: Test\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\nplayer: { at: [32, 32] }\n`,
  );
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const s = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) });
  await s.load();
  // Let the player land.
  run(s, 1);
  return { s, lines };
}

function view(s: HostSession) {
  const received: HostMessage[] = [];
  const handle = s.connect((m) => received.push(m));
  const last = <T extends HostMessage['type']>(type: T) =>
    received.filter((m): m is Extract<HostMessage, { type: T }> => m.type === type).at(-1);
  return { handle, received, last };
}

const walkEast = {
  type: 'intent',
  intent: { ...IDLE, moveX: 1 },
  yaw: -Math.PI / 2,
  pitch: 0,
} as const;

describe('host simulation and views', () => {
  it('HOST-001.a: the host simulates in fixed steps with no browser connected', async () => {
    const { s } = await session();
    const before = s.steps;
    run(s, 1);
    expect(s.steps - before).toBe(60);
    expect(s.snapshot()!.onGround).toBe(true);
  });

  it('HOST-001.b: the host is the authority on the player; without views it stays still', async () => {
    const { s } = await session();
    const start = s.snapshot()!;
    run(s, 2);
    expect(s.snapshot()).toEqual(start);
    // A driving view moves it; when the view leaves, the player stops where it is.
    const driver = view(s);
    driver.handle.receive(walkEast);
    run(s, 0.25);
    driver.handle.close();
    const left = s.snapshot()!;
    expect(left.x).toBeGreaterThan(start.x);
    run(s, 2);
    expect(s.snapshot()!.x).toBe(left.x);
  });

  it('greets a view with version, role, world, player; sends the state at every step', async () => {
    const { s, lines } = await session();
    const v = view(s);
    const hello = v.received[0];
    expect(hello).toMatchObject({ type: 'hello', version: 1, role: 'driver', views: 1 });
    if (hello?.type !== 'hello') throw new Error('no hello');
    expect(hello.world).toMatchObject({
      file: expect.stringContaining('world.yaml'),
      structures: [],
    });
    expect(hello.world!.hash).toBe(s.world!.hash);
    expect(hello.player).toEqual(s.snapshot());
    run(s, 0.1);
    expect(v.last('state')).toMatchObject({ type: 'state', step: s.steps, views: 1 });
    v.handle.receive({ type: 'ping', id: 7 });
    expect(v.last('pong')).toEqual({ type: 'pong', id: 7 });
    expect(lines.join('\n')).toContain('view 1 connected (driver) · 1 view');
  });

  it('the first view drives, the others watch; the driver role passes on when it leaves', async () => {
    const { s, lines } = await session();
    const first = view(s);
    const second = view(s);
    expect([first.handle.role, second.handle.role]).toEqual(['driver', 'spectator']);
    const start = s.snapshot()!;
    // Spectators cannot move the player.
    second.handle.receive(walkEast);
    run(s, 0.25);
    expect(s.snapshot()!.x).toBe(start.x);
    first.handle.close();
    expect(second.last('role')).toEqual({ type: 'role', role: 'driver' });
    expect(second.handle.role).toBe('driver');
    second.handle.receive(walkEast);
    run(s, 0.25);
    expect(s.snapshot()!.x).toBeGreaterThan(start.x);
    expect(lines.join('\n')).toContain('view 2 now drives the player');
  });

  it('an intent expires after 0.5 s without updates; a returning view finds the player', async () => {
    const { s } = await session();
    const driver = view(s);
    driver.handle.receive(walkEast);
    run(s, INTENT_TIMEOUT_SECONDS);
    const stopped = s.snapshot()!.x;
    run(s, 1);
    expect(s.snapshot()!.x).toBeCloseTo(stopped, 0);
    expect(s.snapshot()!.vx).toBe(0);
    driver.handle.close();
    const again = view(s);
    const hello = again.received[0];
    if (hello?.type !== 'hello') throw new Error('no hello');
    expect(hello.player).toEqual(s.snapshot());
    expect(hello.player!.yaw).toBe(-Math.PI / 2);
  });
});
