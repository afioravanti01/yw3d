import { HEARING_DISTANCE } from '../../core/agents/agentWorld';
import { LONG_SAY_LENGTH } from './reply';
import type { MapEntry, MapShape, WorldMap } from '../../core/map/worldMap';

/**
 * What an agent knows when it asks its LLM (AGENT-002, plan F08 P3): fixed instructions, then
 * the state of the world in JSON: who it is, where it is, the map with coordinates, what is
 * around it, the time, its memory, and what just happened.
 */

/** Surroundings: what is within this distance, in blocks (16 m, Q2). */
export const SURROUNDINGS_RADIUS = 32;

export interface AgentIdentity {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly persona?: string;
  readonly goals?: readonly string[];
  /** Short answers for the bubble, or long ones for the console (A8.1). */
  readonly answers?: 'short' | 'long';
}

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An entity the character perceives now (PROTO-002.a). */
export interface SeenEntity extends Point {
  readonly id: string;
  readonly name?: string;
  readonly kind: 'player' | 'character';
  readonly distance: number;
}

/** Something that made the agent ask its LLM (AGENT-004). */
export type AgentTrigger =
  | {
      readonly kind: 'message';
      readonly from: string;
      readonly fromName: string;
      readonly to: string | null;
      readonly text: string;
    }
  | { readonly kind: 'near'; readonly who: string; readonly whoName: string }
  | { readonly kind: 'interact' }
  | { readonly kind: 'autonomous' }
  | { readonly kind: 'continue'; readonly done: string; readonly failed?: string };

export interface ContextInput {
  readonly identity: AgentIdentity;
  readonly map: WorldMap;
  readonly self: Point;
  readonly nearby: readonly SeenEntity[];
  /** Seconds of the world. */
  readonly time: number;
  /** Recent events, oldest first, already written as lines (AGENT-005). */
  readonly memory: readonly string[];
  readonly triggers: readonly AgentTrigger[];
}

const round = (v: number) => Math.round(v * 10) / 10;

const SECTORS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

/** Where a point is seen from another one: north is −z, east is +x. */
export function direction(from: Point, to: { x: number; z: number }): string {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 1) return 'here';
  const angle = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return SECTORS[Math.round(((angle + 360) % 360) / 45) % 8]!;
}

/** The nearest point of a shape to a point, in blocks: 0 when inside. */
function distanceTo(shape: MapShape, p: Point): number {
  switch (shape.kind) {
    case 'point':
      return Math.hypot(shape.x - p.x, shape.z - p.z);
    case 'circle': {
      const d = Math.hypot(shape.center[0] + 0.5 - p.x, shape.center[1] + 0.5 - p.z);
      return Math.max(0, d - shape.radius);
    }
    case 'rect': {
      const dx = Math.max(shape.from[0] - p.x, 0, p.x - shape.to[0]);
      const dz = Math.max(shape.from[1] - p.z, 0, p.z - shape.to[1]);
      return Math.hypot(dx, dz);
    }
  }
}

/** The middle of a shape, x and z. */
function centerOf(shape: MapShape): { x: number; z: number } {
  switch (shape.kind) {
    case 'point':
      return { x: shape.x, z: shape.z };
    case 'circle':
      return { x: shape.center[0] + 0.5, z: shape.center[1] + 0.5 };
    case 'rect':
      return { x: (shape.from[0] + shape.to[0]) / 2, z: (shape.from[1] + shape.to[1]) / 2 };
  }
}

/** The elements whose area contains the point, or that are within 2 blocks of it. */
export function whereIs(map: WorldMap, p: Point): MapEntry[] {
  return map.entries.filter(
    (e) => e.kind !== 'character' && e.kind !== 'player' && distanceTo(e.shape, p) <= 2,
  );
}

export interface Surrounding {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly type?: string;
  readonly distance: number;
  readonly direction: string;
}

/**
 * What is around the character within SURROUNDINGS_RADIUS (AGENT-002.b): the elements of the map
 * by their nearest point, and the characters and the player where they are now; nearest first.
 */
export function surroundings(
  map: WorldMap,
  self: Point,
  nearby: readonly SeenEntity[],
): Surrounding[] {
  const found: Surrounding[] = [];
  for (const e of map.entries) {
    if (e.kind === 'character' || e.kind === 'player') continue;
    const distance = distanceTo(e.shape, self);
    if (distance > SURROUNDINGS_RADIUS) continue;
    found.push({
      id: e.id,
      name: e.name,
      kind: e.kind,
      ...(e.type ? { type: e.type } : {}),
      distance: round(distance),
      direction: distance === 0 ? 'here' : direction(self, centerOf(e.shape)),
    });
  }
  for (const n of nearby) {
    if (n.distance > SURROUNDINGS_RADIUS) continue;
    found.push({
      id: n.id,
      name: n.name ?? n.id,
      kind: n.kind,
      distance: round(n.distance),
      direction: direction(self, n),
    });
  }
  return found.sort((a, b) => a.distance - b.distance);
}

/** An element of the map in the context: where it is, as a point or an area. */
function entryOf(e: MapEntry) {
  const c = centerOf(e.shape);
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    ...(e.type ? { type: e.type } : {}),
    ...(e.description ? { description: e.description } : {}),
    at: [round(c.x), round(c.z)],
    ...(e.shape.kind === 'rect'
      ? { area: { from: e.shape.from, to: e.shape.to } }
      : e.shape.kind === 'circle'
        ? { area: { center: e.shape.center, radius: e.shape.radius } }
        : {}),
  };
}

function describeTrigger(t: AgentTrigger): string {
  switch (t.kind) {
    case 'message':
      return `${t.fromName} (${t.from}) says${t.to ? ` to ${t.to}` : ' aloud'}: ${t.text}`;
    case 'near':
      return `${t.whoName} (${t.who}) came near you.`;
    case 'interact':
      return 'The player turned to you (pressed E near you).';
    case 'autonomous':
      return 'Nothing in particular: decide what to do now, following your goals.';
    case 'continue':
      return t.failed
        ? `Your last actions stopped: ${t.failed}. Decide the next step.`
        : `You finished your last actions (${t.done}). Decide the next step, if any.`;
  }
}

/** The fixed instructions of every request (plan F08 P3). */
function instructions(identity: AgentIdentity): string {
  return [
    `You are ${identity.name}, a character of yw3d, a world of blocks.`,
    identity.description ?? '',
    identity.persona ?? '',
    identity.goals?.length ? `Your goals: ${identity.goals.join('; ')}.` : '',
    'Stay in character. Answer in the language of whoever speaks to you.',
    'The player can ask you to do things: do them, unless they are impossible in this world. Your character colors how you speak, never whether you help: grumble if it fits you, but go. "Vai da Anselmo", "portami al laghetto", "seguimi" are requests to you.',
    'When someone speaks to you, answer them: say.to = their id.',
    'Plans in steps: set "continue": true when your actions are one step of a longer plan and you must decide again once they are done (you will be asked); set it to false when you are done.',
    'Errands: when the player asks you to ask someone something, first reply with walk_to that character and "continue": true; once there, say the question to them (say.to = their id); their answer will reach you as a new message; then walk_to "player" with "continue": true, and once there tell the player what they said. Your memory tells you which errand you are on.',
    'First use what the world state below says: places, characters, where things are. When asked what you see, or where something is, name the places and the characters of your surroundings with their names, their direction and roughly their distance in meters. When a question is not about this world, answer with your own knowledge, as your character would.',
    `Coordinates are in blocks (1 block = 0.5 m): x grows to the east, z grows to the south. You can speak to someone only within ${HEARING_DISTANCE} blocks.`,
    'You act only through your reply: at most one sentence to say, and up to 5 actions done in order: walk_to (target: an id of the map, or x and z), look_at (target, or x and z), follow (target: a character or "player"; distance in blocks), wait (seconds), stop.',
    'Reply with one JSON object only, no other text: {"say": {"text": "…", "to": "an id, or null for aloud"} or null, "actions": [{"type": "walk_to", "target": "laghetto1"}, …], "continue": false}. ' +
      (identity.answers === 'long'
        ? `When a question asks for it, answer fully and precisely, up to about 300 words (at most ${LONG_SAY_LENGTH} characters); otherwise keep it short. Markdown is allowed.`
        : 'Keep what you say short: one to three sentences; Markdown is allowed.'),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** The whole text sent to the LLM (AGENT-002.a). */
export function buildContext(input: ContextInput): string {
  const { identity, map, self } = input;
  const state = {
    you: {
      id: identity.id,
      name: identity.name,
      at: [round(self.x), round(self.z)],
      in: whereIs(map, self).map((e) => e.id),
    },
    time_seconds: Math.round(input.time),
    surroundings: surroundings(map, self, input.nearby),
    world: {
      name: map.name,
      ...(map.description ? { description: map.description } : {}),
      size: [map.size[0], map.size[2]],
      elements: map.entries.filter((e) => e.kind !== 'player').map(entryOf),
    },
    memory: input.memory,
  };
  return [
    instructions(identity),
    '',
    'WORLD STATE (JSON):',
    JSON.stringify(state),
    '',
    'WHAT JUST HAPPENED:',
    ...input.triggers.map((t) => `- ${describeTrigger(t)}`),
  ].join('\n');
}
