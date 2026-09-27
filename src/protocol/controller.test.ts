import { describe, expect, it } from 'vitest';
import { CONTROLLER_PROTOCOL_VERSION, helloMessage, parseControllerMessage } from './controller';

const parse = (value: unknown) => parseControllerMessage(JSON.stringify(value));

describe('controller messages', () => {
  it('PROTO-001.a: the first message declares version, character with name and description, world size and map', () => {
    const map = { name: 'Valle', description: null, size: [512, 96, 512] as const, entries: [] };
    expect(
      helloMessage(
        { id: 'guardiano', name: 'Bruno', description: 'Il guardiano.' },
        [512, 96, 512],
        map,
      ),
    ).toEqual({
      type: 'hello',
      version: CONTROLLER_PROTOCOL_VERSION,
      character: { id: 'guardiano', name: 'Bruno', description: 'Il guardiano.' },
      world: { size: [512, 96, 512] },
      map,
    });
    expect(CONTROLLER_PROTOCOL_VERSION).toBe(3);
  });

  it('PROTO-001.b: each action is a message with its id', () => {
    expect(parse({ type: 'walk_to', id: 'a1', x: 150, z: 70 })).toEqual({
      ok: true,
      message: {
        kind: 'action',
        request: { kind: 'walk_to', id: 'a1', x: 150, z: 70 },
      },
    });
    expect(parse({ type: 'walk_to', id: 'a2', target: 'player', speed: 1.2 })).toMatchObject({
      message: { request: { kind: 'walk_to', target: 'player', speed: 1.2 } },
    });
    // A5.1: the speed is in m/s, between 0.5 and 7.
    expect(parse({ type: 'walk_to', id: 'a3', x: 1, z: 1, speed: 9 })).toMatchObject({ ok: false });
    expect(parse({ type: 'follow', id: 'f2', target: 'player', speed: 0.5 })).toMatchObject({
      message: { request: { speed: 0.5 } },
    });
    expect(parse({ type: 'look_at', id: 'l', target: 'marta' })).toMatchObject({ ok: true });
    expect(parse({ type: 'say', id: 's', text: 'Ciao!' })).toMatchObject({
      message: { request: { kind: 'say', text: 'Ciao!' } },
    });
    expect(parse({ type: 'follow', id: 'f', target: 'player' })).toMatchObject({
      message: { request: { kind: 'follow', target: 'player', distance: 3 } },
    });
    expect(parse({ type: 'wait', id: 'w', seconds: 2.5 })).toMatchObject({ ok: true });
    expect(parse({ type: 'stop', id: 'x' })).toMatchObject({
      message: { request: { kind: 'stop' } },
    });
    expect(parse({ type: 'control', character: 'guardiano' })).toEqual({
      ok: true,
      message: { kind: 'control', character: 'guardiano' },
    });
  });

  it('PROTO-001.d: invalid messages get an error with the cause', () => {
    const error = (text: string) => {
      const result = parseControllerMessage(text);
      if (result.ok) throw new Error('expected an error');
      return result.error;
    };
    expect(error('{ not json')).toEqual({ type: 'error', message: 'not valid JSON: { not json' });
    expect(error('[1, 2]').message).toBe('a message must be a JSON object with a "type"');
    expect(error('{"type": "fly"}').message).toContain(
      'unknown message type "fly"; expected one of: walk_to',
    );
    expect(error('{"type": "walk_to", "id": "a", "x": 3}').message).toBe(
      'walk_to: give either "x" and "z", or "target"',
    );
    expect(
      error('{"type": "walk_to", "id": "a", "x": 3, "z": 4, "target": "p"}').message,
    ).toContain('give either');
    expect(error('{"type": "say", "id": "s", "text": ""}').message).toBe(
      'text: the text must have 1 to 500 characters',
    );
    expect(error('{"type": "wait", "seconds": -1}').message).toBe(
      'id: missing required field; seconds: -1 is out of range: expected a number between 0 and 3600',
    );
    expect(error('{"type": "stop", "id": "x", "why": 1}').message).toBe('why: unknown field');
  });
});
