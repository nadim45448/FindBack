/**
 * The account repository port.
 *
 * **`save` is the only write**, and it takes the caller's transaction
 * handle — so an account write cannot commit on its own. The same discipline
 * bolt `001-audit-core` established for the audit trail.
 *
 * The port is the seam between the domain and Prisma. The domain never
 * sees a row, and the infrastructure never decides a lifecycle rule.
 */

import type { Account } from '@/domain/accounts';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** A pending registration, as the administrator's queue shows it. */
export interface PendingRegistration {
  readonly account: Account;
}

/** Reads and writes accounts. */
export interface AccountRepository {
  /** Find an account by its id. */
  findById(id: string): Promise<Account | null>;

  /**
   * Find an account by its email address.
   *
   * The address is normalized by the caller before it reaches here, and the
   * query is case-insensitive regardless — the unique index is functional
   * (`lower(btrim(email))`), so a row written by any path is found.
   */
  findByEmail(email: string): Promise<Account | null>;

  /** True when an account already uses this email address. */
  existsByEmail(email: string): Promise<boolean>;

  /**
   * Persist an account inside the caller's transaction.
   *
   * A **create** and an **update** are the same call: the repository decides
   * which from the aggregate's state, because the domain has one way to
   * change an account's status and the repository can see the difference.
   */
  save(account: Account, transaction: TransactionHandle): Promise<Account>;

  /**
   * The pending registrations, oldest first (FR-3's submission-time
   * ordering).
   *
   * The page is capped by the repository, because a queue that returns
   * everything is a queue that times out.
   */
  listPending(limit: number): Promise<readonly PendingRegistration[]>;
}
