import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, reported, type Brain, type BrainRequest, type Thought } from '../brain';
import { REPLY_SCHEMA } from '../reply';
import { apiKey, postJson } from './api';

/**
 * The OpenAI API and the services compatible with it (OpenAI, Ollama, LM Studio, OpenRouter…;
 * plan F08 P5, P7, P13): `POST <base_url>/chat/completions` with a strict JSON schema. A service
 * that refuses the schema (HTTP 400) is asked again without it, and the JSON is read from the
 * text; the effort goes as `reasoning_effort`.
 */
export class OpenAiBrain implements Brain {
  readonly name = 'openai';
  private schemaRefused = false;

  constructor(
    private readonly agent: AgentDecl,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private get baseUrl(): string {
    return (this.agent.base_url ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  body(text: string, withSchema: boolean): Record<string, unknown> {
    return {
      model: this.agent.model,
      messages: [{ role: 'user', content: text }],
      ...(withSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'reply', strict: true, schema: REPLY_SCHEMA },
            },
          }
        : {}),
      ...(this.agent.effort ? { reasoning_effort: this.agent.effort } : {}),
    };
  }

  async think(request: BrainRequest, signal: AbortSignal): Promise<Thought> {
    const key = apiKey(this.agent, this.env);
    const post = (withSchema: boolean) =>
      postJson(
        'openai api',
        `${this.baseUrl}/chat/completions`,
        { authorization: `Bearer ${key}` },
        this.body(request.text, withSchema),
        key,
        signal,
      );
    let answer: unknown;
    try {
      answer = await post(!this.schemaRefused);
    } catch (error) {
      if (this.schemaRefused || !(error instanceof BrainError) || !/HTTP 400/.test(error.message)) {
        throw error;
      }
      this.schemaRefused = true;
      answer = await post(false);
    }
    const { choices, usage } = answer as {
      choices?: { message?: { content?: string; refusal?: string } }[];
      usage?: Record<string, unknown>;
    };
    const message = choices?.[0]?.message;
    if (message?.refusal)
      throw new BrainError(`openai api refused: ${message.refusal.slice(0, 200)}`);
    if (typeof message?.content !== 'string') throw new BrainError('openai api gave no reply');
    // Tokens when the service sends them; never a price (plan F10, table of T10.01).
    return {
      reply: message.content,
      usage: {
        input_tokens: reported(usage?.prompt_tokens),
        output_tokens: reported(usage?.completion_tokens),
        cost_usd: null,
      },
    };
  }
}
