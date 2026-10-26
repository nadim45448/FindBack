/**
 * The transaction factory port.
 *
 * A read record is a write, so it needs a transaction — and the read record
 * is written in **its own** transaction, separate from any read (ADR-7). This
 * port is how the application layer opens that transaction without knowing
 * whether the implementation is Prisma.
 *
 * The port is deliberately small: it runs a unit of work inside a transaction
 * and hands the unit a handle. It cannot be used to update or delete, because
 * the repository interfaces that consume the handle expose no such method.
 */

import type { TransactionHandle } from './transaction-handle';

/** Runs a unit of work inside a transaction. */
export interface TransactionFactory {
  /**
   * Run `work` inside a transaction, committing on success and rolling back
   * on failure.
   *
   * The transaction is short — the work is expected to be a single insert.
   * `data-stack.md` requires short transactions, and a long one holds a
   * pooled connection for its duration.
   */
  run<T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T>;
}
