import path from 'node:path';
import { STRUCTURES_DIR, WORLD_FILE, type WorldFolder } from './worldFolder';

/** The part of a file watcher (chokidar, as used by Vite) that the host needs. */
export interface FileWatcher {
  add(paths: string | readonly string[]): unknown;
  on(event: 'add' | 'change' | 'unlink', listener: (file: string) => void): unknown;
}

/** Quiet time before reloading, to gather the several writes of one save (plan F04 P11). */
export const RELOAD_DELAY_MS = 150;

/**
 * Whether a file change concerns the world: `world.yaml`, any other YAML file of the folder
 * (plan F06 P15), or a file under `structures/`.
 */
export function affectsWorld(folder: WorldFolder, file: string): boolean {
  const relative = path.relative(folder.root, path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return (
    relative === WORLD_FILE ||
    /\.ya?ml$/.test(relative) ||
    relative.startsWith(STRUCTURES_DIR + path.sep)
  );
}

/**
 * Calls `reload` after the world files of the folder change (HOST-003.a), once per burst of
 * changes. Returns a function that stops the pending reload.
 */
export function watchWorldFolder(
  watcher: FileWatcher,
  folder: WorldFolder,
  reload: () => void,
  delayMs = RELOAD_DELAY_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = (file: string) => {
    if (!affectsWorld(folder, file)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      reload();
    }, delayMs);
  };
  watcher.add(folder.root);
  for (const event of ['add', 'change', 'unlink'] as const) watcher.on(event, changed);
  return () => {
    if (timer) clearTimeout(timer);
  };
}
