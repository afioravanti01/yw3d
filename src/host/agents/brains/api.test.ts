import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentDecl } from '../../../core/yaml/worldFile';
import type { BrainRequest } from '../brain';
import { readReply, REPLY_SCHEMA } from '../reply';
import { AnthropicBrain, THINKING_BUDGET } from './anthropic';
import { OpenAiBrain } from './openai';

/** A local server in place of the APIs (plan F08 P15): it records the requests and answers. */
interface Seen {
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
  readonly body: Record<string, unknown>;
}

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function api(answer: (seen: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c.toString()));
    req.on('end', () => {
      const request = {
        url: req.url ?? '',
        headers: req.headers,
        body: JSON.parse(data) as Record<string, unknown>,
      };
      seen.push(request);
      const { status, body } = answer(request);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const KEY = 'sk-test-secret-123';
const agent = (fields: Partial<AgentDecl>) =>
  ({ mode: 'api', initiative: 'reactive', every: 60, answers: 'short', ...fields }) as AgentDecl;
const request = { text: 'CONTEXT', input: {} } as unknown as BrainRequest;
const known = new Set(['player']);
const REPLY = { say: { text: 'Ciao!', to: 'player' }, actions: [], continue: false };
const signal = () => new AbortController().signal;

describe('the API brains', () => {
  it('AGENT-001.c: Anthropic: the key from the environment, a forced tool with the schema; with an effort, thinking', async () => {
    const server = await api(() => ({
      status: 200,
      body: { content: [{ type: 'tool_use', name: 'reply', input: REPLY }] },
    }));
    const brain = new AnthropicBrain(
      agent({ provider: 'anthropic', model: 'claude-haiku-4-5' }),
      { ANTHROPIC_API_KEY: KEY },
      server.url,
    );
    expect(readReply(await brain.think(request, signal()), known).steps).toEqual([
      { kind: 'say', text: 'Ciao!', to: 'player' },
    ]);
    const first = server.seen[0]!;
    expect(first.url).toBe('/v1/messages');
    expect(first.headers['x-api-key']).toBe(KEY);
    expect(first.body).toMatchObject({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'CONTEXT' }],
      tools: [{ name: 'reply', input_schema: REPLY_SCHEMA }],
      tool_choice: { type: 'tool', name: 'reply' },
    });
    const thinking = new AnthropicBrain(
      agent({ provider: 'anthropic', model: 'x', effort: 'medium' }),
      { ANTHROPIC_API_KEY: KEY },
      server.url,
    );
    await thinking.think(request, signal());
    expect(server.seen[1]!.body).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET.medium },
      tool_choice: { type: 'auto' },
    });
  });

  it('AGENT-001.c: OpenAI-compatible: base address, bearer key, strict schema, reasoning effort; a service that refuses the schema is asked without it', async () => {
    let refuse = true;
    const server = await api(({ body }) => {
      if (body.response_format && refuse) {
        return { status: 400, body: { error: { message: 'response_format not supported' } } };
      }
      return {
        status: 200,
        body: { choices: [{ message: { content: `Ecco: ${JSON.stringify(REPLY)}` } }] },
      };
    });
    const brain = new OpenAiBrain(
      agent({
        provider: 'openai',
        model: 'llama3',
        base_url: `${server.url}/v1/`,
        effort: 'low',
        api_key_env: 'OLLAMA_KEY',
      }),
      { OLLAMA_KEY: KEY },
    );
    expect(readReply(await brain.think(request, signal()), known).steps).toHaveLength(1);
    expect(server.seen.map((s) => s.url)).toEqual(['/v1/chat/completions', '/v1/chat/completions']);
    expect(server.seen[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(server.seen[0]!.body).toMatchObject({
      model: 'llama3',
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: REPLY_SCHEMA } },
    });
    expect(server.seen[1]!.body.response_format).toBeUndefined();
    // Once refused, the schema is not asked again.
    refuse = false;
    await brain.think(request, signal());
    expect(server.seen[2]!.body.response_format).toBeUndefined();
  });

  it('AGENT-001.c, AGENT-006.c: a missing key, an HTTP error and the time limit end the request; the key never appears', async () => {
    const server = await api(() => ({
      status: 401,
      body: { error: { message: `invalid x-api-key ${KEY}` } },
    }));
    const missing = new AnthropicBrain(
      agent({ provider: 'anthropic', model: 'x' }),
      {},
      server.url,
    );
    await expect(missing.think(request, signal())).rejects.toThrow(
      'the key is missing: set ANTHROPIC_API_KEY',
    );
    const refused = new AnthropicBrain(
      agent({ provider: 'anthropic', model: 'x' }),
      { ANTHROPIC_API_KEY: KEY },
      server.url,
    );
    const error = await refused.think(request, signal()).catch((e: Error) => e);
    expect((error as Error).message).toBe('anthropic api: HTTP 401: invalid x-api-key ***');
    const slow = await api(() => ({ status: 200, body: {} }));
    const unreachable = new OpenAiBrain(
      agent({ provider: 'openai', model: 'x', base_url: 'http://127.0.0.1:9' }),
      { OPENAI_API_KEY: KEY },
    );
    await expect(unreachable.think(request, signal())).rejects.toThrow(
      /cannot reach 127\.0\.0\.1:9/,
    );
    const controller = new AbortController();
    controller.abort();
    const stopped = new OpenAiBrain(agent({ provider: 'openai', model: 'x', base_url: slow.url }), {
      OPENAI_API_KEY: KEY,
    });
    await expect(stopped.think(request, controller.signal)).rejects.toThrow(
      'openai api was stopped',
    );
  });
});
