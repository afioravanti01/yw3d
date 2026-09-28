import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parseArgs, USAGE } from './args';
import { resolveWorldFolder, structureFiles, WORLD_FILE } from './worldFolder';

function tempFolder(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

describe('yw3d command line', () => {
  it('CLI-001.a: the world is world.yaml of the given folder; errors are clear', () => {
    const root = tempFolder({ [WORLD_FILE]: 'version: 2\nname: Test\n' });
    const resolved = resolveWorldFolder(root);
    expect(resolved).toEqual({
      ok: true,
      folder: { root, worldFile: path.join(root, WORLD_FILE) },
    });
    // Relative to the current directory.
    expect(resolveWorldFolder(path.basename(root), path.dirname(root)).ok).toBe(true);
    expect(resolveWorldFolder(path.join(root, 'missing'))).toEqual({
      ok: false,
      message: expect.stringContaining('does not exist'),
    });
    expect(resolveWorldFolder(path.join(root, WORLD_FILE))).toEqual({
      ok: false,
      message: expect.stringContaining('is not a folder'),
    });
    const empty = tempFolder({ 'other.yaml': '' });
    expect(resolveWorldFolder(empty)).toEqual({
      ok: false,
      message: expect.stringContaining(`has no ${WORLD_FILE}`),
    });
    expect(parseArgs([])).toEqual({ kind: 'error', message: 'missing the world folder' });
  });

  it('CLI-001.c: --port, --no-open, --lan, --seed and --help', () => {
    expect(parseArgs(['valle'])).toEqual({
      kind: 'run',
      options: {
        folder: 'valle',
        port: DEFAULT_PORT,
        open: true,
        lan: false,
        seed: undefined,
        allowCommands: false,
        python: undefined,
      },
    });
    expect(
      parseArgs([
        '--port',
        '8080',
        'valle',
        '--no-open',
        '--lan',
        '--seed',
        '42',
        '--allow-commands',
      ]),
    ).toEqual({
      kind: 'run',
      options: {
        folder: 'valle',
        port: 8080,
        open: false,
        lan: true,
        seed: 42,
        allowCommands: true,
        python: undefined,
      },
    });
    expect(parseArgs(['valle', '--python', '/opt/py/bin/python3.12'])).toMatchObject({
      options: { python: '/opt/py/bin/python3.12' },
    });
    expect(parseArgs(['valle', '--python']).kind).toBe('error');
    expect(USAGE).toContain('--python <path>');
    expect(parseArgs(['valle', '--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['-h'])).toEqual({ kind: 'help' });
    for (const bad of [
      ['valle', '--port', 'x'],
      ['valle', '--port', '70000'],
      ['valle', '--seed', '-1'],
      ['valle', '--seed'],
      ['valle', '--fast'],
      ['valle', 'other'],
    ]) {
      expect(parseArgs(bad).kind).toBe('error');
    }
    expect(USAGE).toContain('--no-open');
    expect(USAGE).toContain('world.yaml');
  });

  it('lists the structure files of the author, sorted', () => {
    const root = tempFolder({
      [WORLD_FILE]: '',
      'structures/tower.ts': '',
      'structures/bridge.js': '',
      'structures/types.d.ts': '',
      'structures/notes.md': '',
    });
    const resolved = resolveWorldFolder(root);
    if (!resolved.ok) throw new Error(resolved.message);
    expect(structureFiles(resolved.folder).map((f) => path.basename(f))).toEqual([
      'bridge.js',
      'tower.ts',
    ]);
  });

  it('LAB-007.a, CLI-001.c: yw3d run takes a folder, runs, brains, a spending cap; the help describes it', () => {
    expect(
      parseArgs([
        'run',
        'valle',
        '--runs',
        '3',
        '--brain',
        'fake',
        '--brain',
        'claude,model=sonnet,effort=low',
        '--budget',
        '0.5',
        '--allow-commands',
      ]),
    ).toEqual({
      kind: 'series',
      options: {
        folder: 'valle',
        runs: 3,
        brains: ['fake', 'claude,model=sonnet,effort=low'],
        budget: 0.5,
        allowCommands: true,
        python: undefined,
      },
    });
    expect(parseArgs(['run', 'valle'])).toMatchObject({
      kind: 'series',
      options: { runs: 5, brains: [], budget: undefined },
    });
    expect(parseArgs(['run'])).toEqual({
      kind: 'error',
      message: 'yw3d run: missing the world folder',
    });
    expect(parseArgs(['run', 'valle', '--runs', '0'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['run', 'valle', '--budget', '-1'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['run', 'valle', '--port', '1'])).toEqual({
      kind: 'error',
      message: 'unknown option --port of yw3d run',
    });
    expect(USAGE).toContain('yw3d run <folder>');
    expect(USAGE).toContain('--brain <b>');
    expect(USAGE).toContain('--budget <d>');
  });
});
