export const DEFAULT_SEED = 1;
const MAX_SEED = 0xffffffff;

export interface StartParams {
  seed: number;
  /** Set when the URL asked for something invalid and a default was used instead (APP-001.b). */
  warning?: string;
}

/** Reads the start parameters from the URL query string (APP-001.a). */
export function parseStartParams(search: string): StartParams {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null) {
    return { seed: DEFAULT_SEED };
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed) && Number(trimmed) <= MAX_SEED) {
    return { seed: Number(trimmed) };
  }
  return {
    seed: DEFAULT_SEED,
    warning: `Invalid seed "${raw}": it must be an integer between 0 and ${MAX_SEED}. Using the default seed ${DEFAULT_SEED}.`,
  };
}
