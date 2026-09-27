import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import type { DeclaredCommand } from './consent';
import type { ModuleLoader } from './moduleLoader';
import { checkPython, LIBRARY_PATH, programCommand, type PythonCheck } from './python';
import { HostSession, type SessionOptions } from './session';
import { affectsWorld } from './watch';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const HEADER = `version: 2\nname: Test\nterrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }\n`;

/** Programs used by the tests: raw protocol, as the library will speak it (PY-001.c). */
const PROGRAMS: Record<string, string> = {
  'characters/walker.py': `
import json, sys
import yw3d
print("library " + yw3d.__file__, file=sys.stderr, flush=True)
hello = json.loads(sys.stdin.readline())
print("hello " + hello["character"]["name"], file=sys.stderr, flush=True)
print(json.dumps({"type": "walk_to", "id": "w1", "x": 40, "z": 30}), flush=True)
for line in sys.stdin:
    if json.loads(line)["type"] == "action_done":
        print("arrived", file=sys.stderr, flush=True)
`,
  'characters/broken.py': `
import sys
sys.stdin.readline()
raise RuntimeError("something went wrong")
`,
  'characters/quiet.py': `
import sys
sys.stdin.readline()
`,
};

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.close();
});

async function session(characters: string, options: SessionOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-programs-'));
  for (const [name, text] of Object.entries(PROGRAMS)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  writeFileSync(path.join(root, WORLD_FILE), `${HEADER}characters:\n${characters}`);
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const asked: DeclaredCommand[][] = [];
  const s = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    {
      consent: async (commands) => {
        asked.push([...commands]);
        return true;
      },
      ...options,
    },
  );
  sessions.push(s);
  const loaded = await s.load();
  return { s, lines, asked, loaded, root, folder: resolved.folder };
}

async function until(s: HostSession, done: () => boolean, seconds = 15): Promise<void> {
  const end = Date.now() + seconds * 1000;
  while (!done()) {
    if (Date.now() > end) throw new Error('timed out');
    for (let i = 0; i < 3; i++) s.advance(1 / 60);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const errorsOf = (s: HostSession) =>
  s.diagnostics.map((d) => ({ line: d.line, path: d.path, message: d.message }));

describe('Python programs of the world folder', () => {
  it('PY-003.a, PY-001.a: a character with a program runs it with the consent, and the program imports the library without installing it', async () => {
    const { s, lines, asked } = await session(
      '  - { id: tobia, name: Tobia, at: [30, 30], program: characters/walker.py }\n',
    );
    // The consent shows the command that really runs.
    expect(asked).toEqual([
      [{ id: 'tobia', command: 'python3 -u characters/walker.py', program: true }],
    ]);
    expect(lines).toContain('yw3d  characters: tobia (program characters/walker.py)');
    expect(lines).toContain('yw3d  [tobia] program started: python3 -u characters/walker.py');
    await until(s, () => lines.includes('yw3d  [tobia] arrived'));
    expect(lines).toContain(
      `yw3d  [tobia] library ${path.join(LIBRARY_PATH, 'yw3d', '__init__.py')}`,
    );
    expect(lines).toContain('yw3d  [tobia] hello Tobia');
    const tobia = s.agents!.stateOf('tobia')!;
    expect(Math.hypot(tobia.x - 40.5, tobia.z - 30.5)).toBeLessThanOrEqual(1.8);
    expect(s.programOf('tobia')).toEqual({ file: 'characters/walker.py', state: 'running' });
  });

  it('PY-003.a: a program and a controller together are an error; the command quotes paths with spaces', async () => {
    const { loaded, s } = await session(
      '  - id: tobia\n    name: Tobia\n    at: [30, 30]\n    program: characters/walker.py\n    controller: { command: node t.mjs }\n',
    );
    expect(loaded).toBe(false);
    expect(errorsOf(s)).toEqual([
      {
        line: 9,
        path: 'characters[0].controller',
        message: 'a character has either a program or a controller, not both',
      },
    ]);
    expect(programCommand('python3', 'personaggi/il garzone.py')).toBe(
      'python3 -u "personaggi/il garzone.py"',
    );
  });

  it('PY-003.b: a program missing, outside the folder or not .py is an error of the world file', async () => {
    const { loaded, s } = await session(
      [
        '  - { id: a, name: A, at: [30, 30], program: characters/nessuno.py }',
        '  - { id: b, name: B, at: [31, 30], program: ../fuori.py }',
        '  - { id: c, name: C, at: [32, 30], program: characters/walker.txt }',
        '',
      ].join('\n'),
    );
    expect(loaded).toBe(false);
    expect(errorsOf(s)).toEqual([
      {
        line: 6,
        path: 'characters[1].program',
        message: 'the program "../fuori.py" must be a file inside the world folder',
      },
      {
        line: 7,
        path: 'characters[2].program',
        message: 'the program "characters/walker.txt" must be a Python file (.py)',
      },
    ]);
    // The missing file is found once the file is otherwise valid.
    const missing = await session(
      '  - { id: a, name: A, at: [30, 30], program: characters/nessuno.py }\n',
    );
    expect(missing.loaded).toBe(false);
    expect(errorsOf(missing.s)).toEqual([
      {
        line: 5,
        path: 'characters[0].program',
        message: 'the program "characters/nessuno.py" does not exist in the world folder',
      },
    ]);
  });

  it('PY-003.b: a missing or old interpreter is reported with the character, which stands still', async () => {
    const run =
      (stdout: string, status = 0) =>
      () => ({ status, stdout });
    expect(checkPython('python3', run('3.12\n'))).toEqual({ ok: true, version: '3.12' });
    expect(checkPython('python3', run('3.10\n'))).toEqual({ ok: true, version: '3.10' });
    expect(checkPython('python3', run('3.9\n'))).toEqual({
      ok: false,
      error:
        'Python 3.9 ("python3") is older than 3.10: install a newer one, or give its path with --python',
    });
    expect(
      checkPython('/nowhere/python3', () => ({
        status: null,
        stdout: '',
        error: new Error('ENOENT'),
      })),
    ).toEqual({
      ok: false,
      error:
        'Python was not found ("/nowhere/python3"): install Python 3.10 or later, or give its path with --python',
    });
    // Through the session, with --python pointing nowhere.
    const { lines, s } = await session(
      '  - { id: tobia, name: Tobia, at: [30, 30], program: characters/walker.py }\n',
      { python: '/nowhere/python3' },
    );
    expect(lines).toContain(
      'yw3d  [tobia] cannot start the program: Python was not found ("/nowhere/python3"): install Python 3.10 or later, or give its path with --python',
    );
    expect(s.programOf('tobia')).toEqual({ file: 'characters/walker.py', state: 'stopped' });
    // An old interpreter, as the check reports it.
    const old: PythonCheck = { ok: false, error: 'Python 3.8 ("python3") is older than 3.10' };
    const second = await session(
      '  - { id: tobia, name: Tobia, at: [30, 30], program: characters/walker.py }\n',
      { checkPython: () => old },
    );
    expect(second.lines).toContain(
      'yw3d  [tobia] cannot start the program: Python 3.8 ("python3") is older than 3.10',
    );
  });

  it('PY-003.c, HOST-001.c: an error in the program shows in the terminal and the character stops; saving a .py reloads the world', async () => {
    const { s, lines, folder, root } = await session(
      [
        '  - { id: rotto, name: Rotto, at: [30, 30], program: characters/broken.py }',
        '  - { id: quieto, name: Quieto, at: [34, 30], program: characters/quiet.py }',
        '',
      ].join('\n'),
    );
    await until(
      s,
      () => s.programOf('rotto')?.state === 'error' && s.programOf('quieto')?.state === 'stopped',
    );
    expect(lines).toContainEqual(expect.stringMatching(/^yw3d {2}\[rotto\] .*broken\.py", line 4/));
    expect(lines).toContain('yw3d  [rotto] RuntimeError: something went wrong');
    expect(lines).toContain('yw3d  [rotto] program ended (exit code 1): the character stops');
    expect(lines).toContain('yw3d  [quieto] program ended (exit code 0): the character stops');
    expect(s.characterSnapshots().map((c) => [c.id, c.program])).toEqual([
      ['rotto', { file: 'characters/broken.py', state: 'error' }],
      ['quieto', { file: 'characters/quiet.py', state: 'stopped' }],
    ]);
    // Saving a program reloads the world, which starts the programs again (HOST-003).
    expect(affectsWorld(folder, path.join(root, 'characters/broken.py'))).toBe(true);
    expect(
      affectsWorld(folder, path.join(root, 'characters/__pycache__/broken.cpython-313.pyc')),
    ).toBe(false);
    expect(affectsWorld(folder, path.join(root, 'characters/__pycache__/x.py'))).toBe(false);
    expect(await s.load()).toBe(true);
    expect(s.programOf('rotto')).toEqual({ file: 'characters/broken.py', state: 'running' });
    await until(s, () => s.programOf('rotto')?.state === 'error');
  });
});
