import type { AgentDecl } from '../../../core/yaml/worldFile';
import type { Brain, BrainRequest } from '../brain';
import { agentWorkFolder, runCli } from './cli';

/**
 * opencode (plan F08 P5–P7, table «Cervelli»): `opencode run` with the read-only agent `plan`
 * and the context as the message. It has no option for a schema: the runtime reads the JSON
 * from the text. The effort is not passed: opencode sets it as a variant of the model
 * (`provider/model#variant`), which the world file can write in `model` (AGENT-001.b).
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
    return ['run', '--agent', 'plan', ...(this.agent.model ? ['-m', this.agent.model] : []), text];
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<unknown> {
    const { stdout } = await runCli('opencode', this.args(request.text), '', {
      cwd: this.cwd,
      env: this.env,
      signal,
    });
    return stdout;
  }
}
