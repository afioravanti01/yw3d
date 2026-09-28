import type { TraceEvent } from '../../lab/trace';
import { BrainError, type Brain, type Thought, type Usage } from '../brain';

/**
 * The brain of a replay (LAB-006.a, plan F10 P12): it gives an agent the replies of a trace, in
 * their order, each not before the simulated time it came in the run; a request that failed
 * fails again. No LLM is called. The world does not stop (A10.1), so the replay follows the run
 * closely without being a copy of it.
 */

/** A reply of a trace, or the failure of a request, at its simulated time. */
export interface RecordedReply {
  readonly t: number;
  readonly raw?: unknown;
  readonly usage?: Usage;
  readonly error?: string;
}

/** The replies of each agent of a trace, in order. */
export function recordedReplies(events: readonly TraceEvent[]): Map<string, RecordedReply[]> {
  const replies = new Map<string, RecordedReply[]>();
  for (const e of events) {
    if (e.type !== 'agent' || (e.kind !== 'reply' && e.kind !== 'failed')) continue;
    const list = replies.get(e.agent) ?? [];
    list.push(
      e.kind === 'reply' ? { t: e.t, raw: e.raw, usage: e.usage } : { t: e.t, error: e.reason },
    );
    replies.set(e.agent, list);
  }
  return replies;
}

export class ReplayBrain implements Brain {
  readonly name = 'replay';
  private next = 0;
  private toldOver = false;

  constructor(
    private readonly replies: readonly RecordedReply[],
    /** Simulated seconds from the start of the run being replayed. */
    private readonly now: () => number,
    private readonly log: (line: string) => void,
    private readonly pause = (): Promise<void> => new Promise((r) => setTimeout(r, 20)),
  ) {}

  async think(_: unknown, signal: AbortSignal): Promise<Thought> {
    const reply = this.replies[this.next];
    if (!reply) {
      if (!this.toldOver) this.log('the recorded replies are over: the agent stands still');
      this.toldOver = true;
      // Nothing more to say: the request waits until the runtime gives it up.
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      throw new BrainError('no more recorded replies');
    }
    this.next++;
    while (this.now() < reply.t && !signal.aborted) await this.pause();
    if (signal.aborted) throw new BrainError('replay was stopped');
    if (reply.error !== undefined) throw new BrainError(reply.error);
    return {
      reply: reply.raw,
      usage: reply.usage ?? { input_tokens: null, output_tokens: null, cost_usd: null },
    };
  }
}
