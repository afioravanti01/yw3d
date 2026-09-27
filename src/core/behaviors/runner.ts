import type { ActionRequest, AgentEvent, AgentWorld } from '../agents/agentWorld';
import { areaContains } from '../compose/areas';
import type { Goal, WorldMap } from '../map/worldMap';
import { fnv1a, hash3 } from '../math/rng';
import {
  understandChoice,
  understandElement,
  understandYesNo,
  type Nameable,
} from '../dialogue/understand';
import { allHold } from './builtin';
import type {
  BehaviorAction,
  BehaviorContext,
  BehaviorState,
  Instruction,
  Program,
  Question,
  Reaction,
  Reference,
  TargetValue,
} from './registry';

/**
 * Behaviors running (BEHAV-002 – BEHAV-004, plan F06 P6–P8). A behavior drives its character
 * like a controller inside the agent world: it asks for actions with ids of its own and gets
 * their outcome as events, in the same step, so that the result is deterministic (P2).
 */

/** Instructions that end at once, run by one behavior in one step at most (F06 Q11). */
export const INSTANT_LIMIT = 100;

/** What behaviors see of the world and how they act on it. */
export interface BehaviorWorld {
  /** Simulated seconds since the world started. */
  readonly time: number;
  /** Seed of the world, for the chance of behaviors (BEHAV-004.e). */
  readonly seed: number;
  position(id: string): { readonly x: number; readonly y: number; readonly z: number } | undefined;
  inside(entity: string, area: string): boolean;
  /** Name of an element of the map, for the texts (Q9). */
  nameOf(id: string): string | undefined;
  /** The elements of the map, to understand answers (DIALOG-003). */
  readonly elements: readonly Nameable[];
  request(characterId: string, request: ActionRequest): void;
  /** A line for the terminal of the host (BEHAV-002.f, BEHAV-002.g). */
  log(characterId: string, message: string): void;
}

/** A world for behaviors made of the agent world and the map of the composition. */
export function agentBehaviorWorld(
  agents: AgentWorld,
  map: WorldMap,
  goals: ReadonlyMap<string, Goal>,
  seed: number,
  log: (characterId: string, message: string) => void,
): BehaviorWorld {
  const names = new Map(map.entries.map((e) => [e.id, e.name]));
  return {
    get time() {
      return agents.time;
    },
    seed,
    position: (id) => agents.stateOf(id),
    inside: (entity, area) => {
      const at = agents.stateOf(entity);
      const goal = goals.get(area);
      return (
        !!at && goal?.kind === 'area' && areaContains(goal.area, Math.floor(at.x), Math.floor(at.z))
      );
    },
    nameOf: (id) => names.get(id),
    elements: map.entries.map((e) => ({ id: e.id, name: e.name })),
    request: (id, request) => agents.request(id, request),
    log,
  };
}

/** The behaviors of all the characters that have one. */
export class Behaviors {
  private readonly runners = new Map<string, Runner>();
  private steps = 0;

  constructor(programs: ReadonlyMap<string, Program>, world: BehaviorWorld) {
    for (const [id, program] of programs) this.runners.set(id, new Runner(id, program, world));
  }

  /** Whether a character is driven by a behavior. */
  has(characterId: string): boolean {
    return this.runners.has(characterId);
  }

  /** One step, before the physics: events, reactions, instructions (plan F06 P7). */
  step(): void {
    this.steps++;
    for (const runner of this.runners.values()) runner.step(this.steps);
  }

  /** An event of the agent world for a character. */
  event(characterId: string, event: AgentEvent): void {
    this.runners.get(characterId)?.event(event);
  }

  /** Whether a character is waiting for the answer to its question (BEHAV-005.a). */
  waiting(characterId: string): boolean {
    return this.runners.get(characterId)?.waiting() ?? false;
  }

  /**
   * A sentence of the player, heard by the characters within 16 blocks with their distance
   * (BEHAV-005.a, F06 Q7): it answers the question of the character it is said to, or, said
   * to nobody, of the nearest one that is waiting (the first by id at the same distance).
   * Returns who took it as an answer: that character does not hear it as a sentence
   * (BEHAV-005.d).
   */
  answer(
    text: string,
    to: string | null,
    hearers: readonly { readonly id: string; readonly distance: number }[],
  ): string | undefined {
    const waiting = hearers.filter((h) => this.waiting(h.id));
    const who =
      to !== null
        ? waiting.find((h) => h.id === to)
        : [...waiting].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
    if (!who) return undefined;
    this.runners.get(who.id)!.answer(text);
    return who.id;
  }

  /** A client drives the character: the behavior waits (PROTO-004.a, F06 Q2). */
  suspend(characterId: string): void {
    this.runners.get(characterId)?.suspend();
  }

  /** The client left: the behavior goes on from where it was (PROTO-004.b, F06 Q2). */
  resume(characterId: string): void {
    this.runners.get(characterId)?.resume();
  }

  /** State and running instruction, for the overlay (DEBUG-001.a). */
  activity(characterId: string): { state: string; instruction: string | null } | undefined {
    return this.runners.get(characterId)?.activity();
  }
}

/** What a reference and the names in the texts point to, in a branch or a reaction. */
interface Refs {
  readonly answer?: string;
  readonly speaker?: string;
  readonly mentions?: string;
}

/** Instructions to run in order: a routine, a reaction, or a branch inside them. */
interface Frame {
  readonly body: readonly Instruction[];
  index: number;
  readonly refs: Refs;
}

interface Running {
  readonly instruction: Instruction;
  /** The frame of the instruction, in its stack. */
  readonly frame: Frame;
  readonly stack: Frame[];
  /** Id of the action asked of the agent world. */
  readonly id: string;
  /**
   * `stop`: a `follow` that ran for its time (BEHAV-002.b); `ask`: a question, said and then
   * waiting for the answer until `until` (BEHAV-005.a).
   */
  readonly kind: 'action' | 'stop' | 'ask';
  readonly until: number | undefined;
  readonly question?: Question;
}

class Runner {
  private state: BehaviorState;
  private stateStart = 0;
  private started = false;
  private finished = false;
  private routine: Frame[] = [];
  private reaction: { readonly priority: number; readonly frames: Frame[] } | undefined;
  private running: Running | undefined;
  private suspended = false;
  private readonly flags = new Set<string>();
  private readonly counters = new Map<string, number>();
  /** Last value of the events checked at every step, to fire on the change (BEHAV-004.a). */
  private readonly edges = new Map<Reaction, boolean>();
  private readonly lastFired = new Map<Reaction, number>();
  private readonly spent = new Set<Reaction>();
  private budget = INSTANT_LIMIT;
  private warned = false;
  private advancing = false;
  private step_ = 0;
  private draws = 0;
  private nextId = 0;
  private readonly idHash: number;

  constructor(
    readonly id: string,
    private readonly program: Program,
    private readonly world: BehaviorWorld,
  ) {
    this.state = program.states.find((s) => s.name === program.start)!;
    this.idHash = fnv1a(Array.from(id, (c) => c.charCodeAt(0)));
  }

  step(step: number): void {
    this.step_ = step;
    this.draws = 0;
    this.budget = INSTANT_LIMIT;
    if (this.suspended) return;
    const running = this.running;
    if (running?.until !== undefined && this.world.time + 1e-9 >= running.until) {
      if (running.kind === 'ask') {
        // No answer in time (BEHAV-005.c).
        this.answered(running, 'no_answer', undefined);
      } else {
        // A `follow` that ran for its time stops, then the next instruction comes.
        this.running = { ...running, id: this.newId(), kind: 'stop', until: undefined };
        this.world.request(this.id, { kind: 'stop', id: this.running.id });
      }
    }
    this.checkEvents();
    this.advance();
  }

  event(event: AgentEvent): void {
    if (this.suspended) return;
    switch (event.type) {
      case 'action_done':
        return this.outcome(event.id, undefined);
      case 'action_failed':
        return this.outcome(event.id, event.reason);
      case 'action_replaced':
        return;
      case 'interacted':
        return this.signal('interacted', {});
      case 'heard':
        return this.heard(event);
    }
  }

  waiting(): boolean {
    return !this.suspended && this.running?.kind === 'ask';
  }

  /** The answer of the player to the question (BEHAV-005.b–c), understood with DIALOG-003. */
  answer(text: string): void {
    const running = this.running;
    if (running?.kind !== 'ask') return;
    const { expect } = running.question!;
    let key: string | undefined;
    let answer: string | undefined;
    if (expect.kind === 'place') {
      answer = understandElement(text, this.world.elements);
      key = answer === undefined ? undefined : 'then';
    } else if (expect.kind === 'yes_no') {
      key = understandYesNo(text);
      answer = key === 'yes' ? 'sì' : key;
    } else {
      key = understandChoice(text, expect.options);
      answer = key;
    }
    this.answered(running, key ?? 'not_understood', answer);
    if (!this.advancing) this.advance();
  }

  /** Goes on after a question: the branch of the answer, if any, else the next instruction. */
  private answered(running: Running, key: string, answer: string | undefined): void {
    const question = running.question!;
    this.running = undefined;
    running.frame.index++;
    const body =
      key === 'not_understood'
        ? question.notUnderstood
        : key === 'no_answer'
          ? question.noAnswer
          : question.answers[key];
    if (body) running.stack.push({ body, index: 0, refs: { ...running.frame.refs, answer } });
  }

  suspend(): void {
    this.suspended = true;
    this.running = undefined;
  }

  resume(): void {
    this.suspended = false;
    // Positions changed meanwhile: the events checked at every step start over.
    this.edges.clear();
    this.advance();
  }

  activity(): { state: string; instruction: string | null } {
    const r = this.running;
    return {
      state: this.state.name,
      instruction: r ? `${r.instruction.definition.name} (${r.instruction.where})` : null,
    };
  }

  /** Reactions by priority: the state's own, then the common ones (BEHAV-002.d, BEHAV-003.c). */
  private reactions(): readonly Reaction[] {
    return [...this.state.reactions, ...this.program.common];
  }

  private checkEvents(): void {
    this.reactions().forEach((reaction, priority) => {
      const { definition, args } = reaction.event;
      if (definition.signal || !definition.check) return;
      const now = definition.check(args, this.context({}));
      const before = this.edges.get(reaction);
      this.edges.set(reaction, now);
      // Entering and leaving fire on the change, not while it lasts (BEHAV-004.a).
      if (before === false && now) this.trigger(priority, reaction, {});
    });
  }

  private signal(
    kind: 'interacted' | 'heard',
    refs: Refs,
    accepts?: (r: Reaction) => boolean,
  ): void {
    this.reactions().some(
      (reaction, priority) =>
        reaction.event.definition.signal === kind &&
        (accepts?.(reaction) ?? true) &&
        this.trigger(priority, reaction, refs),
    );
    if (!this.advancing) this.advance();
  }

  private heard(event: Extract<AgentEvent, { type: 'heard' }>): void {
    const refs: Refs = { speaker: event.from, mentions: event.mentions ?? undefined };
    this.signal('heard', refs, (reaction) => {
      const args = reaction.event.args;
      const from = args.from as TargetValue | undefined;
      if (from?.kind === 'id' && from.id !== event.from) return false;
      if (args.to_me && event.to !== this.id) return false;
      if (args.mentions === 'any' && !event.mentions) return false;
      if (
        typeof args.mentions === 'string' &&
        args.mentions !== 'any' &&
        args.mentions !== event.mentions
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Starts a reaction when its limits and conditions allow and nothing more important runs
   * (BEHAV-002.c–e): the running action is interrupted; the interrupted reaction is dropped.
   */
  private trigger(priority: number, reaction: Reaction, refs: Refs): boolean {
    if (this.spent.has(reaction)) return false;
    const last = this.lastFired.get(reaction);
    if (
      reaction.every !== undefined &&
      last !== undefined &&
      this.world.time - last < reaction.every
    ) {
      return false;
    }
    if (this.reaction && this.reaction.priority <= priority) return false;
    if (!allHold(reaction.when, this.context(refs))) return false;
    if (reaction.once) this.spent.add(reaction);
    this.lastFired.set(reaction, this.world.time);
    this.interrupt();
    this.reaction = { priority, frames: [{ body: reaction.body, index: 0, refs }] };
    return true;
  }

  /** Stops what the character is doing; the interrupted instruction starts again later (Q3). */
  private interrupt(): void {
    if (this.running) this.world.request(this.id, { kind: 'stop', id: this.newId() });
    this.running = undefined;
  }

  /** A new state: its routine from the start (BEHAV-003.b). */
  private enter(name: string): void {
    this.interrupt();
    this.state = this.program.states.find((s) => s.name === name)!;
    this.stateStart = this.world.time;
    this.routine = [];
    this.reaction = undefined;
    this.started = false;
    this.finished = false;
    this.edges.clear();
  }

  /** Runs instructions until one takes time, or the budget of the step ends. */
  private advance(): void {
    if (this.advancing) return;
    this.advancing = true;
    try {
      this.run();
    } finally {
      this.advancing = false;
    }
  }

  private run(): void {
    for (;;) {
      if (this.running || this.suspended) return;
      const stack = this.reaction ? this.reaction.frames : this.routine;
      if (stack.length === 0) {
        if (this.reaction) {
          // The reaction is over: back to the routine, at the instruction it interrupted.
          this.reaction = undefined;
          continue;
        }
        if (this.finished || this.state.routine.length === 0) return;
        if (this.started && !this.state.repeat) {
          // A routine that runs once: then the character stands still (BEHAV-002.a).
          this.finished = true;
          return;
        }
        this.started = true;
        this.routine.push({ body: this.state.routine, index: 0, refs: {} });
        continue;
      }
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.body.length) {
        stack.pop();
        continue;
      }
      const instruction = frame.body[frame.index]!;
      if (instruction.definition.instant) {
        if (this.budget <= 0) {
          if (!this.warned) {
            this.warned = true;
            this.world.log(
              this.id,
              `more than ${INSTANT_LIMIT} instructions without actions in one step (${instruction.where}): a loop that never waits?`,
            );
          }
          return;
        }
        this.budget--;
      }
      const step = instruction.definition.run(instruction.args, this.context(frame.refs));
      switch (step.kind) {
        case 'done':
          frame.index++;
          break;
        case 'branch':
          frame.index++;
          stack.push({ body: step.body, index: 0, refs: frame.refs });
          break;
        case 'goto':
          this.enter(step.state);
          break;
        case 'action':
          this.start(instruction, frame, stack, step.action);
          break;
        case 'ask':
          this.ask(instruction, frame, stack, step.question);
          break;
      }
    }
  }

  private start(
    instruction: Instruction,
    frame: Frame,
    stack: Frame[],
    action: BehaviorAction,
  ): void {
    if ('target' in action && action.target === '') {
      return this.fail(
        instruction,
        frame,
        stack,
        'the reference points nowhere: nothing was answered or named',
      );
    }
    const id = this.newId();
    const seconds = instruction.args.for as number | undefined;
    this.running = {
      instruction,
      frame,
      stack,
      id,
      kind: 'action',
      until: seconds === undefined ? undefined : this.world.time + seconds,
    };
    this.world.request(this.id, { ...action, id } as ActionRequest);
  }

  /** Says the question; the character then stands still and waits (BEHAV-005.a). */
  private ask(instruction: Instruction, frame: Frame, stack: Frame[], question: Question): void {
    const id = this.newId();
    this.running = { instruction, frame, stack, id, kind: 'ask', until: undefined, question };
    this.world.request(this.id, { kind: 'say', id, text: question.text });
  }

  /** The outcome of an action of this behavior; others (interrupted ones) are ignored. */
  private outcome(id: string, failure: string | undefined): void {
    const running = this.running;
    if (!running || running.id !== id) return;
    if (running.kind === 'ask') {
      // The question is said: the waiting starts, up to its time limit (BEHAV-005.a).
      if (running.until === undefined) {
        this.running = { ...running, until: this.world.time + running.question!.timeout };
      }
      return;
    }
    this.running = undefined;
    if (failure === undefined || running.kind === 'stop') {
      running.frame.index++;
    } else {
      this.fail(running.instruction, running.frame, running.stack, failure);
    }
    if (!this.advancing) this.advance();
  }

  /** A failed instruction: its failure branch, if any, else the next one (BEHAV-002.f). */
  private fail(instruction: Instruction, frame: Frame, stack: Frame[], reason: string): void {
    this.world.log(
      this.id,
      `${instruction.where}: ${instruction.definition.name} failed: ${reason}`,
    );
    frame.index++;
    if (instruction.onFail) stack.push({ body: instruction.onFail, index: 0, refs: frame.refs });
  }

  private newId(): string {
    return `behavior-${++this.nextId}`;
  }

  private context(refs: Refs): BehaviorContext {
    const world = this.world;
    const resolve = (ref: Reference): string | undefined =>
      ref === 'player'
        ? 'player'
        : ref === 'answer'
          ? refs.answer
          : ref === 'heard.from'
            ? refs.speaker
            : refs.mentions;
    const name = (id: string | undefined) => (id === undefined ? '' : (world.nameOf(id) ?? id));
    return {
      self: this.id,
      time: world.time,
      timeInState: world.time - this.stateStart,
      position: (id) => world.position(id),
      inside: (entity, area) => world.inside(entity, area),
      flag: (n) => this.flags.has(n),
      setFlag: (n, on) => (on ? this.flags.add(n) : this.flags.delete(n)),
      counter: (n) => this.counters.get(n) ?? 0,
      setCounter: (n, v) => this.counters.set(n, v),
      // Seed of the world, character and step: the same draws in every run (BEHAV-004.e).
      random: () => hash3(this.idHash | 0, this.step_, this.draws++, world.seed) / 4294967296,
      resolve,
      format: (text) =>
        text
          .replace(/\{player\}/g, name('player'))
          .replace(/\{speaker\}/g, name(refs.speaker))
          .replace(/\{answer\}/g, name(refs.answer))
          .replace(/\{mentions\}/g, name(refs.mentions)),
    };
  }
}
