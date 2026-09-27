import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, type Brain, type BrainRequest } from '../brain';
import { REPLY_SCHEMA } from '../reply';
import { agentWorkFolder, runCli } from './cli';

/**
 * Codex in headless mode (plan F08 P5–P7, table «Cervelli»): `codex exec -` with the context on
 * stdin, the reply enforced by `--output-schema` and written to a file with `-o`, a read-only
 * sandbox, no saved session. Model and effort only when the world file gives them.
 */
export class CodexBrain implements Brain {
  readonly name = 'codex';
  private readonly cwd = agentWorkFolder();
  private readonly schema = path.join(this.cwd, 'reply.schema.json');
  private requests = 0;

  constructor(
    private readonly agent: AgentDecl,
    private readonly env?: NodeJS.ProcessEnv,
  ) {
    writeFileSync(this.schema, JSON.stringify(REPLY_SCHEMA));
  }

  /** The arguments of the CLI for this agent, writing the reply to `output`. */
  args(output: string): string[] {
    return [
      'exec',
      '-',
      '--output-schema',
      this.schema,
      '-o',
      output,
      '-s',
      'read-only',
      '--ephemeral',
      '--skip-git-repo-check',
      '-C',
      this.cwd,
      ...(this.agent.model ? ['-m', this.agent.model] : []),
      ...(this.agent.effort ? ['-c', `model_reasoning_effort=${this.agent.effort}`] : []),
    ];
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<unknown> {
    const output = path.join(this.cwd, `reply-${++this.requests}.json`);
    await runCli('codex', this.args(output), request.text, {
      cwd: this.cwd,
      env: this.env,
      signal,
    });
    try {
      return readFileSync(output, 'utf8');
    } catch {
      throw new BrainError('codex wrote no reply');
    }
  }
}
