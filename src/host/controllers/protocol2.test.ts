import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import { HostSession } from '../session';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';
import { attachControllerSocket, type ControllerSocket } from './socket';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 30], name: Ada }
places:
  - { id: pozzo, name: Pozzo vecchio, at: [44, 30] }
characters:
  - id: tobia
    name: Tobia
    description: Il garzone del fabbro.
    at: [30, 34]
  - { id: marta, name: Marta, at: [26, 30] }
`;

async function session() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-proto2-'));
  const file = path.join(root, WORLD_FILE);
  writeFileSync(file, WORLD);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const s = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) });
  await s.load();
  return { s, lines, file };
}

class FakeSocket extends EventEmitter implements ControllerSocket {
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
    this.emit('close');
  }
  say(message: unknown): void {
    this.emit('message', JSON.stringify(message));
  }
  of(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

function client(s: HostSession, lines: string[] = []) {
  const socket = new FakeSocket();
  attachControllerSocket(socket, s, { line: (t) => lines.push(t) }, () => 0);
  return socket;
}

const run = (s: HostSession, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
};

const speech = (s: HostSession, id: string) =>
  s.characterSnapshots().find((c) => c.id === id)!.speech;

describe('controller protocol, version 2', () => {
  it('PROTO-001.a: the first message has the character with name and description, and the map', async () => {
    const { s } = await session();
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    expect(marta.sent[0]).toMatchObject({
      type: 'hello',
      version: 2,
      character: { id: 'marta', name: 'Marta', description: null },
      world: { size: [64, 96, 64] },
      map: { name: 'Borgo' },
    });
    const ids = (marta.sent[0]!.map as { entries: { id: string }[] }).entries.map((e) => e.id);
    expect(ids).toEqual(['pozzo', 'tobia', 'marta', 'player']);
  });

  it('PROTO-001.e: at a reload of the world the controller gets the new map', async () => {
    const { s, file } = await session();
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    writeFileSync(file, WORLD.replace('name: Pozzo vecchio', 'name: Pozzo nuovo'));
    expect(await s.load()).toBe(true);
    const [update] = marta.of('map');
    expect(update).toMatchObject({ type: 'map', map: { name: 'Borgo' } });
    expect(JSON.stringify(update)).toContain('Pozzo nuovo');
    // Still attached: it drives Marta in the new world.
    marta.say({ type: 'say', id: 's', text: 'Ancora qui' });
    run(s, 0.1);
    expect(speech(s, 'marta')).toBe('Ancora qui');
  });

  it('PROTO-007.a: a client speaks as the player, with an addressee, and hears what the player hears', async () => {
    const { s, lines } = await session();
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    const voice = client(s, lines);
    voice.say({ type: 'player' });
    expect(voice.sent[0]).toMatchObject({
      type: 'hello',
      version: 2,
      player: { id: 'player', name: 'Ada' },
      map: { name: 'Borgo' },
    });
    expect(lines).toContain('yw3d  a client on the WebSocket speaks as the player');
    run(s, 0.5);
    voice.say({ type: 'say', text: 'Buongiorno Marta!', to: 'marta' });
    expect(marta.of('heard')).toContainEqual(
      expect.objectContaining({ from: 'player', text: 'Buongiorno Marta!', to: 'marta' }),
    );
    // The client hears its own sentence and the characters near the player.
    s.agents!.request('tobia', { kind: 'say', id: 's1', text: 'uno' });
    run(s, 0.1);
    expect(voice.of('heard')).toEqual(
      expect.arrayContaining([
        {
          type: 'heard',
          from: 'player',
          from_name: 'Ada',
          to: 'marta',
          to_name: 'Marta',
          text: 'Buongiorno Marta!',
        },
        expect.objectContaining({ from: 'tobia', from_name: 'Tobia', text: 'uno' }),
      ]),
    );
    voice.say({ type: 'say', text: 'Ehi', to: 'nessuno' });
    expect(voice.sent.at(-1)).toEqual({
      type: 'error',
      message: 'there is no character "nessuno"',
    });
    voice.say({ type: 'walk_to', id: 'x', x: 1, z: 1 });
    expect(voice.sent.at(-1)).toMatchObject({ type: 'error' });
  });
});
