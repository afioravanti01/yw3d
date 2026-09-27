import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError, type Brain } from '../brain';
import { FakeBrain } from './fake';

/** The brain of an agent, from its configuration (plan F08 P2). */
export function createBrain(agent: AgentDecl): Brain {
  switch (agent.mode) {
    case 'fake':
      return new FakeBrain();
    default:
      throw new BrainError(`the ${agent.mode} agents are not available yet`);
  }
}
