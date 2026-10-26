import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Loads `.env.local` so a test that touches the database finds
    // `DATABASE_URL` — Next.js does this for the app, Vitest does not.
    setupFiles: ['./src/test/setup.ts'],
    // The database-backed suites share one PostgreSQL instance, and each
    // clears the same tables. Running them in parallel would have one suite
    // delete another's rows mid-test, so the test files run in sequence.
    // The individual tests inside a file still run concurrently.
    fileParallelism: false,
    // Domain tests need no DOM; component tests opt in per-file with a
    // `@vitest-environment jsdom` docblock.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/app/**',
        'src/**/*.d.ts',
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.stories.tsx',
      ],
      // PRD requirement matrix, not raw coverage, is the goal. This floor is the
      // coding-standards minimum.
      thresholds: {
        lines: 80,
      },
    },
  },
});
