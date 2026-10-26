/**
 * The Prisma client.
 *
 * Prisma 7 takes its connection through a driver adapter, and the pooled
 * connection string is mandatory: Vercel Functions cap file descriptors at
 * 1,024 shared across concurrent executions, so a direct connection would
 * exhaust them under concurrency (`data-stack.md` § Connection handling).
 *
 * The client is created once per process. In development Next.js reloads
 * modules on every change, so the instance is cached on `globalThis` to avoid
 * exhausting the connection pool during a reload.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

declare global {
  var findbackPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. The application reads it from .env.local (see .env.example).',
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

/**
 * The shared client.
 *
 * A transaction client is obtained from `prisma.$transaction(...)`; it is
 * never constructed directly.
 */
export const prisma: PrismaClient = globalThis.findbackPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.findbackPrisma = prisma;
}
