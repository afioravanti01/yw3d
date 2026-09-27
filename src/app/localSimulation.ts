import type { ComposeResult } from '../core/compose/composeWorld';
import type { Intent } from '../core/physics/entity';
import type { EntityState } from '../core/physics/entity';
import { FixedStepper } from '../core/physics/fixedStep';
import { Simulation, type SayResult, type SpokenLine } from '../core/sim/simulation';
import type { World } from '../core/world/world';
import type { CharacterSnapshot } from '../protocol/messages';
import type { PlayerSource, PlayerState } from './playerView';

type Position = { x: number; y: number; z: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The browser-only mode (APP-003.a) with the simulation the host runs (plan F06 P1): the
 * player, the characters and the dialogue. Without the host no program or controller runs, so
 * characters stand still (CHAR-001.d).
 */
export class LocalSimulation implements PlayerSource {
  lastStepMs = 0;
  readonly startYaw: number;
  private sim: Simulation;
  private readonly stepper = new FixedStepper();
  private previous: EntityState;
  private previousCharacters = new Map<string, EntityState>();
  /** The agents the characters declare, which only the host runs. */
  private agents: ReadonlyMap<string, NonNullable<CharacterSnapshot['agent']>>;
  /** The programs the characters declare, which only the host runs. */
  private programs: ReadonlyMap<string, string>;

  constructor(
    result: ComposeResult & { readonly world: World },
    private readonly now: () => number,
    private readonly heard: (line: SpokenLine) => void,
  ) {
    this.sim = new Simulation(result, { now, heard });
    this.programs = programsOf(result);
    this.agents = agentsOf(result);
    this.startYaw = this.sim.view.yaw;
    this.previous = this.sim.player.state;
  }

  /** The simulation now running, e.g. for the overlay. */
  get simulation(): Simulation {
    return this.sim;
  }

  advance(dt: number, intent: Intent, yaw: number, pitch: number): void {
    const steps = this.stepper.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.previous = this.sim.player.state;
      this.previousCharacters = new Map(this.sim.agents.views().map((v) => [v.id, v.state]));
      this.sim.intent = intent;
      this.sim.view = { yaw, pitch };
      this.sim.step();
      this.lastStepMs = this.sim.lastStepMs;
    }
  }

  /** Interpolation between the last two steps (plan F03 P6). */
  render(): Position {
    const t = this.stepper.alpha;
    const current = this.sim.player.state;
    return {
      x: lerp(this.previous.x, current.x, t),
      y: lerp(this.previous.y, current.y, t),
      z: lerp(this.previous.z, current.z, t),
    };
  }

  state(): PlayerState {
    return this.sim.player.state;
  }

  figureYaw(): undefined {
    return undefined;
  }

  /** The world is replaced by `recompose`, which knows the whole composition. */
  replaceWorld(): void {}

  /**
   * A new composition after a hot reload (YAML-007.a): the player keeps its place, the
   * characters start over.
   */
  recompose(result: ComposeResult & { readonly world: World }): void {
    const { x, y, z } = this.sim.player.state;
    const view = this.sim.view;
    // The hour goes on, unless the clock of the file changed (TIME-001.b).
    const before = this.sim;
    const sameClock =
      before.clockSettings.startMinutes === result.clock?.startMinutes &&
      before.clockSettings.dayMinutes === result.clock?.dayMinutes;
    this.sim = new Simulation(result, {
      now: this.now,
      heard: this.heard,
      playerAt: { x, y, z },
      ...(sameClock ? { clockAt: before.clock.minutes } : {}),
    });
    this.programs = programsOf(result);
    this.agents = agentsOf(result);
    this.sim.view = view;
    this.previous = this.sim.player.state;
    this.previousCharacters = new Map();
  }

  /** The characters as they are drawn now, between the last two steps. */
  characters(): CharacterSnapshot[] {
    const t = this.stepper.alpha;
    return this.sim.agents.views().map((c) => {
      const before = this.previousCharacters.get(c.id) ?? c.state;
      return {
        id: c.id,
        x: lerp(before.x, c.state.x, t),
        y: lerp(before.y, c.state.y, t),
        z: lerp(before.z, c.state.z, t),
        speed: Math.hypot(c.state.vx, c.state.vz),
        onGround: c.state.onGround,
        submerged: c.state.submerged,
        yaw: c.yaw,
        speech: c.speech,
        controlled: false,
        action: this.sim.agents.perceive(c.id).action?.kind ?? null,
        // Without the host no agent runs (D-012).
        agent: this.agents.get(c.id) ?? null,
        // Without the host no program runs (D-010).
        program: this.programs.has(c.id)
          ? { file: this.programs.get(c.id)!, state: 'stopped' as const }
          : null,
      };
    });
  }

  interact(): void {
    this.sim.interact();
  }

  /** A message of the player, to the character named by `@` if any (DIALOG-001, DIALOG-005). */
  say(text: string): SayResult {
    return this.sim.playerSays(text);
  }

  /** What the player is saying, for its speech bubble (DIALOG-001.d). */
  get playerSpeech(): string | null {
    return this.sim.playerSaying;
  }
}

function programsOf(result: ComposeResult): ReadonlyMap<string, string> {
  return new Map(result.characters.flatMap((c) => (c.program ? [[c.id, c.program] as const] : [])));
}

function agentsOf(
  result: ComposeResult,
): ReadonlyMap<string, NonNullable<CharacterSnapshot['agent']>> {
  return new Map(
    result.characters.flatMap((c) =>
      c.agent
        ? [
            [
              c.id,
              {
                mode: c.agent.mode,
                brain: c.agent.cli ?? c.agent.provider ?? 'fake',
                model: c.agent.model ?? null,
                state: 'stopped' as const,
                last_ms: null,
              },
            ] as const,
          ]
        : [],
    ),
  );
}
