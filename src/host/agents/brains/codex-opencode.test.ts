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
printf '%s' '${REPLY}' > "$out"`,
    );
    const plain = new CodexBrain(agent('codex'), cli.env);
    expect(
      readReply(await plain.think(request, new AbortController().signal), known).steps,
    ).toEqual([{ kind: 'say', text: 'Ciao!', to: 'player' }]);
    const args = cli.args();
    expect(args.slice(0, 2)).toEqual(['exec', '-']);
    expect(args).toContain('--output-schema');
    expect(args.slice(args.indexOf('-s'), args.indexOf('-s') + 2)).toEqual(['-s', 'read-only']);
    expect(args).toContain('--ephemeral');
    expect(args).not.toContain('-m');
    expect(cli.stdin()).toBe('CONTEXT');
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

  it('AGENT-001.b: opencode runs the read-only agent with the context as the message; the effort is ignored with a warning', async () => {
    const cli = fakeCli('opencode', `printf '%s\\n' 'Ecco:' '\`\`\`json' '${REPLY}' '\`\`\`'`);
    const brain = new OpencodeBrain(agent('opencode'), cli.env);
    expect(brain.warning).toBeUndefined();
    const text = await brain.think(request, new AbortController().signal);
    expect(readReply(text, known).steps).toEqual([{ kind: 'say', text: 'Ciao!', to: 'player' }]);
    expect(cli.args()).toEqual(['run', '--agent', 'plan', 'CONTEXT']);
    const tuned = new OpencodeBrain(
      agent('opencode', { model: 'openrouter/x#high', effort: 'high' }),
      cli.env,
    );
    expect(tuned.warning).toMatch(/opencode has no effort option/);
    await tuned.think(request, new AbortController().signal);
    expect(cli.args()).toEqual(['run', '--agent', 'plan', '-m', 'openrouter/x#high', 'CONTEXT']);
  });
});
