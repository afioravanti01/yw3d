import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'test-results/', 'playwright-report/', 'e2e/screenshots/'] },
  js.configs.recommended,
  {
    // Controllers of characters are Node programs (F05): examples and test worlds.
    files: ['examples/**/*.{js,mjs}', 'e2e/host/controllers/**/*.{js,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  tseslint.configs.recommended,
  {
    // ARCH-001: the core is pure simulation code, independent of rendering and of the app shell.
    // The host (F04, plan P13), the public API and the protocol share the boundary of the core.
    files: ['src/core/**/*.ts', 'src/api/**/*.ts', 'src/protocol/**/*.ts', 'src/host/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message:
                'src/core, src/api, src/protocol and src/host must not depend on three (ARCH-001).',
            },
            {
              group: ['**/render/**', '**/app/**'],
              message:
                'src/core, src/api, src/protocol and src/host must not depend on render or app code (ARCH-001).',
            },
          ],
        },
      ],
    },
  },
);
