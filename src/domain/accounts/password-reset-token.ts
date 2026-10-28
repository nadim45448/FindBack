/**
 * The `PasswordResetToken` aggregate root.
 *
 * FR-51: a password-reset token is **single-use** and **time-limited**.
 *
 * **The token is stored only as a digest.** The plaintext exists in the reset
 * link, the member's browser, and the outbound email — and nowhere else. The
 * aggregate therefore carries a `tokenHash`, and the plaintext is never a
 * field on it.
 *
 * **The single-use rule is a database guarantee, not an application check.**
 * The aggregate records *that* a token was issued and *when* it expires; the
 * "first use wins" rule is enforced by a conditional write —
 * `UPDATE … WHERE used_at IS NULL AND expires_at > now()` — whose result is
 * the check. A read-then-write would have a window between "is it still
 * unused?" and "mark it used" in which a concurrent replay could slip
 * through, and that window is exactly the race the story's edge case
 * describes.
 *
 * **Issuing a new token does not invalidate an outstanding one.** Two reset
 * requests create two independent tokens, both valid until used. This is what
 * makes a lost email recoverable by simply asking again.
 *
 * Pure — no I/O, no framework imports.
 */

/** The token's own state. */
export interface PasswordResetToken {
  readonly id: string;
  readonly accountId: string;
  /** The keyed digest of the token's plaintext. Never the plaintext. */
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** When the token was used. `null` until it is. */
  readonly usedAt: Date | null;
}

/** The fields a new token is created with. */
export interface IssuePasswordResetTokenParams {
  readonly id: string;
  readonly accountId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/**
 * Issue a reset token.
 *
 * The expiry is passed in rather than computed here, because the **lifetime
 * is configuration** (ADR-17) and the aggregate must not hold a second copy
 * of that decision.
 */
export function issuePasswordResetToken(
  params: IssuePasswordResetTokenParams,
): PasswordResetToken {
  return {
    id: params.id,
    accountId: params.accountId,
    tokenHash: params.tokenHash,
    createdAt: params.createdAt,
    expiresAt: params.expiresAt,
    usedAt: null,
  };
}

/**
 * True when the token's window has elapsed.
 *
 * **Expiry is enforced on read, not by a sweeper** (ADR-17): a token is dead
 * the moment its window elapses, whether or not any cleanup job has run. The
 * daily sweep removes the row for storage reasons only, and correctness never
 * depends on it.
 */
export function isExpired(token: PasswordResetToken, now: Date): boolean {
  return token.expiresAt.getTime() <= now.getTime();
}

/**
 * True when the token has already been used.
 *
 * A used token is refused even if it has not expired — the single-use rule is
 * independent of the time limit.
 */
export function isUsed(token: PasswordResetToken): boolean {
  return token.usedAt !== null;
}

/**
 * True when the token may still be used.
 *
 * Both conditions must hold, and the **conditional write** enforces them
 * again at the database, so this predicate is a convenience for the caller
 * and not the mechanism.
 */
export function isUsableResetToken(token: PasswordResetToken, now: Date): boolean {
  return !isUsed(token) && !isExpired(token, now);
}
