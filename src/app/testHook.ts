/** State exposed to the end-to-end tests (plan P12). */
export interface TestHook {
  ready: boolean;
  seed: number;
  warning: string | null;
  loadTimeMs: number;
  frames: number;
  worldHash(): number;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): boolean;
  stats(): { meshedChunks: number; triangles: number; rebuiltChunks: number };
  /** Resolves after the next frame has been rendered. */
  nextFrame(): Promise<void>;
  /** Moves the camera to a fixed viewpoint, for screenshots. */
  setView(x: number, y: number, z: number, yaw: number, pitch: number): void;
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
