import { AgentWorld, type ActionRequest, type AgentEvent } from '../agents/agentWorld';
import { createDefaultRegistry, STONE } from '../blocks/builtin';
import { spawnCharacters } from '../characters/characters';
import { composeWorld, type ComposeResult } from '../compose/composeWorld';
import { TERRAIN_GENERATOR_VERSION } from '../gen/terrain';
import { NavGrid } from '../nav/navGrid';
import { Pathfinder } from '../nav/pathfinding';
import { PhysicsWorld, type EntityHandle } from '../physics/physicsWorld';
import { spawnPlayer } from '../player/player';
import { createDefaultStructures } from '../structures/builtin';
import { World } from '../world/world';
import { createDefaultBehaviors } from './builtin';
import type { BehaviorRegistry } from './registry';
import { agentBehaviorWorld, Behaviors } from './runner';

/**
 * Test bench for behaviors: the programs, the map and the goals come from a world file; the
 * characters walk on a flat world of stone (the ground at y = 10), so that paths are simple.
 */
export interface Harness {
  readonly result: ComposeResult;
  readonly agents: AgentWorld;
  readonly behaviors: Behaviors;
  readonly player: EntityHandle | undefined;
  /** Actions asked by the behaviors, in order, with the character and the simulated time. */
  readonly requests: (ActionRequest & { readonly by: string; readonly at: number })[];
  /** Events of the agent world, by character. */
  readonly events: (AgentEvent & { readonly to_character: string })[];
  /** Lines for the terminal of the host. */
  readonly log: string[];
  /** Texts said by a character, in order. */
  said(id: string): string[];
  /** Runs the simulation for some seconds: behaviors, then the agent world, each step. */
  run(seconds: number): void;
  /** Runs until the condition holds, at most `seconds`; returns whether it did. */
  until(condition: () => boolean, seconds?: number): boolean;
  /** Times at which a character said a text. */
  saidAt(id: string, text: string): number[];
  state(id: string): { x: number; y: number; z: number };
}

export function behaviorHarness(
  body: string,
  options: { player?: [number, number]; behaviors?: BehaviorRegistry; seed?: number } = {},
): Harness {
  const text = `version: 2\nname: Test\nterrain: { seed: ${options.seed ?? 5}, generator: ${TERRAIN_GENERATOR_VERSION}, size: [128, 96, 128] }\n${body}`;
  const result = composeWorld(text, 'w.yaml', {
    registry: createDefaultStructures(),
    behaviors: options.behaviors ?? createDefaultBehaviors(),
  });
  if (!result.world) {
    throw new Error(result.diagnostics.map((d) => `${d.line}: ${d.path} ${d.message}`).join('\n'));
  }
  const registry = createDefaultRegistry();
  const world = new World({ x: 128, y: 32, z: 128 });
  for (let z = 0; z < 128; z++) {
    for (let x = 0; x < 128; x++) for (let y = 0; y < 10; y++) world.setBlock(x, y, z, STONE);
  }
  const physics = new PhysicsWorld(world, registry);
  const finder = new Pathfinder(new NavGrid(world, registry.solid));
  const characters = spawnCharacters(physics, result.characters);
  const player = options.player
    ? spawnPlayer(physics, options.player[0] + 0.5, options.player[1] + 0.5)
    : undefined;
  physics.step();
  const requests: Harness['requests'] = [];
  const events: Harness['events'] = [];
  const log: string[] = [];
  // The agent world sends events to the behaviors, which are made after it.
  const route: { behaviors?: Behaviors } = {};
  const agents = new AgentWorld(
    physics,
    characters,
    player,
    finder,
    {
      event: (id, event) => {
        events.push({ ...event, to_character: id });
        route.behaviors?.event(id, event);
      },
      perception: () => {},
    },
    result.goals,
  );
  const programs = new Map(
    result.characters.flatMap((c) => (c.behavior ? [[c.id, c.behavior] as const] : [])),
  );
  const base = agentBehaviorWorld(agents, result.map!, result.goals, result.seed!, (id, m) =>
    log.push(`[${id}] ${m}`),
  );
  const behaviors = new Behaviors(programs, {
    get time() {
      return base.time;
    },
    seed: base.seed,
    position: base.position,
    inside: base.inside,
    nameOf: base.nameOf,
    log: base.log,
    request: (id, request) => {
      requests.push({ ...request, by: id, at: base.time });
      base.request(id, request);
    },
  });
  route.behaviors = behaviors;
  return {
    result,
    agents,
    behaviors,
    player,
    requests,
    events,
    log,
    said: (id) => requests.flatMap((r) => (r.by === id && r.kind === 'say' ? [r.text] : [])),
    run: (seconds) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        behaviors.step();
        agents.step();
      }
    },
    until: (condition, seconds = 60) => {
      for (let i = 0; i < seconds * 60; i++) {
        if (condition()) return true;
        behaviors.step();
        agents.step();
      }
      return condition();
    },
    saidAt: (id, text) =>
      requests.flatMap((r) => (r.by === id && r.kind === 'say' && r.text === text ? [r.at] : [])),
    state: (id) => agents.stateOf(id)!,
  };
}
