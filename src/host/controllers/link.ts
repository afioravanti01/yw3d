import type { AgentEvent, AgentListener, Perception } from '../../core/agents/agentWorld';
import type { WorldMap } from '../../core/map/worldMap';
import {
  helloMessage,
  parseControllerMessage,
  type HostToController,
} from '../../protocol/controller';
import type { HostSession } from '../session';
import { PREFIX, type Terminal } from '../terminal';

/** A way to talk to a controller: one JSON text per message (a line on stdio, a WebSocket frame). */
export interface Channel {
  /** Sends a message; returns false when the channel is full and the rest must wait. */
  send(text: string): boolean;
}

/** Events kept while a controller does not read, before the oldest are dropped (plan F05 P8). */
export const MAX_QUEUED_EVENTS = 100;
/** A controller that does not read for this long is reported and its character stops. */
export const NOT_READING_SECONDS = 5;

/**
 * Connects a controller channel to a character (PROTO-003, PROTO-004): hello, messages turned
 * into actions, events and perception sent back. A slow controller never slows the world: only
 * the latest perception waits, events wait up to MAX_QUEUED_EVENTS (PROTO-006.a).
 */
export class ControllerLink implements AgentListener {
  private events: AgentEvent[] = [];
  private perceptionWaiting: Perception | undefined;
  private full = false;
  private fullSince: number | undefined;
  private warned = false;
  private closed = false;

  constructor(
    readonly characterId: string,
    private readonly session: HostSession,
    private readonly channel: Channel,
    private readonly terminal: Terminal,
    private readonly now: () => number,
  ) {}

  /** Attaches to the character and greets the controller (PROTO-001.a). */
  start(): void {
    this.session.attachController(this.characterId, this);
    const { result } = this.session.world!;
    const size = result.world.size;
    const character = result.characters.find((c) => c.id === this.characterId)!;
    this.write(
      helloMessage(
        {
          id: character.id,
          name: character.name,
          description: character.description ?? null,
        },
        [size.x, size.y, size.z],
        result.map!,
      ),
    );
  }

  /** The world was composed again: the controller gets the new map (PROTO-001.e). */
  worldChanged(map: WorldMap): void {
    this.write({ type: 'map', map });
  }

  /** A message from the controller. */
  receive(text: string): void {
    if (this.closed || text.trim() === '') return;
    const parsed = parseControllerMessage(text);
    if (!parsed.ok) {
      this.write(parsed.error);
      return;
    }
    if (parsed.message.kind === 'action') {
      this.session.agents?.request(this.characterId, parsed.message.request);
    }
  }

  event(_: string, event: AgentEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_QUEUED_EVENTS) {
      this.events.splice(0, this.events.length - MAX_QUEUED_EVENTS);
    }
    this.flush();
  }

  perception(_: string, perception: Perception): void {
    this.perceptionWaiting = perception;
    this.flush();
  }

  /** The channel has room again (e.g. the `drain` of a stream). */
  drained(): void {
    this.full = false;
    this.fullSince = undefined;
    this.warned = false;
    this.flush();
  }

  /** The controller went away: the character stops (PROTO-003.b, PROTO-004.b). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.session.detachController(this.characterId, this);
  }

  /** Messages waiting to be sent, for tests: events and at most one perception. */
  get waiting(): { events: number; perceptions: number } {
    return { events: this.events.length, perceptions: this.perceptionWaiting ? 1 : 0 };
  }

  private flush(): void {
    if (this.closed) return;
    if (this.full) {
      this.checkNotReading();
      return;
    }
    while (this.events.length > 0 && !this.full) this.write(this.events.shift()!);
    if (!this.full && this.perceptionWaiting) {
      const perception = this.perceptionWaiting;
      this.perceptionWaiting = undefined;
      this.write(perception);
    }
  }

  private write(message: HostToController): void {
    if (!this.channel.send(JSON.stringify(message))) {
      this.full = true;
      this.fullSince ??= this.now();
    }
  }

  private checkNotReading(): void {
    if (this.warned || this.fullSince === undefined) return;
    if (this.now() - this.fullSince < NOT_READING_SECONDS * 1000) return;
    this.warned = true;
    this.terminal.line(
      `${PREFIX}  [${this.characterId}] the controller is not reading its messages: the character stops`,
    );
    this.session.agents?.release(this.characterId);
  }
}
