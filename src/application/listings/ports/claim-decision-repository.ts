/**
 * The claim decision repository port — the writes a decision makes.
 *
 * **The transaction handle is a required parameter on every method**, as it
 * is on `ClaimRepository.create` and `AuditWriter.record`. There is no
 * overload that opens its own transaction. An approval that wrote the
 * Claim's status outside the transaction that also wrote the report's move
 * and the audit events would leave the three disagreeing — and the audit
 * trail is append-only with no correction path (ADR-6), so an audit record
 * for a transition that did not happen is permanent.
 *
 * **The decision writes are conditional writes.** A decision applies only
 * to a `Pending` Claim, so the write says so in its `WHERE` clause rather
 * than relying on the reader's earlier check. The reader's check is
 * **advisory** — it lets the service refuse a decision on an
 * already-decided Claim without opening a transaction — but it cannot be
 * the guarantee, because between the read and the write another
 * administrator may decide the same Claim. The write's own condition is
 * what makes the decision apply to a Claim that was still `Pending` when
 * the decision began.
 *
 * **A write that matched no row is a conflict, not a silent success.** The
 * port returns whether the write landed, and the service turns "did not
 * land" into the conflict the story requires.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimRejectionReason } from '@/domain/listings';

/**
 * Writes a Claim's decision.
 */
export interface ClaimDecisionRepository {
  /**
   * Approve a `Pending` Claim.
   *
   * **The write is conditional on the Claim still being `Pending`,** and
   * it records the deciding administrator and the instant of the decision.
   *
   * @returns `true` when the Claim was approved by this write, `false` when
   * the Claim was no longer `Pending` and the write did not land.
   */
  approve(
    claimId: string,
    administratorId: string,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean>;

  /**
   * Reject a `Pending` Claim with a reason.
   *
   * **The reason is stored on the Claim,** so the rejection is on the record
   * with the Claim itself and not only on the trail.
   *
   * @returns `true` when the Claim was rejected by this write, `false` when
   * the Claim was no longer `Pending` and the write did not land.
   */
  reject(
    claimId: string,
    administratorId: string,
    reason: ClaimRejectionReason,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean>;

  /**
   * Reject a `Pending` Claim without an administrator's reason.
   *
   * **This is the auto-rejection's write,** and it is a *different method*
   * rather than the same method with an absent reason. The auto-rejection's
   * reason is the trigger's verbatim reason, and the trigger — not an
   * administrator — is what caused it. Two methods make it impossible to
   * write an auto-rejection with no reason, and impossible to mistake an
   * auto-rejection for an administrator's rejection.
   *
   * @returns `true` when the Claim was rejected by this write, `false` when
   * the Claim was no longer `Pending` and the write did not land.
   */
  autoReject(
    claimId: string,
    reason: string,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean>;
}
