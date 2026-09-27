import type { AgentDecl } from '../../core/yaml/worldFile';
import { findProgram } from '../consent';

/**
 * The configuration of an agent as the user sees it (AGENT-001.d, plan F08 P12): in the list of
 * consent and in the terminal. It never contains a key, only the name of its variable.
 */
export function describeAgent(agent: AgentDecl): string {
  const model = agent.model ?? 'default model';
  const effort = agent.effort ? `, effort ${agent.effort}` : '';
  switch (agent.mode) {
    case 'headless':
      return `agent ${agent.cli} (${model}${effort})`;
    case 'api':
      return `agent ${agent.provider} api (${model}${effort}, key from ${keyVariable(agent)}${
        agent.base_url ? `, ${agent.base_url}` : ''
      })`;
    case 'fake':
      return 'agent fake (no LLM)';
  }
}

/** The variable that holds the key of an api agent: its own, or the provider's (Q8). */
export function keyVariable(agent: AgentDecl): string {
  return (
    agent.api_key_env ?? (agent.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY')
  );
}

export type AgentCheck = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Whether an agent can start on this machine (AGENT-001.c–d): its CLI is in the PATH, or its
 * key is in the environment.
 */
export function checkAgent(
  agent: AgentDecl,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): AgentCheck {
  if (agent.mode === 'headless' && !findProgram(agent.cli!, cwd, env)) {
    return { ok: false, error: `the CLI "${agent.cli}" was not found in the PATH` };
  }
  if (agent.mode === 'api' && !env[keyVariable(agent)]) {
    return {
      ok: false,
      error: `the key is missing: set the environment variable ${keyVariable(agent)}`,
    };
  }
  return { ok: true };
}
