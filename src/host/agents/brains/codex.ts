import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, sumReported, type Brain, type BrainRequest, type Thought } from '../brain';
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
      '--json',
      '--skip-git-repo-check',
      '-C',
      this.cwd,
      ...(this.agent.model ? ['-m', this.agent.model] : []),
      ...(this.agent.effort ? ['-c', `model_reasoning_effort=${this.agent.effort}`] : []),
    ];
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    const output = path.join(this.cwd, `reply-${++this.requests}.json`);
    const { stdout } = await runCli('codex', this.args(output), request.text, {
      cwd: this.cwd,
      env: this.env,
      signal,
    });
    let reply: string;
    try {
      reply = readFileSync(output, 'utf8');
    } catch {
      throw new BrainError('codex wrote no reply');
    }
    // `--json` prints events; the last `turn.completed` has the tokens, never the cost (T10.01).
    const usage = codexUsage(stdout);
    return {
      reply,
      usage: {
        input_tokens: sumReported(usage?.input_tokens),
        // Reasoning tokens are part of the output tokens.
        output_tokens: sumReported(usage?.output_tokens),
        cost_usd: null,
      },
    };
  }
}

/** The usage of the last completed turn in the events of `codex exec --json`. */
function codexUsage(stdout: string): Record<string, unknown> | undefined {
  let usage: Record<string, unknown> | undefined;
  for (const line of stdout.split('\n')) {
    try {
      const event = JSON.parse(line) as { type?: string; usage?: Record<string, unknown> };
      if (event.type === 'turn.completed' && event.usage) usage = event.usage;
    } catch {
      // Not an event: Codex may print other lines.
    }
  }
  return usage;
}
