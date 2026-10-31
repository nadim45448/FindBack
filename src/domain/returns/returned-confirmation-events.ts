/**
 * The four Returned-confirmation events — catalog events 6, 7, 21, and 22.
 *
 * **All four already exist in the frozen catalog, so this module adds no
 * event and no event number.** The catalog's guarantee is structural: ADR-9
 * froze the numbering, and the four types are already there.
 *
 * | Event | Direction | Type |
 * |---|---|---|
 * | 6 | Found, default receiver | `returned.confirmed_default_receiver` |
 * | 7 | Found, substitute receiver | `returned.confirmed_substitute_receiver` |
 * | 21 | Lost, default receiver | `returned.confirmed_lost_default_receiver` |
 * | 22 | Lost, substitute receiver | `returned.confirmed_lost_substitute_receiver` |
 *
 * ## The direction picks the event, and the direction is a fact
 *
 * **A Found report writes event 6 or 7; a Lost report writes event 21 or
 * 22.** The catalog gives the two directions *separate* event types, so the
 * trail can tell a Found handover from a Lost one without reading the
 * parent — and the module's `returnedConfirmationEventType` is the single
 * place that mapping lives.
 *
 * ## The payload is the catalog's, exactly
 *
 * **The default-receiver events carry one field: `receiver`.** That field is
 * the receiver's **account id** — the approved claimant or the Lost-report
 * owner. It is the account, not the name, because the trail's job is to say
 * *who was answerable for the item*, and an account id is the thing the
 * accounts table can still resolve after a rename.
 *
 * **The substitute events carry three fields: `substituteReceiverName`,
 * `authorizationAffirmation`, and `relationship`.** All three are catalog-named
 * Sensitive Fields for those events, which means they appear on the
 * administrator-visible trail only and never in an operational log.
 *
 * **The sanitizer denies by default,** so a field the catalog does not name
 * is *refused* rather than dropped — a silently discarded field is a
 * silently incomplete audit record. The payload types below carry exactly
 * the catalog's fields, and the compiler is the check that they do.
 *
 * ## The receiver id is a Sensitive Field, and it is catalog-named
 *
 * **The catalog names `receiver` as a Sensitive Field for event 6,** so the
 * value is permitted on the trail and barred from the log. The module does
 * not re-derive that; the catalog owns it.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportType } from '@/domain/listings';

import type { SubstituteReceiver } from './substitute-receiver';

/** The catalog type discriminator for event 6. */
export const RETURNED_CONFIRMED_DEFAULT_RECEIVER_EVENT_TYPE =
  'returned.confirmed_default_receiver';

/** The catalog type discriminator for event 7. */
export const RETURNED_CONFIRMED_SUBSTITUTE_RECEIVER_EVENT_TYPE =
  'returned.confirmed_substitute_receiver';

/** The catalog type discriminator for event 21. */
export const RETURNED_CONFIRMED_LOST_DEFAULT_RECEIVER_EVENT_TYPE =
  'returned.confirmed_lost_default_receiver';

/** The catalog type discriminator for event 22. */
export const RETURNED_CONFIRMED_LOST_SUBSTITUTE_RECEIVER_EVENT_TYPE =
  'returned.confirmed_lost_substitute_receiver';

/** Every type this module can produce. */
export const RETURNED_CONFIRMATION_EVENT_TYPES: readonly string[] = Object.freeze([
  RETURNED_CONFIRMED_DEFAULT_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_SUBSTITUTE_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_LOST_DEFAULT_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_LOST_SUBSTITUTE_RECEIVER_EVENT_TYPE,
]);

/**
 * The event type a confirmation writes.
 *
 * **The direction and the receiver's kind together pick the event,** and
 * this function is the single place that mapping lives. Four combinations,
 * four catalog types.
 *
 * @throws {Error} when the report type is not one of the two.
 */
export function returnedConfirmationEventType(input: {
  readonly reportType: ReportType;
  readonly isSubstitute: boolean;
}): string {
  if (input.reportType === 'Found') {
    return input.isSubstitute
      ? RETURNED_CONFIRMED_SUBSTITUTE_RECEIVER_EVENT_TYPE
      : RETURNED_CONFIRMED_DEFAULT_RECEIVER_EVENT_TYPE;
  }

  if (input.reportType === 'Lost') {
    return input.isSubstitute
      ? RETURNED_CONFIRMED_LOST_SUBSTITUTE_RECEIVER_EVENT_TYPE
      : RETURNED_CONFIRMED_LOST_DEFAULT_RECEIVER_EVENT_TYPE;
  }

  throw new Error(
    `"${String(input.reportType)}" is not a report type. This is a defect.`,
  );
}

/**
 * The `ReturnedConfirmedDefaultReceiver` event — catalog events 6 and 21.
 *
 * **The payload carries exactly one field: `receiver`.** The catalog names
 * no other field for either event, so the payload names no other field.
 */
export interface ReturnedConfirmedDefaultReceiver {
  readonly type: string;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    /** The receiver's account id. */
    readonly receiver: string;
  };
}

/**
 * The `ReturnedConfirmedSubstituteReceiver` event — catalog events 7 and 22.
 *
 * **The payload carries exactly the catalog's three fields.**
 */
export interface ReturnedConfirmedSubstituteReceiver {
  readonly type: string;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    readonly substituteReceiverName: string;
    readonly authorizationAffirmation: string;
    readonly relationship: string;
  };
}

/** Either event this module can produce. */
export type ReturnedConfirmationEvent =
  | ReturnedConfirmedDefaultReceiver
  | ReturnedConfirmedSubstituteReceiver;

/**
 * Build the confirmation's audit event.
 *
 * **The administrator is the actor on every one of them.** The confirming
 * administrator is the same person in both directions — the difference is
 * the *report type* and the *receiver's kind*, not who acts.
 *
 * @param receiverAccountId the default receiver's account id. **It is
 * carried on the substitute event too**, because the catalog does not name
 * it there and the substitute event's own parent is the report — but the
 * *authorization* is the default receiver's, and the trail's reader needs
 * to know whose consent it was. **It is not put in the payload**, because
 * the catalog does not name it for events 7 and 22 and the sanitizer would
 * refuse it.
 */
export function buildReturnedConfirmationEvent(input: {
  readonly reportId: string;
  readonly administratorId: string;
  readonly reportType: ReportType;
  readonly defaultReceiverAccountId: string;
  readonly substitute: SubstituteReceiver | null;
}): ReturnedConfirmationEvent {
  const type = returnedConfirmationEventType({
    reportType: input.reportType,
    isSubstitute: input.substitute !== null,
  });

  if (input.substitute !== null) {
    return {
      type,
      reportId: input.reportId,
      administratorId: input.administratorId,
      payload: {
        substituteReceiverName: input.substitute.name.value,
        // **The affirmation is recorded as the catalog's wording.** The
        // catalog's field is `authorizationAffirmation`, and the value is
        // the affirmation itself — the default receiver's consent,
        // recorded by the administrator. FindBack performs no identity
        // verification, so there is no second fact to carry.
        authorizationAffirmation: 'Default receiver authorized the substitute',
        relationship: input.substitute.relationship,
      },
    };
  }

  return {
    type,
    reportId: input.reportId,
    administratorId: input.administratorId,
    payload: { receiver: input.defaultReceiverAccountId },
  };
}
