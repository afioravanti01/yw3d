import type { Intent } from '../core/physics/entity';
import type { SpokenLine } from '../core/sim/simulation';
import type { Diagnostic } from '../core/yaml/report';

/**
 * Messages between the host and its views (plan F04 P6), JSON over the WebSocket of the host.
 * The first message of the host (`hello`) carries the protocol version.
 */
export const PROTOCOL_VERSION = 1;
/** Path of the WebSocket of the host (plan F04 P5). */
export const HOST_SOCKET_PATH = '/host';

/** What a view needs to compose the same world as the host (plan F04 P7). */
export interface WorldMessage {
  /** File as shown in diagnostics, e.g. `valle/world.yaml`. */
  readonly file: string;
  readonly text: string;
  /** URLs of the author's structure modules, in registration order. */
  readonly structures: readonly string[];
  readonly seedOverride: number | undefined;
  /** Hash of the world composed by the host. */
  readonly hash: number;
}

/** A view drives the player or only watches (F04 Q3). */
export type Role = 'driver' | 'spectator';

export interface PlayerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly onGround: boolean;
  readonly submerged: number;
  /** View direction of the driver, radians. */
  readonly yaw: number;
  readonly pitch: number;
  /** What the player is saying, for its speech bubble (DIALOG-001.d). */
  readonly speech: string | null;
}

/** A character as views draw it (plan F05 P15). */
export interface CharacterSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Horizontal speed, blocks per second: drives the walking animation. */
  readonly speed: number;
  readonly onGround: boolean;
  readonly submerged: number;
  readonly yaw: number;
  /** What it is saying, shown in a speech bubble (CHAR-002.c). */
  readonly speech: string | null;
  /** Whether a controller drives it now, and its running action (DEBUG-001.a). */
  readonly controlled: boolean;
  readonly action: string | null;
  /** Its LLM agent and what it is doing, if it has one (DEBUG-001.a, plan F08 P14). */
  readonly agent: {
    readonly mode: 'headless' | 'api' | 'fake';
    readonly brain: string;
    readonly model: string | null;
    readonly state: 'idle' | 'thinking' | 'acting' | 'stopped' | 'error';
    readonly last_ms: number | null;
  } | null;
  /** Its Python program and whether it runs, if it has one (DEBUG-001.a). */
  readonly program: {
    readonly file: string;
    readonly state: 'running' | 'stopped' | 'error';
  } | null;
}

export type HostMessage =
  | {
      readonly type: 'hello';
      readonly version: number;
      readonly role: Role;
      readonly world: WorldMessage | null;
      readonly diagnostics: readonly Diagnostic[];
      readonly player: PlayerSnapshot | null;
      readonly characters: readonly CharacterSnapshot[];
      readonly views: number;
    }
  | {
      readonly type: 'world';
      readonly world: WorldMessage;
      readonly diagnostics: readonly Diagnostic[];
      readonly player: PlayerSnapshot;
    }
  | { readonly type: 'diagnostics'; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly type: 'state';
      /** Simulation steps since the host started. */
      readonly step: number;
      readonly player: PlayerSnapshot;
      readonly characters: readonly CharacterSnapshot[];
      readonly views: number;
    }
  | { readonly type: 'role'; readonly role: Role }
  | { readonly type: 'pong'; readonly id: number }
  /** A sentence the player hears (DIALOG-002.a). */
  | { readonly type: 'line'; readonly line: SpokenLine }
  /** A sentence of the driving view that could not be said, e.g. an unknown `@id`. */
  | { readonly type: 'say_error'; readonly error: string };

export type ViewMessage =
  | {
      readonly type: 'intent';
      readonly intent: Intent;
      readonly yaw: number;
      readonly pitch: number;
    }
  | { readonly type: 'ping'; readonly id: number }
  /** The player pressed E near a character (PROTO-002.c). */
  | { readonly type: 'interact' }
  /** The player says a sentence, from the driving view (DIALOG-001). */
  | { readonly type: 'say'; readonly text: string };
