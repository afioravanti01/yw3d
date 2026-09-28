import type { ContextInput } from './context';

/**
 * The brain of an agent (plan F08 P2): it gets the context and gives the reply, as a parsed
 * object when the brain enforces the schema, or as text to read the JSON from, with what the
 * request consumed (plan F10 P6). It must give up when the signal aborts: the runtime aborts it
 * at the time limit.
 */
export interface Brain {
  /** How the terminal and the overlay name it, e.g. `claude` or `anthropic api`. */
  readonly name: string;
  /** Something the author should know about its configuration, said once at the start. */
  readonly warning?: string;
  think(request: BrainRequest, signal: AbortSignal): Promise<Thought>;
}

export interface BrainRequest {
  /** The whole text for the LLM (AGENT-002.a). */
  readonly text: string;
  /** The same knowledge as data, for brains that do not need an LLM (the fake one). */
  readonly input: ContextInput;
}

/**
 * What a request consumed, as the CLI or the API reports it (LAB-005.b): null when it does not
 * report it, never an estimate.
 */
export interface Usage {
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  /** Dollars, at the price the CLI reports. */
  readonly cost_usd: number | null;
}

export const UNKNOWN_USAGE: Usage = { input_tokens: null, output_tokens: null, cost_usd: null };

/** The reply of a brain and what it cost. */
export interface Thought {
  readonly reply: unknown;
  readonly usage: Usage;
}

/** A number of a report, or null when it is missing. */
export function reported(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The sum of reported numbers: null when the first one is missing, the others count as 0. */
export function sumReported(first: unknown, ...rest: unknown[]): number | null {
  const base = reported(first);
  if (base === null) return null;
  return rest.reduce<number>((total, value) => total + (reported(value) ?? 0), base);
}

/** A failure of a brain, with a message fit for the terminal: never a key. */
export class BrainError extends Error {}
