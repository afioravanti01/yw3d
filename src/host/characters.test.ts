import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent, Perception } from '../core/agents/agentWorld';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import type { HostMessage } from '../protocol/messages';
import type { ModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

async function session(characters = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-chars-'));
  writeFileSync(
    path.join(root, WORLD_FILE),
    `version: 2\nname: Test\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\nplayer: { at: [30, 30] }\n${characters}`,
  );
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const s = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) });
  await s.load();
  return { s, lines };
}

const run = (s: HostSession, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
};

const TWO = `characters:
  - { id: guardiano, name: guardiano, at: [32, 30], controller: { command: python guardiano.py } }
  - { id: marta, name: marta, at: [20, 20] }
`;

describe('characters in the host', () => {
  it('HOST-001.c: the terminal lists the characters with their controller', async () => {
    const { lines } = await session(TWO);
    expect(lines).toContain(
      'yw3d  characters: guardiano (python guardiano.py), marta (no controller)',
    );
  });

  it('PROTO-003.c: characters act with no view connected', async () => {
    const { s } = await session(TWO);
    const events: AgentEvent[] = [];
    s.attachController('marta', { event: (_, e) => events.push(e), perception: () => {} });
    run(s, 0.5);
    s.agents!.request('marta', { kind: 'say', id: 'hello', text: 'Nessuno mi guarda' });
    run(s, 0.1);
    expect(s.characterSnapshots().find((c) => c.id === 'marta')!.speech).toBe('Nessuno mi guarda');
    run(s, 3);
    expect(events).toContainEqual({ type: 'action_done', id: 'hello' });
    // A walk to the player, wherever the terrain lets it go: it ends with an outcome.
    s.agents!.request('marta', { kind: 'walk_to', id: 'go', target: 'player' });
    run(s, 30);
    expect(events.some((e) => e.type !== 'heard' && 'id' in e && e.id === 'go')).toBe(true);
  });

  it('PROTO-002.c: E from the driving view reaches the nearest character within 3 m', async () => {
    const { s } = await session(TWO);
    const events: [string, AgentEvent][] = [];
    const perceptions: Perception[] = [];
    s.attachController('guardiano', {
      event: (id, e) => events.push([id, e]),
      perception: (_, p) => perceptions.push(p),
    });
    run(s, 0.5);
    const received: HostMessage[] = [];
    const driver = s.connect((m) => received.push(m));
    const spectator = s.connect(() => {});
    spectator.receive({ type: 'interact' });
    expect(events).toEqual([]);
    driver.receive({ type: 'interact' });
    expect(events).toEqual([['guardiano', { type: 'interacted', by: 'player' }]]);
    expect(perceptions.length).toBeGreaterThan(0);
    // Views get the characters with every state.
    run(s, 0.1);
    const state = received.filter((m) => m.type === 'state').at(-1);
    expect(state?.type === 'state' && state.characters.map((c) => c.id)).toEqual([
      'guardiano',
      'marta',
    ]);
  });

  it('a character whose controller goes away stops', async () => {
    const { s } = await session(TWO);
    const sink = { event: () => {}, perception: () => {} };
    s.attachController('marta', sink);
    expect(s.isControlled('marta')).toBe(true);
    run(s, 0.3);
    s.agents!.request('marta', { kind: 'walk_to', id: 'go', x: 50, z: 50 });
    run(s, 0.5);
    s.detachController('marta', sink);
    expect(s.isControlled('marta')).toBe(false);
    const stopped = s.characterSnapshots().find((c) => c.id === 'marta')!;
    run(s, 1);
    const later = s.characterSnapshots().find((c) => c.id === 'marta')!;
    expect(Math.hypot(later.x - stopped.x, later.z - stopped.z)).toBeLessThan(0.5);
  });
});
