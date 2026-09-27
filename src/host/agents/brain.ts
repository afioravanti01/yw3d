import type { ContextInput } from './context';

/**
 * The brain of an agent (plan F08 P2): it gets the context and gives the reply, as a parsed
 * object when the brain enforces the schema, or as text to read the JSON from. It must give up
 * when the signal aborts: the runtime aborts it at the time limit.
 */
export interface Brain {
  /** How the terminal and the overlay name it, e.g. `claude` or `anthropic api`. */
  readonly name: string;
  think(request: BrainRequest, signal: AbortSignal): Promise<unknown>;
}

export interface BrainRequest {
  /** The whole text for the LLM (AGENT-002.a). */
  readonly text: string;
  /** The same knowledge as data, for brains that do not need an LLM (the fake one). */
  readonly input: ContextInput;
}

/** A failure of a brain, with a message fit for the terminal: never a key. */
export class BrainError extends Error {}
