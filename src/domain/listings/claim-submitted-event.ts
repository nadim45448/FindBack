/**
 * The `ClaimSubmitted` domain event — catalog event 2.
 *
 * **The event already exists in the frozen catalog.** `claim.submitted` is
 * event 2, with `additionalFields: ['reason', 'identifyingDetails',
 * 'dateLost']` and `sensitiveFields: ['reason', 'identifyingDetails']`. This
 * bolt therefore **adds no event and no event number** — ADR-9's guarantee
 * is structural.
 *
 * **The reason and the identifying details are Sensitive Fields, and the
 * trail records them under the catalog's names.** The catalog names them for
 * this event, which is what permits them on the trail at all — FR-37's rule
 * is that a Sensitive Field is never granted to the Found-report owner, and
 * the trail is administrator-only (FR-32). The **audit payload sanitizer
 * denies by default**, so naming exactly these three fields permits exactly
 * these three fields.
 *
 * **The event is raised after the transaction commits**, not from inside it.
 * An event for a Claim that may not exist is worse than a missing one — the
 * same reasoning ADR-7 gives for the audit-read record, and the same
 * reasoning `report-created-event.ts` records.
 *
 * Pure — no I/O, no framework imports.
 */

/** The catalog type discriminator for event 2. */
export const CLAIM_SUBMITTED_EVENT_TYPE = 'claim.submitted';

/** The `ClaimSubmitted` event's payload. */
export interface ClaimSubmittedPayload {
  /** The claimant's reason. An FR-37 Sensitive Field. */
  readonly reason: string;
  /** The claimant's identifying details. An FR-37 Sensitive Field. */
  readonly identifyingDetails: string;
  /** The calendar day the item went missing, as `YYYY-MM-DD`. */
  readonly dateLost: string;
}

/** The `ClaimSubmitted` domain event. */
export interface ClaimSubmitted {
  readonly type: typeof CLAIM_SUBMITTED_EVENT_TYPE;
  readonly claimId: string;
  readonly reportId: string;
  readonly claimantId: string;
  readonly payload: ClaimSubmittedPayload;
}

/**
 * Build the `ClaimSubmitted` event.
 *
 * The payload is assembled from the Claim's own fields, so an event cannot
 * carry a field the catalog does not name — the compiler is the check.
 */
export function buildClaimSubmittedEvent(claim: {
  readonly id: string;
  readonly reportId: string;
  readonly claimantId: string;
  readonly reason: { readonly value: string };
  readonly identifyingDetails: { readonly value: string };
  readonly dateLost: { readonly isoDay: string };
}): ClaimSubmitted {
  return {
    type: CLAIM_SUBMITTED_EVENT_TYPE,
    claimId: claim.id,
    reportId: claim.reportId,
    claimantId: claim.claimantId,
    payload: {
      reason: claim.reason.value,
      identifyingDetails: claim.identifyingDetails.value,
      dateLost: claim.dateLost.isoDay,
    },
  };
}
