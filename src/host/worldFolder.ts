import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** The world of a folder is always this file (F04 Q1). */
export const WORLD_FILE = 'world.yaml';
/** Structures of the author (STRUCT-008). */
export const STRUCTURES_DIR = 'structures';
const STRUCTURE_FILE = /\.(ts|mts|js|mjs)$/;

export interface WorldFolder {
  /** Absolute path of the folder. */
  readonly root: string;
  /** Absolute path of `world.yaml`. */
  readonly worldFile: string;
}

export type ResolvedFolder =
  | { readonly ok: true; readonly folder: WorldFolder }
  | { readonly ok: false; readonly message: string };

/** Checks the folder given to `yw3d` (CLI-001.a). */
export function resolveWorldFolder(given: string, cwd = process.cwd()): ResolvedFolder {
  const root = path.resolve(cwd, given);
  if (!existsSync(root)) return { ok: false, message: `the folder ${given} does not exist` };
  if (!statSync(root).isDirectory()) {
    return {
      ok: false,
      message: `${given} is not a folder: give the folder that contains ${WORLD_FILE}`,
    };
  }
  const worldFile = path.join(root, WORLD_FILE);
  if (!existsSync(worldFile)) {
    return { ok: false, message: `the folder ${given} has no ${WORLD_FILE}` };
  }
  return { ok: true, folder: { root, worldFile } };
}

/** Structure files of the author, sorted by name so that host and views agree on the order. */
export function structureFiles(folder: WorldFolder): string[] {
  const dir = path.join(folder.root, STRUCTURES_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => STRUCTURE_FILE.test(name) && !name.endsWith('.d.ts'))
    .sort()
    .map((name) => path.join(dir, name));
}
