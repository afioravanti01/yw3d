import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, type Brain, type BrainRequest } from '../brain';
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

  async think(request: BrainRequest, signal: AbortSignal): Promise<unknown> {
    const { stdout } = await runCli('claude', this.args(), request.text, {
      cwd: this.cwd,
      env: this.env,
      signal,
    });
    let result: { is_error?: boolean; result?: unknown; structured_output?: unknown };
    try {
      result = JSON.parse(stdout) as typeof result;
    } catch {
      throw new BrainError('claude did not answer in JSON');
    }
    if (result.is_error) {
      throw new BrainError(`claude: ${String(result.result ?? 'error').slice(0, 200)}`);
    }
    return result.structured_output ?? result.result;
  }
}
