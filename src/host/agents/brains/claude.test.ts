import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentDecl } from '../../../core/yaml/worldFile';
import type { BrainRequest } from '../brain';
import { REPLY_SCHEMA } from '../reply';
import { ClaudeBrain } from './claude';

/**
 * A fake `claude` on a PATH of its own (plan F08 P15): it writes its arguments, its working
 * folder and its input to files, then answers as the environment says.
 */
function fakeCli(answer: string, delaySeconds = 0) {
  const bin = mkdtempSync(path.join(tmpdir(), 'yw3d-fake-claude-'));
  writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh
for a in "$@"; do printf '%s\\n' "$a"; done > "${bin}/args"
pwd > "${bin}/cwd"
cat > "${bin}/stdin"
sleep ${delaySeconds}
printf '%s' '${answer.replace(/'/g, "'\\''")}'
`,
  );
  chmodSync(path.join(bin, 'claude'), 0o755);
  const read = (file: string) => readFileSync(path.join(bin, file), 'utf8');
  return { env: { PATH: `${bin}:/usr/bin:/bin` }, read };
}

const agent = (fields: Partial<AgentDecl> = {}) =>
  ({ mode: 'headless', cli: 'claude', initiative: 'reactive', every: 60, ...fields }) as AgentDecl;
const request = { text: 'CONTEXT', input: {} } as unknown as BrainRequest;
const reply = { say: { text: 'Ciao!', to: 'player' }, actions: [] };
const signal = () => new AbortController().signal;

describe('the Claude Code brain', () => {
  it('AGENT-001.b: without model and effort the CLI keeps its own; with them it gets them', async () => {
    const cli = fakeCli(JSON.stringify({ is_error: false, structured_output: reply }));
    const brain = new ClaudeBrain(agent(), cli.env);
    expect((await brain.think(request, new AbortController().signal)).reply).toEqual(reply);
    const args = cli.read('args').trimEnd().split('\n');
    expect(args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(REPLY_SCHEMA),
      '--tools',
      '',
      '--no-session-persistence',
    ]);
    expect(cli.read('stdin')).toBe('CONTEXT');
    // Never in the world folder: a temporary folder of its own.
    expect(cli.read('cwd')).toMatch(/yw3d-agent-/);
    const tuned = new ClaudeBrain(agent({ model: 'claude-haiku-4-5', effort: 'low' }), cli.env);
    await tuned.think(request, new AbortController().signal);
    expect(cli.read('args').trimEnd().split('\n').slice(-4)).toEqual([
      '--model',
      'claude-haiku-4-5',
      '--effort',
      'low',
    ]);
  });

  it('AGENT-006.c: an error of the CLI, a reply that is not JSON, and the time limit end the request with a reason', async () => {
    const failing = fakeCli(
      JSON.stringify({ is_error: true, result: 'Credit balance is too low' }),
    );
    await expect(
      new ClaudeBrain(agent(), failing.env).think(request, new AbortController().signal),
    ).rejects.toThrow('claude: Credit balance is too low');
    const garbled = fakeCli('not json');
    await expect(
      new ClaudeBrain(agent(), garbled.env).think(request, new AbortController().signal),
    ).rejects.toThrow('claude did not answer in JSON');
    const slow = fakeCli(JSON.stringify({ structured_output: reply }), 5);
    const controller = new AbortController();
    const thinking = new ClaudeBrain(agent(), slow.env).think(request, controller.signal);
    setTimeout(() => controller.abort(), 100);
    const start = Date.now();
    await expect(thinking).rejects.toThrow('claude was stopped');
    expect(Date.now() - start).toBeLessThan(3000);
    // A text reply without a schema still reaches the runtime, which extracts the JSON.
    const text = fakeCli(
      JSON.stringify({ is_error: false, result: '{"say": null, "actions": []}' }),
    );
    expect(
      (await new ClaudeBrain(agent(), text.env).think(request, new AbortController().signal)).reply,
    ).toBe('{"say": null, "actions": []}');
  });

  it('LAB-005.b: tokens, cache included, and the cost that Claude Code reports', async () => {
    const cli = fakeCli(
      JSON.stringify({
        structured_output: reply,
        total_cost_usd: 0.0356,
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 8542,
          cache_read_input_tokens: 5985,
          output_tokens: 20,
        },
      }),
    );
    const thought = await new ClaudeBrain(agent(), cli.env).think(request, signal());
    expect(thought.usage).toEqual({ input_tokens: 14529, output_tokens: 20, cost_usd: 0.0356 });
    const silent = fakeCli(JSON.stringify({ structured_output: reply }));
    expect((await new ClaudeBrain(agent(), silent.env).think(request, signal())).usage).toEqual({
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    });
  });
});
