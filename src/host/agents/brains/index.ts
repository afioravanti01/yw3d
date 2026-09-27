import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, type Brain } from '../brain';
import { ClaudeBrain } from './claude';
import { FakeBrain } from './fake';

/** The brain of an agent, from its configuration (plan F08 P2). */
export function createBrain(agent: AgentDecl, env?: NodeJS.ProcessEnv): Brain {
  switch (agent.mode) {
    case 'fake':
      return new FakeBrain();
    case 'headless':
      if (agent.cli === 'claude') return new ClaudeBrain(agent, env);
      throw new BrainError(`the ${agent.cli} agents are not available yet`);
    default:
      throw new BrainError(`the ${agent.mode} agents are not available yet`);
  }
}
