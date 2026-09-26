export const DEFAULT_WORLD = 'default';
const MAX_SEED = 0xffffffff;

export interface StartParams {
  /** World file name, without folder and extension (YAML-006). */
  world: string;
  /** Seed from the URL, replacing the seed of the world file (APP-001.a). */
  seedOverride?: number;
  /** Set when the URL asked for something invalid and it was ignored (APP-001.b). */
  warning?: string;
}

/** Reads the start parameters from the URL query string. */
export function parseStartParams(search: string): StartParams {
  const query = new URLSearchParams(search);
  const world = query.get('world')?.trim() || DEFAULT_WORLD;
  const raw = query.get('seed');
  if (raw === null) {
    return { world };
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed) && Number(trimmed) <= MAX_SEED) {
    return { world, seedOverride: Number(trimmed) };
  }
  return {
    world,
    warning: `Invalid seed "${raw}": it must be an integer between 0 and ${MAX_SEED}. Using the seed of the world file.`,
  };
}
