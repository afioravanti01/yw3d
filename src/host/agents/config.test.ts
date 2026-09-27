import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentDecl } from '../../core/yaml/worldFile';
import { checkAgent, describeAgent } from './config';

const base = { initiative: 'reactive', every: 60 } as const;
/** An agent as the world file gives it, with the fields not written left out. */
const agent = (fields: Partial<AgentDecl>): AgentDecl => ({ ...base, ...fields }) as AgentDecl;

describe('the configuration of an agent on this machine', () => {
  it('AGENT-001.d: the consent and the terminal show the CLI or the provider and the model, never a key', () => {
    expect(describeAgent(agent({ mode: 'headless', cli: 'claude' }))).toBe(
      'agent claude (default model)',
    );
    expect(
      describeAgent(agent({ mode: 'headless', cli: 'codex', model: 'gpt-5', effort: 'low' })),
    ).toBe('agent codex (gpt-5, effort low)');
    expect(
      describeAgent(agent({ mode: 'api', provider: 'anthropic', model: 'claude-haiku-4-5' })),
    ).toBe('agent anthropic api (claude-haiku-4-5, key from ANTHROPIC_API_KEY)');
    expect(
      describeAgent(
        agent({
          mode: 'api',
          provider: 'openai',
          model: 'llama3',
          base_url: 'http://localhost:11434/v1',
          api_key_env: 'OLLAMA_KEY',
        }),
      ),
    ).toBe('agent openai api (llama3, key from OLLAMA_KEY, http://localhost:11434/v1)');
    expect(describeAgent(agent({ mode: 'fake' }))).toBe('agent fake (no LLM)');
  });

  it('AGENT-001.c, AGENT-001.d: a CLI missing from the PATH or a key missing from the environment are reported', () => {
    const bin = mkdtempSync(path.join(tmpdir(), 'yw3d-cli-'));
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\n');
    chmodSync(path.join(bin, 'claude'), 0o755);
    const env = { PATH: bin };
    const claude = agent({ mode: 'headless', cli: 'claude' });
    expect(checkAgent(claude, bin, env)).toEqual({ ok: true });
    expect(checkAgent({ ...claude, cli: 'codex' }, bin, env)).toEqual({
      ok: false,
      error: 'the CLI "codex" was not found in the PATH',
    });
    const api = agent({ mode: 'api', provider: 'anthropic', model: 'x' });
    expect(checkAgent(api, bin, {})).toEqual({
      ok: false,
      error: 'the key is missing: set the environment variable ANTHROPIC_API_KEY',
    });
    expect(checkAgent(api, bin, { ANTHROPIC_API_KEY: 'sk-secret' })).toEqual({ ok: true });
    expect(checkAgent(agent({ mode: 'fake' }), bin, {})).toEqual({ ok: true });
  });
});
