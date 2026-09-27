import type { ComposeResult } from '../core/compose/composeWorld';
import type { CharacterDetails } from '../core/dialogue/commands';
import type { CharacterSnapshot } from './messages';

/**
 * The technical data of a character for `/describe` (A8.3), from its declaration in the world
 * file and from what it is doing now: the host and the views build them the same way.
 */
export function characterDetails(
  start: ComposeResult['characters'][number],
  now: CharacterSnapshot | undefined,
): CharacterDetails {
  const action = now?.action ?? null;
  const agent = start.agent;
  if (agent) {
    return {
      driver: {
        kind: 'agent',
        mode: agent.mode,
        brain: now?.agent?.brain ?? agent.cli ?? agent.provider ?? 'fake',
        model: agent.model ?? null,
        effort: agent.effort ?? null,
        answers: agent.answers,
        initiative: agent.initiative,
        every: agent.initiative === 'autonomous' ? agent.every : null,
        state: now?.agent?.state ?? null,
        lastMs: now?.agent?.last_ms ?? null,
      },
      action,
      ...(agent.persona ? { persona: agent.persona } : {}),
      ...(agent.goals ? { goals: agent.goals } : {}),
    };
  }
  if (start.program) {
    return {
      driver: { kind: 'program', file: start.program, state: now?.program?.state ?? null },
      action,
    };
  }
  if (start.command || now?.controlled) {
    return {
      driver: {
        kind: 'controller',
        command: start.command ?? null,
        active: now?.controlled ?? false,
      },
      action,
    };
  }
  return { driver: { kind: 'none' }, action };
}
