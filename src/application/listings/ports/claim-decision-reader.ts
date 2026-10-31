/**
 * The claim decision reader port.
 *
 * **It answers the questions the decision needs, and it supplies them from
 * inside the caller's transaction.** The approval's atomicity depends on
 * the report row being locked *before* the decision is applied, so every
 * read that feeds the decision must happen after the lock and within the
 * same transaction — otherwise two administrators can each read a `Pending`
 * Claim and each believe they may decide it.
 *
 * **The transaction handle is optional here, and that is deliberate.** The
 * gate's *first* read — "does this Claim exist, and is it still
 * `Pending`?" — happens before the transaction opens, so that a
 * non-administrator-facing fast refusal writes nothing. The reads that feed
 * an *applied* decision happen inside the transaction, and the handle is
 * then required. A port that made the handle required everywhere would
 * force a transaction to open before the gate has decided anything, and a
 * transaction that opens before the gate refuses is a transaction that has
 * to be rolled back for nothing.
 *
 * **The competing-claim read is the one that must be inside the
 * transaction.** It is the read that decides whether an approval
 * auto-rejects anybody, and a read outside the transaction would be a
 * read-then-write race — the exact race the story forbids.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimStatus, ReportStatus } from '@/domain/listings';

/**
 * The Claim's state, as the decision gate reads it.
 */
export interface ClaimDecisionState {
  readonly id: string;
  readonly status: ClaimStatus;
  readonly reportId: string;
  readonly claimantId: string;
  /** The claimant's email address, for the decision email. */
  readonly claimantEmail: string;
}

/**
 * A `Pending` Claim on the same item, competing with the one being decided.
 *
 * **The reference is thin on purpose.** The approval needs to know *that*
 * a competing Claim exists so it can reject it and write the audit event;
 * it does not need the competitor's evidence.
 */
export interface CompetingPendingClaim {
  readonly claimId: string;
  readonly claimantId: string;
  readonly claimantEmail: string;
  readonly submittedAt: Date;
}

/**
 * Reads the facts a claim decision needs.
 */
export interface ClaimDecisionReader {
  /**
   * Read the Claim's decision state.
   *
   * @returns the state, or `null` when no Claim carries that id.
   */
  readDecisionState(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimDecisionState | null>;

  /**
   * Read the **other** `Pending` Claims on the same item.
   *
   * **The Claim being decided is never in the result.** The caller passes
   * the id to exclude, and the implementation excludes it — a Claim is not
   * its own competitor, and an approval that rejected itself would be a
   * contradiction.
   *
   * **Only `Pending` Claims are returned.** An `Approved` or `Rejected`
   * Claim is settled history, not competition, and an approval must not
   * write an auto-rejection event for one.
   */
  listCompetingPendingClaims(
    reportId: string,
    excludeClaimId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly CompetingPendingClaim[]>;

  /**
   * Lock the Found report row and read its status.
   *
   * **The lock is the mechanism that makes the approval atomic.** The
   * implementation issues `SELECT … FOR UPDATE` on the report row, so two
   * administrators approving two different Claims on the same item are
   * **serialised**: the second waits for the first to commit, and then
   * reads the report's status *after* the first's move — so it sees
   * `Claim Approved` and its own approval is refused.
   *
   * **The lock is taken on the report, not on the Claim.** The report is the
   * shared resource: two administrators deciding two *different* Claims on
 * the *same item* is the race the story describes, and locking each Claim
   * separately would not prevent it.
   *
   * @returns the report's status, or `null` when no report carries that id.
   */
  lockReportStatus(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<ReportStatus | null>;
}
