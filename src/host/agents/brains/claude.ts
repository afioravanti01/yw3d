import type { AgentDecl } from '../../../core/yaml/worldFile';
import {
  BrainError,
  reported,
  sumReported,
  type Brain,
  type BrainRequest,
  type Thought,
} from '../brain';
import { REPLY_SCHEMA } from '../reply';
import { agentWorkFolder, runCli } from './cli';

/**
 * Claude Code in headless mode (plan F08 P5–P7, table «Cervelli»): `claude -p` with the context
 * on stdin, the reply enforced by `--json-schema`, no tools and no saved session. Model and
 * effort only when the world file gives them: otherwise the CLI's own settings (AGENT-001.b).
 */
export class ClaudeBrain implements Brain {
  readonly name = 'claude';
  private readonly cwd = agentWorkFolder();

  constructor(
    private readonly agent: AgentDecl,
    private readonly env?: NodeJS.ProcessEnv,
  ) {}

  /** The arguments of the CLI for this agent. */
  args(): string[] {
    return [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(REPLY_SCHEMA),
      '--tools',
      '',
      '--no-session-persistence',
      ...(this.agent.model ? ['--model', this.agent.model] : []),
      ...(this.agent.effort ? ['--effort', this.agent.effort] : []),
    ];
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    const { stdout } = await runCli('claude', this.args(), request.text, {
      cwd: this.cwd,
      env: this.env,
      signal,
    });
    let result: {
      is_error?: boolean;
      result?: unknown;
      structured_output?: unknown;
      total_cost_usd?: unknown;
      usage?: Record<string, unknown>;
    };
    try {
      result = JSON.parse(stdout) as typeof result;
    } catch {
      throw new BrainError('claude did not answer in JSON');
    }
    if (result.is_error) {
      throw new BrainError(`claude: ${String(result.result ?? 'error').slice(0, 200)}`);
    }
    // Tokens read from the cache count as input too (plan F10, table of T10.01).
    const usage = result.usage ?? {};
    return {
      reply: result.structured_output ?? result.result,
      usage: {
        input_tokens: sumReported(
          usage.input_tokens,
          usage.cache_creation_input_tokens,
          usage.cache_read_input_tokens,
        ),
        output_tokens: reported(usage.output_tokens),
        cost_usd: reported(result.total_cost_usd),
      },
    };
  }
}
