import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../../core/gen/terrain';
import type { ModuleLoader } from '../moduleLoader';
import { HostSession } from '../session';
import { resolveWorldFolder, WORLD_FILE } from '../worldFolder';
import { ControllerLink } from './link';
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
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-proto3-'));
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

describe('controller protocol, version 3', () => {
  it('PROTO-001.a: the first message has the character with name and description, and the map', async () => {
    const { s } = await session();
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    expect(marta.sent[0]).toMatchObject({
      type: 'hello',
      version: 3,
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
      version: 3,
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

  it('PROTO-002.b: sentences carry yes or no; a message with @ reaches only a controller nearby; say may have an addressee nearby', async () => {
    const { s } = await session();
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    const tobia = client(s);
    tobia.say({ type: 'control', character: 'tobia' });
    run(s, 0.1);
    s.playerSays('@marta sì, volentieri');
    expect(marta.of('heard').at(-1)).toMatchObject({
      from: 'player',
      to: 'marta',
      text: 'sì, volentieri',
      yes_no: 'yes',
      mentions: null,
    });
    s.playerSays('@Marta torna al pozzo vecchio');
    expect(marta.of('heard').at(-1)).toMatchObject({
      to: 'marta',
      mentions: 'pozzo',
      yes_no: null,
    });
    // Marta walks far away: a message with @ does not reach her any more (A7.5).
    marta.say({ type: 'walk_to', id: 'w', x: 60, z: 60 });
    run(s, 30);
    const far = s.agents!.stateOf('marta')!;
    const p = s.agents!.stateOf('player')!;
    expect(Math.hypot(far.x - p.x, far.z - p.z)).toBeGreaterThan(16);
    const heardBefore = marta.of('heard').length;
    expect(s.playerSays('@Marta torna qui')).toEqual({
      ok: false,
      error: 'Personaggio non in prossimità',
    });
    expect(marta.of('heard')).toHaveLength(heardBefore);
    // A character speaks to the player nearby; to Marta, far away, it cannot (A7.6).
    const lines: string[] = [];
    s.listen((line) => lines.push(`${line.from}→${line.to}: ${line.text}`));
    tobia.say({ type: 'say', id: 's1', text: 'Marta, ti aspetto!', to: 'marta' });
    tobia.say({ type: 'say', id: 's2', text: 'Dove vado?', to: 'player' });
    tobia.say({ type: 'say', id: 's3', text: 'Ehi', to: 'nessuno' });
    run(s, 0.1);
    expect(lines).toEqual(['tobia→player: Dove vado?']);
    expect(tobia.of('action_failed')).toEqual([
      { type: 'action_failed', id: 's1', reason: '"marta" is not nearby' },
      { type: 'action_failed', id: 's3', reason: 'there is no character "nessuno"' },
    ]);
    // Near Marta, it can.
    marta.say({ type: 'walk_to', id: 'w2', target: 'tobia' });
    run(s, 30);
    tobia.say({ type: 'say', id: 's4', text: 'Marta, ti aspettavo!', to: 'marta' });
    run(s, 0.1);
    expect(marta.of('heard').at(-1)).toMatchObject({ from: 'tobia', to: 'marta' });
    expect(lines.at(-1)).toBe('tobia→marta: Marta, ti aspettavo!');
  });

  it('PROTO-004.a, PROTO-004.b: a client takes a character from its program, which is paused and then resumed', async () => {
    const { s, lines } = await session();
    const terminal = { line: (t: string) => lines.push(t) };
    // A program of the world folder, as the host starts it (plan F07 P7).
    const sent: Record<string, unknown>[] = [];
    const program = new ControllerLink(
      'tobia',
      s,
      { send: (text) => (sent.push(JSON.parse(text) as Record<string, unknown>), true) },
      terminal,
      () => 0,
      true,
    );
    program.start();
    const received = (type: string) => sent.filter((m) => m.type === type);
    program.receive(JSON.stringify({ type: 'walk_to', id: 'w1', target: 'pozzo' }));
    run(s, 0.5);
    // A client takes Tobia: the program is told, and its actions fail with «paused».
    const client1 = client(s, lines);
    client1.say({ type: 'control', character: 'tobia' });
    expect(client1.sent[0]).toMatchObject({ type: 'hello', character: { id: 'tobia' } });
    expect(lines).toContain('yw3d  [tobia] driven by a client on the WebSocket: its program waits');
    expect(received('paused')).toEqual([{ type: 'paused' }]);
    run(s, 0.5);
    const held = { ...s.agents!.stateOf('tobia')! };
    program.receive(JSON.stringify({ type: 'say', id: 's1', text: 'Io no' }));
    expect(sent.at(-1)).toEqual({ type: 'action_failed', id: 's1', reason: 'paused' });
    run(s, 2);
    // The walk of the program stopped; the client drives.
    expect(
      Math.hypot(s.agents!.stateOf('tobia')!.x - held.x, s.agents!.stateOf('tobia')!.z - held.z),
    ).toBeLessThan(0.3);
    client1.say({ type: 'say', id: 'c1', text: 'Ora comando io' });
    run(s, 0.1);
    expect(speech(s, 'tobia')).toBe('Ora comando io');
    const perceptionsWhilePaused = received('perception').length;
    run(s, 1);
    expect(received('perception')).toHaveLength(perceptionsWhilePaused);
    // A second client cannot take it while the first one drives.
    const client2 = client(s, lines);
    client2.say({ type: 'control', character: 'tobia' });
    expect(client2.sent.at(-1)).toMatchObject({ type: 'error' });
    // The client leaves: the program is told and drives again.
    client1.close();
    expect(lines).toContain('yw3d  [tobia] the WebSocket client left: its program goes on');
    expect(received('resumed')).toEqual([{ type: 'resumed' }]);
    program.receive(JSON.stringify({ type: 'say', id: 's2', text: 'Di nuovo io' }));
    run(s, 0.3);
    expect(speech(s, 'tobia')).toBe('Di nuovo io');
    expect(received('perception').length).toBeGreaterThan(perceptionsWhilePaused);
    // A controller that is not a program cannot be taken (PROTO-004.a).
    const marta = client(s);
    marta.say({ type: 'control', character: 'marta' });
    const other = client(s);
    other.say({ type: 'control', character: 'marta' });
    expect(other.sent.at(-1)).toEqual({
      type: 'error',
      message: 'the character "marta" already has a controller',
    });
  });
});
