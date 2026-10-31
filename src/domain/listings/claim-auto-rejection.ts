/**
 * The three auto-rejection triggers — FR-17's "another claim was approved
 * for this item", FR-11's "report withdrawn by reporter", and FR-21's
 * "report closed by administrator".
 *
 * **The reasons are verbatim, and they are stored verbatim.** Story 006 is
 * explicit: "the trigger reason is stored verbatim exactly as ... as
 * applicable", and "Softening must never be implemented by rewriting the
 * stored reason". The stored reason is what an administrator reads on the
 * trail when they ask *why* a Claim was rejected, so it must say exactly
 * what happened — not a softened version of it.
 *
 * **The user-facing copy is a separate thing, in a separate module.** The
 * softening rule (story 006: "the visible copy states that another claim on
 * the same item was approved without the wording 'another claim was
 * approved for this item' appearing verbatim") applies to the *email and
 * the member-visible explanation* — never to the stored reason. This
 * module holds only the stored reasons; `claim-auto-rejection-copy.ts`
 * holds the softened text, and the two are related by **an explicit
 * mapping**, not by a rewrite.
 *
 * **The three triggers are distinct and are not all caused by another
 * claim.** Only one of them — an approval — is caused by a competing
 * Claim. The other two are caused by the report's own lifecycle ending.
 * That difference is why the reasons are three literals and not one
 * parameterised string: an audit reader comparing two auto-rejections must
 * be able to tell them apart, and a reason built by interpolation would
 * blur them.
 *
 * **The withdrawal reason already existed** — it is FR-11's, and
 * `report-interaction-records.ts` holds it because bolt 008's withdrawal
 * path writes it. This module **re-exports** it rather than declaring a
 * second copy, because two literals for one reason is two answers to "what
 * does a withdrawal record?", and they would drift.
 *
 * **The trigger names the human whose action caused it.** Story 006 is
 * explicit: "`actor` is the system performing the transition;
 * `triggered_by` names the human whose action caused it, so a decision is
 * always traceable to a person." The catalog's event 5 names the fields
 * `triggeredBy`, `triggeringAction`, `foundReportId`, and
 * `autoRejectionReason`.
 *
 * Pure — no I/O, no framework imports.
 */

import { WITHDRAWAL_CLAIM_REJECTION_REASON } from './report-interaction-records';

/**
 * The three auto-rejection triggers.
 *
 * **The names are the trigger, not the effect.** Every trigger has the
 * same effect — the Claim becomes `Rejected` — so a name that described
 * the effect would name all three identically. The names describe *what
 * caused it*, which is the thing the audit trail distinguishes.
 */
export type ClaimAutoRejectionTrigger =
  /** Another Claim on the same item was approved. */
  | 'AnotherClaimApproved'
  /** The reporter withdrew the report. */
  | 'ReportWithdrawnByReporter'
  /** An administrator closed the report. */
  | 'ReportClosedByAdministrator';

/**
 * The audit reason each trigger records — **verbatim**.
 *
 * **This is the stored reason, not the visible copy.** It goes into the
 * audit event's payload under the catalog's `autoRejectionReason` field,
 * and it is what an administrator reads when they ask why a Claim was
 * rejected.
 */
export const CLAIM_AUTO_REJECTION_REASONS: Readonly<
  Record<ClaimAutoRejectionTrigger, string>
> = Object.freeze({
  AnotherClaimApproved: 'another claim was approved for this item',
  // **The same literal, not a second copy.** FR-11's withdrawal path
  // already writes this reason, and the trail must not carry two spellings
  // of the same fact.
  ReportWithdrawnByReporter: WITHDRAWAL_CLAIM_REJECTION_REASON,
  ReportClosedByAdministrator: 'report closed by administrator',
});

/**
 * The `triggeringAction` each trigger records.
 *
 * **The action, not the trigger.** The catalog names the field
 * `triggeringAction`, and the story names the value for the approval
 * trigger: "`triggering_action` set to Claim approval". The other two are
 * the actions that caused them — the reporter's withdrawal and the
 * administrator's close.
 *
 * The values are the PRD's wording, capitalised as the PRD capitalises
 * them, because the trail is read by administrators and by auditors.
 */
export const CLAIM_AUTO_REJECTION_TRIGGERING_ACTIONS: Readonly<
  Record<ClaimAutoRejectionTrigger, string>
> = Object.freeze({
  AnotherClaimApproved: 'Claim approval',
  ReportWithdrawnByReporter: 'Report withdrawal',
  ReportClosedByAdministrator: 'Report closure',
});

/**
 * The audit reason a trigger records.
 *
 * @throws {Error} when the trigger is not one of the three — a caller that
 * invented a trigger would write a reason the trail cannot explain.
 */
export function autoRejectionReason(trigger: ClaimAutoRejectionTrigger): string {
  const reason = CLAIM_AUTO_REJECTION_REASONS[trigger];

  if (reason === undefined) {
    throw new Error(`Unhandled claim auto-rejection trigger: ${String(trigger)}`);
  }

  return reason;
}

/**
 * The `triggeringAction` a trigger records.
 */
export function autoRejectionTriggeringAction(trigger: ClaimAutoRejectionTrigger): string {
  const action = CLAIM_AUTO_REJECTION_TRIGGERING_ACTIONS[trigger];

  if (action === undefined) {
    throw new Error(`Unhandled claim auto-rejection trigger: ${String(trigger)}`);
  }

  return action;
}

/**
 * Every trigger, in the order the PRD names them.
 *
 * **Frozen, so a caller cannot push a fourth trigger into it.** The set is
 * the PRD's three triggers; a fourth would need a new catalog event, and
 * the catalog is frozen.
 */
export const CLAIM_AUTO_REJECTION_TRIGGERS: readonly ClaimAutoRejectionTrigger[] =
  Object.freeze([
    'AnotherClaimApproved',
    'ReportWithdrawnByReporter',
    'ReportClosedByAdministrator',
  ]);

/**
 * The trigger that an approval raises.
 *
 * **A named constant, because the approval path and the audit path must
 * agree.** A string literal in two places is two answers to "which trigger
 * does an approval raise?".
 */
export const APPROVAL_AUTO_REJECTION_TRIGGER: ClaimAutoRejectionTrigger =
  'AnotherClaimApproved';

/**
 * The trigger that a reporter's withdrawal raises.
 */
export const WITHDRAWAL_AUTO_REJECTION_TRIGGER: ClaimAutoRejectionTrigger =
  'ReportWithdrawnByReporter';

/**
 * The trigger that an administrator's close raises.
 */
export const CLOSE_AUTO_REJECTION_TRIGGER: ClaimAutoRejectionTrigger =
  'ReportClosedByAdministrator';

/**
 * The claim decision's own status values.
 *
 * **Re-exported from `claim-status.ts`,** which is the single implementation
 * point for the Claim vocabulary. This module uses them, and does not
 * declare them.
 */
export { CLAIM_APPROVED_STATUS, CLAIM_REJECTED_STATUS } from './claim-status';
