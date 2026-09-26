import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Public API for the authors of world folders: `import { defineStructure } from 'yw3d'`.
    alias: { yw3d: fileURLToPath(new URL('./src/api/index.ts', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
