import type { Character } from '../characters/characters';
import { PathFollower, type FindPath } from '../nav/pathFollower';
import { RUN_SPEED, STEP_SECONDS, WALK_SPEED } from '../physics/constants';
import { IDLE, type EntityState, type Intent } from '../physics/entity';
import type { EntityHandle, PhysicsWorld } from '../physics/physicsWorld';
import { metersToBlocks } from '../world/units';

/**
 * Characters in action (PROTO-001, PROTO-002): high-level actions turned into intents for the
 * physics (P3), perception and events for their controllers. Field names follow the protocol
 * (`snake_case`, F05 Q8), so that controllers receive them as they are.
 */

/** Perception rate, per simulated second (F05 Q4). */
export const PERCEPTION_HZ = 4;
/** Entities within this distance are perceived (PROTO-002.a). */
export const SIGHT_DISTANCE = 32;
/** Sentences said within this distance are heard (PROTO-002.b). */
export const HEARING_DISTANCE = 16;
/** The player interacts with the nearest character within 3 m (PROTO-002.c). */
export const INTERACTION_DISTANCE = metersToBlocks(3);
/** Time a sentence stays in the air: 1 s + 0.06 s per character (plan F05 P6). */
export const sayDuration = (text: string) => 1 + 0.06 * text.length;

export type Target = { readonly x: number; readonly z: number } | { readonly target: string };

export type ActionRequest =
  | ({ readonly kind: 'walk_to'; readonly id: string; readonly run?: boolean } & Target)
  | ({ readonly kind: 'look_at'; readonly id: string } & Target)
  | { readonly kind: 'say'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'follow';
      readonly id: string;
      readonly target: string;
      readonly distance: number;
    }
  | { readonly kind: 'wait'; readonly id: string; readonly seconds: number }
  | { readonly kind: 'stop'; readonly id: string };

export type AgentEvent =
  | {
      readonly type: 'heard';
      readonly from: string;
      readonly text: string;
      readonly distance: number;
    }
  | { readonly type: 'interacted'; readonly by: 'player' }
  | { readonly type: 'action_done'; readonly id: string }
  | { readonly type: 'action_failed'; readonly id: string; readonly reason: string }
  | { readonly type: 'action_replaced'; readonly id: string };

export interface PerceivedEntity {
  readonly id: string;
  readonly kind: 'player' | 'character';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
}

export interface Perception {
  readonly type: 'perception';
  /** Simulated seconds since the world started. */
  readonly time: number;
  readonly self: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly on_ground: boolean;
    readonly in_water: boolean;
  };
  readonly action: { readonly id: string; readonly kind: ActionRequest['kind'] } | null;
  /** Entities within SIGHT_DISTANCE, nearest first. */
  readonly nearby: readonly PerceivedEntity[];
}

interface Running {
  readonly request: ActionRequest;
  readonly started: number;
  deadline: number;
  follower?: PathFollower;
  /** For `follow`: where the current path goes, to notice when the target moves away. */
  goal?: { x: number; z: number };
  lastPlan?: number;
}

interface Agent {
  readonly character: Character;
  yaw: number;
  action: Running | undefined;
  speech: { text: string; until: number } | undefined;
}

export interface AgentListener {
  event(characterId: string, event: AgentEvent): void;
  perception(characterId: string, perception: Perception): void;
}

/** What views need to draw a character (plan F05 P15). */
export interface CharacterView {
  readonly id: string;
  readonly state: EntityState;
  readonly yaw: number;
  readonly speech: string | null;
}

export class AgentWorld {
  /** Simulated seconds since the start. */
  time = 0;
  private readonly agents = new Map<string, Agent>();
  private nextPerception = 0;

  constructor(
    readonly physics: PhysicsWorld,
    characters: readonly Character[],
    private readonly player: EntityHandle | undefined,
    private readonly findPath: FindPath,
    private readonly listener: AgentListener,
  ) {
    for (const character of characters) {
      this.agents.set(character.start.id, {
        character,
        yaw: character.start.yaw,
        action: undefined,
        speech: undefined,
      });
    }
  }

  get ids(): string[] {
    return [...this.agents.keys()];
  }

  /** A new action replaces the running one, which ends as replaced (PROTO-001.c, F05 Q5). */
  request(characterId: string, request: ActionRequest): void {
    const agent = this.agents.get(characterId);
    if (!agent) return;
    if (agent.action) {
      this.listener.event(characterId, { type: 'action_replaced', id: agent.action.request.id });
    }
    agent.action = { request, started: this.time, deadline: Infinity };
    this.start(agent, agent.action);
  }

  /** The player pressed E: the nearest character within 3 m gets the event (PROTO-002.c). */
  interact(): string | undefined {
    if (!this.player) return undefined;
    const p = this.player.state;
    let nearest: string | undefined;
    let best = INTERACTION_DISTANCE;
    for (const [id, agent] of this.agents) {
      const s = agent.character.entity.state;
      const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
      if (d <= best) {
        best = d;
        nearest = id;
      }
    }
    if (nearest) this.listener.event(nearest, { type: 'interacted', by: 'player' });
    return nearest;
  }

  /** Stops every action of a character, e.g. when its controller goes away (PROTO-003.b). */
  release(characterId: string): void {
    const agent = this.agents.get(characterId);
    if (agent) agent.action = undefined;
  }

  /**
   * One fixed step: intents of the characters, physics (the player's intent is set by the
   * caller), completion of the actions, perception at PERCEPTION_HZ.
   */
  step(): void {
    for (const agent of this.agents.values()) {
      agent.character.entity.intent = this.intentOf(agent);
    }
    this.physics.step();
    this.time += STEP_SECONDS;
    for (const [id, agent] of this.agents) {
      if (agent.speech && this.time >= agent.speech.until) agent.speech = undefined;
      this.finish(id, agent);
    }
    if (this.time + 1e-9 >= this.nextPerception) {
      this.nextPerception += 1 / PERCEPTION_HZ;
      for (const id of this.agents.keys()) this.listener.perception(id, this.perceive(id));
    }
  }

  /** What a character perceives now (PROTO-002.a). */
  perceive(characterId: string): Perception {
    const agent = this.agents.get(characterId)!;
    const s = agent.character.entity.state;
    const nearby: PerceivedEntity[] = [];
    const add = (id: string, kind: PerceivedEntity['kind'], e: EntityState) => {
      const distance = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z);
      if (distance <= SIGHT_DISTANCE) nearby.push({ id, kind, x: e.x, y: e.y, z: e.z, distance });
    };
    if (this.player) add('player', 'player', this.player.state);
    for (const [id, other] of this.agents) {
      if (id !== characterId) add(id, 'character', other.character.entity.state);
    }
    nearby.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    return {
      type: 'perception',
      time: this.time,
      self: {
        x: s.x,
        y: s.y,
        z: s.z,
        yaw: agent.yaw,
        on_ground: s.onGround,
        in_water: s.submerged >= 0.5,
      },
      action: agent.action
        ? { id: agent.action.request.id, kind: agent.action.request.kind }
        : null,
      nearby,
    };
  }

  /** Characters as views draw them. */
  views(): CharacterView[] {
    return [...this.agents].map(([id, agent]) => ({
      id,
      state: agent.character.entity.state,
      yaw: agent.yaw,
      speech: agent.speech?.text ?? null,
    }));
  }

  private positionOf(id: string): EntityState | undefined {
    if (id === 'player') return this.player?.state;
    return this.agents.get(id)?.character.entity.state;
  }

  private start(agent: Agent, running: Running): void {
    const { request } = running;
    const state = agent.character.entity.state;
    switch (request.kind) {
      case 'walk_to': {
        const goal = 'target' in request ? this.positionOf(request.target) : request;
        if (!goal)
          return this.fail(agent, `there is no entity "${(request as { target: string }).target}"`);
        running.follower = new PathFollower(
          this.findPath,
          { x: goal.x, z: goal.z },
          state,
          this.time,
          request.run,
        );
        // Time limit: twice the walk along the path, plus 5 s (plan F05 P6, PROTO-006.b).
        const speed = request.run ? RUN_SPEED : WALK_SPEED;
        running.deadline = this.time + (2 * running.follower.length) / speed + 5;
        return;
      }
      case 'look_at': {
        const goal = 'target' in request ? this.positionOf(request.target) : request;
        if (!goal)
          return this.fail(agent, `there is no entity "${(request as { target: string }).target}"`);
        agent.yaw = yawTowards(state, goal);
        running.deadline = this.time;
        return;
      }
      case 'say':
        agent.speech = { text: request.text, until: this.time + sayDuration(request.text) };
        running.deadline = agent.speech.until;
        for (const [otherId, other] of this.agents) {
          if (other === agent) continue;
          const o = other.character.entity.state;
          const distance = Math.hypot(o.x - state.x, o.y - state.y, o.z - state.z);
          if (distance <= HEARING_DISTANCE) {
            this.listener.event(otherId, {
              type: 'heard',
              from: agent.character.start.id,
              text: request.text,
              distance,
            });
          }
        }
        return;
      case 'follow':
        if (!this.positionOf(request.target))
          return this.fail(agent, `there is no entity "${request.target}"`);
        return;
      case 'wait':
        running.deadline = this.time + request.seconds;
        return;
      case 'stop':
        running.deadline = this.time;
        return;
    }
  }

  private intentOf(agent: Agent): Intent {
    const running = agent.action;
    if (!running) return IDLE;
    const state = agent.character.entity.state;
    const { request } = running;
    if (request.kind === 'walk_to' && running.follower) {
      return this.walk(agent, running.follower.update(state, this.time));
    }
    if (request.kind === 'follow') {
      const target = this.positionOf(request.target);
      if (!target) return IDLE;
      const distance = Math.hypot(target.x - state.x, target.z - state.z);
      if (distance <= request.distance) {
        running.follower = undefined;
        agent.yaw = yawTowards(state, target);
        return IDLE;
      }
      // A new path when there is none, or when the target moved more than 2 blocks away from it.
      const moved = running.goal
        ? Math.hypot(target.x - running.goal.x, target.z - running.goal.z)
        : Infinity;
      if (!running.follower || running.follower.status.kind !== 'moving' || moved > 2) {
        running.goal = { x: target.x, z: target.z };
        running.follower = new PathFollower(this.findPath, running.goal, state, this.time);
      }
      return this.walk(agent, running.follower.update(state, this.time));
    }
    return IDLE;
  }

  /** Faces the direction of the movement. */
  private walk(agent: Agent, intent: Intent): Intent {
    if (intent.moveX !== 0 || intent.moveZ !== 0) {
      const s = agent.character.entity.state;
      agent.yaw = yawTowards(s, { x: s.x + intent.moveX, z: s.z + intent.moveZ });
    }
    return intent;
  }

  private finish(id: string, agent: Agent): void {
    const running = agent.action;
    if (!running) return;
    const { request } = running;
    const status = running.follower?.status;
    if (request.kind === 'walk_to' && status?.kind === 'arrived') return this.done(id, agent);
    if ((request.kind === 'walk_to' || request.kind === 'follow') && status?.kind === 'failed') {
      return this.fail(agent, status.reason);
    }
    if (this.time + 1e-9 >= running.deadline) {
      if (request.kind === 'walk_to') return this.fail(agent, 'time limit reached before arriving');
      return this.done(id, agent);
    }
  }

  private done(id: string, agent: Agent): void {
    const running = agent.action!;
    agent.action = undefined;
    this.listener.event(id, { type: 'action_done', id: running.request.id });
  }

  private fail(agent: Agent, reason: string): void {
    const running = agent.action;
    if (!running) return;
    agent.action = undefined;
    this.listener.event(agent.character.start.id, {
      type: 'action_failed',
      id: running.request.id,
      reason,
    });
  }
}

/** Yaw that looks from `from` towards `to` (0 looks north, towards -z). */
function yawTowards(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
