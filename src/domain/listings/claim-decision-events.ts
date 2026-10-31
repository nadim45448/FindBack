/**
 * The three claim-decision domain events — catalog events 3, 4, and 5.
 *
 * **All three already exist in the frozen catalog**, so this bolt **adds
 * no event and no event number** (ADR-9's guarantee is structural):
 *
 * - Event 3 `claim.approved` — no additional fields.
 * - Event 4 `claim.rejected_by_administrator` — `reason`.
 * - Event 5 `claim.auto_rejected` — `triggeredBy`, `triggeringAction`,
 *   `foundReportId`, `autoRejectionReason`.
 *
 * **The catalog's field list is a minimum, not a maximum — and for these
 * three events it is exact.** Event 3 names no fields, so the approval event
 * carries an **empty payload**. Event 4 names exactly `reason`, so the
 * administrator's rejection carries the reason and nothing else. Event 5
 * names exactly four fields, so the auto-rejection carries all four and
 * nothing else.
 *
 * **The audit payload sanitizer denies by default.** A field the catalog
 * does not name is *refused*, not dropped — a silently discarded field is a
 * silently incomplete audit record. So the payload builders below are
 * typed to carry exactly the catalog's fields, and the compiler is the
 * check that they do.
 *
 * **The auto-rejection's `foundReportId` is in the payload, not the
 * parent.** The event's parent is the *Claim* — the auto-rejection is a
 * Claim's event, and the trail an administrator reads for a Claim must
 * show which Found report it was against. The Found report id is therefore
 * a named payload field, exactly as the catalog says.
 *
 * **The events are raised after the transaction commits**, not from inside
 * it. An event for a decision that may not exist is worse than a missing
 * one — the same reasoning bolt 013's `claim-submitted` event records, and
 * the same reasoning ADR-7 gives for the audit-read record.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  autoRejectionReason,
  autoRejectionTriggeringAction,
  type ClaimAutoRejectionTrigger,
} from './claim-auto-rejection';

/** The catalog type discriminator for event 3. */
export const CLAIM_APPROVED_EVENT_TYPE = 'claim.approved';

/** The catalog type discriminator for event 4. */
export const CLAIM_REJECTED_BY_ADMINISTRATOR_EVENT_TYPE = 'claim.rejected_by_administrator';

/** The catalog type discriminator for event 5. */
export const CLAIM_AUTO_REJECTED_EVENT_TYPE = 'claim.auto_rejected';

/**
 * The `ClaimApproved` event — catalog event 3.
 *
 * **The payload is empty, and that is the catalog's doing.** Event 3 names
 * no additional fields, so there is nothing to carry. The claim's id, the
 * report's id, the administrator, and the timestamp are all standard
 * audit-record fields and travel outside the payload.
 */
export interface ClaimApproved {
  readonly type: typeof CLAIM_APPROVED_EVENT_TYPE;
  readonly claimId: string;
  readonly reportId: string;
  readonly administratorId: string;
}

/**
 * Build the `ClaimApproved` event.
 */
export function buildClaimApprovedEvent(input: {
  readonly claimId: string;
  readonly reportId: string;
  readonly administratorId: string;
}): ClaimApproved {
  return {
    type: CLAIM_APPROVED_EVENT_TYPE,
    claimId: input.claimId,
    reportId: input.reportId,
    administratorId: input.administratorId,
  };
}

/**
 * The `ClaimRejectedByAdministrator` event — catalog event 4.
 *
 * **The reason is the payload's only field.** The catalog names exactly
 * `reason` for this event, and the reason is the administrator's finding
 * against the claim — the thing the claimant is told and the thing the
 * trail preserves.
 */
export interface ClaimRejectedByAdministrator {
  readonly type: typeof CLAIM_REJECTED_BY_ADMINISTRATOR_EVENT_TYPE;
  readonly claimId: string;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    readonly reason: string;
  };
}

/**
 * Build the `ClaimRejectedByAdministrator` event.
 *
 * @param reason the administrator's rejection reason. **The stored reason
 * is the administrator's own words, verbatim** — it is not softened, and
 * the softening rule (story 006) applies to the *auto*-rejection's visible
 * copy, not to an administrator's stated finding.
 */
export function buildClaimRejectedByAdministratorEvent(input: {
  readonly claimId: string;
  readonly reportId: string;
  readonly administratorId: string;
  readonly reason: { readonly value: string };
}): ClaimRejectedByAdministrator {
  return {
    type: CLAIM_REJECTED_BY_ADMINISTRATOR_EVENT_TYPE,
    claimId: input.claimId,
    reportId: input.reportId,
    administratorId: input.administratorId,
    payload: { reason: input.reason.value },
  };
}

/**
 * The `ClaimAutoRejected` event — catalog event 5.
 *
 * **The payload carries exactly the catalog's four fields.**
 *
 * - `triggeredBy` — the **human** whose action caused the auto-rejection.
 *   The actor is the *system*; this field is what makes the decision
 *   traceable to a person (story 006).
 * - `triggeringAction` — the action that caused it, as the catalog's
 *   wording.
 * - `foundReportId` — the Found report the Claim was against.
 * - `autoRejectionReason` — the **verbatim** trigger reason.
 */
export interface ClaimAutoRejected {
  readonly type: typeof CLAIM_AUTO_REJECTED_EVENT_TYPE;
  readonly claimId: string;
  readonly reportId: string;
  readonly payload: {
    readonly triggeredBy: string;
    readonly triggeringAction: string;
    readonly foundReportId: string;
    readonly autoRejectionReason: string;
  };
}

/**
 * Build the `ClaimAutoRejected` event.
 *
 * @param trigger the auto-rejection trigger. **The reason and the action
 * come from the trigger, not from the caller** — the caller supplies *which
 * trigger fired*, and the module supplies the two strings the catalog
 * records. A caller that supplied its own reason string could write a
 * reason the trail cannot tie back to a trigger.
 * @param triggeredBy the **human** whose action caused the auto-rejection.
 */
export function buildClaimAutoRejectedEvent(input: {
  readonly claimId: string;
  readonly reportId: string;
  readonly trigger: ClaimAutoRejectionTrigger;
  readonly triggeredBy: string;
}): ClaimAutoRejected {
  return {
    type: CLAIM_AUTO_REJECTED_EVENT_TYPE,
    claimId: input.claimId,
    reportId: input.reportId,
    payload: {
      triggeredBy: input.triggeredBy,
      triggeringAction: autoRejectionTriggeringAction(input.trigger),
      foundReportId: input.reportId,
      autoRejectionReason: autoRejectionReason(input.trigger),
    },
  };
}
