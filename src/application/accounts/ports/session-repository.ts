/**
 * The session repository port.
 *
 * **Every write takes the caller's transaction handle**, so a session
 * cannot commit on its own. Revocation in particular must be part of the
 * same transaction as the decision that caused it — a logout that commits
 * its revocation separately from the request is a logout that can be
 * half-done.
 */

import type { Session } from '@/domain/accounts';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** Reads and writes sessions. */
export interface SessionRepository {
  /**
   * Find a session by its token hash.
   *
   * The hash is what is stored; the plaintext token is never persisted.
   */
  findByTokenHash(tokenHash: string): Promise<Session | null>;

  /** Find a session by its id. */
  findById(id: string): Promise<Session | null>;

  /** The account's sessions that are still usable. */
  listActiveByAccount(accountId: string, now: Date): Promise<readonly Session[]>;

  /** Persist a session inside the caller's transaction. */
  save(session: Session, transaction: TransactionHandle): Promise<Session>;

  /**
   * Revoke a session inside the caller's transaction.
   *
   * **Idempotent** — revoking an already-revoked session succeeds without
   * changing anything, because logout must be an idempotent success (story
   * 005 criterion 4).
   *
   * `now` is the moment of the revocation, passed in so the timestamp is
   * deterministic under test.
   */
  revoke(
    sessionId: string,
    reason: string,
    transaction: TransactionHandle,
    now: Date,
  ): Promise<Session>;
}
