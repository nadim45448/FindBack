/**
 * The pending-claim reader port.
 *
 * **It answers one question: does this member already have a `Pending` Claim
 * on this report?** That is FR-15's one-`Pending`-Claim-per-item-per-member
 * rule, asked from the user's side — the domain decides whether a duplicate
 * is refused, and this port supplies the fact it decides on.
 *
 * **The database carries the same rule as a uniqueness constraint.** The
 * story says so explicitly: "The one-`Pending`-Claim-per-item-per-member
 * rule is enforced by a database uniqueness constraint, not only by an
 * application check." This port is the *user-facing* half — it lets the
 * member be told "you already have a claim pending on this item" instead of
 * hitting a constraint violation. The constraint is the *fact*; this is the
 * *explanation*. Both exist because either alone is insufficient: the check
 * alone is a race, and the constraint alone is an untranslated error.
 *
 * **The query is by member and report, not by report.** A report may carry
 * many Claims from many members — the rule bounds *this member's* pending
 * Claims on *this* report, not the number of Claims on the report.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** Reads whether a member already has a pending Claim on a report. */
export interface PendingClaimReader {
  /**
   * Whether the member already has a `Pending` Claim on the report.
   *
   * @returns `true` when a `Pending` Claim exists for this member on this
   * report. A `Rejected` or `Approved` Claim does not count — a member whose
   * claim was rejected may claim again, and that new Claim sits alongside the
   * retained history.
   */
  hasPendingClaim(
    reportId: string,
    claimantId: string,
    transaction?: TransactionHandle,
  ): Promise<boolean>;
}
