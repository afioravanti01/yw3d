import type { AgentDecl } from '../../../core/yaml/worldFile';
import {
  reported,
  sumReported,
  UNKNOWN_USAGE,
  type Brain,
  type BrainRequest,
  type Thought,
  type Usage,
} from '../brain';
import { agentWorkFolder, runCli } from './cli';

/**
 * opencode (plan F08 P5–P7, table «Cervelli»): `opencode run` with the read-only agent `plan`
 * and the context as the message. It has no option for a schema: the runtime reads the JSON
 * from the text. The effort is not passed: opencode sets it as a variant of the model
 * (`provider/model#variant`), which the world file can write in `model` (AGENT-001.b).
 *
 * Its JSON events carry the text but not what the request consumed: that is read from the
 * session with `opencode session export` (plan F10, table of T10.01).
 */
export class OpencodeBrain implements Brain {
  readonly name = 'opencode';
  readonly warning: string | undefined;
  private readonly cwd = agentWorkFolder();

  constructor(
    private readonly agent: AgentDecl,
    private readonly env?: NodeJS.ProcessEnv,
  ) {
    this.warning = agent.effort
      ? 'opencode has no effort option: the effort is ignored (write a variant in the model, e.g. provider/model#high)'
      : undefined;
  }

  /** The arguments of the CLI for this agent and this context. */
  args(text: string): string[] {
    return [
      'run',
      '--agent',
      'plan',
      '--format',
      'json',
      ...(this.agent.model ? ['-m', this.agent.model] : []),
      text,
    ];
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    const options = { cwd: this.cwd, env: this.env, signal };
    const { stdout } = await runCli('opencode', this.args(request.text), '', options);
    const { text, session } = readEvents(stdout);
    return {
      // Without events (an older opencode), the output is the text itself.
      reply: text ?? stdout,
      usage: session ? await this.usage(session, options) : UNKNOWN_USAGE,
    };
  }

  /** Tokens and cost of a session; unknown when the export fails. */
  private async usage(session: string, options: Parameters<typeof runCli>[3]): Promise<Usage> {
    try {
      const { stdout } = await runCli('opencode', ['session', 'export', session], '', options);
      const info = (JSON.parse(stdout) as { info?: { tokens?: OpencodeTokens; cost?: unknown } })
        .info;
      const tokens = info?.tokens;
      return {
        input_tokens: sumReported(tokens?.input, tokens?.cache?.read, tokens?.cache?.write),
        output_tokens: sumReported(tokens?.output, tokens?.reasoning),
        cost_usd: reported(info?.cost),
      };
    } catch {
      return UNKNOWN_USAGE;
    }
  }
}

interface OpencodeTokens {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly reasoning?: unknown;
  readonly cache?: { readonly read?: unknown; readonly write?: unknown };
}

/** The text and the session of the events of `opencode run --format json`. */
function readEvents(stdout: string): { text: string | undefined; session: string | undefined } {
  let text: string | undefined;
  let session: string | undefined;
  for (const line of stdout.split('\n')) {
    let event: { type?: string; sessionID?: unknown; part?: { text?: unknown } };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (typeof event.sessionID === 'string') session ??= event.sessionID;
    if (event.type === 'text' && typeof event.part?.text === 'string') {
      text = (text ?? '') + event.part.text;
    }
  }
  return { text, session };
}
