/**
 * World files bundled with the app (plan F02 P13): `worlds/*.yaml`, plus the test worlds of
 * `e2e/worlds/` in test builds only. The YAML files in their subfolders are the files a world
 * names, such as behaviors (plan F06 P14). Editing a file in development triggers a hot update
 * of this module, which the app accepts to regenerate the world (YAML-007).
 */
const projectFiles = import.meta.glob('/worlds/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const testFiles = (
  import.meta.env.MODE === 'test'
    ? import.meta.glob('/e2e/worlds/**/*.yaml', { query: '?raw', import: 'default', eager: true })
    : {}
) as Record<string, string>;

const files = new Map<string, string>();
const byName = new Map<string, { path: string; text: string }>();
for (const [path, text] of Object.entries({ ...projectFiles, ...testFiles })) {
  files.set(path.slice(1), text);
  // Worlds are the files directly in `worlds/` (or `e2e/worlds/`), not in their subfolders.
  if (!/^\/(e2e\/)?worlds\/[^/]+\.yaml$/.test(path)) continue;
  byName.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, ''), {
    path: path.slice(1),
    text,
  });
}

/**
 * Reads a file named by a world, relative to the folder of the world file, e.g.
 * `comportamenti/giro.yaml` for `worlds/default.yaml` (BEHAV-001.a).
 */
export function readWorldFile(worldPath: string, relative: string): string | undefined {
  const folder = worldPath.slice(0, worldPath.lastIndexOf('/'));
  return files.get(`${folder}/${relative}`);
}

/** Names of the available worlds, sorted. */
export function worldNames(): string[] {
  return [...byName.keys()].sort();
}

/** Path (e.g. `worlds/default.yaml`) and text of a world, or undefined if it does not exist. */
export function worldFile(name: string): { path: string; text: string } | undefined {
  return byName.get(name);
}
