import { blocksToMeters } from '../core/world/units';

export interface OverlayData {
  fps: number;
  camera: { x: number; y: number; z: number };
  speedMps: number;
  seed: number;
  world: string;
  structureCounts: Record<string, number>;
  warnings: number;
  meshedChunks: number;
  totalChunks: number;
  triangles: number;
  loadTimeMs: number;
  generationMs: number;
  meshingMs: number;
  /** Duration of the last hot reload, 0 if none (YAML-007.a). */
  reloadMs: number;
  lastChunkRebuildMs: number;
}

const REFRESH_MS = 250;

/** Diagnostic overlay toggled with F3 (DEBUG-001.a). */
export class DebugOverlay {
  private readonly element: HTMLElement;
  private lastRefresh = 0;

  constructor(parent: HTMLElement = document.body) {
    this.element = document.createElement('pre');
    this.element.id = 'debug-overlay';
    parent.append(this.element);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.element.hidden = !this.element.hidden;
      }
    });
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  update(now: number, data: () => OverlayData): void {
    if (this.element.hidden || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const d = data();
    const block = (v: number) => v.toFixed(1);
    const meters = (v: number) => blocksToMeters(v).toFixed(1);
    this.element.textContent = [
      `fps        ${d.fps.toFixed(0)}`,
      `position   ${block(d.camera.x)}, ${block(d.camera.y)}, ${block(d.camera.z)} blocks`,
      `           ${meters(d.camera.x)}, ${meters(d.camera.y)}, ${meters(d.camera.z)} m`,
      `speed      ${d.speedMps.toFixed(1)} m/s`,
      `world      ${d.world} · seed ${d.seed} · ${d.warnings} warning${d.warnings === 1 ? '' : 's'}`,
      `structures ${formatCounts(d.structureCounts)}`,
      `chunks     ${d.meshedChunks} meshed / ${d.totalChunks}`,
      `triangles  ${d.triangles.toLocaleString('en-US')}`,
      `load       ${(d.loadTimeMs / 1000).toFixed(2)} s (generation ${d.generationMs.toFixed(0)} ms, meshing ${d.meshingMs.toFixed(0)} ms)`,
      ...(d.reloadMs > 0
        ? [`reload     ${(d.reloadMs / 1000).toFixed(2)} s (last hot reload)`]
        : []),
      `rebuild    ${d.lastChunkRebuildMs.toFixed(1)} ms (last chunk)`,
      ``,
      `F3 hide · click to fly · WASD/arrows move · Space/Shift up/down · wheel speed`,
    ].join('\n');
  }
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? 'none' : entries.map(([name, n]) => `${name} ${n}`).join(', ');
}

/** Frames per second over a sliding window of about one second. */
export class FpsMeter {
  private frames: number[] = [];

  tick(now: number): number {
    this.frames.push(now);
    while (this.frames.length > 0 && now - this.frames[0]! > 1000) this.frames.shift();
    return this.frames.length;
  }
}
