/**
 * The password-reset-token repository port.
 *
 * **The seam bolt `004` left open.** The table existed so the schema would be
 * coherent; this port is what makes it reachable.
 *
 * **The token is looked up by its digest only.** There is no `findById` on
 * the request path, so a caller cannot address a token without presenting
 * its secret. A token id is guessable-enumerable; a token hash is not.
 *
 * **`markUsed` is a conditional write, not a read-then-write.** The write
 * *is* the check — see the method's own contract.
 *
 * Every write takes the caller's transaction handle, so a token cannot
 * commit on its own.
 */

import type { PasswordResetToken } from '@/domain/accounts';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** Reads and writes password-reset tokens. */
export interface PasswordResetTokenRepository {
  /**
   * Find a token by its digest.
   *
   * The digest is what is stored; the plaintext token is never persisted.
   */
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;

  /**
   * Persist a token inside the caller's transaction.
   */
  save(token: PasswordResetToken, transaction: TransactionHandle): Promise<PasswordResetToken>;

  /**
   * Mark a token used, **conditionally**, and report whether it happened.
   *
   * The condition is the whole mechanism:
   *
   * ```sql
   * UPDATE password_reset_tokens
   *    SET used_at = $now
   *  WHERE id = $tokenId
   *    AND used_at IS NULL
   *    AND expires_at > $now
   * ```
   *
   * One statement, evaluated atomically by PostgreSQL. There is no window
   * between "is it still unused?" and "mark it used" in which a second
   * concurrent request could slip through.
   *
   * **The result distinguishes the outcomes without leaking them:**
   *
   * - `true` — the token was valid and is now used;
   * - `false` — the token was already used, **or** expired, **or** unknown.
   *
   * All three refusals collapse into **one** internal reason and **one**
   * response body, because the caller must not be able to tell them apart.
   */
  markUsed(tokenId: string, transaction: TransactionHandle, now: Date): Promise<boolean>;
}
