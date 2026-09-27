import {
  AgentWorld,
  HEARING_DISTANCE,
  sayDuration,
  type AgentEvent,
  type AgentListener,
  type Perception,
} from '../agents/agentWorld';
import { createDefaultRegistry } from '../blocks/builtin';
import { MAX_SAY_LENGTH } from '../behaviors/builtin';
import { agentBehaviorWorld, Behaviors } from '../behaviors/runner';
import { spawnCharacters } from '../characters/characters';
import type { ComposeResult } from '../compose/composeWorld';
import { understandElement } from '../dialogue/understand';
import { PLAYER_ID } from '../map/worldMap';
import { NavGrid } from '../nav/navGrid';
import { Pathfinder } from '../nav/pathfinding';
import { IDLE, type Intent } from '../physics/entity';
import { PhysicsWorld, type EntityHandle } from '../physics/physicsWorld';
import { EYE_HEIGHT, PLAYER_SIZE, spawnAtStart, viewDirection } from '../player/player';
import type { World } from '../world/world';

/**
 * The simulation of a composed world (plan F06 P1): physics, player, characters with their
 * behaviors and controllers, and the dialogue. The host and the browser without a host run
 * the same one, so that characters act the same way in both (BEHAV-001.d, BEHAV-001.f).
 */

/** A sentence said in the world, as the conversation log shows it (DIALOG-002). */
export interface SpokenLine {
  /** Who spoke: a character id or `player`, with its name. */
  readonly from: string;
  readonly fromName: string;
  /** To whom, if to someone (DIALOG-001.c). */
  readonly to: string | null;
  readonly toName: string | null;
  readonly text: string;
  /** Simulated seconds. */
  readonly time: number;
}

/** A character is looked at within this angle from the center of the view (DIALOG-001.c). */
export const LOOK_ANGLE = (10 * Math.PI) / 180;
/** Height of the center of a character above its feet, blocks: the middle of its body. */
const BODY_CENTER = PLAYER_SIZE.height / 2;

export type SayResult =
  | { readonly ok: true; readonly line: SpokenLine; readonly answeredBy: string | undefined }
  | { readonly ok: false; readonly error: string };

export interface SimulationOptions {
  /** Where the player is: kept across reloads (HOST-003.a); the start of the file otherwise. */
  readonly playerAt?: { readonly x: number; readonly y: number; readonly z: number };
  /** Lines for the terminal of the host: failures of behaviors (BEHAV-002.f, BEHAV-002.g). */
  readonly log?: (characterId: string, message: string) => void;
  /** The sentences the player hears, as they are said (DIALOG-002, DIALOG-004). */
  readonly heard?: (line: SpokenLine) => void;
  /** Clock for the duration of a step, e.g. `performance.now`. */
  readonly now?: () => number;
}

export class Simulation {
  readonly physics: PhysicsWorld;
  readonly player: EntityHandle;
  readonly agents: AgentWorld;
  readonly behaviors: Behaviors;
  /** View direction of the player, radians: set by the view that drives it. */
  view: { yaw: number; pitch: number };
  /** Intent of the player for the next steps. */
  intent: Intent = IDLE;
  /** Duration of the last step, milliseconds. */
  lastStepMs = 0;
  /** What the player is saying, for its speech bubble (DIALOG-001.d). */
  private playerSpeech: { text: string; until: number } | undefined;
  /** External controllers by character (PROTO-003, PROTO-004). */
  private readonly sinks = new Map<string, AgentListener>();
  private readonly names: ReadonlyMap<string, string>;
  private readonly elements: readonly { id: string; name: string }[];

  constructor(
    readonly result: ComposeResult & { readonly world: World },
    private readonly options: SimulationOptions = {},
  ) {
    const registry = createDefaultRegistry();
    this.physics = new PhysicsWorld(result.world, registry);
    if (options.playerAt) {
      const { x, y, z } = options.playerAt;
      this.player = this.physics.spawn(PLAYER_SIZE, x, y, z);
      this.view = { yaw: 0, pitch: 0 };
    } else {
      const spawned = spawnAtStart(this.physics, result.player);
      this.player = spawned.player;
      this.view = { yaw: spawned.yaw, pitch: 0 };
    }
    const map = result.map!;
    this.names = new Map(map.entries.map((e) => [e.id, e.name]));
    this.elements = map.entries.map((e) => ({ id: e.id, name: e.name }));
    const characters = spawnCharacters(this.physics, result.characters);
    const finder = new Pathfinder(new NavGrid(result.world, registry.solid));
    // The agent world sends events to the behaviors, which are made after it.
    const route: { behaviors?: Behaviors } = {};
    this.agents = new AgentWorld(
      this.physics,
      characters,
      this.player,
      finder,
      {
        event: (id, event) => {
          const enriched = this.enrich(event);
          this.sinks.get(id)?.event(id, enriched);
          route.behaviors?.event(id, enriched);
        },
        perception: (id, perception) => this.sinks.get(id)?.perception(id, this.named(perception)),
        said: (id, text) => this.spoken({ from: id, to: null, text }, this.agents.stateOf(id)!),
      },
      result.goals,
    );
    this.behaviors = new Behaviors(
      new Map(result.characters.flatMap((c) => (c.behavior ? [[c.id, c.behavior] as const] : []))),
      agentBehaviorWorld(this.agents, map, result.goals, result.seed!, (id, message) =>
        options.log?.(id, message),
      ),
    );
    route.behaviors = this.behaviors;
  }

  /** Simulated seconds since the world started. */
  get time(): number {
    return this.agents.time;
  }

  /** One fixed step: behaviors, the player's intent, the agent world and the physics. */
  step(): void {
    const start = this.options.now?.();
    this.behaviors.step();
    this.player.intent = this.intent;
    this.agents.step();
    if (this.playerSpeech && this.time >= this.playerSpeech.until) this.playerSpeech = undefined;
    if (start !== undefined) this.lastStepMs = this.options.now!() - start;
  }

  /** The player pressed E near a character (PROTO-002.c). */
  interact(): string | undefined {
    return this.agents.interact();
  }

  /** What the player is saying now, if anything. */
  get playerSaying(): string | null {
    return this.playerSpeech?.text ?? null;
  }

  /**
   * An external controller drives a character (PROTO-003, PROTO-004): its events and
   * perception go to it, and the character's behavior, if any, waits (F06 Q2).
   */
  attach(characterId: string, sink: AgentListener): void {
    this.sinks.set(characterId, sink);
    if (this.behaviors.has(characterId)) {
      // The client starts from a character standing still, not from the behavior's action.
      this.behaviors.suspend(characterId);
      this.agents.release(characterId);
    }
  }

  /** The controller went away: the character stops, or its behavior goes on (PROTO-004.b). */
  detach(characterId: string, sink: AgentListener): void {
    if (this.sinks.get(characterId) !== sink) return;
    this.sinks.delete(characterId);
    this.agents.release(characterId);
    this.behaviors.resume(characterId);
  }

  isControlled(characterId: string): boolean {
    return this.sinks.has(characterId);
  }

  /**
   * The player says a sentence (DIALOG-001.b–c): to the character named by `@id` at the
   * start, or given by the channel, or looked at; heard by the characters within 16 blocks;
   * first an answer to a question (BEHAV-005.a), then a sentence for the others.
   */
  playerSays(
    text: string,
    options: { readonly to?: string | null; readonly lookAt?: boolean } = {},
  ): SayResult {
    let body = text.trim();
    let to = options.to ?? null;
    const addressed = /^@([^\s]+)\s*(.*)$/s.exec(body);
    if (addressed) {
      to = addressed[1]!;
      body = addressed[2]!.trim();
    }
    if (to !== null && !this.agents.ids.includes(to)) {
      return { ok: false, error: `there is no character "${to}"` };
    }
    if (body.length === 0 || body.length > MAX_SAY_LENGTH) {
      return { ok: false, error: `a sentence has 1 to ${MAX_SAY_LENGTH} characters` };
    }
    if (to === null && options.lookAt) to = this.lookedAt() ?? null;
    const p = this.player.state;
    const hearers = this.agents.ids.flatMap((id) => {
      const s = this.agents.stateOf(id)!;
      const distance = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
      return distance <= HEARING_DISTANCE ? [{ id, distance }] : [];
    });
    const answeredBy = this.behaviors.answer(body, to, hearers);
    const mentions = understandElement(body, this.elements) ?? null;
    for (const { id, distance } of hearers) {
      if (id === answeredBy) continue;
      const event: AgentEvent = {
        type: 'heard',
        from: PLAYER_ID,
        text: body,
        distance,
        to,
        mentions,
      };
      this.sinks.get(id)?.event(id, event);
      this.behaviors.event(id, event);
    }
    this.playerSpeech = { text: body, until: this.time + sayDuration(body) };
    const line = this.spoken({ from: PLAYER_ID, to, text: body }, p);
    return { ok: true, line, answeredBy };
  }

  /**
   * The character at the center of the view, within 10° and 16 blocks of the eyes, the nearest
   * to the center when there are more (DIALOG-001.c).
   */
  lookedAt(): string | undefined {
    const p = this.player.state;
    const eye = [p.x, p.y + EYE_HEIGHT, p.z] as const;
    const [dx, dy, dz] = viewDirection(this.view.yaw, this.view.pitch);
    let best: string | undefined;
    let bestAngle = LOOK_ANGLE;
    for (const id of this.agents.ids) {
      const s = this.agents.stateOf(id)!;
      const vx = s.x - eye[0];
      const vy = s.y + BODY_CENTER - eye[1];
      const vz = s.z - eye[2];
      const distance = Math.hypot(vx, vy, vz);
      if (distance === 0 || distance > HEARING_DISTANCE) continue;
      const cos = (vx * dx + vy * dy + vz * dz) / distance;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (angle <= bestAngle) {
        bestAngle = angle;
        best = id;
      }
    }
    return best;
  }

  /** A line of the conversation, passed on when the player hears it (DIALOG-002.a). */
  private spoken(
    said: { from: string; to: string | null; text: string },
    at: { x: number; y: number; z: number },
  ): SpokenLine {
    const line: SpokenLine = {
      from: said.from,
      fromName: this.names.get(said.from) ?? said.from,
      to: said.to,
      toName: said.to === null ? null : (this.names.get(said.to) ?? said.to),
      text: said.text,
      time: this.time,
    };
    const p = this.player.state;
    if (Math.hypot(at.x - p.x, at.y - p.y, at.z - p.z) <= HEARING_DISTANCE) {
      this.options.heard?.(line);
    }
    return line;
  }

  /** Sentences carry the element they name, as in DIALOG-003 (PROTO-002.b). */
  private enrich(event: AgentEvent): AgentEvent {
    if (event.type !== 'heard' || event.mentions !== undefined) return event;
    return {
      ...event,
      to: event.to ?? null,
      mentions: understandElement(event.text, this.elements) ?? null,
    };
  }

  /** Perception with the names of the entities nearby (PROTO-002.a). */
  private named(perception: Perception): Perception {
    return {
      ...perception,
      nearby: perception.nearby.map((e) => ({ ...e, name: this.names.get(e.id) ?? e.id })),
    };
  }
}
