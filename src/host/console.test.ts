import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../core/agents/agentWorld';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import { startConsole, terminalInput, type LineInput } from './console';
import type { ModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const WORLD = `version: 2
name: Borgo
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 30] }
characters:
  - id: tobia
    name: Tobia
    at: [30, 34]
  - { id: marta, name: Marta, at: [26, 30] }
  - { id: lontana, name: Lontana, at: [60, 60] }
`;

async function consoleOf() {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-console-'));
  writeFileSync(path.join(root, WORLD_FILE), WORLD);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const terminal = { line: (t: string) => lines.push(t) };
  const session = new HostSession(resolved.folder, noModules, terminal);
  await session.load();
  const typed: ((line: string) => void)[] = [];
  const input: LineInput = {
    onLine: (listener) => typed.push(listener),
    question: () => Promise.resolve(''),
    close: () => {},
  };
  startConsole(session, input, terminal);
  const type = (text: string) => typed.forEach((listener) => listener(text));
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) session.advance(1 / 60);
  };
  return { session, lines, type, run };
}

describe('the console of the host', () => {
  it('DIALOG-004.a: the terminal shows every message of the world, also far from the player; the player reads «Tu»', async () => {
    const { session, lines, type, run } = await consoleOf();
    session.agents!.request('tobia', { kind: 'say', id: 's1', text: 'Dove devo andare?' });
    // Lontana is 40 blocks away from the player: its message is in the terminal too.
    session.agents!.request('lontana', { kind: 'say', id: 's2', text: 'Sono al bosco.' });
    run(0.1);
    type('@tobia al laghetto');
    expect(lines).toContain('yw3d  Tobia: Dove devo andare?');
    expect(lines).toContain('yw3d  Lontana: Sono al bosco.');
    expect(lines).toContain('yw3d  Tu → Tobia: al laghetto');
  });

  it('DIALOG-004.b: a typed line is a message of the player, to the character of @id or @name, or a command', async () => {
    const { session, lines, type } = await consoleOf();
    const heard: AgentEvent[] = [];
    const far: AgentEvent[] = [];
    session.attachController('marta', { event: (_, e) => heard.push(e), perception: () => {} });
    session.attachController('lontana', { event: (_, e) => far.push(e), perception: () => {} });
    type('Buongiorno!');
    type('@marta come stai?');
    expect(heard).toEqual([
      expect.objectContaining({ type: 'heard', from: 'player', text: 'Buongiorno!', to: null }),
      expect.objectContaining({ type: 'heard', from: 'player', text: 'come stai?', to: 'marta' }),
    ]);
    // Lontana is 40 blocks away: only characters nearby can be spoken to (A7.5).
    type('@Lontana torna qui');
    expect(lines.at(-1)).toBe('yw3d  cannot say it: Personaggio non in prossimità');
    expect(far).toEqual([]);
    type('@nessuno ciao');
    expect(lines.at(-1)).toBe(
      'yw3d  cannot say it: no character is called "nessuno"; the characters are: Tobia (tobia), Marta (marta), Lontana (lontana)',
    );
    // Commands are answered in the terminal and not said in the world.
    type('/help');
    expect(lines).toContain('yw3d  - /help: this help.');
    type('/world');
    expect(lines).toContain('yw3d  - Lontana (lontana) · 61, 61');
    expect(lines).toContain('yw3d  Characters');
    type('/vola');
    expect(lines.at(-1)).toBe('yw3d  unknown command "/vola": write /help');
    expect(heard).toHaveLength(2);
  });

  it('DIALOG-004.c: the console only on an interactive terminal; a pending question takes the next line', async () => {
    const notTty = Object.assign(new PassThrough(), { isTTY: false });
    expect(terminalInput(notTty, new PassThrough())).toBeUndefined();
    const stdin = Object.assign(new PassThrough(), { isTTY: true });
    const stdout = new PassThrough();
    const input = terminalInput(stdin, stdout)!;
    const typed: string[] = [];
    input.onLine((line) => typed.push(line));
    const answer = input.question('Allow these commands? [y/N] ');
    stdin.write('y\n');
    expect(await answer).toBe('y');
    stdin.write('ciao a tutti\n');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(typed).toEqual(['ciao a tutti']);
    expect(String(stdout.read())).toBe('Allow these commands? [y/N] ');
    input.close();
  });
});
