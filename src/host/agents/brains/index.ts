import type { AgentDecl } from '../../../core/yaml/worldFile';
import type { Brain } from '../brain';
import { AnthropicBrain } from './anthropic';
import { ClaudeBrain } from './claude';
import { CodexBrain } from './codex';
import { FakeBrain } from './fake';
import { OpenAiBrain } from './openai';
import { OpencodeBrain } from './opencode';

/** The brain of an agent, from its configuration (plan F08 P2). */
export function createBrain(agent: AgentDecl, env?: NodeJS.ProcessEnv): Brain {
  switch (agent.mode) {
    case 'fake':
      return new FakeBrain();
    case 'headless':
      if (agent.cli === 'claude') return new ClaudeBrain(agent, env);
      if (agent.cli === 'codex') return new CodexBrain(agent, env);
      return new OpencodeBrain(agent, env);
    case 'api':
      return agent.provider === 'anthropic'
        ? new AnthropicBrain(agent, env)
        : new OpenAiBrain(agent, env);
  }
}
