import { MAX_SAY_LENGTH, type ActionRequest, type AgentEvent } from '../../core/agents/agentWorld';

/**
 * The reply of an LLM (AGENT-003, plan F08 P4): at most one sentence and up to five actions,
 * checked against the world. What is valid runs, the rest is set aside with a reason for the
 * terminal: a wrong reply never stops the agent.
 */

export const MAX_ACTIONS = 5;
export const ACTION_TYPES = ['walk_to', 'look_at', 'follow', 'wait', 'stop'] as const;

/**
 * JSON Schema of the reply, for the brains that can enforce it (plan F08 P5). Every field is
 * required and may be null, as the strict structured outputs of the APIs want.
 */
export const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'actions'],
  properties: {
    say: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['text', 'to'],
      properties: { text: { type: 'string' }, to: { type: ['string', 'null'] } },
    },
    actions: {
      type: 'array',
      maxItems: MAX_ACTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'target', 'x', 'z', 'distance', 'seconds'],
        properties: {
          type: { type: 'string', enum: [...ACTION_TYPES] },
          target: { type: ['string', 'null'] },
          x: { type: ['number', 'null'] },
          z: { type: ['number', 'null'] },
          distance: { type: ['number', 'null'] },
          seconds: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const;

/** One step of a reply, as the host runs it: a request without its id. */
export type Step =
  | { readonly kind: 'say'; readonly text: string; readonly to?: string }
  | { readonly kind: 'walk_to'; readonly target: string }
  | { readonly kind: 'walk_to'; readonly x: number; readonly z: number }
  | { readonly kind: 'look_at'; readonly target: string }
  | { readonly kind: 'look_at'; readonly x: number; readonly z: number }
  | { readonly kind: 'follow'; readonly target: string; readonly distance: number }
  | { readonly kind: 'wait'; readonly seconds: number }
  | { readonly kind: 'stop' };

export interface Reply {
  readonly steps: readonly Step[];
  /** What was set aside, and why (AGENT-003.b). */
  readonly discarded: readonly string[];
}

/**
 * The first JSON object of a text: the reply of brains that give text (opencode, some APIs),
 * also inside a code block or after a sentence.
 */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a reply against the ids the world knows (the map, the characters, `player`), turning
 * it into steps (plan F08 P4). `raw` is the parsed object, or the text to extract it from.
 */
export function readReply(raw: unknown, knownIds: ReadonlySet<string>): Reply {
  const value = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!isObject(value)) {
    return { steps: [], discarded: ['the reply is not a JSON object'] };
  }
  const steps: Step[] = [];
  const discarded: string[] = [];
  const say = value.say;
  if (isObject(say)) {
    const text = typeof say.text === 'string' ? say.text.trim() : '';
    const to = typeof say.to === 'string' && say.to !== '' ? say.to : undefined;
    if (text === '') discarded.push('say: no text');
    else if (to !== undefined && !knownIds.has(to))
      discarded.push(`say: unknown addressee "${to}"`);
    else steps.push({ kind: 'say', text: text.slice(0, MAX_SAY_LENGTH), ...(to ? { to } : {}) });
  } else if (say !== null && say !== undefined) {
    discarded.push('say: not an object');
  }
  const actions = Array.isArray(value.actions) ? value.actions : [];
  if (value.actions !== undefined && !Array.isArray(value.actions)) {
    discarded.push('actions: not a list');
  }
  actions.forEach((action, i) => {
    if (i >= MAX_ACTIONS) {
      discarded.push(`actions[${i}]: more than ${MAX_ACTIONS} actions`);
      return;
    }
    const step = readAction(action, knownIds);
    if (typeof step === 'string') discarded.push(`actions[${i}]: ${step}`);
    else steps.push(step);
  });
  return { steps, discarded };
}

/** One action of the reply, or why it is set aside. */
function readAction(action: unknown, knownIds: ReadonlySet<string>): Step | string {
  if (!isObject(action)) return 'not an object';
  const type = action.type;
  const target = typeof action.target === 'string' && action.target !== '' ? action.target : null;
  const point = isNumber(action.x) && isNumber(action.z) ? { x: action.x, z: action.z } : null;
  const where = (kind: 'walk_to' | 'look_at'): Step | string => {
    if (target !== null) {
      return knownIds.has(target)
        ? ({ kind, target } as Step)
        : `${kind}: unknown target "${target}"`;
    }
    return point ? ({ kind, ...point } as Step) : `${kind}: needs a target or x and z`;
  };
  switch (type) {
    case 'walk_to':
    case 'look_at':
      return where(type);
    case 'follow':
      if (target === null || !knownIds.has(target)) {
        return `follow: unknown target "${target ?? ''}"`;
      }
      return {
        kind: 'follow',
        target,
        distance: isNumber(action.distance) ? Math.min(32, Math.max(1, action.distance)) : 3,
      };
    case 'wait':
      return isNumber(action.seconds) && action.seconds >= 0
        ? { kind: 'wait', seconds: Math.min(action.seconds, 600) }
        : 'wait: needs seconds';
    case 'stop':
      return { kind: 'stop' };
    default:
      return `unknown action "${String(type)}"`;
  }
}

/**
 * Runs the steps of a reply one after the other with the actions of the characters (plan F08
 * P4): each one when the previous has ended. A failure ends the sequence; `cancel` stops it when
 * a new reply comes (AGENT-003.c).
 */
export class Sequence {
  private next = 0;
  private running: string | undefined;
  private done = false;

  constructor(
    private readonly steps: readonly Step[],
    private readonly request: (request: ActionRequest) => void,
    private readonly newId: () => string,
    /** The sequence ended: all done, a step failed, or cancelled. */
    private readonly ended: (outcome: { failed?: { step: Step; reason: string } }) => void,
  ) {}

  get finished(): boolean {
    return this.done;
  }

  start(): void {
    this.advance();
  }

  /** An event of the character: the outcome of the running step moves the sequence on. */
  event(event: AgentEvent): void {
    if (this.done || !('id' in event) || event.id !== this.running) return;
    if (event.type === 'action_done') {
      this.advance();
    } else if (event.type === 'action_failed') {
      this.finish({ failed: { step: this.steps[this.next - 1]!, reason: event.reason } });
    } else if (event.type === 'action_replaced') {
      this.finish({});
    }
  }

  cancel(): void {
    this.finish({});
  }

  private advance(): void {
    const step = this.steps[this.next++];
    if (!step) {
      this.finish({});
      return;
    }
    const id = this.newId();
    this.running = id;
    this.request({ ...step, id } as ActionRequest);
  }

  private finish(outcome: { failed?: { step: Step; reason: string } }): void {
    if (this.done) return;
    this.done = true;
    this.running = undefined;
    this.ended(outcome);
  }
}
