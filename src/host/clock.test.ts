import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Perception } from '../core/agents/agentWorld';
import { runCommand } from '../core/dialogue/commands';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import { formatClock } from '../core/time/clock';
import type { HostMessage, ViewMessage } from '../protocol/messages';
import type { ModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const world = (time: string) => `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 26] }
${time}characters:
  - { id: marta, name: Marta, at: [30, 30] }
`;

async function session(time = 'time: { start: "08:00", day_minutes: 60 }\n') {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-clock-'));
  const file = path.join(root, WORLD_FILE);
  writeFileSync(file, world(time));
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const s = new HostSession(resolved.folder, noModules, { line: () => {} }, {});
  await s.load();
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
  };
  const hour = () => formatClock(s.clock!.minutes);
  return { s, file, run, hour };
}

function view(s: HostSession) {
  const received: HostMessage[] = [];
  const handle = s.connect((m) => received.push(m));
  return {
    received,
    send: (m: ViewMessage) => handle.receive(m),
    lastClock: () => {
      const state = received.filter((m) => m.type === 'state').at(-1) as
        { clock: number } | undefined;
      return state && formatClock(state.clock);
    },
  };
}

describe('the clock in the host', () => {
  it('TIME-001.b: one hour for every view; a reload keeps it, a new clock in the file restarts it', async () => {
    const { s, file, run, hour } = await session();
    const a = view(s);
    const b = view(s);
    expect((a.received[0] as { clock: number }).clock).toBe(480);
    run(150);
    expect(hour()).toBe('09:00');
    expect(a.lastClock()).toBe('09:00');
    expect(b.lastClock()).toBe('09:00');
    // The world file is saved again: the hour goes on.
    writeFileSync(
      file,
      world('time: { start: "08:00", day_minutes: 60 }\n').replace('Marta', 'Marta Rossi'),
    );
    await s.load();
    expect(hour()).toBe('09:00');
    // The clock of the file changes: the hour starts again from the file.
    writeFileSync(file, world('time: { start: "22:00", day_minutes: 60 }\n'));
    await s.load();
    expect(hour()).toBe('22:00');
  });

  it('TIME-002.a: the driving view and the terminal set the hour; the views that watch cannot', async () => {
    const { s, run, hour } = await session();
    const driver = view(s);
    const spectator = view(s);
    spectator.send({ type: 'time', minutes: 3 * 60 });
    run(0.1);
    expect(hour()).toBe('08:00');
    driver.send({ type: 'time', minutes: 21 * 60 + 30 });
    run(0.1);
    expect(hour()).toBe('21:30');
    expect(spectator.lastClock()).toBe('21:30');
    // From the terminal, with the command of the console.
    const context = {
      map: s.world!.result.map!,
      position: () => undefined,
      clock: () => s.clock?.minutes,
      setClock: (m: number) => s.setClock(m),
    };
    expect(runCommand('/time', context)).toEqual({ ok: true, text: 'It is **21:30**, night.' });
    expect(runCommand('/time 06:00', context)).toEqual({
      ok: true,
      text: 'The world is now at **06:00**, dawn.',
    });
    expect(hour()).toBe('06:00');
    expect(runCommand('/time 6', context)).toEqual({
      ok: false,
      error: 'write /time HH:MM, e.g. /time 21:30',
    });
    const watching = { ...context, setClock: undefined };
    expect(runCommand('/time 10:00', watching)).toEqual({
      ok: false,
      error: 'only the view that drives the player can set the time',
    });
    expect((runCommand('/world', context) as { text: string }).text).toMatch(
      /^\*\*Borgo\*\* · 06:00 \(dawn\) · /,
    );
  });

  it('PROTO-002.a: the perception has the hour of the world and the part of the day', async () => {
    const { s, run } = await session('time: { start: "19:59", day_minutes: 60 }\n');
    const perceptions: Perception[] = [];
    s.attachController('marta', { event: () => {}, perception: (_, p) => perceptions.push(p) });
    run(1);
    expect(perceptions[0]).toMatchObject({ time_of_day: '19:59', part_of_day: 'dusk' });
    // 0.4 minutes of the world each second: 5 s make two minutes.
    run(4);
    expect(perceptions.at(-1)).toMatchObject({ time_of_day: '20:01', part_of_day: 'night' });
  });
});
