/**
 * The registration-review use case.
 *
 * FR-3: an administrator approves or rejects a pending registration.
 *
 * **Only approval sends an email** (FR-1, FR-27). Rejection sends none.
 * The rule is enforced here, where the decision is made, rather than in a
 * notification module that would have to be told which transition happened
 * (ADR-14).
 *
 * **The email is sent after the transaction commits**, never inside it
 * (ADR-3, decision 4; PRD §10's "email send failures are logged; the
 * triggering action is not blocked"). This use case therefore returns the
 * address the caller must send to, and the caller sends it once the
 * transaction has committed.
 *
 * A failed send **never** rolls back the approval. The approval stands, and
 * the failure is logged (story 002 criterion 6).
 */

import { approveAccount, rejectAccount, type Account } from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import type { AccountRepository } from './ports/account-repository';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The decision an administrator makes on a pending registration. */
export type RegistrationDecision = 'approve' | 'reject';

/** The outcome of a review. */
export interface RegistrationReviewOutcome {
  readonly account: Account;
  /**
   * The address the approval email must go to — **only** for an approval.
   *
   * `null` for a rejection, because a rejection sends no email of any kind
   * (FR-1, FR-3, story 007).
   */
  readonly approvalEmailRecipient: string | null;
}

/** The registration-review use case. */
export class ReviewRegistration {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Approve or reject a pending registration.
   *
   * @throws {NotFoundError} when no such account exists.
   * @throws {IllegalTransitionError} when the account is no longer pending —
   * the concurrent-decision case, where exactly one decision commits.
   */
  async execute(
    decision: RegistrationDecision,
    accountId: string,
    actingAdministratorId: string,
    transaction: TransactionHandle,
    rejectionReason?: string | null,
  ): Promise<RegistrationReviewOutcome> {
    const account = await this.accounts.findById(accountId);

    if (!account) {
      throw new NotFoundError('No account with that id.');
    }

    if (decision === 'approve') {
      return this.approve(account, actingAdministratorId, transaction);
    }

    return this.reject(account, actingAdministratorId, transaction, rejectionReason);
  }

  /**
   * Approve. The account becomes `Active` and the approval email is due.
   */
  private async approve(
    account: Account,
    actingAdministratorId: string,
    transaction: TransactionHandle,
  ): Promise<RegistrationReviewOutcome> {
    const approved = approveAccount(account, new Date());
    const saved = await this.accounts.save(approved, transaction);

    // Audit event 11. The reason column is left empty — the PRD names no
    // reason for an approval.
    await this.audit.record(
      {
        eventType: 'registration.approved',
        parent: { parentType: 'account', parentId: saved.id },
        actor: { actorId: actingAdministratorId, actorRole: 'administrator' },
      },
      transaction,
    );

    return { account: saved, approvalEmailRecipient: saved.email.value };
  }

  /**
   * Reject. The account becomes `Rejected` and **no email is sent**.
   *
   * The reason is recorded on the account row *and* in the audit event, in
   * the same transaction, so the two cannot disagree (design decision 16).
   * It is never returned to the member.
   */
  private async reject(
    account: Account,
    actingAdministratorId: string,
    transaction: TransactionHandle,
    rejectionReason?: string | null,
  ): Promise<RegistrationReviewOutcome> {
    // The reason is built by the caller (the route boundary), which enforces
    // the PRD's 5-character minimum on the input. The aggregate tolerates a
    // missing reason — an administrator is never blocked from rejecting.
    const reason = rejectionReason?.trim() ? { value: rejectionReason.trim() } : null;

    const rejected = rejectAccount(account, reason);
    const saved = await this.accounts.save(rejected, transaction);

    // Audit event 12. The reason is a typed column on the trail, and it is
    // **administrator-visible** — FR-31 names the field for this event.
    await this.audit.record(
      {
        eventType: 'registration.rejected',
        parent: { parentType: 'account', parentId: saved.id },
        actor: { actorId: actingAdministratorId, actorRole: 'administrator' },
        reason: reason?.value ?? null,
      },
      transaction,
    );

    return { account: saved, approvalEmailRecipient: null };
  }
}
