import {
  MAX_SAY_LENGTH,
  type ActionRequest,
  type AgentEvent,
  type Perception,
} from '../core/agents/agentWorld';
import type { WorldMap } from '../core/map/worldMap';
import { MAX_CHARACTER_SPEED_MPS, MIN_CHARACTER_SPEED_MPS } from '../core/physics/constants';
import {
  formatPath,
  number,
  object,
  oneOf,
  optional,
  str,
  type Issue,
  type Schema,
} from '../core/schema/schema';

/**
 * Protocol between the host and the controllers of characters (PROTO-001), version 3 (plan
 * F07 P6): JSON messages, one per line on stdio, one per frame on the WebSocket
 * `/controller`. Every message has a `type`; fields are `snake_case` (F05 Q8).
 */
export const CONTROLLER_PROTOCOL_VERSION = 3;
export const CONTROLLER_SOCKET_PATH = '/controller';

export interface ControllerHello {
  readonly type: 'hello';
  readonly version: number;
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
  };
  /** Size of the world in blocks: x, y, z. */
  readonly world: { readonly size: readonly [number, number, number] };
  /** Every element of the world, with its id (MAP-002, PROTO-001.a). */
  readonly map: WorldMap;
}

/** The map of the world after a reload (PROTO-001.e). */
export interface MapMessage {
  readonly type: 'map';
  readonly map: WorldMap;
}

/** The first message to a client that speaks as the player (PROTO-007). */
export interface PlayerHello {
  readonly type: 'hello';
  readonly version: number;
  readonly player: { readonly id: 'player'; readonly name: string };
  readonly world: { readonly size: readonly [number, number, number] };
  readonly map: WorldMap;
}

/** A sentence the player hears, for a client that speaks as the player (PROTO-007). */
export interface PlayerHeard {
  readonly type: 'heard';
  readonly from: string;
  readonly from_name: string;
  readonly to: string | null;
  readonly to_name: string | null;
  readonly text: string;
}

/** A client drives the character of a program now, or has left it (PROTO-004). */
export interface ControlMessage {
  readonly type: 'paused' | 'resumed';
}

export interface ControllerError {
  readonly type: 'error';
  readonly message: string;
}

/** Messages from the host to a controller. */
export type HostToController =
  ControllerHello | MapMessage | Perception | AgentEvent | ControlMessage | ControllerError;

/** Messages from the host to a client that speaks as the player. */
export type HostToPlayer = PlayerHello | MapMessage | PlayerHeard | ControllerError;

/** The first message on the WebSocket: which character the client wants to drive (PROTO-004). */
export interface ControlRequest {
  readonly type: 'control';
  readonly character: string;
}

export function helloMessage(
  character: ControllerHello['character'],
  size: readonly [number, number, number],
  map: WorldMap,
): ControllerHello {
  return {
    type: 'hello',
    version: CONTROLLER_PROTOCOL_VERSION,
    character,
    world: { size },
    map,
  };
}

const actionId = () => str();
const coordinate = () => number({ min: -1e6, max: 1e6 });
const entity = () => str();
/** Walking speed in m/s (A5.1). */
const speed = () => number({ min: MIN_CHARACTER_SPEED_MPS, max: MAX_CHARACTER_SPEED_MPS });

/** Schema of each message a controller can send, by `type` (PROTO-001.b). */
const MESSAGES: Record<string, Schema<Record<string, unknown>>> = {
  walk_to: object(
    {
      type: oneOf(['walk_to']),
      id: actionId(),
      x: optional(coordinate()),
      z: optional(coordinate()),
      target: optional(entity()),
      speed: optional(speed()),
    },
    pointOrTarget,
  ),
  look_at: object(
    {
      type: oneOf(['look_at']),
      id: actionId(),
      x: optional(coordinate()),
      z: optional(coordinate()),
      target: optional(entity()),
    },
    pointOrTarget,
  ),
  say: object(
    { type: oneOf(['say']), id: actionId(), text: str(), to: optional(entity()) },
    (m, path, issues) => {
      if (m.text.length === 0 || m.text.length > MAX_SAY_LENGTH) {
        issues.push({
          path: [...path, 'text'],
          message: `the text must have 1 to ${MAX_SAY_LENGTH} characters`,
        });
      }
    },
  ),
  follow: object({
    type: oneOf(['follow']),
    id: actionId(),
    target: entity(),
    distance: number({ min: 1, max: 32, default: 3 }),
    speed: optional(speed()),
  }),
  wait: object({ type: oneOf(['wait']), id: actionId(), seconds: number({ min: 0, max: 3600 }) }),
  stop: object({ type: oneOf(['stop']), id: actionId() }),
  control: object({ type: oneOf(['control']), character: str() }),
  player: object({ type: oneOf(['player']) }),
};

function pointOrTarget(
  m: { x?: number; z?: number; target?: string },
  path: readonly (string | number)[],
  issues: Issue[],
): void {
  const point = m.x !== undefined && m.z !== undefined;
  const partial = (m.x === undefined) !== (m.z === undefined);
  if (partial || point === (m.target !== undefined)) {
    issues.push({ path, message: 'give either "x" and "z", or "target"' });
  }
}

export type ControllerMessage =
  | { readonly kind: 'action'; readonly request: ActionRequest }
  | { readonly kind: 'control'; readonly character: string }
  | { readonly kind: 'player' };

export type ParsedControllerMessage =
  | { readonly ok: true; readonly message: ControllerMessage }
  | { readonly ok: false; readonly error: ControllerError };

/**
 * Parses one message from a controller (PROTO-001.d). Invalid messages give an error message
 * to send back, with the cause; they never throw.
 */
export function parseControllerMessage(text: string): ParsedControllerMessage {
  const fail = (message: string): ParsedControllerMessage => ({
    ok: false,
    error: { type: 'error', message },
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(`not valid JSON: ${text.slice(0, 80)}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('a message must be a JSON object with a "type"');
  }
  const type = (raw as { type?: unknown }).type;
  const schema = typeof type === 'string' ? MESSAGES[type] : undefined;
  if (!schema) {
    return fail(
      `unknown message type ${JSON.stringify(type)}; expected one of: ${Object.keys(MESSAGES).join(', ')}`,
    );
  }
  const issues: Issue[] = [];
  const parsed = schema.parse(raw, [], issues);
  if (!parsed) {
    return fail(issues.map((i) => `${formatPath(i.path) || type}: ${i.message}`).join('; '));
  }
  if (type === 'control')
    return { ok: true, message: { kind: 'control', character: parsed.character as string } };
  if (type === 'player') return { ok: true, message: { kind: 'player' } };
  const { type: kind, ...fields } = parsed;
  // Drop the absent optional fields, so that the request has either a point or a target.
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  return { ok: true, message: { kind: 'action', request: { kind, ...clean } as ActionRequest } };
}

const playerSay = object({
  type: oneOf(['say']),
  text: str(),
  to: optional(str()),
});

export type ParsedPlayerMessage =
  | { readonly ok: true; readonly text: string; readonly to: string | undefined }
  | { readonly ok: false; readonly error: ControllerError };

/** A message of a client that speaks as the player: `{ "type": "say", "text", "to"? }`. */
export function parsePlayerMessage(text: string): ParsedPlayerMessage {
  const fail = (message: string): ParsedPlayerMessage => ({
    ok: false,
    error: { type: 'error', message },
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(`not valid JSON: ${text.slice(0, 80)}`);
  }
  const issues: Issue[] = [];
  const parsed = playerSay.parse(raw, [], issues);
  if (!parsed) {
    return fail(
      `a client of the player sends { "type": "say", "text": …, "to"?: … }: ${issues
        .map((i) => `${formatPath(i.path) || 'say'}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return { ok: true, text: parsed.text, to: parsed.to };
}
