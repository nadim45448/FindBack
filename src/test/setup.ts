/**
 * Vitest setup.
 *
 * Loads the local environment file so a test that touches the database can
 * find `DATABASE_URL`. Next.js loads `.env.local` itself; Vitest does not, so
 * it is done here with Node's built-in loader — no extra dependency.
 *
 * This mirrors `prisma.config.ts`, which loads the same files for the CLI.
 */

import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

// Tests wipe identity and listing tables. Point them at the isolated
// test database so `npm test` cannot delete local app users or reports.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
