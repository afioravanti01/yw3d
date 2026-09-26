/**
 * World files bundled with the app (plan F02 P13): `worlds/*.yaml`, plus the test worlds of
 * `e2e/worlds/` in test builds only. Editing a file in development triggers a hot update of
 * this module, which the app accepts to regenerate the world (YAML-007).
 */
const projectWorlds = import.meta.glob('/worlds/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const testWorlds = (
  import.meta.env.MODE === 'test'
    ? import.meta.glob('/e2e/worlds/*.yaml', { query: '?raw', import: 'default', eager: true })
    : {}
) as Record<string, string>;

const byName = new Map<string, { path: string; text: string }>();
for (const [path, text] of Object.entries({ ...projectWorlds, ...testWorlds })) {
  byName.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, ''), {
    path: path.slice(1),
    text,
  });
}

/** Names of the available worlds, sorted. */
export function worldNames(): string[] {
  return [...byName.keys()].sort();
}

/** Path (e.g. `worlds/default.yaml`) and text of a world, or undefined if it does not exist. */
export function worldFile(name: string): { path: string; text: string } | undefined {
  return byName.get(name);
}
