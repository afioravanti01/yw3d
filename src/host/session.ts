import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composeWorld, type ComposeResult } from '../core/compose/composeWorld';
import { createDefaultStructures } from '../core/structures/builtin';
import type { StructureRegistry, StructureType } from '../core/structures/registry';
import type { World } from '../core/world/world';
import { diagnostic, hasErrors, type Diagnostic } from '../core/yaml/report';
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
  /** How paths are shown to the user; relative to the current directory by default. */
  readonly display?: (file: string) => string;
}

/**
 * The world of a folder, as seen by the host (HOST-001): loads the author's structures and
 * `world.yaml`, composes, and reports to the terminal. With errors it keeps the previous world
 * (none at start) and waits for a valid file (CLI-001.b, HOST-003.b).
 */
export class HostSession {
  world: SessionWorld | undefined;
  diagnostics: Diagnostic[] = [];
  private warnedAboutCode = false;

  constructor(
    readonly folder: WorldFolder,
    private readonly loader: ModuleLoader,
    private readonly terminal: Terminal,
    private readonly options: SessionOptions = {},
  ) {}

  /** Path shown to the user for a file of the folder. */
  display(file: string): string {
    return this.options.display?.(file) ?? (path.relative(process.cwd(), file) || file);
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
      this.terminal.line(
        this.world
          ? `${PREFIX}  errors in the world: keeping the previous one until the files are fixed`
          : `${PREFIX}  waiting for a valid ${this.display(this.folder.worldFile)}`,
      );
      return false;
    }
    this.world = world;
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
