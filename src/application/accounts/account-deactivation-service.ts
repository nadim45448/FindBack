/**
 * The account-deactivation use case.
 *
 * FR-5: an administrator deactivates an account. Every open session is
 * revoked, and everything else about the account's history is preserved.
 *
 * **The transaction is the point.** The status change and every session
 * revocation commit **together** (ADR-3), so there is never a window in which
 * a deactivated account holds a live session. An audit row for a transition
 * that did not happen is a defect, so the audit row is written **inside the
 * same transaction** (ADR-6).
 *
 * **The service never touches a report, a Claim, a Recovery Response, a
 * message, or a historical audit row** — it has no repository that could.
 * That is how "deactivation preserves everything" (FR-5) is enforced
 * structurally rather than by remembering not to.
 *
 * **A second deactivation is an idempotent no-op**, not a conflict. It writes
 * nothing and records nothing, so the audit trail stays a record of what
 * happened, once (story 004's edge case).
 */

import {
  deactivateAccount,
  REVOCATION_REASON_ACCOUNT_DEACTIVATED,
  type Account,
} from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import type { AccountRepository } from './ports/account-repository';
import type { SessionRepository } from './ports/session-repository';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The outcome of a deactivation. */
export interface DeactivationOutcome {
  /** The account, as it is now. */
  readonly account: Account;
  /** True when this call performed the deactivation; false for a no-op. */
  readonly changed: boolean;
  /** How many sessions were revoked. */
  readonly revokedSessions: number;
}

/** The account-deactivation use case. */
export class AccountDeactivationService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Deactivate an account.
   *
   * @throws {NotFoundError} when no such account exists.
   * @throws {IllegalTransitionError} when the account is `Pending` or
   * `Rejected` — a genuinely illegal transition, which the aggregate
   * refuses.
   */
  async execute(
    accountId: string,
    actingAdministratorId: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<DeactivationOutcome> {
    const account = await this.accounts.findById(accountId);

    if (!account) {
      throw new NotFoundError('No account with that id.');
    }

    // The idempotent no-op. A second deactivation is the same request
    // arriving twice, not a conflict — so it is a 200 with the same body,
    // writes nothing, and records nothing.
    if (account.status === 'Deactivated') {
      return { account, changed: false, revokedSessions: 0 };
    }

    // The `Active`-only rule lives in the aggregate, so every caller is
    // covered by one check and the route does not repeat it.
    const deactivated = deactivateAccount(account, now);

    const activeSessions = await this.sessions.listActiveByAccount(accountId, now);

    for (const session of activeSessions) {
      await this.sessions.revoke(
        session.id,
        REVOCATION_REASON_ACCOUNT_DEACTIVATED,
        transaction,
        now,
      );
    }

    const saved = await this.accounts.save(deactivated, transaction);

    // Audit event 13. Written **inside** the caller's transaction, so the
    // record and the transition commit together.
    await this.audit.record(
      {
        eventType: 'account.deactivated',
        parent: { parentType: 'account', parentId: saved.id },
        actor: { actorId: actingAdministratorId, actorRole: 'administrator' },
      },
      transaction,
    );

    return { account: saved, changed: true, revokedSessions: activeSessions.length };
  }
}
