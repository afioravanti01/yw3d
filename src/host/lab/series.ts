import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { AGENT_EFFORTS, type AgentDecl } from '../../core/yaml/worldFile';
import { describeAgent } from '../agents/config';
import type { CommandConsent, DeclaredCommand } from '../consent';
import type { ModuleLoader } from '../moduleLoader';
import { HostSession, type SessionOptions } from '../session';
import { PREFIX, type Terminal } from '../terminal';
import type { WorldFolder } from '../worldFolder';
import type { ScenarioOutcome } from './scenarioRun';
import { RUNS_DIR, runName } from './trace';

/**
 * A series of runs (LAB-007, plan F10 P10–P11): the scenarios of a world run again and again,
 * without views, for each brain to compare; every run starts from the world of the file with
 * empty memories, and writes its own trace.
 */

/** Runs of each condition when the command gives no number (LAB-007.a). */
export const DEFAULT_RUNS = 5;

const BRAINS = ['fake', 'claude', 'codex', 'opencode', 'anthropic', 'openai'] as const;
type BrainName = (typeof BRAINS)[number];

/** A brain to compare: how it is written, and how it replaces the brain of an agent. */
export interface BrainCondition {
  readonly label: string;
  apply(agent: AgentDecl): AgentDecl;
}

/**
 * Reads a brain of the command line: a name, then `model=` and `effort=` separated by commas,
 * e.g. `claude,model=sonnet,effort=low` or `openai,model=llama3.1:8b` (plan F10 P11).
 */
export function parseBrain(spec: string): BrainCondition | string {
  const [name, ...fields] = spec.split(',').map((part) => part.trim());
  if (!BRAINS.includes(name as BrainName)) {
    return `unknown brain "${name}": one of ${BRAINS.join(', ')}`;
  }
  let model: string | undefined;
  let effort: AgentDecl['effort'];
  for (const field of fields) {
    const [key, ...rest] = field.split('=');
    const value = rest.join('=');
    if (key === 'model' && value !== '') model = value;
    else if (key === 'effort' && (AGENT_EFFORTS as readonly string[]).includes(value)) {
      effort = value as AgentDecl['effort'];
    } else {
      return `"${field}" in the brain "${spec}": write model=<name> or effort=${AGENT_EFFORTS.join('|')}`;
    }
  }
  const brain = name as BrainName;
  if ((brain === 'anthropic' || brain === 'openai') && model === undefined) {
    return `the brain ${brain} needs a model: ${brain},model=<name>`;
  }
  if (brain === 'fake' && (model !== undefined || effort !== undefined)) {
    return 'the fake brain has no model and no effort';
  }
  return {
    label: [
      brain,
      ...(model ? [`model=${model}`] : []),
      ...(effort ? [`effort=${effort}`] : []),
    ].join(','),
    apply(agent) {
      // What says who the character is stays; what says which brain it uses is replaced.
      const { persona, goals, initiative, every, fallback, answers } = agent;
      const own = {
        initiative,
        every,
        answers,
        ...(persona !== undefined ? { persona } : {}),
        ...(goals !== undefined ? { goals } : {}),
        ...(fallback !== undefined ? { fallback } : {}),
      };
      const tuning = { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
      if (brain === 'fake') return { ...own, mode: 'fake' } as AgentDecl;
      if (brain === 'anthropic' || brain === 'openai') {
        // An address and a key variable of the file hold only for the same provider.
        const same = agent.provider === brain;
        return {
          ...own,
          ...tuning,
          mode: 'api',
          provider: brain,
          ...(same && agent.base_url ? { base_url: agent.base_url } : {}),
          ...(same && agent.api_key_env ? { api_key_env: agent.api_key_env } : {}),
        } as AgentDecl;
      }
      return { ...own, ...tuning, mode: 'headless', cli: brain } as AgentDecl;
    },
  };
}

/** A run of a series: its condition, its trace and how its scenarios ended. */
export interface RunRecord {
  readonly condition: string;
  /** 1 for the first run of the condition. */
  readonly index: number;
  readonly trace: string | undefined;
  readonly outcomes: readonly ScenarioOutcome[];
  /** Dollars reported by the brains during the run. */
  readonly spent: number;
}

export interface SeriesResult {
  /** The folder of the series, with a folder for each run. */
  readonly folder: string;
  readonly runs: readonly RunRecord[];
  readonly spent: number;
  /** Whether some reply had no cost: those do not count for the cap (LAB-007.c). */
  readonly unknownCost: boolean;
  /** Whether the spending cap stopped the series. */
  readonly capped: boolean;
}

export interface SeriesOptions {
  readonly folder: WorldFolder;
  readonly loader: ModuleLoader;
  readonly terminal: Terminal;
  readonly consent: CommandConsent;
  /** Runs of each condition. */
  readonly runs: number;
  /** The brains to compare; none: the ones of the world file. */
  readonly brains: readonly BrainCondition[];
  /** Dollars the whole series may spend. */
  readonly budget?: number;
  readonly python?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** The folder of the series; by default `runs/<date and time>` in the world folder. */
  readonly seriesFolder?: string;
  /**
   * Makes the world go on until the run ends: in real time by default (F10 Q5); the tests
   * go faster.
   */
  readonly drive?: (session: HostSession, over: () => boolean) => Promise<void>;
  /** Replaces the brains of the agents in the tests (plan F08 P2). */
  readonly brain?: SessionOptions['brain'];
}

/** The world goes on in real time, 60 times a second, until the run is over. */
export async function realTime(session: HostSession, over: () => boolean): Promise<void> {
  let last = performance.now();
  while (!over()) {
    await new Promise((resolve) => setTimeout(resolve, 1000 / 60));
    const now = performance.now();
    session.advance((now - last) / 1000);
    last = now;
  }
}

export async function runSeries(options: SeriesOptions): Promise<SeriesResult> {
  const { terminal } = options;
  const folder =
    options.seriesFolder ?? path.join(options.folder.root, RUNS_DIR, runName(new Date()));
  const conditions: (BrainCondition | undefined)[] =
    options.brains.length > 0 ? [...options.brains] : [undefined];
  const drive = options.drive ?? realTime;
  const runs: RunRecord[] = [];
  let spent = 0;
  let unknownCost = false;
  let capped = false;
  let answer: boolean | undefined;
  const total = conditions.length * options.runs;
  terminal.line(
    `${PREFIX}  series of ${total} run${total === 1 ? '' : 's'}: ${conditions.length} condition${
      conditions.length === 1 ? '' : 's'
    } × ${options.runs}${options.budget !== undefined ? ` · spending cap $${options.budget}` : ''}`,
  );

  for (const [c, condition] of conditions.entries()) {
    const label = condition?.label ?? 'world file';
    for (let index = 1; index <= options.runs && !capped; index++) {
      const outcomes: ScenarioOutcome[] = [];
      let runSpent = 0;
      let over = false;
      let trace: string | undefined;
      const consent: CommandConsent = async (declared) => {
        // Asked once for the whole series, with the brains of every condition (LAB-007.b).
        answer ??= await options.consent(allCommands(declared, session, conditions));
        return answer;
      };
      // The consent function above reads the world of this session, once it is loaded.
      const session: HostSession = new HostSession(
        options.folder,
        options.loader,
        quiet(terminal),
        {
          now: () => performance.now(),
          consent,
          ...(options.python ? { python: options.python } : {}),
          ...(options.env ? { env: options.env } : {}),
          ...(options.brain ? { brain: options.brain } : {}),
          ...(condition ? { agentOverride: (agent: AgentDecl) => condition.apply(agent) } : {}),
          traceFolder: () => path.join(folder, `${c + 1}-${safe(label)}-${index}`),
          scenarioEnded: (outcome) => outcomes.push(outcome),
          runEnded: (file) => {
            trace = file;
            over = true;
          },
          usage: (_, usage) => {
            if (usage.cost_usd === null) unknownCost = true;
            else {
              runSpent += usage.cost_usd;
              spent += usage.cost_usd;
            }
            if (options.budget !== undefined && spent >= options.budget && !capped) {
              capped = true;
              session.interruptScenarios(
                `the spending cap of the series ($${options.budget}) was reached`,
              );
            }
          },
        },
      );
      const loaded = await session.load();
      if (!loaded || session.world!.result.scenarios.length === 0) {
        session.close();
        throw new Error(
          loaded
            ? 'the world has no scenarios: add "scenarios" to world.yaml'
            : 'the world file has errors',
        );
      }
      await drive(session, () => over);
      session.close();
      runs.push({ condition: label, index, trace, outcomes, spent: runSpent });
      terminal.line(
        `${PREFIX}  run ${runs.length}/${total} · ${label} · ${outcomes
          .map((o) => `${o.scenario}: ${o.result} (${o.seconds} s, ${o.steps} steps)`)
          .join(', ')} · spent so far $${spent.toFixed(4)}${unknownCost ? ' + unknown' : ''}`,
      );
    }
  }
  if (capped) terminal.line(`${PREFIX}  the spending cap stopped the series`);
  return { folder, runs, spent, unknownCost, capped };
}

/** The commands of the first run, plus the brains of the other conditions for its agents. */
function allCommands(
  declared: readonly DeclaredCommand[],
  session: HostSession,
  conditions: readonly (BrainCondition | undefined)[],
): DeclaredCommand[] {
  const result = session.world!.result;
  const subjects = new Set(result.scenarios.map((s) => s.agent));
  const commands = [...declared];
  const seen = new Set(declared.map((d) => `${d.id} ${d.command}`));
  for (const condition of conditions) {
    if (!condition) continue;
    for (const c of result.characters) {
      if (!c.agent || !subjects.has(c.id)) continue;
      const agent = condition.apply(c.agent);
      if (agent.mode === 'fake') continue;
      const command = describeAgent(agent);
      if (seen.has(`${c.id} ${command}`)) continue;
      seen.add(`${c.id} ${command}`);
      commands.push({ id: c.id, command });
    }
  }
  return commands;
}

/** A label fit for a folder name. */
function safe(label: string): string {
  return label.replace(/[^a-zA-Z0-9.=_-]+/g, '_');
}

/**
 * The terminal of the runs of a series: the lines of the scenarios and the errors, not the
 * details of every world loaded again.
 */
function quiet(terminal: Terminal): Terminal {
  const keep = /scenario |failed|cannot|error|not allowed|allowed|run them|commands/i;
  return { line: (text) => (keep.test(text) ? terminal.line(text) : undefined) };
}
