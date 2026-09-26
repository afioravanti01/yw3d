import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Port of the yw3d host started on the test world folder e2e/host (F04). */
export const HOST_PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // One WebGL page at a time: SwiftShader renders on the CPU.
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // Software WebGL (plan P12): same rendering path on every machine, no GPU needed.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    {
      // The app on its own (browser-only mode, APP-003.a).
      name: 'browser',
      testMatch: 'smoke.spec.ts',
      use: { baseURL: `http://localhost:${PORT}` },
    },
    {
      // The app served by the host (F04).
      name: 'host',
      testMatch: 'host.spec.ts',
      use: { baseURL: `http://localhost:${HOST_PORT}` },
    },
  ],
  webServer: [
    {
      // Production build in "test" mode, so that the test hook is installed.
      command: `npx vite build --mode test && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `node bin/yw3d.js e2e/host --no-open --port ${HOST_PORT} --allow-commands`,
      url: `http://localhost:${HOST_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
