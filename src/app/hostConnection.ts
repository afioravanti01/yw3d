import type { Intent } from '../core/physics/entity';
import type { Diagnostic } from '../core/yaml/report';
import type { SpokenLine } from '../core/sim/simulation';
import type {
  CharacterSnapshot,
  HostMessage,
  PlayerSnapshot,
  Role,
  ViewMessage,
  WorldMessage,
} from '../protocol/messages';

/** Configuration the host puts in the page (plan F04 P10). */
export interface HostConfig {
  readonly socket: string;
}

declare global {
  interface Window {
    __YW3D_HOST__?: HostConfig;
  }
}

/** The host configuration, or undefined in browser-only mode (APP-003). */
export function hostConfig(): HostConfig | undefined {
  return window.__YW3D_HOST__;
}

export interface HostHandlers {
  hello(message: Extract<HostMessage, { type: 'hello' }>): void;
  world(world: WorldMessage, diagnostics: readonly Diagnostic[]): void;
  diagnostics(diagnostics: readonly Diagnostic[]): void;
  role(role: Role): void;
  /** A sentence the player hears (DIALOG-002.a). */
  line(line: SpokenLine): void;
  /** A sentence of this view that could not be said. */
  sayError(error: string): void;
  closed(): void;
}

/** Intents are sent when they change, and at least this often while driving (plan F04 P9). */
const INTENT_INTERVAL_MS = 50;
const PING_INTERVAL_MS = 1000;

/**
 * The WebSocket to the host (HOST-002): receives worlds and player states, sends the intents of
 * the driving view, measures the round trip.
 */
export class HostConnection {
  role: Role = 'spectator';
  views = 0;
  /** Round-trip time of the last ping, ms. */
  rttMs = 0;
  private lastClock: { minutes: number; at: number } | undefined;
  readonly address: string;

  private readonly socket: WebSocket;
  private previous: { at: number; player: PlayerSnapshot } | undefined;
  private last: { at: number; player: PlayerSnapshot } | undefined;
  private previousCharacters: { at: number; list: readonly CharacterSnapshot[] } | undefined;
  private lastCharacters: { at: number; list: readonly CharacterSnapshot[] } | undefined;
  private lastSent: { at: number; key: string } | undefined;
  private readonly pings = new Map<number, number>();
  private nextPing = 1;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    config: HostConfig,
    private readonly handlers: HostHandlers,
    private readonly now: () => number,
  ) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.address = location.host;
    this.socket = new WebSocket(`${protocol}//${location.host}${config.socket}`);
    this.socket.addEventListener('message', (event) =>
      this.receive(JSON.parse(String(event.data)) as HostMessage),
    );
    this.socket.addEventListener('close', () => handlers.closed());
    this.timer = setInterval(() => this.ping(), PING_INTERVAL_MS);
  }

  /** Latest state of the player received from the host. */
  latest(): PlayerSnapshot | undefined {
    return this.last?.player;
  }

  /**
   * Position to draw at `now`: between the two latest states, one message interval behind the
   * host, so that the movement stays smooth (plan F04 P8).
   */
  interpolated(now: number): { x: number; y: number; z: number } | undefined {
    const last = this.last;
    if (!last) return undefined;
    const previous = this.previous;
    if (!previous || last.at <= previous.at) return last.player;
    const alpha = Math.min(1, (now - last.at) / (last.at - previous.at));
    const a = previous.player;
    const b = last.player;
    return {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
    };
  }

  /** Characters to draw at `now`, interpolated like the player (plan F05 P15). */
  interpolatedCharacters(now: number): CharacterSnapshot[] {
    const last = this.lastCharacters;
    if (!last) return [];
    const previous = this.previousCharacters;
    if (!previous || last.at <= previous.at) return [...last.list];
    const alpha = Math.min(1, (now - last.at) / (last.at - previous.at));
    const before = new Map(previous.list.map((c) => [c.id, c]));
    return last.list.map((c) => {
      const a = before.get(c.id);
      if (!a) return c;
      return {
        ...c,
        x: a.x + (c.x - a.x) * alpha,
        y: a.y + (c.y - a.y) * alpha,
        z: a.z + (c.z - a.z) * alpha,
      };
    });
  }

  /** The player pressed E (PROTO-002.c). */
  /** The player says a sentence (DIALOG-001.b). */
  say(text: string): void {
    this.send({ type: 'say', text });
  }

  /** `/time HH:MM` from the driving view (TIME-002.a). */
  setTime(minutes: number): void {
    this.send({ type: 'time', minutes });
  }

  /**
   * The hour of the world now, minutes after midnight (TIME-001.b): the last one of the host,
   * moved on by the time passed since, at the pace of a day of `dayMinutes` real minutes.
   */
  clock(dayMinutes: number): number | undefined {
    if (!this.lastClock) return undefined;
    const seconds = (this.now() - this.lastClock.at) / 1000;
    return (this.lastClock.minutes + (seconds * 1440) / (dayMinutes * 60)) % 1440;
  }

  interact(): void {
    this.send({ type: 'interact' });
  }

  /** Sends the intent of the driving view when it changes, or periodically (plan F04 P9). */
  sendIntent(intent: Intent, yaw: number, pitch: number, now: number): void {
    const key = JSON.stringify(intent);
    const changed = key !== this.lastSent?.key;
    if (!changed && this.lastSent && now - this.lastSent.at < INTENT_INTERVAL_MS) return;
    this.lastSent = { at: now, key };
    this.send({ type: 'intent', intent, yaw, pitch });
  }

  close(): void {
    clearInterval(this.timer);
    this.socket.close();
  }

  private send(message: ViewMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private ping(): void {
    const id = this.nextPing++;
    this.pings.set(id, this.now());
    this.send({ type: 'ping', id });
  }

  private receive(message: HostMessage): void {
    switch (message.type) {
      case 'hello':
        this.role = message.role;
        this.views = message.views;
        if (message.clock !== null) this.lastClock = { minutes: message.clock, at: this.now() };
        if (message.player) this.record(message.player);
        this.recordCharacters(message.characters);
        this.handlers.hello(message);
        break;
      case 'world':
        this.handlers.world(message.world, message.diagnostics);
        break;
      case 'diagnostics':
        this.handlers.diagnostics(message.diagnostics);
        break;
      case 'state':
        this.views = message.views;
        this.lastClock = { minutes: message.clock, at: this.now() };
        this.record(message.player);
        this.recordCharacters(message.characters);
        break;
      case 'role':
        this.role = message.role;
        this.handlers.role(message.role);
        break;
      case 'line':
        this.handlers.line(message.line);
        break;
      case 'say_error':
        this.handlers.sayError(message.error);
        break;
      case 'pong': {
        const sent = this.pings.get(message.id);
        if (sent !== undefined) this.rttMs = this.now() - sent;
        this.pings.delete(message.id);
        break;
      }
    }
  }

  private recordCharacters(list: readonly CharacterSnapshot[]): void {
    this.previousCharacters = this.lastCharacters;
    this.lastCharacters = { at: this.now(), list };
  }

  private record(player: PlayerSnapshot): void {
    this.previous = this.last;
    this.last = { at: this.now(), player };
  }
}
