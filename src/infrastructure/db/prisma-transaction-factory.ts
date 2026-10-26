/**
 * The Prisma transaction factory.
 *
 * Opens a short transaction and runs a unit of work inside it. This is what
 * gives the read record **its own transaction**, separate from the trail
 * query (ADR-7).
 *
 * The unit of work receives a `TransactionHandle`, not the Prisma client, so
 * the application layer cannot reach a mutation path it does not own.
 */

import type { PrismaClient } from '@prisma/client';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/**
 * Prisma's transaction factory.
 *
 * The client is a **constructor parameter**, and the shared `prisma` singleton
 * is resolved lazily rather than imported. A module that imported the
 * singleton would construct it at import time — before a script had loaded
 * its environment file — and would fail with "DATABASE_URL is not set".
 */
export class PrismaTransactionFactory implements TransactionFactory {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Run `work` inside a transaction.
   *
   * The transaction is committed when `work` resolves and rolled back when it
   * rejects. It is expected to be short — a single insert for the read
   * record — because `data-stack.md` requires short transactions and a long
   * one holds a pooled connection for its duration.
   */
  async run<T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (transaction) => {
      const handle: TransactionHandle = { transaction };

      return work(handle);
    });
  }
}
