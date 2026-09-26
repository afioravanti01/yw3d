import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDefaultRegistry } from '../core/blocks/builtin';
import { composeWorld, type ComposeResult } from '../core/compose/composeWorld';
import { STEP_SECONDS } from '../core/physics/constants';
import { IDLE, type Intent } from '../core/physics/entity';
import { FixedStepper } from '../core/physics/fixedStep';
import { PhysicsWorld, type EntityHandle } from '../core/physics/physicsWorld';
import { PLAYER_SIZE, spawnAtStart } from '../core/player/player';
import { createDefaultStructures } from '../core/structures/builtin';
import type { StructureRegistry, StructureType } from '../core/structures/registry';
import type { World } from '../core/world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../core/yaml/report';
import {
  PROTOCOL_VERSION,
  type HostMessage,
  type PlayerSnapshot,
  type Role,
  type ViewMessage,
  type WorldMessage,
} from '../protocol/messages';
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
}

/** Intents older than this are dropped: a stalled view does not keep the player walking (P9). */
export const INTENT_TIMEOUT_SECONDS = 0.5;

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

  private physics: PhysicsWorld | undefined;
  private player: EntityHandle | undefined;
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
    return this.finish(diagnostics, world);
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
      `${PREFIX}  world ${this.display(this.folder.worldFile)} · seed ${result.seed}`,
    );
    this.terminal.line(
      `${PREFIX}  ${total} structures${counts.length > 0 ? ` (${counts.join(', ')})` : ''} · ${warnings} warning${warnings === 1 ? '' : 's'}`,
    );
    return true;
  }

  /**
   * A new world: the player keeps its place when there was one before (HOST-003.a), otherwise
   * it starts where the world file says (PLAYER-001.c).
   */
  private startSimulation(world: SessionWorld): void {
    const physics = new PhysicsWorld(world.result.world, createDefaultRegistry());
    if (this.player) {
      const { x, y, z } = this.player.state;
      this.player = physics.spawn(PLAYER_SIZE, x, y, z);
    } else {
      const spawned = spawnAtStart(physics, world.result.player);
      this.player = spawned.player;
      this.view = { yaw: spawned.yaw, pitch: 0 };
    }
    this.physics = physics;
  }

  /**
   * Advances the simulation by `seconds` of real time, in fixed steps (HOST-001.a). The player
   * follows the intents of the driving view, if recent, and otherwise stands still (HOST-001.b).
   */
  advance(seconds: number): void {
    if (!this.physics || !this.player) return;
    const steps = this.stepper.advance(seconds);
    for (let i = 0; i < steps; i++) {
      this.time += STEP_SECONDS;
      const fresh = this.lastIntent && this.time - this.lastIntent.at <= INTENT_TIMEOUT_SECONDS;
      this.player.intent = fresh ? this.lastIntent!.intent : IDLE;
      this.physics.step();
      this.steps++;
    }
    if (steps > 0) {
      this.broadcast({
        type: 'state',
        step: this.steps,
        player: this.snapshot()!,
        views: this.views.length,
      });
    }
  }

  /** State of the player, or undefined before the first valid world. */
  snapshot(): PlayerSnapshot | undefined {
    if (!this.player) return undefined;
    const { x, y, z, vx, vy, vz, onGround, submerged } = this.player.state;
    return { x, y, z, vx, vy, vz, onGround, submerged, ...this.view };
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
