import type { EntityState, Intent } from '../core/physics/entity';

/** State exposed to the end-to-end tests (plan P12). */
export interface TestHook {
  /** True after the first frame, or once the errors of the first load are shown. */
  ready: boolean;
  status: 'loading' | 'ready' | 'error';
  /** Name of the world file (YAML-006). */
  world: string;
  seed: number;
  /** Warning about the URL parameters (APP-001.b). */
  warning: string | null;
  /** Messages of the diagnostics panel, errors and warnings. */
  messages: string[];
  structureCounts: Record<string, number>;
  /** Role of this view when connected to a host (HOST-002.d), null in browser-only mode. */
  connection: { role: 'driver' | 'spectator' } | null;
  /** State of the player shown by this view. */
  player(): { x: number; y: number; z: number; onGround: boolean } | null;
  /** Characters as shown by this view (CHAR-001.d). */
  characters(): { id: string; x: number; y: number; z: number; speech: string | null }[];
  loadTimeMs: number;
  frames: number;
  worldHash(): number;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  stats(): { meshedChunks: number; triangles: number; rebuiltChunks: number };
  /** Resolves after the next frame has been rendered. */
  nextFrame(): Promise<void>;
  /** Switches to the free camera and moves it to a fixed viewpoint, for screenshots. */
  setView(x: number, y: number, z: number, yaw: number, pitch: number): void;
  /** Steps a test entity of the player size with the given intents (PHYS-002.d). */
  simulate(start: { x: number; y: number; z: number }, intents: Intent[]): EntityState;
}

declare global {
  interface Window {
    __yw3d?: TestHook;
  }
}

/** Installs the hook only in development and test builds, never in production. */
export function installTestHook(hook: TestHook): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    window.__yw3d = hook;
  }
}
