import { MAX_CHARACTER_SPEED_MPS, MIN_CHARACTER_SPEED_MPS } from '../physics/constants';
import {
  BehaviorRegistry,
  defineCondition,
  defineEvent,
  defineInstruction,
  type Args,
  type BehaviorContext,
  type Condition,
  type FieldSpec,
  type Instruction,
  type Question,
  type TargetValue,
} from './registry';

/**
 * The predefined vocabulary of behaviors (plan F06, «Linguaggio dei comportamenti»):
 * instructions, events and conditions, registered like the ones code outside the core adds.
 */

/** Longest text of `say` and of a question, as in the protocol (PROTO-001.b). */
export const MAX_SAY_LENGTH = 500;
/** Time a question waits for the answer when it declares none (BEHAV-005.a). */
export const DEFAULT_ASK_TIMEOUT = 30;

const speed: FieldSpec = {
  kind: 'number',
  optional: true,
  min: MIN_CHARACTER_SPEED_MPS,
  max: MAX_CHARACTER_SPEED_MPS,
};

/** The target of an action as the agent world wants it: a point, or an id to go to. */
function targetOf(
  value: TargetValue,
  context: BehaviorContext,
): { x: number; z: number } | { target: string } | undefined {
  if (value.kind === 'point') return { x: value.x, z: value.z };
  if (value.kind === 'id') return { target: value.id };
  const id = context.resolve(value.ref);
  return id === undefined ? undefined : { target: id };
}

/** A target that points nowhere (e.g. an answer not given): the action fails with the cause. */
const nowhere = { target: '' } as const;

export const walkTo = defineInstruction({
  name: 'walk_to',
  main: { kind: 'target', list: true },
  options: { speed },
  instant: false,
  run: (args, context) => ({
    kind: 'action',
    action: {
      kind: 'walk_to',
      ...(targetOf(args.main as TargetValue, context) ?? nowhere),
      ...(args.speed === undefined ? {} : { speed: args.speed as number }),
    },
  }),
});

export const lookAt = defineInstruction({
  name: 'look_at',
  main: { kind: 'target' },
  instant: false,
  run: (args, context) => ({
    kind: 'action',
    action: { kind: 'look_at', ...(targetOf(args.main as TargetValue, context) ?? nowhere) },
  }),
});

export const say = defineInstruction({
  name: 'say',
  main: { kind: 'text', maxLength: MAX_SAY_LENGTH },
  instant: false,
  run: (args, context) => ({
    kind: 'action',
    action: { kind: 'say', text: context.format(args.main as string) },
  }),
});

export const follow = defineInstruction({
  name: 'follow',
  main: { kind: 'entity' },
  options: {
    distance: { kind: 'number', default: 3, min: 1, max: 32 },
    speed,
    /** In a behavior `follow` lasts a declared time (BEHAV-002.b). */
    for: { kind: 'duration', min: 0.1, max: 3600 },
  },
  instant: false,
  run: (args, context) => {
    const who = targetOf(args.main as TargetValue, context);
    return {
      kind: 'action',
      action: {
        kind: 'follow',
        target: who && 'target' in who ? who.target : '',
        distance: args.distance as number,
        ...(args.speed === undefined ? {} : { speed: args.speed as number }),
      },
    };
  },
});

export const wait = defineInstruction({
  name: 'wait',
  main: { kind: 'duration', min: 0, max: 3600 },
  instant: false,
  run: (args) => ({ kind: 'action', action: { kind: 'wait', seconds: args.main as number } }),
});

export const ask = defineInstruction({
  name: 'ask',
  main: { kind: 'text', maxLength: MAX_SAY_LENGTH },
  options: {
    expect: { kind: 'expect', default: { kind: 'place' } },
    timeout: { kind: 'duration', default: DEFAULT_ASK_TIMEOUT, min: 1, max: 3600 },
    then: { kind: 'instructions', optional: true },
    yes: { kind: 'instructions', optional: true },
    no: { kind: 'instructions', optional: true },
    answers: { kind: 'answers', optional: true },
    not_understood: { kind: 'instructions', optional: true },
    no_answer: { kind: 'instructions', optional: true },
  },
  instant: false,
  // Each kind of answer has its branches (BEHAV-005.c).
  check: (args) => {
    const expect = (args.expect as Question['expect']).kind;
    if (args.then && expect !== 'place') return '"then" is for questions that expect a place';
    if ((args.yes || args.no) && expect !== 'yes_no')
      return '"yes" and "no" are for questions that expect yes_no';
    if (args.answers && expect !== 'one_of') return '"answers" is for questions that expect one_of';
    if (expect === 'one_of' && args.answers) {
      const options = (args.expect as { options: readonly string[] }).options;
      const unknown = Object.keys(args.answers).filter((k) => !options.includes(k));
      if (unknown.length > 0)
        return `"answers" has "${unknown[0]}", which is not one of the options`;
    }
    return undefined;
  },
  run: (args, context) => ({ kind: 'ask', question: questionOf(args, context) }),
});

/** The question of an `ask`, with its text formatted now (Q9). */
function questionOf(args: Args, context: BehaviorContext): Question {
  const expect = args.expect as Question['expect'];
  const answers: Record<string, readonly Instruction[]> = {};
  if (expect.kind === 'place' && args.then) answers.then = args.then as Instruction[];
  if (expect.kind === 'yes_no') {
    if (args.yes) answers.yes = args.yes as Instruction[];
    if (args.no) answers.no = args.no as Instruction[];
  }
  if (expect.kind === 'one_of' && args.answers) {
    Object.assign(answers, args.answers as Record<string, Instruction[]>);
  }
  return {
    text: context.format(args.main as string),
    expect,
    timeout: args.timeout as number,
    answers,
    notUnderstood: args.not_understood as Instruction[] | undefined,
    noAnswer: args.no_answer as Instruction[] | undefined,
  };
}

export const set = defineInstruction({
  name: 'set',
  main: { kind: 'flag' },
  instant: true,
  run: (args, context) => {
    context.setFlag(args.main as string, true);
    return { kind: 'done' };
  },
});

export const unset = defineInstruction({
  name: 'unset',
  main: { kind: 'flag' },
  instant: true,
  run: (args, context) => {
    context.setFlag(args.main as string, false);
    return { kind: 'done' };
  },
});

export const count = defineInstruction({
  name: 'count',
  main: { kind: 'counter' },
  options: {
    add: { kind: 'number', optional: true },
    to: { kind: 'number', optional: true },
  },
  instant: true,
  run: (args, context) => {
    const name = args.main as string;
    const value =
      args.to !== undefined
        ? (args.to as number)
        : context.counter(name) + ((args.add as number | undefined) ?? 1);
    context.setCounter(name, value);
    return { kind: 'done' };
  },
});

export const ifInstruction = defineInstruction({
  name: 'if',
  main: { kind: 'conditions' },
  options: {
    then: { kind: 'instructions', optional: true },
    else: { kind: 'instructions', optional: true },
  },
  instant: true,
  run: (args, context) => {
    const holds = allHold(args.main as Condition[], context);
    const body = (holds ? args.then : args.else) as Instruction[] | undefined;
    return body ? { kind: 'branch', body } : { kind: 'done' };
  },
});

export const goto = defineInstruction({
  name: 'goto',
  main: { kind: 'state' },
  instant: true,
  run: (args) => ({ kind: 'goto', state: args.main as string }),
});

/** Whether all the conditions hold (BEHAV-004.c). */
export function allHold(conditions: readonly Condition[], context: BehaviorContext): boolean {
  return conditions.every((c) => c.definition.test(c.args, context));
}

// Events (BEHAV-004.a).

export const interacted = defineEvent({
  name: 'interacted',
  main: { kind: 'boolean', default: true },
  signal: 'interacted',
});

export const heard = defineEvent({
  name: 'heard',
  main: { kind: 'boolean', default: true },
  options: {
    /** Who spoke: the player or a character; anyone when absent. */
    from: { kind: 'entity', optional: true },
    /** Only sentences said to this character. */
    to_me: { kind: 'boolean', default: false },
    /** Only sentences that name an element of the map: `any`, or a given id. */
    mentions: { kind: 'mention', optional: true },
  },
  signal: 'heard',
});

const distance = (
  a: { x: number; y: number; z: number } | undefined,
  b: { x: number; y: number; z: number } | undefined,
) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);

function entityId(value: unknown, context: BehaviorContext): string | undefined {
  const t = value as TargetValue;
  if (t.kind === 'id') return t.id;
  if (t.kind === 'ref') return context.resolve(t.ref);
  return undefined;
}

const within: FieldSpec = { kind: 'number', min: 0.5, max: 256 };

export const near = defineEvent({
  name: 'near',
  main: { kind: 'entity' },
  options: { within },
  check: (args, context) =>
    distance(
      context.position(context.self),
      context.position(entityId(args.main, context) ?? ''),
    ) <= (args.within as number),
});

export const away = defineEvent({
  name: 'away',
  main: { kind: 'entity' },
  options: { within },
  check: (args, context) =>
    distance(context.position(context.self), context.position(entityId(args.main, context) ?? '')) >
    (args.within as number),
});

/** Who enters or leaves an area: the player unless said otherwise. */
const who: FieldSpec = { kind: 'entity', optional: true };
const whoOf = (args: Args, context: BehaviorContext) =>
  args.who === undefined ? 'player' : (entityId(args.who, context) ?? '');

export const enter = defineEvent({
  name: 'enter',
  main: { kind: 'area' },
  options: { who },
  check: (args, context) => context.inside(whoOf(args, context), args.main as string),
});

export const leave = defineEvent({
  name: 'leave',
  main: { kind: 'area' },
  options: { who },
  check: (args, context) => !context.inside(whoOf(args, context), args.main as string),
});

export const after = defineEvent({
  name: 'after',
  main: { kind: 'duration', min: 0, max: 86400 },
  check: (args, context) => context.timeInState >= (args.main as number),
});

// Conditions (BEHAV-004.c).

export const flagCondition = defineCondition({
  name: 'flag',
  main: { kind: 'flag' },
  test: (args, context) => context.flag(args.main as string),
});

export const notFlagCondition = defineCondition({
  name: 'not_flag',
  main: { kind: 'flag' },
  test: (args, context) => !context.flag(args.main as string),
});

export const counterCondition = defineCondition({
  name: 'counter',
  main: { kind: 'counter' },
  options: {
    equals: { kind: 'number', optional: true },
    below: { kind: 'number', optional: true },
    above: { kind: 'number', optional: true },
  },
  test: (args, context) => {
    const value = context.counter(args.main as string);
    return (
      (args.equals === undefined || value === args.equals) &&
      (args.below === undefined || value < (args.below as number)) &&
      (args.above === undefined || value > (args.above as number))
    );
  },
});

export const nearCondition = defineCondition({
  name: 'near',
  main: { kind: 'entity' },
  options: { within },
  test: (args, context) =>
    distance(
      context.position(context.self),
      context.position(entityId(args.main, context) ?? ''),
    ) <= (args.within as number),
});

export const insideCondition = defineCondition({
  name: 'inside',
  main: { kind: 'area' },
  /** Who must be inside: the character itself unless said otherwise. */
  options: { who: { kind: 'entity', optional: true } },
  test: (args, context) =>
    context.inside(
      args.who === undefined ? context.self : (entityId(args.who, context) ?? ''),
      args.main as string,
    ),
});

export const chance = defineCondition({
  name: 'chance',
  main: { kind: 'number', min: 0, max: 1 },
  test: (args, context) => context.random() < (args.main as number),
});

/** A registry with the predefined vocabulary. */
export function createDefaultBehaviors(): BehaviorRegistry {
  const registry = new BehaviorRegistry();
  for (const d of [
    walkTo,
    lookAt,
    say,
    follow,
    wait,
    ask,
    set,
    unset,
    count,
    ifInstruction,
    goto,
  ]) {
    registry.registerInstruction(d);
  }
  for (const d of [interacted, heard, near, away, enter, leave, after]) registry.registerEvent(d);
  for (const d of [
    flagCondition,
    notFlagCondition,
    counterCondition,
    nearCondition,
    insideCondition,
    chance,
  ]) {
    registry.registerCondition(d);
  }
  return registry;
}
