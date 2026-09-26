import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkPrograms,
  commandConsent,
  fileConsentStore,
  findProgram,
  fingerprint,
} from './consent';

const COMMANDS = [
  { id: 'guardiano', command: 'python guardiano.py' },
  { id: 'marta', command: 'node marta.js' },
];

function setup(answers: string[] | undefined, allowAll = false) {
  const home = mkdtempSync(path.join(tmpdir(), 'yw3d-home-'));
  const folder = mkdtempSync(path.join(tmpdir(), 'yw3d-world-'));
  const lines: string[] = [];
  const asked: string[] = [];
  const store = fileConsentStore(home);
  const make = () =>
    commandConsent({
      folder,
      allowAll,
      store,
      terminal: { line: (t) => lines.push(t) },
      ask: answers && (async (q) => (asked.push(q), answers.shift() ?? '')),
    });
  return { home, folder, lines, asked, store, make };
}

describe('consent to run commands', () => {
  it('PROTO-005.a: the commands are listed and the user is asked; --allow-commands does not ask', async () => {
    const yes = setup(['y']);
    expect(await yes.make()(COMMANDS)).toBe(true);
    expect(yes.lines.slice(0, 3)).toEqual([
      'yw3d  this world wants to run these commands:',
      '        guardiano  python guardiano.py',
      '        marta      node marta.js',
    ]);
    expect(yes.asked).toEqual(['yw3d  run them? [y/N] ']);

    const no = setup(['']);
    expect(await no.make()(COMMANDS)).toBe(false);
    expect(no.lines.at(-1)).toBe('yw3d  not allowed: the characters with a command stand still');

    const allowed = setup([], true);
    expect(await allowed.make()(COMMANDS)).toBe(true);
    expect(allowed.asked).toEqual([]);

    // Without an interactive terminal nothing is asked and nothing runs.
    const headless = setup(undefined);
    expect(await headless.make()(COMMANDS)).toBe(false);
    expect(headless.lines.at(-1)).toContain('use --allow-commands');
    // Nothing to run, nothing to ask.
    expect(await setup(undefined).make()([])).toBe(true);
  });

  it('PROTO-005.c: the consent is remembered until the commands change, outside the world folder', async () => {
    const s = setup(['y', 'y']);
    expect(await s.make()(COMMANDS)).toBe(true);
    // A new host on the same folder: no question.
    expect(await s.make()(COMMANDS)).toBe(true);
    expect(s.asked).toHaveLength(1);
    expect(s.lines).toContain('yw3d  running the commands already allowed for this folder');
    // Same commands in another order: same fingerprint.
    expect(fingerprint([...COMMANDS].reverse())).toBe(fingerprint(COMMANDS));
    // A changed command asks again.
    const changed = [COMMANDS[0]!, { id: 'marta', command: 'node marta.js --fast' }];
    expect(await s.make()(changed)).toBe(true);
    expect(s.asked).toHaveLength(2);
    // Stored in the home, never in the world folder.
    expect(existsSync(path.join(s.home, '.yw3d', 'consent.json'))).toBe(true);
    expect(readdirSync(s.folder)).toEqual([]);
  });

  it('PROTO-005.b: a missing program is reported with the character and the command', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'yw3d-progs-'));
    mkdirSync(path.join(folder, 'bin'));
    writeFileSync(path.join(folder, 'bin', 'tool'), '#!/bin/sh\n');
    chmodSync(path.join(folder, 'bin', 'tool'), 0o755);
    expect(findProgram('node controller.js', folder)).toBeDefined();
    expect(findProgram('./bin/tool --x', folder)).toBe(path.join(folder, 'bin', 'tool'));
    expect(findProgram('surely-not-a-program-yw3d arg', folder)).toBeUndefined();
    const lines: string[] = [];
    const kept = checkPrograms(
      [
        { id: 'ok', command: 'node a.js' },
        { id: 'ghost', command: 'surely-not-a-program-yw3d run' },
      ],
      folder,
      { line: (t) => lines.push(t) },
    );
    expect(kept.map((c) => c.id)).toEqual(['ok']);
    expect(lines).toEqual([
      'yw3d  [ghost] the program "surely-not-a-program-yw3d" of "surely-not-a-program-yw3d run" was not found',
    ]);
  });
});
