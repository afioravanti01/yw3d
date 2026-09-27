import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TERRAIN_GENERATOR_VERSION } from '../core/gen/terrain';
import type { ModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import { affectsWorld } from './watch';
import { resolveWorldFolder, WORLD_FILE } from './worldFolder';

const noModules: ModuleLoader = {
  load: () => Promise.reject(new Error('none')),
  invalidate: () => {},
};

const HEADER = `version: 2
name: Borgo di prova
terrain: { seed: 5, generator: ${TERRAIN_GENERATOR_VERSION}, size: [64, 96, 64] }
player: { at: [30, 30] }
places:
  - { id: pozzo, name: Pozzo, at: [40, 30] }
`;

async function host(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'yw3d-behaviors-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const resolved = resolveWorldFolder(root);
  if (!resolved.ok) throw new Error(resolved.message);
  const lines: string[] = [];
  const consent = vi.fn(async () => true);
  const session = new HostSession(
    resolved.folder,
    noModules,
    { line: (t) => lines.push(t) },
    { consent, display: (file) => path.relative(root, file) },
  );
  await session.load();
  return { session, lines, consent, root, folder: resolved.folder };
}

const run = (s: HostSession, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s.advance(1 / 60);
};

const where = (s: HostSession, id: string) => s.agents!.stateOf(id)!;

const TOBIA = `characters:
  - id: tobia
    name: Tobia
    at: [30, 34]
    behavior:
      memory: { counters: [giri] }
      routine:
        - walk_to: pozzo
        - count: giri
        - if: { counter: giri, equals: 1 }
          then: [{ say: primo giro }]
        - walk_to: [30, 34]
  - { id: marta, name: Marta, at: [26, 30] }
`;

describe('behaviors in the host', () => {
  it('HOST-001.c: the terminal names the world and the behaviors, and says why an action failed', async () => {
    const { session, lines } = await host({
      [WORLD_FILE]: `${HEADER}characters:\n  - id: tobia\n    name: Tobia\n    at: [30, 34]\n    behavior:\n      repeat: false\n      routine:\n        - walk_to: [500, 500]\n  - { id: marta, name: Marta, at: [26, 30] }\n`,
    });
    expect(lines).toContain('yw3d  world Borgo di prova (world.yaml) · seed 5');
    expect(lines).toContain('yw3d  characters: tobia (behavior), marta (no controller)');
    run(session, 0.5);
    expect(lines).toContain(
      'yw3d  [tobia] world.yaml:14: walk_to failed: the destination is outside the world',
    );
  });

  it('BEHAV-001.e: behaviors run no program and need no consent', async () => {
    const { session, consent } = await host({ [WORLD_FILE]: HEADER + TOBIA });
    const start = { ...where(session, 'tobia') };
    run(session, 3);
    expect(consent).not.toHaveBeenCalled();
    expect(
      Math.hypot(where(session, 'tobia').x - start.x, where(session, 'tobia').z - start.z),
    ).toBeGreaterThan(2);
  });

  it('CHAR-001.c: without a behavior or a controller a character stands still', async () => {
    const { session } = await host({ [WORLD_FILE]: HEADER + TOBIA });
    const start = { ...where(session, 'marta') };
    run(session, 5);
    expect(
      Math.hypot(where(session, 'marta').x - start.x, where(session, 'marta').z - start.z),
    ).toBeLessThan(0.1);
  });

  it('BEHAV-001.g: at a reload, also of an external behavior file, behaviors start over with empty memory', async () => {
    const { session, root, folder } = await host({
      [WORLD_FILE]: `${HEADER}characters:\n  - id: tobia\n    name: Tobia\n    at: [30, 34]\n    behavior: { file: comportamenti/tobia.yaml }\n`,
      'comportamenti/tobia.yaml':
        'memory: { counters: [n] }\nroutine:\n  - count: n\n  - if: { counter: n, equals: 1 }\n    then: [{ say: prima volta }]\n    else: [{ say: ancora }]\n',
    });
    // Saving the behavior file reloads the world, like the world file (plan F06 P15).
    expect(affectsWorld(folder, path.join(root, 'comportamenti/tobia.yaml'))).toBe(true);
    expect(affectsWorld(folder, path.join(root, 'note.txt'))).toBe(false);
    const speech = () => session.characterSnapshots().find((c) => c.id === 'tobia')!.speech;
    run(session, 0.2);
    expect(speech()).toBe('prima volta');
    run(session, 3);
    expect(speech()).toBe('ancora');
    writeFileSync(
      path.join(root, 'comportamenti/tobia.yaml'),
      'memory: { counters: [n] }\nroutine:\n  - count: n\n  - if: { counter: n, equals: 1 }\n    then: [{ say: di nuovo la prima }]\n    else: [{ say: ancora }]\n',
    );
    expect(await session.load()).toBe(true);
    run(session, 0.2);
    expect(speech()).toBe('di nuovo la prima');
    // The views compose the same world: they receive the text of the file.
    expect(session.worldMessage()!.files).toEqual({
      'comportamenti/tobia.yaml': expect.stringContaining('di nuovo la prima'),
    });
  });
});
