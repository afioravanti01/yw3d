import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import { HostSession } from '../session';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';
import { ControllerLink, MAX_QUEUED_EVENTS } from './link';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

/** Controllers used by the tests, as a world author would write them (in JavaScript). */
const SCRIPTS: Record<string, string> = {
  'greeter.mjs': `
import { createInterface } from 'node:readline';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
console.error('ready');
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.type === 'hello') send({ type: 'say', id: 's1', text: 'Buongiorno' });
  if (m.type === 'action_done') console.error('done ' + m.id);
});`,
  'quitter.mjs': `
import { createInterface } from 'node:readline';
createInterface({ input: process.stdin }).on('line', () => process.exit(3));`,
  'deaf.mjs': `setInterval(() => {}, 1000);`,
  'confused.mjs': `
import { createInterface } from 'node:readline';
process.stdout.write('this is not json\\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.type === 'error') console.error('got error: ' + m.message);
});`,
};

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
});

async function session(characters: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-stdio-'));
  for (const [name, text] of Object.entries(SCRIPTS)) writeFileSync(path.join(root, name), text);
  writeFileSync(
    path.join(root, WORLD_FILE),
    `version: 2\nname: Test\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\ncharacters:\n${characters}`,
  );
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    { consent: async () => true },
  );
  sessions.push(s);
  await s.load();
  return { s, lines };
}

/** Runs the simulation in real time slices until `done` holds, or fails after `seconds`. */
async function until(
  s: HostSession,
  done: () => boolean,
  seconds = 10,
  stepsPerSlice = 3,
): Promise<void> {
  const end = Date.now() + seconds * 1000;
  while (!done()) {
    if (Date.now() > end) throw new Error('timed out');
    for (let i = 0; i < stepsPerSlice; i++) s.advance(1 / 60);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('controllers on stdio', () => {
  it('PROTO-003.a: a process of the folder drives its character with JSON lines; stderr goes to the terminal', async () => {
    const { s, lines } = await session(
      '  - { id: guardiano, name: guardiano, at: [30, 30], controller: { command: node greeter.mjs } }\n',
    );
    expect(lines).toContain('yw3d  [guardiano] controller started: node greeter.mjs');
    await until(s, () => s.characterSnapshots()[0]?.speech === 'Buongiorno');
    await until(s, () => lines.includes('yw3d  [guardiano] done s1'));
    expect(lines).toContain('yw3d  [guardiano] ready');
    expect(s.isControlled('guardiano')).toBe(true);
  });

  it('PROTO-003.b: when the process ends the character stops; controllers restart on reload', async () => {
    const { s, lines } = await session(
      '  - { id: marta, name: marta, at: [30, 30], controller: { command: node quitter.mjs } }\n',
    );
    await until(s, () => lines.some((l) => l.includes('controller ended (exit code 3)')));
    expect(lines).toContain('yw3d  [marta] controller ended (exit code 3): the character stops');
    expect(s.isControlled('marta')).toBe(false);
    await s.load();
    expect(
      lines.filter((l) => l === 'yw3d  [marta] controller started: node quitter.mjs'),
    ).toHaveLength(2);
  });

  it('PROTO-001.d: an invalid line from a controller gets an error back; the host goes on', async () => {
    const { s, lines } = await session(
      '  - { id: pino, name: pino, at: [30, 30], controller: { command: node confused.mjs } }\n',
    );
    await until(s, () => lines.some((l) => l.includes('got error')));
    expect(lines).toContain('yw3d  [pino] got error: not valid JSON: this is not json');
  });

  it(
    'PROTO-006.a: a controller that does not read never slows the world; it is reported',
    { timeout: 60_000 },
    async () => {
      const { s, lines } = await session(
        '  - { id: sordo, name: sordo, at: [30, 30], controller: { command: node deaf.mjs } }\n',
      );
      const steps = s.steps;
      // Two simulated minutes of perception, far more than the pipe between the processes holds.
      // One simulated second per slice: minutes of perception in a few real seconds.
      await until(s, () => lines.some((l) => l.includes('not reading its messages')), 40, 60);
      expect(lines).toContain(
        'yw3d  [sordo] the controller is not reading its messages: the character stops',
      );
      expect(s.steps).toBeGreaterThan(steps);
    },
  );

  it('PROTO-006.a: while a channel is full only the latest perception waits; events are capped', () => {
    const sent: string[] = [];
    let open = false;
    const fakeSession = {
      world: { result: { world: { size: { x: 64, y: 96, z: 64 } } } },
      agents: { request: () => {}, release: () => {} },
      attachController: () => {},
      detachController: () => {},
    } as unknown as HostSession;
    const link = new ControllerLink(
      'x',
      fakeSession,
      { send: (t) => (sent.push(t), open) },
      { line: () => {} },
      () => 0,
    );
    link.start();
    const perception = (time: number) =>
      ({
        type: 'perception',
        time,
        self: { x: 0, y: 0, z: 0, yaw: 0, on_ground: true, in_water: false },
        action: null,
        nearby: [],
      }) as const;
    for (let i = 0; i < 50; i++) link.perception('x', perception(i));
    for (let i = 0; i < MAX_QUEUED_EVENTS + 20; i++)
      link.event('x', { type: 'action_done', id: `a${i}` });
    expect(link.waiting).toEqual({ events: MAX_QUEUED_EVENTS, perceptions: 1 });
    open = true;
    link.drained();
    expect(link.waiting).toEqual({ events: 0, perceptions: 0 });
    // Only the latest perception went out, after the events.
    const last = JSON.parse(sent.at(-1)!);
    expect(last).toMatchObject({ type: 'perception', time: 49 });
    expect(sent.filter((t) => t.includes('"perception"'))).toHaveLength(1);
  });
});
