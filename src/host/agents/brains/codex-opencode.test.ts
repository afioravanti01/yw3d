import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentDecl } from '../../../core/yaml/worldFile';
import type { BrainRequest } from '../brain';
import { readReply } from '../reply';
import { CodexBrain } from './codex';
import { OpencodeBrain } from './opencode';

/** A fake CLI on a PATH of its own: it records its arguments and input, then runs `body`. */
function fakeCli(name: string, body: string) {
  const bin = mkdtempSync(path.join(tmpdir(), `yw3d-fake-${name}-`));
  writeFileSync(
    path.join(bin, name),
    `#!/bin/sh
for a in "$@"; do printf '%s\\n' "$a"; done > "${bin}/args"
cat > "${bin}/stdin"
${body}
`,
  );
  chmodSync(path.join(bin, name), 0o755);
  return {
    env: { PATH: `${bin}:/usr/bin:/bin` },
    args: () => readFileSync(path.join(bin, 'args'), 'utf8').trimEnd().split('\n'),
    stdin: () => readFileSync(path.join(bin, 'stdin'), 'utf8'),
    lines: (file: string) => readFileSync(path.join(bin, file), 'utf8').trimEnd().split('\n'),
  };
}

const agent = (cli: 'codex' | 'opencode', fields: Partial<AgentDecl> = {}) =>
  ({
    mode: 'headless',
    cli,
    initiative: 'reactive',
    every: 60,
    answers: 'short',
    ...fields,
  }) as AgentDecl;
const request = { text: 'CONTEXT', input: {} } as unknown as BrainRequest;
const REPLY = '{"say":{"text":"Ciao!","to":"player"},"actions":[],"continue":false}';
const known = new Set(['player']);

describe('the Codex and opencode brains', () => {
  it('AGENT-001.b: Codex gets the context on stdin, the schema, a read-only sandbox; model and effort only when given', async () => {
    // The fake Codex writes the reply to the file after -o, as the real one does.
    const cli = fakeCli(
      'codex',
      `out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
printf '%s' '${REPLY}' > "$out"
echo '{"type":"thread.started"}'
echo '{"type":"turn.completed","usage":{"input_tokens":13856,"cached_input_tokens":11776,"output_tokens":5,"reasoning_output_tokens":2}}'`,
    );
    const plain = new CodexBrain(agent('codex'), cli.env);
    expect(
      readReply((await plain.think(request, new AbortController().signal)).reply, known).steps,
    ).toEqual([{ kind: 'say', text: 'Ciao!', to: 'player' }]);
    const args = cli.args();
    expect(args.slice(0, 2)).toEqual(['exec', '-']);
    expect(args).toContain('--output-schema');
    expect(args.slice(args.indexOf('-s'), args.indexOf('-s') + 2)).toEqual(['-s', 'read-only']);
    expect(args).toContain('--ephemeral');
    expect(args).toContain('--json');
    expect(args).not.toContain('-m');
    expect(cli.stdin()).toBe('CONTEXT');
    // LAB-005.b: tokens from the last completed turn; Codex reports no price.
    expect((await plain.think(request, new AbortController().signal)).usage).toEqual({
      input_tokens: 13856,
      output_tokens: 5,
      cost_usd: null,
    });
    const schema = args[args.indexOf('--output-schema') + 1]!;
    expect(JSON.parse(readFileSync(schema, 'utf8')).required).toEqual([
      'say',
      'actions',
      'continue',
    ]);
    await new CodexBrain(agent('codex', { model: 'gpt-5', effort: 'low' }), cli.env).think(
      request,
      new AbortController().signal,
    );
    expect(cli.args().slice(-4)).toEqual(['-m', 'gpt-5', '-c', 'model_reasoning_effort=low']);
  });

  it('AGENT-001.b, LAB-005.b: opencode runs the read-only agent with the context as the message and reads tokens and cost from the session; the effort is ignored with a warning', async () => {
    // The fake opencode prints the events of `run --format json`, and the session on `export`.
    const cli = fakeCli(
      'opencode',
      `if [ "$1" = "session" ]; then
  printf '%s' '{"info":{"cost":0.0012,"tokens":{"input":7584,"output":77,"reasoning":223,"cache":{"read":3328,"write":2739}}}}'
  exit 0
fi
for a in "$@"; do printf '%s\\n' "$a"; done > "$(dirname "$0")/run-args"
echo '{"type":"step_start","sessionID":"ses_1","part":{}}'
echo '{"type":"text","sessionID":"ses_1","part":{"text":"Ecco: "}}'
echo '{"type":"text","sessionID":"ses_1","part":{"text":${JSON.stringify(REPLY).replace(/'/g, '')}}}'`,
    );
    const runArgs = () => cli.lines('run-args');
    const brain = new OpencodeBrain(agent('opencode'), cli.env);
    expect(brain.warning).toBeUndefined();
    const thought = await brain.think(request, new AbortController().signal);
    expect(readReply(thought.reply, known).steps).toEqual([
      { kind: 'say', text: 'Ciao!', to: 'player' },
    ]);
    expect(thought.usage).toEqual({ input_tokens: 13651, output_tokens: 300, cost_usd: 0.0012 });
    expect(runArgs()).toEqual(['run', '--agent', 'plan', '--format', 'json', 'CONTEXT']);
    expect(cli.args()).toEqual(['session', 'export', 'ses_1']);
    const tuned = new OpencodeBrain(
      agent('opencode', { model: 'openrouter/x#high', effort: 'high' }),
      cli.env,
    );
    expect(tuned.warning).toMatch(/opencode has no effort option/);
    await tuned.think(request, new AbortController().signal);
    expect(runArgs()).toEqual([
      'run',
      '--agent',
      'plan',
      '--format',
      'json',
      '-m',
      'openrouter/x#high',
      'CONTEXT',
    ]);
  });

  it('AGENT-001.b: an opencode that prints plain text still gives its reply, with unknown usage', async () => {
    const cli = fakeCli('opencode', `printf '%s\\n' 'Ecco:' '${REPLY}'`);
    const thought = await new OpencodeBrain(agent('opencode'), cli.env).think(
      request,
      new AbortController().signal,
    );
    expect(readReply(thought.reply, known).steps).toHaveLength(1);
    expect(thought.usage).toEqual({ input_tokens: null, output_tokens: null, cost_usd: null });
  });
});
