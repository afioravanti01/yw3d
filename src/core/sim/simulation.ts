import {
  DEFAULT_DAY_MINUTES,
  DEFAULT_START,
  formatClock,
  parseClock,
  partOfDay,
  secondsBetween,
  timeOfDay,
  type ClockSettings,
  type PartOfDay,
} from '../time/clock';
import {
  AgentWorld,
  HEARING_DISTANCE,
  MAX_SAY_LENGTH,
  sayDuration,
  type AgentEvent,
  type AgentListener,
  type Perception,
} from '../agents/agentWorld';
import { createDefaultRegistry } from '../blocks/builtin';
import { spawnCharacters } from '../characters/characters';
import type { ComposeResult } from '../compose/composeWorld';
import { address } from '../dialogue/address';
import { understandElement, understandYesNo } from '../dialogue/understand';
import { PLAYER_ID } from '../map/worldMap';
import { NavGrid } from '../nav/navGrid';
import { Pathfinder } from '../nav/pathfinding';
import { IDLE, type Intent } from '../physics/entity';
import { PhysicsWorld, type EntityHandle } from '../physics/physicsWorld';
import { PLAYER_SIZE, spawnAtStart } from '../player/player';
import type { World } from '../world/world';

/**
 * The simulation of a composed world (plan F06 P1): physics, player, characters with their
 * controllers, and the dialogue. The host and the browser without a host run the same one.
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

/** The answer when the addressee of the player is not within 16 blocks (A7.5). */
export const NOT_NEARBY = 'Personaggio non in prossimità';

export type SayResult =
  { readonly ok: true; readonly line: SpokenLine } | { readonly ok: false; readonly error: string };

export interface SimulationOptions {
  /** Where the player is: kept across reloads (HOST-003.a); the start of the file otherwise. */
  readonly playerAt?: { readonly x: number; readonly y: number; readonly z: number };
  /** The hour at the start, to keep the hour of the world across a reload (TIME-001.b). */
  readonly clockAt?: number;
  /** Every message of the world, as it is said (DIALOG-002.a, DIALOG-004.a). */
  readonly heard?: (line: SpokenLine) => void;
  /** Clock for the duration of a step, e.g. `performance.now`. */
  readonly now?: () => number;
}

export class Simulation {
  readonly physics: PhysicsWorld;
  readonly player: EntityHandle;
  readonly agents: AgentWorld;
  /** View direction of the player, radians: set by the view that drives it. */
  view: { yaw: number; pitch: number };
  /** Intent of the player for the next steps. */
  intent: Intent = IDLE;
  /** Duration of the last step, milliseconds. */
  lastStepMs = 0;
  /** The clock of the world (TIME-001) and how far `/time` moved it, simulated seconds. */
  readonly clockSettings: ClockSettings;
  private clockOffset = 0;
  /** What the player is saying, for its speech bubble (DIALOG-001.d). */
  private playerSpeech: { text: string; until: number } | undefined;
  /** External controllers by character (PROTO-003, PROTO-004). */
  private readonly sinks = new Map<string, AgentListener>();
  private readonly names: ReadonlyMap<string, string>;
  private readonly elements: readonly { id: string; name: string }[];
  /** The characters, for the addressee of the player's messages (DIALOG-005.d). */
  readonly characters: readonly { id: string; name: string }[];

  constructor(
    readonly result: ComposeResult & { readonly world: World },
    private readonly options: SimulationOptions = {},
  ) {
    this.clockSettings = result.clock ?? {
      startMinutes: parseClock(DEFAULT_START)!,
      dayMinutes: DEFAULT_DAY_MINUTES,
    };
    if (options.clockAt !== undefined) {
      this.clockOffset = secondsBetween(
        this.clockSettings.startMinutes,
        options.clockAt,
        this.clockSettings,
      );
    }
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
    this.characters = result.characters.map((c) => ({ id: c.id, name: c.name }));
    const characters = spawnCharacters(this.physics, result.characters);
    const finder = new Pathfinder(new NavGrid(result.world, registry.solid));
    this.agents = new AgentWorld(
      this.physics,
      characters,
      this.player,
      finder,
      {
        event: (id, event) => {
          this.sinks.get(id)?.event(id, this.enrich(event));
        },
        perception: (id, perception) => this.sinks.get(id)?.perception(id, this.named(perception)),
        said: (id, text, to) => this.spoken({ from: id, to, text }),
      },
      result.goals,
    );
  }

  /** Simulated seconds since the world started. */
  get time(): number {
    return this.agents.time;
  }

  /** The hour of the world, minutes after midnight, and the part of the day (TIME-001). */
  get clock(): { readonly minutes: number; readonly part: PartOfDay } {
    const minutes = timeOfDay(this.time + this.clockOffset, this.clockSettings);
    return { minutes, part: partOfDay(minutes) };
  }

  /** Brings the world to an hour, going forward (`/time`, TIME-002.a). */
  setClock(minutes: number): void {
    this.clockOffset += secondsBetween(this.clock.minutes, minutes, this.clockSettings);
  }

  /** One fixed step: the player's intent, the agent world and the physics. */
  step(): void {
    const start = this.options.now?.();
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
   * perception go to it.
   */
  attach(characterId: string, sink: AgentListener): void {
    this.sinks.set(characterId, sink);
  }

  /** The controller went away: the character stops (PROTO-004.b). */
  detach(characterId: string, sink: AgentListener): void {
    if (this.sinks.get(characterId) !== sink) return;
    this.sinks.delete(characterId);
    this.agents.release(characterId);
  }

  isControlled(characterId: string): boolean {
    return this.sinks.has(characterId);
  }

  /**
   * The player says a message (DIALOG-001.b–c, DIALOG-005.d): to the character named by `@` at
   * the start, or given by the channel, or to nobody. The characters within 16 blocks of the
   * player hear it; an addressee farther away does not, and the message is refused (A7.5).
   */
  playerSays(text: string, options: { readonly to?: string | null } = {}): SayResult {
    let body = text.trim();
    let to = options.to ?? null;
    if (to !== null) {
      if (!this.agents.ids.includes(to)) {
        return { ok: false, error: `there is no character "${to}"` };
      }
    } else {
      const addressed = address(body, this.characters);
      if (!addressed.ok) return addressed;
      to = addressed.to;
      body = addressed.body;
    }
    if (body.length === 0 || body.length > MAX_SAY_LENGTH) {
      return { ok: false, error: `a message has 1 to ${MAX_SAY_LENGTH} characters` };
    }
    const p = this.player.state;
    const hearers = this.agents.ids.flatMap((id) => {
      const s = this.agents.stateOf(id)!;
      const distance = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
      return distance <= HEARING_DISTANCE ? [{ id, distance }] : [];
    });
    // Only a character near the player can be spoken to (A7.5).
    if (to !== null && !hearers.some((h) => h.id === to)) {
      return { ok: false, error: NOT_NEARBY };
    }
    // The message is in the log before the replies it causes.
    this.playerSpeech = { text: body, until: this.time + sayDuration(body) };
    const line = this.spoken({ from: PLAYER_ID, to, text: body });
    for (const { id, distance } of hearers) {
      const event: AgentEvent = { type: 'heard', from: PLAYER_ID, text: body, distance, to };
      this.sinks.get(id)?.event(id, this.enrich(event));
    }
    return { ok: true, line };
  }

  /** A line of the conversation, passed on whoever says it and wherever (DIALOG-002.a). */
  private spoken(said: { from: string; to: string | null; text: string }): SpokenLine {
    const line: SpokenLine = {
      from: said.from,
      fromName: this.names.get(said.from) ?? said.from,
      to: said.to,
      toName: said.to === null ? null : (this.names.get(said.to) ?? said.to),
      text: said.text,
      time: this.time,
    };
    this.options.heard?.(line);
    return line;
  }

  /**
   * Sentences carry the element they name and whether they say yes or no, as in DIALOG-003
   * (PROTO-002.b, DIALOG-003.e).
   */
  private enrich(event: AgentEvent): AgentEvent {
    if (event.type !== 'heard') return event;
    return {
      ...event,
      to: event.to ?? null,
      mentions: understandElement(event.text, this.elements) ?? null,
      yes_no: understandYesNo(event.text) ?? null,
    };
  }

  /** Perception with the names of the entities nearby (PROTO-002.a). */
  private named(perception: Perception): Perception {
    const clock = this.clock;
    return {
      ...perception,
      time_of_day: formatClock(clock.minutes),
      part_of_day: clock.part,
      nearby: perception.nearby.map((e) => ({ ...e, name: this.names.get(e.id) ?? e.id })),
    };
  }
}
