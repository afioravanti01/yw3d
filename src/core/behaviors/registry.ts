import type { ActionRequest } from '../agents/agentWorld';

/**
 * The vocabulary of behaviors (BEHAV-004, plan F06 P3): instructions, events and conditions,
 * each with the fields it accepts and what it does. The built-in ones are registered like any
 * other: code outside the core can add more without changing it (P5, BEHAV-004.f).
 */

/**
 * What a field of the language accepts. Values are checked when the world file is loaded; a
 * library behavior can use its parameters as `$name` where a value of the same kind fits.
 */
export type FieldKind =
  | 'number'
  | 'text'
  /** Seconds, written as a number or as `30s`, `2min`. */
  | 'duration'
  | 'boolean'
  /** A place to go or look at: a declared id of the map, `[x, z]`, or a reference. */
  | 'target'
  /** Who moves: a character, the player, or a reference to one of them. */
  | 'entity'
  /** An area of the map: a place with an area, or a distribution. */
  | 'area'
  | 'flag'
  | 'counter'
  | 'state'
  /** A list of instructions, run in order (a branch). */
  | 'instructions'
  /** One condition or a list of them, all true together. */
  | 'conditions'
  /** What a question expects: `place`, `yes_no` or `{ one_of: [...] }` (BEHAV-005.b). */
  | 'expect'
  /** Branches by option of a question: `{ option: [instructions] }`. */
  | 'answers'
  /** What a sentence must name: `any`, or a declared id (BEHAV-004.a). */
  | 'mention';

export interface FieldSpec {
  readonly kind: FieldKind;
  /** A missing field without a default is an error, unless it is optional. */
  readonly optional?: boolean;
  readonly default?: unknown;
  readonly min?: number;
  readonly max?: number;
  /** For text: the longest accepted. */
  readonly maxLength?: number;
  /** A list of values of this kind is accepted too (A6.1 for `walk_to`). */
  readonly list?: boolean;
}

/** Where a reference points: the player, the answer to a question, who spoke, what they named. */
export type Reference = 'player' | 'answer' | 'heard.from' | 'heard.mentions';

/** A target after checking: a point, an id of the map, or a reference resolved when running. */
export type TargetValue =
  | { readonly kind: 'point'; readonly x: number; readonly z: number }
  | { readonly kind: 'id'; readonly id: string }
  | { readonly kind: 'ref'; readonly ref: Reference };

/** Fields of a definition, as values after checking (numbers, texts, targets, branches…). */
export type Args = Readonly<Record<string, unknown>>;

/** What a behavior can see and change while it runs (plan F06 P7). */
export interface BehaviorContext {
  /** The character running the behavior. */
  readonly self: string;
  /** Simulated seconds since the world started, and since the current state began. */
  readonly time: number;
  readonly timeInState: number;
  /** Where an entity is now: the player or a character. */
  position(id: string): { readonly x: number; readonly y: number; readonly z: number } | undefined;
  /** Whether an entity stands inside an area of the map. */
  inside(entity: string, area: string): boolean;
  flag(name: string): boolean;
  setFlag(name: string, on: boolean): void;
  counter(name: string): number;
  setCounter(name: string, value: number): void;
  /** A number in [0, 1) that depends only on the world seed, the character and the time. */
  random(): number;
  /** The entity or element a reference points to now, if any. */
  resolve(ref: Reference): string | undefined;
  /** Text with its references replaced by names (Q9): `{player}`, `{speaker}`, … */
  format(text: string): string;
}

/** An action for the body, without its id: the behavior gives one. */
export type BehaviorAction = ActionRequest extends infer R
  ? R extends { readonly id: string }
    ? Omit<R, 'id'>
    : never
  : never;

/** What running an instruction does. */
export type Step =
  /** An action of PROTO-001.b: the instruction ends with its outcome. */
  | { readonly kind: 'action'; readonly action: BehaviorAction }
  /** Done at once, e.g. a change of the memory. */
  | { readonly kind: 'done' }
  /** Go on with these instructions, then with the next one (a conditional). */
  | { readonly kind: 'branch'; readonly body: readonly Instruction[] }
  /** Change state (BEHAV-003.b). */
  | { readonly kind: 'goto'; readonly state: string }
  /** Ask the player and wait for the answer (BEHAV-005). */
  | { readonly kind: 'ask'; readonly question: Question };

export interface Question {
  readonly text: string;
  readonly expect:
    | { readonly kind: 'place' }
    | { readonly kind: 'yes_no' }
    | { readonly kind: 'one_of'; readonly options: readonly string[] };
  readonly timeout: number;
  /** Branches by answer: `then` for a place, `yes`/`no`, or one per option. */
  readonly answers: Readonly<Record<string, readonly Instruction[]>>;
  readonly notUnderstood: readonly Instruction[] | undefined;
  readonly noAnswer: readonly Instruction[] | undefined;
}

export interface InstructionDefinition {
  readonly name: string;
  /** The value of the key named after the instruction, e.g. the text of `say`. */
  readonly main: FieldSpec;
  /** Fields next to it, e.g. `speed` of `walk_to`. */
  readonly options?: Readonly<Record<string, FieldSpec>>;
  /** Whether it ends at once (memory, conditions, states): at most 100 per step (Q11). */
  readonly instant: boolean;
  /** Rules between fields, checked when loading: a message for an error, or undefined. */
  check?(args: Args): string | undefined;
  run(args: Args, context: BehaviorContext): Step;
}

export interface EventDefinition {
  readonly name: string;
  readonly main: FieldSpec;
  readonly options?: Readonly<Record<string, FieldSpec>>;
  /**
   * Events of the agent world arrive as signals (`interacted`, `heard`); the others are
   * checked at every step and fire when they become true (BEHAV-004.a).
   */
  readonly signal?: 'interacted' | 'heard';
  check?(args: Args, context: BehaviorContext): boolean;
}

export interface ConditionDefinition {
  readonly name: string;
  readonly main: FieldSpec;
  readonly options?: Readonly<Record<string, FieldSpec>>;
  test(args: Args, context: BehaviorContext): boolean;
}

/** Typed helpers to declare the vocabulary; register the result with a BehaviorRegistry. */
export const defineInstruction = (d: InstructionDefinition) => d;
export const defineEvent = (d: EventDefinition) => d;
export const defineCondition = (d: ConditionDefinition) => d;

/** A checked instruction, ready to run. */
export interface Instruction {
  readonly definition: InstructionDefinition;
  readonly args: Args;
  /** Instructions to run when its action fails (BEHAV-002.f). */
  readonly onFail: readonly Instruction[] | undefined;
  /** Where it was written, e.g. `valle/world.yaml:12`, for the terminal and the overlay. */
  readonly where: string;
}

export interface Condition {
  readonly definition: ConditionDefinition;
  readonly args: Args;
}

export interface Reaction {
  readonly event: { readonly definition: EventDefinition; readonly args: Args };
  readonly when: readonly Condition[];
  /** At most once in this many seconds, or only once (BEHAV-002.e). */
  readonly every: number | undefined;
  readonly once: boolean;
  readonly body: readonly Instruction[];
  readonly where: string;
}

export interface BehaviorState {
  readonly name: string;
  readonly routine: readonly Instruction[];
  /** False: the routine runs once, then the character stands still (BEHAV-002.a). */
  readonly repeat: boolean;
  readonly reactions: readonly Reaction[];
}

/** A behavior after checking: what the runner executes (BEHAV-001). */
export interface Program {
  readonly states: readonly BehaviorState[];
  readonly start: string;
  /** Reactions declared outside the states: valid in all of them, after the state's own. */
  readonly common: readonly Reaction[];
  readonly flags: readonly string[];
  readonly counters: readonly string[];
}

/** Registry of the vocabulary (BEHAV-004.f); names are unique within each kind. */
export class BehaviorRegistry {
  private readonly instructionMap = new Map<string, InstructionDefinition>();
  private readonly eventMap = new Map<string, EventDefinition>();
  private readonly conditionMap = new Map<string, ConditionDefinition>();

  registerInstruction(d: InstructionDefinition): void {
    add(this.instructionMap, d, 'instruction');
  }

  registerEvent(d: EventDefinition): void {
    add(this.eventMap, d, 'event');
  }

  registerCondition(d: ConditionDefinition): void {
    add(this.conditionMap, d, 'condition');
  }

  instruction(name: string): InstructionDefinition | undefined {
    return this.instructionMap.get(name);
  }

  event(name: string): EventDefinition | undefined {
    return this.eventMap.get(name);
  }

  condition(name: string): ConditionDefinition | undefined {
    return this.conditionMap.get(name);
  }

  names(kind: 'instruction' | 'event' | 'condition'): string[] {
    const map =
      kind === 'instruction'
        ? this.instructionMap
        : kind === 'event'
          ? this.eventMap
          : this.conditionMap;
    return [...map.keys()].sort();
  }
}

function add<D extends { readonly name: string }>(
  map: Map<string, D>,
  definition: D,
  kind: string,
): void {
  if (map.has(definition.name)) {
    throw new Error(`The behavior ${kind} "${definition.name}" is already registered`);
  }
  map.set(definition.name, definition);
}
