import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

/**
 * Load local environment files for the Prisma CLI.
 *
 * Next.js loads `.env.local` itself, but the Prisma CLI does not — it only
 * looks for `.env`. Loading here keeps one source of truth for local
 * development: `.env.local` is the file the app reads, and the CLI reads the
 * same one.
 *
 * Uses Node's built-in loader (Node >= 20.12), so this adds no dependency.
 */
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

/**
 * Prisma 7 configuration.
 *
 * Prisma 7 moved the datasource URL out of `schema.prisma` and into this file.
 * The CLI reads it for migrations and introspection; the runtime client takes
 * the URL through a driver adapter (see src/infrastructure/db).
 *
 * Local development uses the Docker PostgreSQL container (host port 5433).
 * See memory-bank/standards/construction-protocol.md, decision CP-2.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
