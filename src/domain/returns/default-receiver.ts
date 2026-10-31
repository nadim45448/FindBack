/**
 * The default receiver — who the item went to when it went to the person who
 * had a right to it.
 *
 * **The default receiver is derived, never chosen.** Story 001 says so
 * outright: *"The default receiver is derived, not chosen: Found → approved
 * claimant, Lost → Lost-report owner."* The administrator does not pick the
 * default receiver; the administrator records whether the default receiver
 * physically received the item, and — if not — who did.
 *
 * ## The two directions, and the one rule
 *
 * | Report | Default receiver |
 * |---|---|
 * | `Found` | the approved claimant |
 * | `Lost` | the Lost-report owner |
 *
 * **This module is the single place that decides which.** It is the whole
 * point of Unit 005's brief: *"Both directions converge here. There must be
 * exactly one Confirm Returned implementation, not one per side — otherwise
 * the receiver and substitute rules drift apart."*
 *
 * **The rule is a table keyed by report type, and the table is total over
 * the two types.** A report type outside the table is not a report this
 * system has — and the refusal is a refusal rather than a silent fallback to
 * one branch, because a fallback would record the wrong receiver for a report
 * whose type is unknown.
 *
 * **The derivation needs a fact the report itself does not carry.** A Found
 * report's default receiver is the claimant on its *approved* Claim — and
 * that claimant is a row on the `claims` table, not a column on the report.
 * So the derivation takes the approved claimant's id as an input, and the
 * application layer is what reads it. **A Found report with no approved
 * Claim has no default receiver**, and that is not a substitution — it is the
 * absence of a precondition (story 001's edge case: *"Found report with no
 * approved Claim — Cannot reach Returned; the precondition does not exist"*).
 *
 * ## The Lost-report owner is the reporter
 *
 **The Lost report's owner is the member who created it.** That is the
 * `reports.reporter_id` column, and it is the same fact the Lost-side
 * workflow already reads as "the owner" — bolt 017's selection service calls
 * it `reporterId` and the domain calls it `reportOwnerId`.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import type { ReportType } from '@/domain/listings';

/**
 * The default receiver's account id.
 *
 * **An account id, because the default receiver is a member.** The approved
 * claimant and the Lost-report owner are both accounts on the system. The
 * *substitute* is not — a substitute is recorded by name, with no account
 * link (see `substitute-receiver.ts`).
 */
export interface DefaultReceiver {
  readonly accountId: string;
  /** The report type the receiver was derived for. */
  readonly reportType: ReportType;
}

/**
 * The facts the derivation reads.
 *
 * **The approved claimant is present only for a Found report.** It is
 * `null` for a Lost report, because a Lost report has no Claims at all —
 * Claims are the Found side's, and the schema's own notes say a Lost report
 * has no Claims.
 */
export interface DefaultReceiverFacts {
  /** The report's type. */
  readonly reportType: ReportType;
  /**
   * The report's owner — the member who created it.
   *
   * **The Lost side's default receiver, and nothing else.** The Found
   * branch does not read it, and the separation is what keeps "the owner is
   * *not* the Found-side receiver" structural rather than a convention that
   * a later edit could break.
   */
  readonly reporterId: string;
  /**
   * The claimant on the report's approved Claim.
   *
   * **`null` for a Lost report, and `null` for a Found report with no
   * approved Claim.** The two are the same answer to the same question —
   * "is there an approved Claim?" — and neither is an error.
   */
  readonly approvedClaimantId: string | null;
}

/**
 * Derive the default receiver for a report.
 *
 * **A Found report with no approved Claim has no default receiver.** The
 * function returns `null` rather than throwing, because the absence is a
 * precondition that has not been met — and the caller decides what to do
 * with it. Story 001's edge case says such a report *"cannot reach Returned"*
 * because *"the precondition does not exist"*, and a report whose owner is
 * absent is not an error the derivation should raise.
 *
 * **A Lost report's default receiver is always derivable.** The owner is on
 * the report row itself.
 *
 * @returns the default receiver, or `null` when the report's precondition
 * does not exist.
 */
export function deriveDefaultReceiver(
  facts: DefaultReceiverFacts,
): DefaultReceiver | null {
  switch (facts.reportType) {
    case 'Found':
      // **The approved claimant, or nothing.** A Found report reaches
      // `Claim Approved` *because* a Claim was approved, so the claimant
      // exists — but the derivation does not assume it and asks.
      if (facts.approvedClaimantId === null) {
        return null;
      }

      return { accountId: facts.approvedClaimantId, reportType: 'Found' };

    case 'Lost':
      // **The owner is the reporter.** The owner is always on the report
      // row, so a Lost report's default receiver is always derivable.
      return { accountId: facts.reporterId, reportType: 'Lost' };
  }
}

/**
 * Validate that a default receiver was derived.
 *
 * @throws {ValidationError} when no receiver could be derived.
 */
export function assertDefaultReceiver(
  receiver: DefaultReceiver | null,
): DefaultReceiver {
  if (receiver === null) {
    throw new ValidationError(
      'receiver',
      'This report has no approved claim, so it cannot be confirmed as returned.',
    );
  }

  return receiver;
}
