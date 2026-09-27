import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentListener, AgentWorld } from '../core/agents/agentWorld';
import { composeWorld, type ComposeResult } from '../core/compose/composeWorld';
import { STEP_SECONDS } from '../core/physics/constants';
import { IDLE, type Intent } from '../core/physics/entity';
import { FixedStepper } from '../core/physics/fixedStep';
import { Simulation, type SayResult, type SpokenLine } from '../core/sim/simulation';
import type { WorldMap } from '../core/map/worldMap';
import { createDefaultStructures } from '../core/structures/builtin';
import type { StructureRegistry, StructureType } from '../core/structures/registry';
import type { World } from '../core/world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../core/yaml/report';
import {
  PROTOCOL_VERSION,
  type CharacterSnapshot,
  type HostMessage,
  type PlayerSnapshot,
  type Role,
  type ViewMessage,
  type WorldMessage,
} from '../protocol/messages';
import { checkPrograms, type CommandConsent } from './consent';
import { startStdioController, type RunningController } from './controllers/stdio';
import { checkPython, defaultPython, programCommand, programEnv, type PythonCheck } from './python';
import { checkAgent, describeAgent } from './agents/config';
import type { Brain } from './agents/brain';
import { createBrain } from './agents/brains';
import { AgentRuntime, type AgentStatus, type Clock } from './agents/runtime';
import type { AgentDecl } from '../core/yaml/worldFile';
import type { ModuleLoader } from './moduleLoader';
import { PREFIX, printDiagnostics, type Terminal } from './terminal';
import { structureFiles, type WorldFolder } from './worldFolder';

/** A world composed by the host, with what the views need to compose the same one. */
export interface SessionWorld {
  readonly result: ComposeResult & { readonly world: World };
  /** Text of `world.yaml` as composed. */
  readonly text: string;
  /** Absolute paths of the author's structure files, in registration order. */
  readonly structureFiles: readonly string[];
  readonly hash: number;
}

export interface SessionOptions {
  /** Replaces the terrain seed of the file (`--seed`). */
  readonly seedOverride?: number;
  /** Clock for the timings, e.g. `performance.now`. */
  readonly now?: () => number;
  /** How paths are shown to the user; by default from the world folder, e.g. `valle/world.yaml`. */
  readonly display?: (file: string) => string;
  /** URL of a structure file for the views; Vite serves files by absolute path under `/@fs`. */
  readonly moduleUrl?: (file: string) => string;
  /** Whether the commands of the controllers may run: the user's consent (PROTO-005). */
  readonly consent?: CommandConsent;
  /** The Python interpreter of the programs (`--python`); `python3` by default (F07 Q2). */
  readonly python?: string;
  /** The environment of the agents (PATH of the CLIs, keys); the host's own by default. */
  readonly env?: NodeJS.ProcessEnv;
  /** Makes the brain of an agent; replaced in tests (plan F08 P2). */
  readonly brain?: (agent: AgentDecl) => Brain;
  /** Clock of the agents' requests; replaced in tests. */
  readonly agentClock?: Clock;
  /** Checks the interpreter; replaced in tests. */
  readonly checkPython?: (python: string) => PythonCheck;
  /** The sentences the player hears (DIALOG-004.a): the console of the host. */
  readonly heard?: (line: SpokenLine) => void;
}

/** The program of a character and whether it runs (DEBUG-001.a, plan F07 P15). */
export interface ProgramStatus {
  readonly file: string;
  state: 'running' | 'stopped' | 'error';
}

/** Intents older than this are dropped: a stalled view does not keep the player walking (P9). */
export const INTENT_TIMEOUT_SECONDS = 0.5;

/** A controller of a character: its events and perception, and the map after a reload. */
export interface ControllerSink extends AgentListener {
  worldChanged?(map: WorldMap): void;
  /**
   * A program of the world folder, which a client may take over (PROTO-004.a): it is paused
   * meanwhile and resumed when the client leaves.
   */
  readonly pausable?: boolean;
  pause?(): void;
  resume?(): void;
}

/** A view connected to the host: the host sends it messages, and gets its messages back. */
export interface ViewHandle {
  readonly id: number;
  readonly role: Role;
  receive(message: ViewMessage): void;
  close(): void;
}

interface View {
  readonly id: number;
  readonly send: (message: HostMessage) => void;
}

/**
 * The world of a folder, as seen by the host (HOST-001): loads the author's structures and
 * `world.yaml`, composes, and reports to the terminal. With errors it keeps the previous world
 * (none at start) and waits for a valid file (CLI-001.b, HOST-003.b).
 */
export class HostSession {
  world: SessionWorld | undefined;
  diagnostics: Diagnostic[] = [];
  /** Simulation steps since the host started. */
  steps = 0;
  private warnedAboutCode = false;

  /** Physics, player, characters and dialogue (plan F06 P1); undefined before the first world. */
  sim: Simulation | undefined;
  private controllers: RunningController[] = [];
  /** The agents declared by the world now running (AGENT-001). */
  private agentsToStart: { readonly id: string; readonly agent: AgentDecl }[] = [];
  /** Called when an agent starts, for the tests. */
  agentStarted: ((id: string, agent: AgentDecl) => void) | undefined;
  /** The agents now running, by character (AGENT-003–006). */
  private readonly runtimes = new Map<string, AgentRuntime>();
  /** State of the program of each character that has one (DEBUG-001.a, plan F07 P15). */
  private readonly programs = new Map<string, ProgramStatus>();
  private python: PythonCheck | undefined;
  /** Controllers attached to characters, kept across reloads (PROTO-004). */
  private readonly controllerSinks = new Map<string, ControllerSink>();
  /** Programs waiting while a client drives their character (PROTO-004). */
  private readonly pausedSinks = new Map<string, ControllerSink>();
  /** Who hears what the player hears besides the options: clients of the player (PROTO-007). */
  private readonly listeners = new Set<(line: SpokenLine) => void>();
  private readonly stepper = new FixedStepper();
  /** Simulated time, seconds: intents expire on this clock, so that tests are exact. */
  private time = 0;
  private view = { yaw: 0, pitch: 0 };
  private lastIntent: { intent: Intent; at: number } | undefined;
  private views: View[] = [];
  private nextViewId = 1;

  constructor(
    readonly folder: WorldFolder,
    private readonly loader: ModuleLoader,
    private readonly terminal: Terminal,
    private readonly options: SessionOptions = {},
  ) {}

  /** Path shown to the user for a file of the folder. */
  display(file: string): string {
    // `valle/world.yaml`: short and the same wherever the command is run from.
    return this.options.display?.(file) ?? path.relative(path.dirname(this.folder.root), file);
  }

  /** Loads and composes the folder. Returns true when a new world replaced the previous one. */
  async load(): Promise<boolean> {
    const diagnostics: Diagnostic[] = [];
    const files = structureFiles(this.folder);
    if (files.length > 0 && !this.warnedAboutCode) {
      this.warnedAboutCode = true;
      this.terminal.line(
        `${PREFIX}  running the code of this folder: ${files.map((f) => this.display(f)).join(', ')}`,
      );
    }
    const registry = await this.loadStructures(files, diagnostics);

    const file = this.display(this.folder.worldFile);
    let text: string;
    try {
      text = readFileSync(this.folder.worldFile, 'utf8');
    } catch (error) {
      diagnostics.push(
        diagnostic('error', file, null, '', `cannot read the file: ${(error as Error).message}`),
      );
      return this.finish(diagnostics, undefined);
    }
    const result = composeWorld(text, file, {
      registry,
      seedOverride: this.options.seedOverride,
      now: this.options.now,
      programExists: (relative) => {
        const full = path.join(this.folder.root, relative);
        return existsSync(full) && statSync(full).isFile();
      },
    });
    diagnostics.push(...result.diagnostics);
    const world =
      result.world && !hasErrors(diagnostics)
        ? {
            result: result as SessionWorld['result'],
            text,
            structureFiles: files,
            hash: result.world.hash(),
          }
        : undefined;
    const replaced = this.finish(diagnostics, world);
    if (replaced) await this.restartControllers(world!);
    return replaced;
  }

  private finish(diagnostics: Diagnostic[], world: SessionWorld | undefined): boolean {
    this.diagnostics = diagnostics;
    printDiagnostics(this.terminal, diagnostics);
    if (!world) {
      this.broadcast({ type: 'diagnostics', diagnostics });
      this.terminal.line(
        this.world
          ? `${PREFIX}  errors in the world: keeping the previous one until the files are fixed`
          : `${PREFIX}  waiting for a valid ${this.display(this.folder.worldFile)}`,
      );
      return false;
    }
    this.world = world;
    this.startSimulation(world);
    this.broadcast({
      type: 'world',
      world: this.worldMessage()!,
      diagnostics,
      player: this.snapshot()!,
    });
    const { result } = world;
    const counts = Object.entries(result.structureCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => `${name} ${n}`);
    const total = Object.values(result.structureCounts).reduce((a, b) => a + b, 0);
    const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
    this.terminal.line(
      `${PREFIX}  world ${result.name} (${this.display(this.folder.worldFile)}) · seed ${result.seed}`,
    );
    this.terminal.line(
      `${PREFIX}  ${total} structures${counts.length > 0 ? ` (${counts.join(', ')})` : ''} · ${warnings} warning${warnings === 1 ? '' : 's'}`,
    );
    return true;
  }

  /**
   * A new world: the player keeps its place when there was one before (HOST-003.a), otherwise
   * it starts where the world file says (PLAYER-001.c). Characters start over; controllers on
   * the WebSocket stay attached.
   */
  private startSimulation(world: SessionWorld): void {
    const previous = this.sim?.player.state;
    const sim = new Simulation(world.result, {
      playerAt: previous && { x: previous.x, y: previous.y, z: previous.z },
      heard: (line) => this.heard(line),
      now: this.options.now,
    });
    if (!previous) this.view = { ...sim.view };
    sim.view = { ...this.view };
    this.sim = sim;
    for (const [id, sink] of this.controllerSinks) {
      if (sim.agents.ids.includes(id)) sim.attach(id, sink);
      sink.worldChanged?.(world.result.map!);
    }
    for (const sink of this.pausedSinks.values()) sink.worldChanged?.(world.result.map!);
    if (world.result.characters.length > 0) {
      this.terminal.line(
        `${PREFIX}  characters: ${world.result.characters
          .map(
            (c) =>
              `${c.id} (${
                c.agent
                  ? describeAgent(c.agent)
                  : c.program
                    ? `program ${c.program}`
                    : (c.command ?? 'no controller')
              })`,
          )
          .join(', ')}`,
      );
    }
  }

  /** Characters and the player, for the controllers and the tests (F05). */
  get agents(): AgentWorld | undefined {
    return this.sim?.agents;
  }

  /** A message of the world: to the console and the views (DIALOG-002.a, DIALOG-004.a). */
  private heard(line: SpokenLine): void {
    this.options.heard?.(line);
    for (const listener of this.listeners) listener(line);
    this.broadcast({ type: 'line', line });
  }

  /** Hears every message of the world, until the returned function is called (PROTO-007). */
  listen(listener: (line: SpokenLine) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The player says a sentence (DIALOG-001.b–c), from a view, the console or a client. */
  playerSays(text: string, options: { to?: string | null } = {}): SayResult {
    if (!this.sim) return { ok: false, error: 'there is no world yet' };
    return this.sim.playerSays(text, options);
  }

  /**
   * Stops the controllers and programs of the previous world and starts the ones declared now,
   * when their commands may run (PROTO-003.b, PY-003.c: they restart at every reload).
   */
  private async restartControllers(world: SessionWorld): Promise<void> {
    for (const controller of this.controllers) controller.stop();
    this.controllers = [];
    this.programs.clear();
    const python = this.options.python ?? defaultPython();
    this.agentsToStart = [];
    const declared = world.result.characters.flatMap((c) => {
      if (c.agent) {
        this.agentsToStart.push({ id: c.id, agent: c.agent });
        // A fake agent runs no program and uses no network: nothing to allow (plan F08 P12).
        if (c.agent.mode === 'fake') return [];
        return [{ id: c.id, command: describeAgent(c.agent), program: false, agent: true }];
      }
      if (c.program) {
        this.programs.set(c.id, { file: c.program, state: 'stopped' });
        return [{ id: c.id, command: programCommand(python, c.program), program: true }];
      }
      return c.command ? [{ id: c.id, command: c.command, program: false }] : [];
    });
    const allowed =
      declared.length === 0 || (await (this.options.consent ?? (async () => false))(declared));
    // The world may have changed while the user was answering.
    if (this.world !== world) return;
    this.startAgents(allowed);
    if (!allowed || declared.every((c) => 'agent' in c)) return;
    const programs = declared.filter((c) => c.program);
    if (programs.length > 0) {
      this.python ??= (this.options.checkPython ?? checkPython)(python);
      if (!this.python.ok) {
        for (const c of programs) {
          this.terminal.line(`${PREFIX}  [${c.id}] cannot start the program: ${this.python.error}`);
        }
      }
    }
    const runnable = [
      ...(this.python?.ok ? programs : []),
      ...checkPrograms(
        declared.filter((c) => !c.program && !('agent' in c)),
        this.folder.root,
        this.terminal,
      ).map((c) => ({ ...c, program: false })),
    ];
    for (const c of runnable) {
      const status = this.programs.get(c.id);
      if (status) status.state = 'running';
      this.controllers.push(
        startStdioController(
          c.id,
          c.command,
          this.folder.root,
          this,
          this.terminal,
          // Simulated time: a controller is judged on the world's clock, not the wall clock.
          () => (this.agents?.time ?? 0) * 1000,
          c.program
            ? {
                program: true,
                env: programEnv(),
                ended: (end) => {
                  if (this.programs.get(c.id) === status) status!.state = end;
                },
              }
            : {},
        ),
      );
    }
  }

  /**
   * Starts the agents of the world (AGENT-001): the fake ones always, the others with the consent
   * and when their CLI or key is there.
   */
  private startAgents(allowed: boolean): void {
    for (const { id, agent } of this.agentsToStart) {
      if (agent.mode !== 'fake' && !allowed) continue;
      const check = checkAgent(agent, this.folder.root, this.options.env);
      if (!check.ok) {
        this.terminal.line(`${PREFIX}  [${id}] cannot start the agent: ${check.error}`);
        continue;
      }
      this.startAgent(id, agent);
      this.agentStarted?.(id, agent);
    }
  }

  /** An agent drives its character from the host, as an internal controller (plan F08 P1). */
  private startAgent(id: string, agent: AgentDecl): void {
    let brain: Brain;
    try {
      brain = this.options.brain ? this.options.brain(agent) : createBrain(agent, this.options.env);
    } catch (error) {
      this.terminal.line(`${PREFIX}  [${id}] cannot start the agent: ${(error as Error).message}`);
      return;
    }
    const character = this.world!.result.characters.find((c) => c.id === id)!;
    const runtime = new AgentRuntime(
      id,
      {
        id,
        name: character.name,
        description: character.description ?? null,
        persona: agent.persona,
        goals: agent.goals,
        answers: agent.answers,
      },
      agent,
      brain,
      {
        request: (request) => this.sim?.agents.request(id, request),
        map: () => this.world!.result.map!,
        isAgent: (other) => this.runtimes.has(other),
        isCharacter: (other) => this.sim?.agents.ids.includes(other) ?? false,
        log: (line) => this.terminal.line(`${PREFIX}  [${id}] ${line}`),
      },
      this.options.agentClock,
    );
    this.runtimes.set(id, runtime);
    this.attachController(id, runtime);
    this.terminal.line(`${PREFIX}  [${id}] agent started: ${describeAgent(agent)}`);
    this.controllers.push({
      characterId: id,
      stop: () => {
        runtime.stop();
        this.detachController(id, runtime);
        if (this.runtimes.get(id) === runtime) this.runtimes.delete(id);
      },
    });
  }

  /** The agent of a character and what it is doing, if it has one (DEBUG-001.a). */
  agentOf(characterId: string): AgentStatus | undefined {
    return this.runtimes.get(characterId)?.status;
  }

  /** The program of a character and its state, if it has one (DEBUG-001.a). */
  programOf(characterId: string): ProgramStatus | undefined {
    return this.programs.get(characterId);
  }

  /** Stops the controllers: the host is closing. */
  close(): void {
    for (const controller of this.controllers) controller.stop();
    this.controllers = [];
  }

  /** Routes the events and perception of a character to its controller (PROTO-003, PROTO-004). */
  attachController(characterId: string, sink: ControllerSink): void {
    const active = this.controllerSinks.get(characterId);
    if (active && sink.pausable && !active.pausable) {
      // A program starts (e.g. after a reload) while a client drives: it waits for its turn.
      this.pausedSinks.set(characterId, sink);
      sink.pause?.();
      return;
    }
    if (active?.pausable) {
      // A client takes a character from its program (PROTO-004.a).
      active.pause?.();
      this.pausedSinks.set(characterId, active);
      this.sim?.agents.release(characterId);
    }
    this.controllerSinks.set(characterId, sink);
    this.sim?.attach(characterId, sink);
  }

  /**
   * The controller of a character went away: it stops, or goes back to its program, which
   * resumes (PROTO-003.b, PROTO-004.b).
   */
  detachController(characterId: string, sink: ControllerSink): void {
    if (this.pausedSinks.get(characterId) === sink) {
      this.pausedSinks.delete(characterId);
      return;
    }
    if (this.controllerSinks.get(characterId) !== sink) return;
    this.controllerSinks.delete(characterId);
    this.sim?.detach(characterId, sink);
    const program = this.pausedSinks.get(characterId);
    if (program) {
      this.pausedSinks.delete(characterId);
      this.controllerSinks.set(characterId, program);
      this.sim?.attach(characterId, program);
      program.resume?.();
    }
  }

  /** Whether a client may drive a character: nobody drives it, or only its program (PROTO-004.a). */
  canTake(characterId: string): boolean {
    const active = this.controllerSinks.get(characterId);
    return !active || active.pausable === true;
  }

  /** Whether the program of a character waits while a client drives it. */
  hasPausedProgram(characterId: string): boolean {
    return this.pausedSinks.has(characterId);
  }

  /** Whether a character has a controller now. */
  isControlled(characterId: string): boolean {
    return this.controllerSinks.has(characterId);
  }

  /** Characters as views draw them (plan F05 P15). */
  characterSnapshots(): CharacterSnapshot[] {
    return (this.agents?.views() ?? []).map((c) => ({
      id: c.id,
      x: c.state.x,
      y: c.state.y,
      z: c.state.z,
      speed: Math.hypot(c.state.vx, c.state.vz),
      onGround: c.state.onGround,
      submerged: c.state.submerged,
      yaw: c.yaw,
      speech: c.speech,
      controlled: this.controllerSinks.has(c.id),
      action: this.agents?.perceive(c.id).action?.kind ?? null,
      program: this.programs.has(c.id) ? { ...this.programs.get(c.id)! } : null,
      agent: this.runtimes.get(c.id)?.status ?? null,
    }));
  }

  /**
   * Advances the simulation by `seconds` of real time, in fixed steps (HOST-001.a). The player
   * follows the intents of the driving view, if recent, and otherwise stands still (HOST-001.b).
   */
  advance(seconds: number): void {
    const sim = this.sim;
    if (!sim) return;
    const steps = this.stepper.advance(seconds);
    for (let i = 0; i < steps; i++) {
      this.time += STEP_SECONDS;
      const fresh = this.lastIntent && this.time - this.lastIntent.at <= INTENT_TIMEOUT_SECONDS;
      sim.intent = fresh ? this.lastIntent!.intent : IDLE;
      sim.view = { ...this.view };
      sim.step();
      this.steps++;
    }
    if (steps > 0) {
      this.broadcast({
        type: 'state',
        step: this.steps,
        player: this.snapshot()!,
        characters: this.characterSnapshots(),
        views: this.views.length,
      });
    }
  }

  /** State of the player, or undefined before the first valid world. */
  snapshot(): PlayerSnapshot | undefined {
    if (!this.sim) return undefined;
    const { x, y, z, vx, vy, vz, onGround, submerged } = this.sim.player.state;
    return {
      x,
      y,
      z,
      vx,
      vy,
      vz,
      onGround,
      submerged,
      ...this.view,
      speech: this.sim.playerSaying,
    };
  }

  /** What views need to compose the current world (plan F04 P7). */
  worldMessage(): WorldMessage | undefined {
    const world = this.world;
    if (!world) return undefined;
    const url =
      this.options.moduleUrl ?? ((file: string) => `/@fs${file.split(path.sep).join('/')}`);
    return {
      file: this.display(this.folder.worldFile),
      text: world.text,
      structures: world.structureFiles.map(url),
      seedOverride: this.options.seedOverride,
      hash: world.hash,
    };
  }

  /**
   * A new view: the first one drives the player, the others watch (F04 Q3). When the driver
   * leaves, the next view in order of arrival drives.
   */
  connect(send: (message: HostMessage) => void): ViewHandle {
    const view: View = { id: this.nextViewId++, send };
    this.views.push(view);
    const role = this.roleOf(view);
    this.terminal.line(`${PREFIX}  view ${view.id} connected (${role}) · ${this.viewCount()}`);
    send({
      type: 'hello',
      version: PROTOCOL_VERSION,
      role,
      world: this.worldMessage() ?? null,
      diagnostics: this.diagnostics,
      player: this.snapshot() ?? null,
      characters: this.characterSnapshots(),
      views: this.views.length,
    });
    const currentRole = () => this.roleOf(view);
    return {
      id: view.id,
      get role() {
        return currentRole();
      },
      receive: (message) => this.receive(view, message),
      close: () => this.disconnect(view),
    };
  }

  private roleOf(view: View): Role {
    return this.views[0] === view ? 'driver' : 'spectator';
  }

  private viewCount(): string {
    return `${this.views.length} view${this.views.length === 1 ? '' : 's'}`;
  }

  private receive(view: View, message: ViewMessage): void {
    if (message.type === 'ping') {
      view.send({ type: 'pong', id: message.id });
      return;
    }
    // Only the driver moves the player; spectators' intents are ignored.
    if (message.type === 'interact' && this.roleOf(view) === 'driver') {
      this.sim?.interact();
      return;
    }
    // Only the driver speaks as the player (DIALOG-001.a), to whom it looks at or `@id`.
    if (message.type === 'say' && this.roleOf(view) === 'driver') {
      const said = this.playerSays(message.text);
      if (!said.ok) view.send({ type: 'say_error', error: said.error });
      return;
    }
    if (message.type === 'intent' && this.roleOf(view) === 'driver') {
      this.lastIntent = { intent: message.intent, at: this.time };
      this.view = { yaw: message.yaw, pitch: message.pitch };
    }
  }

  private disconnect(view: View): void {
    const wasDriver = this.roleOf(view) === 'driver';
    this.views = this.views.filter((v) => v !== view);
    this.terminal.line(`${PREFIX}  view ${view.id} disconnected · ${this.viewCount()}`);
    if (wasDriver) {
      this.lastIntent = undefined;
      const next = this.views[0];
      if (next) {
        next.send({ type: 'role', role: 'driver' });
        this.terminal.line(`${PREFIX}  view ${next.id} now drives the player`);
      }
    }
  }

  private broadcast(message: HostMessage): void {
    for (const view of this.views) view.send(message);
  }

  /**
   * Built-in structures plus the author's ones (STRUCT-008.a). Each file exports by default a
   * structure or a list (plan F04 P4); a broken file is reported and skipped (STRUCT-008.b).
   */
  private async loadStructures(
    files: readonly string[],
    diagnostics: Diagnostic[],
  ): Promise<StructureRegistry> {
    const registry = createDefaultStructures();
    this.loader.invalidate();
    for (const file of files) {
      const shown = this.display(file);
      const fail = (message: string) =>
        diagnostics.push(diagnostic('error', shown, null, '', message));
      let exported: unknown;
      try {
        exported = (await this.loader.load(file)).default;
      } catch (error) {
        fail(`cannot load the structure file: ${firstLine(error)}`);
        continue;
      }
      const types = Array.isArray(exported) ? exported : [exported];
      if (exported === undefined || !types.every(isStructureType)) {
        fail(
          'the file must export by default a structure made with defineStructure, or a list of them',
        );
        continue;
      }
      for (const type of types) {
        try {
          registry.register(type);
        } catch (error) {
          fail(firstLine(error));
        }
      }
    }
    return registry;
  }
}

function isStructureType(value: unknown): value is StructureType {
  const t = value as Partial<StructureType> | null;
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof t.name === 'string' &&
    typeof t.generate === 'function' &&
    typeof t.footprint === 'function' &&
    typeof t.params?.parse === 'function' &&
    (t.terrain === 'sit' || t.terrain === 'flatten' || t.terrain === 'dig')
  );
}

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0]!;
}
