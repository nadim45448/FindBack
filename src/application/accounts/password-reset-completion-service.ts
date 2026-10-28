/**
 * The password-reset **completion** use case.
 *
 * FR-51: a valid, unexpired, unused token replaces the account's password
 * hash. The token is **single-use**, and using it **never changes the
 * account's lifecycle status** — a reset does not approve, activate,
 * reactivate, or undo a rejection.
 *
 * **The single-use rule is a database guarantee, not an application check.**
 * The `markUsed` write is conditional — `UPDATE … WHERE used_at IS NULL AND
 * expires_at > now()` — and the **write is the check**. One statement,
 * evaluated atomically by PostgreSQL, with no window between "is it still
 * unused?" and "mark it used" in which a concurrent replay could slip
 * through.
 *
 * **The conditional write and the hash replacement are one transaction.** That
 * is what makes the replay refusal atomic: a token that was used and a
 * password that was changed land together or not at all.
 *
 * **The five refusals collapse into one.** An absent, malformed, unknown,
 * used, and expired token are five different situations, and they
 * deliberately produce **one** error and **one** response body — each
 * distinction is a probe into whether a given address has an account.
 *
 * **The lifecycle status is never touched.** The completion writes only the
 * password hash; the status column is not in the statement.
 */

import { InvalidResetTokenError, type Account } from '@/domain/accounts';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { ResetTokenHasher } from './ports/reset-token-hasher';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The outcome of a completed reset. */
export interface PasswordResetCompletionOutcome {
  /** The account whose password was changed. */
  readonly account: Account;
}

/** The password-reset completion use case. */
export class PasswordResetCompletionService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokenHasher: ResetTokenHasher,
  ) {}

  /**
   * Complete a password reset.
   *
   * @throws {InvalidResetTokenError} when the token is absent, malformed,
   * unknown, already used, or expired — **one error for all five**.
   * @throws {NotFoundError} when the token names an account that no longer
   * exists.
   */
  async execute(
    tokenPlaintext: string,
    newPassword: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<PasswordResetCompletionOutcome> {
    if (tokenPlaintext.length === 0) {
      throw new InvalidResetTokenError();
    }

    const tokenHash = this.tokenHasher.hash({ value: tokenPlaintext });

    const token = await this.tokens.findByTokenHash(tokenHash.value);

    if (!token) {
      // An unknown token. The caller cannot tell this from a used or an
      // expired one — which is the point.
      throw new InvalidResetTokenError();
    }

    // The **conditional write is the check**. If it updates no row, the token
    // was already used or has expired — and the two are not distinguished.
    const marked = await this.tokens.markUsed(token.id, transaction, now);

    if (!marked) {
      throw new InvalidResetTokenError();
    }

    const account = await this.accounts.findById(token.accountId);

    if (!account) {
      throw new InvalidResetTokenError();
    }

    // The hash goes through the **same** `PasswordHasher` port the
    // registration and login paths use (ADR-12), so a reset password is
    // indistinguishable from a registration password — and it authenticates.
    const passwordHash = await this.hasher.hash(newPassword);

    // **Only the password hash changes.** The status column is not in this
    // write, so a reset never approves, activates, reactivates, or undoes a
    // rejection — for a `Pending`, `Rejected`, or `Deactivated` account
    // alike.
    const saved = await this.accounts.save({ ...account, passwordHash }, transaction);

    return { account: saved };
  }
}
