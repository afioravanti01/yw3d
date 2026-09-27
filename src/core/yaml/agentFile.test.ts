import { describe, expect, it } from 'vitest';
import { loadWorldFile } from './worldFile';

const HEADER = 'version: 2\nname: T\nterrain: { seed: 1, generator: 1 }\ncharacters:\n';
const character = (agent: string) =>
  `${HEADER}  - id: marta\n    name: Marta\n    at: [1, 1]\n    agent: ${agent}\n`;
const load = (agent: string) => loadWorldFile(character(agent), 'w.yaml');
const errors = (agent: string) =>
  load(agent).diagnostics.map((d) => ({ path: d.path, message: d.message }));

describe('agents in the world file', () => {
  it('AGENT-001.a, CHAR-001.a: an agent is headless with a CLI, api with a provider, or fake', () => {
    expect(load('{ mode: headless, cli: claude }').world?.characters?.[0]?.agent).toEqual({
      mode: 'headless',
      cli: 'claude',
      initiative: 'reactive',
      every: 60,
      answers: 'short',
    });
    expect(
      load(
        '{ mode: api, provider: openai, base_url: "http://localhost:11434/v1", model: llama3, effort: low, api_key_env: OLLAMA_KEY, persona: Burbera ma gentile., goals: [pescare, vendere il pesce], initiative: autonomous, every: 120, fallback: "Mmh…" }',
      ).diagnostics,
    ).toEqual([]);
    expect(load('{ mode: api, provider: anthropic, model: claude-haiku-4-5 }').diagnostics).toEqual(
      [],
    );
    expect(load('{ mode: fake }').diagnostics).toEqual([]);
  });

  it('AGENT-001.a: each mode has its own fields, checked with clear errors', () => {
    expect(errors('{ mode: headless }')).toEqual([
      {
        path: 'characters[0].agent.cli',
        message: 'mode headless needs a cli: one of claude, codex, opencode',
      },
    ]);
    expect(errors('{ mode: api, provider: anthropic }')).toEqual([
      { path: 'characters[0].agent.model', message: 'mode api needs a model' },
    ]);
    expect(errors('{ mode: api, model: x }')).toEqual([
      {
        path: 'characters[0].agent.provider',
        message: 'mode api needs a provider: one of anthropic, openai',
      },
    ]);
    expect(errors('{ mode: headless, cli: claude, provider: anthropic }')).toEqual([
      { path: 'characters[0].agent.provider', message: '"provider" is for mode api only' },
    ]);
    expect(
      errors('{ mode: api, provider: anthropic, model: x, base_url: "https://x.it" }'),
    ).toEqual([
      {
        path: 'characters[0].agent.base_url',
        message: '"base_url" is for the provider openai (and compatible services)',
      },
    ]);
    expect(errors('{ mode: headless, cli: gemini }')[0]?.path).toBe('characters[0].agent.cli');
    expect(errors('{ mode: headless, cli: claude, effort: max }')[0]?.path).toBe(
      'characters[0].agent.effort',
    );
    expect(errors('{ mode: headless, cli: claude, every: 1 }')[0]?.path).toBe(
      'characters[0].agent.every',
    );
    expect(
      errors('{ mode: api, provider: openai, model: x, api_key_env: "sk-123 abc" }')[0]?.path,
    ).toBe('characters[0].agent.api_key_env');
  });

  it('CHAR-001.a: a character has one of program, controller or agent', () => {
    const text = `${HEADER}  - id: marta\n    name: Marta\n    at: [1, 1]\n    program: marta.py\n    agent: { mode: fake }\n`;
    expect(loadWorldFile(text, 'w.yaml').diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['characters[0].agent', 'a character has one of program, controller or agent, not more'],
    ]);
  });
});
