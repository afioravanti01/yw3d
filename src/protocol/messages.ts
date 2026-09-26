import type { Intent } from '../core/physics/entity';
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
}

export type HostMessage =
  | {
      readonly type: 'hello';
      readonly version: number;
      readonly role: Role;
      readonly world: WorldMessage | null;
      readonly diagnostics: readonly Diagnostic[];
      readonly player: PlayerSnapshot | null;
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
      readonly views: number;
    }
  | { readonly type: 'role'; readonly role: Role }
  | { readonly type: 'pong'; readonly id: number };

export type ViewMessage =
  | {
      readonly type: 'intent';
      readonly intent: Intent;
      readonly yaw: number;
      readonly pitch: number;
    }
  | { readonly type: 'ping'; readonly id: number };
