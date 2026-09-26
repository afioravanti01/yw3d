import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'test-results/', 'playwright-report/', 'e2e/screenshots/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // ARCH-001: the core is pure simulation code, independent of rendering and of the app shell.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message: 'src/core must not depend on three (ARCH-001).',
            },
            {
              group: ['**/render/**', '**/app/**'],
              message: 'src/core must not depend on render or app code (ARCH-001).',
            },
          ],
        },
      ],
    },
  },
);
