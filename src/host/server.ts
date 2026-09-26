import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { HOST_SOCKET_PATH, type ViewMessage } from '../protocol/messages';
import type { CliOptions } from './args';
import { PROJECT_ROOT, viteBaseConfig, viteModuleLoader } from './moduleLoader';
import { HostSession } from './session';
import type { Terminal } from './terminal';
import type { WorldFolder } from './worldFolder';

/** Name of the global the host puts in the page, so the app knows it is connected (plan P10). */
export const HOST_CONFIG_GLOBAL = '__YW3D_HOST__';

export interface HostServer {
  readonly url: string;
  readonly session: HostSession;
  readonly vite: ViteDevServer;
  close(): Promise<void>;
}

/**
 * Starts the host: Vite in middleware mode serving the app and the author's files (plan F04 P1),
 * the WebSocket of the views (P5), and the simulation clock.
 */
export async function startHostServer(
  folder: WorldFolder,
  options: CliOptions,
  terminal: Terminal,
): Promise<HostServer> {
  const plugin: Plugin = {
    name: 'yw3d-host',
    transformIndexHtml: () => [
      {
        tag: 'script',
        children: `window.${HOST_CONFIG_GLOBAL} = ${JSON.stringify({ socket: HOST_SOCKET_PATH })};`,
        injectTo: 'head-prepend',
      },
    ],
    // Files of the world folder are reloaded by the host, not by Vite's own hot updates.
    handleHotUpdate: ({ file }) => (isInside(file, folder.root) ? [] : undefined),
  };

  const vite = await createServer({
    ...viteBaseConfig(),
    appType: 'spa',
    plugins: [plugin],
    server: {
      port: options.port,
      strictPort: true,
      host: options.lan ? '0.0.0.0' : 'localhost',
      fs: { allow: [PROJECT_ROOT, folder.root] },
    },
  });
  const session = new HostSession(folder, viteModuleLoader(vite), terminal, {
    seedOverride: options.seed,
    now: () => performance.now(),
  });
  await session.load();

  const sockets = new WebSocketServer({ noServer: true });
  vite.httpServer!.on('upgrade', (request, socket, head) => {
    if (request.url !== HOST_SOCKET_PATH) return;
    sockets.handleUpgrade(request, socket, head, (ws) => attach(ws, session));
  });

  // Simulation clock: the session keeps fixed steps whatever the timer precision (PHYS-002).
  let last = performance.now();
  const clock = setInterval(() => {
    const now = performance.now();
    session.advance((now - last) / 1000);
    last = now;
  }, 1000 / 120);

  await vite.listen();
  const url = `http://localhost:${options.port}/`;
  return {
    url,
    session,
    vite,
    async close() {
      clearInterval(clock);
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      await vite.close();
    },
  };
}

function attach(ws: WebSocket, session: HostSession): void {
  const view = session.connect((message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  });
  ws.on('message', (data) => {
    try {
      view.receive(JSON.parse(String(data)) as ViewMessage);
    } catch {
      // Malformed messages from a view are ignored: the host keeps running.
    }
  });
  ws.on('close', () => view.close());
}

function isInside(file: string, folder: string): boolean {
  const relative = path.relative(folder, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
