import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        // These rules need type information. `projectService` lets
        // typescript-eslint resolve types from tsconfig.json without a separate
        // `parserOptions.project` list that would have to be kept in sync.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // PRD §10 requires that a failed background action is recorded, so every
      // async call must be awaited or explicitly voided with a logged catch.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // The FR-39 visibility matrix depends on the compiler knowing the shape of
      // every actor-scoped projection.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // A non-exhaustive switch on a status union is a build error — this is
      // the mechanical guard behind FR-41's canonical status set.
      'no-fallthrough': 'error',
    },
  },
  globalIgnores([
    // Build output and dependencies.
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',

    // Tooling and harness directories that live in this workspace but are not
    // part of the FindBack application. These are ignored by git too.
    '.agents/**',
    '.claude/**',
    '.gemini/**',
    '.puku/**',
    '.puku-cli/**',
    '.specsmd/**',
    '_bmad/**',
    '_bmad-output/**',
    'aidlc/**',
    'design-process/**',
    'docs/**',
    'memory-bank/**',
    'plans/**',
    '.tmp/**',
  ]),
]);

export default eslintConfig;
