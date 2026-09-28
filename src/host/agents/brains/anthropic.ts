import type { AgentDecl } from '../../../core/yaml/worldFile';
import { reported, sumReported, type Brain, type BrainRequest, type Thought } from '../brain';
import { REPLY_SCHEMA } from '../reply';
import { apiKey, postJson } from './api';

/** Thinking budget of the Anthropic API for each effort, tokens (plan F08 P7). */
export const THINKING_BUDGET = { low: 1024, medium: 4096, high: 16_000 } as const;

/**
 * The Anthropic API (plan F08 P5, P7, P13): `POST /v1/messages`. Without an effort the reply is
 * a forced tool whose input is the schema of the reply; with an effort the model thinks first
 * (thinking cannot force a tool), may call the tool, and otherwise gives the JSON as text.
 */
export class AnthropicBrain implements Brain {
  readonly name = 'anthropic';

  constructor(
    private readonly agent: AgentDecl,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  body(text: string): Record<string, unknown> {
    const effort = this.agent.effort;
    const answer = this.agent.answers === 'long' ? 2048 : 1024;
    return {
      model: this.agent.model,
      max_tokens: effort ? THINKING_BUDGET[effort] + answer : answer,
      messages: [{ role: 'user', content: text }],
      tools: [{ name: 'reply', description: 'Your reply', input_schema: REPLY_SCHEMA }],
      ...(effort
        ? {
            thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET[effort] },
            tool_choice: { type: 'auto' },
          }
        : { tool_choice: { type: 'tool', name: 'reply' } }),
    };
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    const key = apiKey(this.agent, this.env);
    const answer = (await postJson(
      'anthropic api',
      `${this.baseUrl}/v1/messages`,
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      this.body(request.text),
      key,
      signal,
    )) as {
      content?: { type: string; name?: string; input?: unknown; text?: string }[];
      usage?: Record<string, unknown>;
    };
    const blocks = answer.content ?? [];
    const tool = blocks.find((b) => b.type === 'tool_use' && b.name === 'reply');
    const usage = answer.usage ?? {};
    return {
      reply:
        tool?.input ??
        blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n'),
      // Tokens only: the API reports no price (plan F10, table of T10.01).
      usage: {
        input_tokens: sumReported(
          usage.input_tokens,
          usage.cache_creation_input_tokens,
          usage.cache_read_input_tokens,
        ),
        output_tokens: reported(usage.output_tokens),
        cost_usd: null,
      },
    };
  }
}
