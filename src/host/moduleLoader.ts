import { fileURLToPath } from 'node:url';
import { createServer, type InlineConfig, type ViteDevServer } from 'vite';

/** Loads a module of the author (a structure file) and returns its exports. */
export interface ModuleLoader {
  load(file: string): Promise<Record<string, unknown>>;
  /** Forgets every loaded module, so that the next `load` reads the files again. */
  invalidate(): void;
}

/** Root of the yw3d project: the app, the core and the public API live here. */
export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const API_ENTRY = fileURLToPath(new URL('../api/index.ts', import.meta.url));

/** Vite options shared by the host server and by the tests: project root and the `yw3d` alias. */
export function viteBaseConfig(): InlineConfig {
  return {
    configFile: false,
    root: PROJECT_ROOT,
    logLevel: 'silent',
    resolve: { alias: { yw3d: API_ENTRY } },
  };
}

/** Loader that compiles the author's files with Vite, like the browser does (plan F04 P2). */
export function viteModuleLoader(vite: ViteDevServer): ModuleLoader {
  return {
    load: (file) => vite.ssrLoadModule(file),
    invalidate: () => vite.moduleGraph.invalidateAll(),
  };
}

/** A Vite server without HTTP, only to load modules (tests, and hosts that do not serve). */
export async function createModuleServer(): Promise<ViteDevServer> {
  return createServer({
    ...viteBaseConfig(),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
}
