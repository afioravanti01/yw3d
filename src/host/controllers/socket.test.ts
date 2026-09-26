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

async function session() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-socket-'));
  writeFileSync(
    path.join(root, WORLD_FILE),
    `version: 1\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\ncharacters:\n  - { id: marta, at: [30, 30] }\n`,
  );
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const s = new HostSession(resolved.folder, noModules, { line: (t) => lines.push(t) });
  await s.load();
  return { s, lines };
}

/** A stand-in for a `ws` socket: records what the host sends, lets the test send messages. */
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
}

const run = (s: HostSession, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
};

describe('controllers on the WebSocket', () => {
  it('PROTO-004.a: a client asks to drive a free character and then speaks the protocol', async () => {
    const { s, lines } = await session();
    const client = new FakeSocket();
    attachControllerSocket(client, s, { line: (t) => lines.push(t) }, () => 0);
    client.say({ type: 'control', character: 'marta' });
    expect(client.sent[0]).toMatchObject({ type: 'hello', character: { id: 'marta' } });
    expect(lines).toContain('yw3d  [marta] driven by a client on the WebSocket');
    client.say({ type: 'say', id: 's', text: 'Eccomi' });
    run(s, 0.3);
    expect(s.characterSnapshots()[0]!.speech).toBe('Eccomi');
    expect(client.sent.some((m) => m.type === 'perception')).toBe(true);
    // A second client cannot take the same character; unknown characters are refused.
    const other = new FakeSocket();
    attachControllerSocket(other, s, { line: () => {} }, () => 0);
    other.say({ type: 'control', character: 'marta' });
    expect(other.sent).toEqual([
      { type: 'error', message: 'the character "marta" already has a controller' },
    ]);
    expect(other.closed).toBe(true);
    const lost = new FakeSocket();
    attachControllerSocket(lost, s, { line: () => {} }, () => 0);
    lost.say({ type: 'control', character: 'nobody' });
    expect(lost.sent).toEqual([{ type: 'error', message: 'there is no character "nobody"' }]);
    const rude = new FakeSocket();
    attachControllerSocket(rude, s, { line: () => {} }, () => 0);
    rude.say({ type: 'say', id: 'x', text: 'hi' });
    expect(rude.sent[0]).toMatchObject({
      type: 'error',
      message: expect.stringContaining('first message'),
    });
  });

  it('PROTO-004.b: when the client closes, the character stops and another client can take it', async () => {
    const { s, lines } = await session();
    const first = new FakeSocket();
    attachControllerSocket(first, s, { line: (t) => lines.push(t) }, () => 0);
    first.say({ type: 'control', character: 'marta' });
    first.say({ type: 'wait', id: 'w', seconds: 60 });
    run(s, 0.2);
    first.close();
    expect(s.isControlled('marta')).toBe(false);
    expect(lines).toContain('yw3d  [marta] the WebSocket client left: the character stops');
    expect(s.agents!.perceive('marta').action).toBeNull();
    const second = new FakeSocket();
    attachControllerSocket(second, s, { line: () => {} }, () => 0);
    second.say({ type: 'control', character: 'marta' });
    expect(second.sent[0]).toMatchObject({ type: 'hello' });
    second.close();
  });
});
