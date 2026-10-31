/**
 * The Lost-side notification events — FR-46's events 4 through 8.
 *
 * **This module is the complete, closed catalogue of the five Lost-side
 * email events.** The PRD's FR-46 table names them, their recipients, and
 * their triggers, and this module names them in code so that no caller can
 * invent a ninth event, address an event to the wrong recipient, or fire
 * one under the wrong condition.
 *
 * ## The eight-event set is closed
 *
 * **FR-30 forbids unsupported channels and events.** FindBack supports
 * exactly eight business/workflow emails — three Found-side (FR-27, FR-28,
 * FR-29) and these five — plus the separate FR-51 authentication email,
 * which is not a ninth. There is no in-app notification stream, no push, and
 * no SMS.
 *
 * The catalogue here is **closed**: every event the product may send on the
 * Lost side is a member of it, and the recipient of each is a member of the
 * same table. A caller that wanted a sixth Lost-side event could not name
 * it.
 *
 * ## Event 8's gate is deliberately narrow
 *
 * **Event 8 fires only when the response has reached `Completed — Report
 * Returned` AND the report has reached `Returned`.** The PRD's table says
 * the trigger is "The Recovery Response transitions `Match Confirmed →
 * Completed — Report Returned` AND the Lost report transitions
 * `Verification Pending → Returned` (in the same transaction). The email
 * fires only at this transition. It does NOT fire when Match Confirmed is
 * initially recorded."
 *
 * That last sentence is the whole point. **Firing event 8 at `Match
 * Confirmed` would tell a responder their recovery had succeeded before the
 * item had actually been handed over** — and the handoff can still fail, or
 * be cancelled exceptionally. The two conditions are a conjunction, and this
 * module refuses a dispatch where only one of them holds.
 *
 * ## Standby and resolved responders receive nothing
 *
 * **Only the matched responder receives event 8.** A standby response — one
 * still `Submitted` while another is selected — is not a match; a resolved
 * response has already ended. Neither is the recipient of a "your recovery
 * completed" message, and the recipient rule below is a lookup rather than a
 * filter, so a caller that passes the wrong response id gets a refusal
 * rather than a misaddressed message.
 *
 * Pure — no I/O, no framework imports.
 */

import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * The five Lost-side notification events, numbered as the PRD numbers them.
 *
 * **Events 1–3 are the Found side** and are not named here — this is the
 * Lost-side catalogue, and the eight-event set is closed without it.
 */
export const LOST_SIDE_NOTIFICATION_EVENTS = [
  /** A Recovery Response arrived on the owner's Lost report. */
  'new_recovery_response',
  /** The owner's selection reached the responder. */
  'selected_for_verification',
  /** The owner determined the response was not a match. */
  'verification_failed',
  /** The Lost report was returned successfully. */
  'lost_report_returned',
  /** The responder's recovery completed successfully. */
  'recovery_completed',
] as const;

/** A Lost-side notification event. */
export type LostSideNotificationEvent = (typeof LOST_SIDE_NOTIFICATION_EVENTS)[number];

/**
 * The FR-46 event numbers.
 *
 * **The PRD's own numbering,** so that the number and the event can be
 * quoted together — the PRD's table, the audit trail, and the tests all
 * speak in these numbers.
 */
export const LOST_SIDE_NOTIFICATION_EVENT_NUMBERS: Readonly<
  Record<LostSideNotificationEvent, number>
> = Object.freeze({
  new_recovery_response: 4,
  selected_for_verification: 5,
  verification_failed: 6,
  lost_report_returned: 7,
  recovery_completed: 8,
});

/** Who a Lost-side notification event is addressed to. */
export type LostSideNotificationRecipient =
  /** The Lost-report owner — the person who reported the item. */
  | 'lost_report_owner'
  /** The responder whose own Recovery Response is the subject. */
  | 'matched_responder';

/**
 * The recipient of each event.
 *
 * **The PRD's notification table, verbatim.** Event 6 is addressed to "the
 * responder whose response just transitioned to `Not a Match`" — which is
 * the matched responder, because only the selected response can be
 * determined.
 */
export const LOST_SIDE_NOTIFICATION_RECIPIENTS: Readonly<
  Record<LostSideNotificationEvent, LostSideNotificationRecipient>
> = Object.freeze({
  new_recovery_response: 'lost_report_owner',
  selected_for_verification: 'matched_responder',
  verification_failed: 'matched_responder',
  lost_report_returned: 'lost_report_owner',
  recovery_completed: 'matched_responder',
});

/**
 * The conditions each event fires under.
 *
 * **Stated as data rather than as prose,** so that a caller's gate and this
 * table cannot disagree: a caller asks `mayNotify` and the answer comes
 * from here.
 */
export interface NotificationGate {
  /**
   * Whether the parent report must have reached `Returned`.
   *
   * **Only event 8 requires it.** Events 4, 5, 6, and 7 fire while the
   * report is still active — event 7 fires *because* the report just reached
   * `Returned`, but the report's own reach is the trigger, not a gate.
   */
  readonly requiresReportReturned: boolean;
  /**
   * The status the responder's own response must hold.
   *
   * **`null` when the event is not addressed to the responder** — events 4
   * and 7 go to the owner and say nothing about a response's status.
   */
  readonly requiresResponseStatus: RecoveryResponseStatus | null;
}

/**
 * The gate of each event.
 *
 * **Event 8's gate is the conjunction the PRD names:** the response is
 * `Completed — Report Returned` *and* the report is `Returned`. Event 6's
 * gate is the response's own `Not a Match`. Event 5's is the response's
 * `Selected for Verification`.
 */
export const LOST_SIDE_NOTIFICATION_GATES: Readonly<
  Record<LostSideNotificationEvent, NotificationGate>
> = Object.freeze({
  new_recovery_response: {
    requiresReportReturned: false,
    requiresResponseStatus: null,
  },
  selected_for_verification: {
    requiresReportReturned: false,
    requiresResponseStatus: 'Selected for Verification',
  },
  verification_failed: {
    requiresReportReturned: false,
    requiresResponseStatus: 'Not a Match',
  },
  lost_report_returned: {
    requiresReportReturned: false,
    requiresResponseStatus: null,
  },
  recovery_completed: {
    // **The report must be `Returned`.** Without this, event 8 could fire at
    // `Match Confirmed`.
    requiresReportReturned: true,
    // **And the response must be `Completed — Report Returned`.** Without
    // this, event 8 could fire for a standby or a resolved response.
    requiresResponseStatus: 'Completed — Report Returned',
  },
});

/** The facts a notification's gate is evaluated against. */
export interface NotificationFacts {
  /** The event being considered. */
  readonly event: LostSideNotificationEvent;
  /** The parent report's status. */
  readonly reportStatus: string;
  /**
   * The responder's own response status.
   *
   * **`null` when the event is not addressed to the responder** — events 4
   * and 7 say nothing about a response.
   */
  readonly responseStatus: RecoveryResponseStatus | null;
}

/** Why a notification was refused. */
export type NotificationRefusal =
  /** The report has not reached the status the event's gate requires. */
  | 'ReportStatusGateNotMet'
  /** The response has not reached the status the event's gate requires. */
  | 'ResponseStatusGateNotMet';

/** The outcome of evaluating a notification's gate. */
export type NotificationDecision =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Refused'; readonly reason: NotificationRefusal };

/**
 * Evaluate a notification event's gate.
 *
 * **The conjunction, checked in order.** The report's condition is checked
 * first, because it is the coarser one and the refusal it produces is the
 * more informative: "the report has not been returned" explains why event 8
 * did not fire far better than "the response is not completed" does.
 */
export function decideNotification(facts: NotificationFacts): NotificationDecision {
  const gate = LOST_SIDE_NOTIFICATION_GATES[facts.event];

  if (gate.requiresReportReturned && facts.reportStatus !== 'Returned') {
    return { kind: 'Refused', reason: 'ReportStatusGateNotMet' };
  }

  if (
    gate.requiresResponseStatus !== null &&
    facts.responseStatus !== gate.requiresResponseStatus
  ) {
    return { kind: 'Refused', reason: 'ResponseStatusGateNotMet' };
  }

  return { kind: 'Permitted' };
}

/**
 * The recipient of an event.
 *
 * **A lookup, not a filter.** The caller is given the recipient kind and
 * resolves the address; this module decides *which* recipient kind, and
 * that is not negotiable per call.
 */
export function notificationRecipient(
  event: LostSideNotificationEvent,
): LostSideNotificationRecipient {
  return LOST_SIDE_NOTIFICATION_RECIPIENTS[event];
}

/**
 * The FR-46 number of an event.
 *
 * **The PRD's own numbering**, so the number can be quoted in the trail and
 * in the tests without a second table to keep in step.
 */
export function notificationEventNumber(event: LostSideNotificationEvent): number {
  return LOST_SIDE_NOTIFICATION_EVENT_NUMBERS[event];
}

/**
 * The event whose number is `number`, or `undefined`.
 *
 * **The reverse lookup,** for a caller reading a number from the PRD.
 */
export function notificationEventForNumber(
  number: number,
): LostSideNotificationEvent | undefined {
  return LOST_SIDE_NOTIFICATION_EVENTS.find(
    (event) => LOST_SIDE_NOTIFICATION_EVENT_NUMBERS[event] === number,
  );
}
