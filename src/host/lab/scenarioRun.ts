import type { Perturbation, Scenario } from '../../core/yaml/scenarioFile';
import type { AgentRuntime } from '../agents/runtime';
import type { Outcome } from '../agents/reply';

/**
 * A scenario of the laboratory while it runs (LAB-002, plan F10 P1): it gives the task to the
 * agent, counts its steps and the simulated time, and ends with the first outcome.
 */

/** Failed requests in a row after which the scenario ends with an error (LAB-002.c). */
export const MAX_FAILURES = 3;

/** How a scenario ended (LAB-002.c). */
export type ScenarioResult = 'succeeded' | 'failed' | 'timeout' | 'steps' | 'error';

export interface ScenarioOutcome {
  readonly scenario: string;
  readonly agent: string;
  readonly result: ScenarioResult;
  /** The reason the agent gave, or the cause. */
  readonly reason: string;
  /** Simulated seconds from the start of the scenario. */
  readonly seconds: number;
  /** Requests to the LLM made for the task. */
  readonly steps: number;
}

/** The words of the console of the views for each result (the console speaks Italian). */
export const RESULT_WORDS: Record<ScenarioResult, string> = {
  succeeded: 'riuscito',
  failed: 'non riuscito',
  timeout: 'tempo scaduto',
  steps: 'passi esauriti',
  error: 'errore',
};

export interface ScenarioHooks {
  /** Simulated seconds of the world. */
  now(): number;
  /** A line in the terminal of the host. */
  log(line: string): void;
  /** A line in the console of the views. */
  notice(text: string): void;
  ended(outcome: ScenarioOutcome): void;
  /** Makes a perturbation happen (LAB-004.a): what happened, for the terminal and the trace. */
  perturb(scenario: Scenario, perturbation: Perturbation): string;
}

export class ScenarioRun {
  private steps = 0;
  private failures = 0;
  private readonly start: number;
  private outcomeNow: ScenarioOutcome | undefined;
  /** Perturbations still to happen, in order of time. */
  private readonly perturbations: Perturbation[];

  /**
   * Starts the scenario on the runtime of its agent; without a runtime (no consent, no CLI, no
   * key) it ends at once with an error.
   */
  constructor(
    readonly scenario: Scenario,
    private readonly agentName: string,
    private readonly runtime: AgentRuntime | undefined,
    private readonly hooks: ScenarioHooks,
  ) {
    this.start = hooks.now();
    this.perturbations = [...(scenario.perturbations ?? [])].sort((a, b) => a.at - b.at);
    hooks.log(`[${scenario.agent}] scenario ${scenario.id} started: ${scenario.task}`);
    hooks.notice(`Scenario «${scenario.name}» assegnato a ${agentName}: ${scenario.task}`);
    if (!runtime) {
      this.end('error', 'the agent is not running (no consent, or its CLI or key is missing)');
      return;
    }
    runtime.startTask(scenario.task, {
      asked: () => this.steps++,
      answered: (outcome) => this.answered(outcome),
      failed: (reason) => this.failed(reason),
    });
  }

  get outcome(): ScenarioOutcome | undefined {
    return this.outcomeNow;
  }

  get running(): boolean {
    return this.outcomeNow === undefined;
  }

  /** The world went on: perturbations that are due (LAB-004.a), then the time limit (LAB-002.c). */
  tick(): void {
    if (!this.running) return;
    const elapsed = this.hooks.now() - this.start;
    while (this.perturbations.length > 0 && this.perturbations[0]!.at <= elapsed) {
      const perturbation = this.perturbations.shift()!;
      const what = this.hooks.perturb(this.scenario, perturbation);
      this.hooks.log(
        `[${this.scenario.agent}] scenario ${this.scenario.id}: at ${Math.round(elapsed * 10) / 10} s, ${what}`,
      );
    }
    if (elapsed >= this.scenario.time_limit) {
      this.end('timeout', `${this.scenario.time_limit} s of simulated time are over`);
    }
  }

  /** The world is closing or reloading: the scenario stops without an outcome of its own. */
  interrupt(reason: string): void {
    if (this.running) this.end('error', reason);
  }

  private answered(outcome: Outcome | undefined): void {
    if (!this.running) return;
    this.failures = 0;
    if (outcome) {
      this.end(outcome.result, outcome.reason);
    } else if (this.steps >= this.scenario.max_steps) {
      this.end('steps', `the ${this.scenario.max_steps} steps are over`);
    }
  }

  private failed(reason: string): void {
    if (!this.running) return;
    if (++this.failures >= MAX_FAILURES) {
      this.end('error', `${MAX_FAILURES} failed requests in a row: ${reason}`);
    } else if (this.steps >= this.scenario.max_steps) {
      this.end('steps', `the ${this.scenario.max_steps} steps are over`);
    }
  }

  private end(result: ScenarioResult, reason: string): void {
    const seconds = Math.round((this.hooks.now() - this.start) * 10) / 10;
    const outcome: ScenarioOutcome = {
      scenario: this.scenario.id,
      agent: this.scenario.agent,
      result,
      reason,
      seconds,
      steps: this.steps,
    };
    this.outcomeNow = outcome;
    // Back to what the world file says (LAB-002.d); a declared outcome already ended the task.
    this.runtime?.endTask();
    const after = `after ${seconds} s and ${this.steps} step${this.steps === 1 ? '' : 's'}`;
    this.hooks.log(
      `[${this.scenario.agent}] scenario ${this.scenario.id}: ${result} ${after}${reason ? `: ${reason}` : ''}`,
    );
    this.hooks.notice(
      `Scenario «${this.scenario.name}» (${this.agentName}): ${RESULT_WORDS[result]} dopo ${seconds} s e ${this.steps} passi${reason ? ` — ${reason}` : ''}`,
    );
    this.hooks.ended(outcome);
  }
}
