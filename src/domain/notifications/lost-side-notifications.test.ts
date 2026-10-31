/**
 * The Lost-side notification events' suite.
 *
 * **The catalogue is closed, and the gate is the PRD's conjunction.** Two
 * properties carry this module:
 *
 * 1. **Event 8 fires only at the completed handoff.** Its gate is the
 *    conjunction the PRD names — the response is `Completed — Report
 *    Returned` *and* the report is `Returned`. Firing it at `Match
 *    Confirmed` would tell a responder their recovery had succeeded before
 *    the item had been handed over, and the handoff can still fail or be
 *    cancelled exceptionally.
 * 2. **The recipient is a lookup, not a filter.** A caller cannot address
 *    an event to the wrong recipient, and a standby responder is never the
 *    recipient of a "your recovery completed" message.
 */

import { describe, expect, it } from 'vitest';

import {
  LOST_SIDE_NOTIFICATION_EVENTS,
  LOST_SIDE_NOTIFICATION_EVENT_NUMBERS,
  LOST_SIDE_NOTIFICATION_GATES,
  LOST_SIDE_NOTIFICATION_RECIPIENTS,
  decideNotification,
  notificationEventForNumber,
  notificationEventNumber,
  notificationRecipient,
  type LostSideNotificationEvent,
} from './lost-side-notifications';

// ── The catalogue ───────────────────────────────────────────────────────────

describe('the Lost-side notification events — the catalogue', () => {
  it('names exactly the five Lost-side events', () => {
    // **FR-30 forbids unsupported events.** The eight-event set is closed —
    // three Found-side and these five — and a sixth Lost-side event could
    // not be named.
    expect(LOST_SIDE_NOTIFICATION_EVENTS).toEqual([
      'new_recovery_response',
      'selected_for_verification',
      'verification_failed',
      'lost_report_returned',
      'recovery_completed',
    ]);
  });

  it('numbers the events as the PRD numbers them', () => {
    expect(LOST_SIDE_NOTIFICATION_EVENT_NUMBERS).toEqual({
      new_recovery_response: 4,
      selected_for_verification: 5,
      verification_failed: 6,
      lost_report_returned: 7,
      recovery_completed: 8,
    });
  });

  it('gives every event a number', () => {
    for (const event of LOST_SIDE_NOTIFICATION_EVENTS) {
      expect(notificationEventNumber(event)).toBeGreaterThanOrEqual(4);
      expect(notificationEventNumber(event)).toBeLessThanOrEqual(8);
    }
  });

  it('reverses the number back to the event', () => {
    for (const event of LOST_SIDE_NOTIFICATION_EVENTS) {
      expect(notificationEventForNumber(notificationEventNumber(event))).toBe(event);
    }
  });

  it('finds nothing for a number outside the catalogue', () => {
    // **The PRD's events 1–3 are the Found side,** and they are not
    // Lost-side events — so the reverse lookup must not invent one.
    expect(notificationEventForNumber(1)).toBeUndefined();
    expect(notificationEventForNumber(9)).toBeUndefined();
  });

  it('gives every event a gate', () => {
    for (const event of LOST_SIDE_NOTIFICATION_EVENTS) {
      expect(LOST_SIDE_NOTIFICATION_GATES[event]).toBeDefined();
    }
  });

  it('gives every event a recipient', () => {
    for (const event of LOST_SIDE_NOTIFICATION_EVENTS) {
      expect(notificationRecipient(event)).toBeDefined();
    }
  });
});

// ── The recipients ──────────────────────────────────────────────────────────

describe('the Lost-side notification events — the recipients', () => {
  it('addresses the owner\'s events to the owner', () => {
    // **Events 4 and 7 are the owner's.** Event 4 tells the owner a response
    // arrived on their report; event 7 tells them their item came home.
    expect(notificationRecipient('new_recovery_response')).toBe('lost_report_owner');
    expect(notificationRecipient('lost_report_returned')).toBe('lost_report_owner');
  });

  it('addresses the responder\'s events to the responder', () => {
    // **Events 5, 6, and 8 concern the responder's own response.**
    expect(notificationRecipient('selected_for_verification')).toBe('matched_responder');
    expect(notificationRecipient('verification_failed')).toBe('matched_responder');
    expect(notificationRecipient('recovery_completed')).toBe('matched_responder');
  });

  it('names every recipient in the table', () => {
    expect(Object.keys(LOST_SIDE_NOTIFICATION_RECIPIENTS).sort()).toEqual(
      [...LOST_SIDE_NOTIFICATION_EVENTS].sort(),
    );
  });
});

// ── The gates that are not event 8 ──────────────────────────────────────────

describe('the Lost-side notification events — the ungated events', () => {
  it('permits event 4 while the report is still open', () => {
    const decision = decideNotification({
      event: 'new_recovery_response',
      reportStatus: 'Verification Pending',
      responseStatus: 'Submitted',
    });

    expect(decision.kind).toBe('Permitted');
  });

  it('permits event 5 when the response is selected', () => {
    const decision = decideNotification({
      event: 'selected_for_verification',
      reportStatus: 'Verification Pending',
      responseStatus: 'Selected for Verification',
    });

    expect(decision.kind).toBe('Permitted');
  });

  it('refuses event 5 when the response is not selected', () => {
    const decision = decideNotification({
      event: 'selected_for_verification',
      reportStatus: 'Verification Pending',
      responseStatus: 'Submitted',
    });

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe(
      'ResponseStatusGateNotMet',
    );
  });

  it('permits event 6 when the response is not a match', () => {
    const decision = decideNotification({
      event: 'verification_failed',
      reportStatus: 'Verification Pending',
      responseStatus: 'Not a Match',
    });

    expect(decision.kind).toBe('Permitted');
  });

  it('refuses event 6 when the response is still selected', () => {
    const decision = decideNotification({
      event: 'verification_failed',
      reportStatus: 'Verification Pending',
      responseStatus: 'Selected for Verification',
    });

    expect(decision.kind).toBe('Refused');
  });

  it('permits event 7 when the report has returned', () => {
    const decision = decideNotification({
      event: 'lost_report_returned',
      reportStatus: 'Returned',
      responseStatus: null,
    });

    expect(decision.kind).toBe('Permitted');
  });
});

// ── Event 8's gate ──────────────────────────────────────────────────────────

describe('the Lost-side notification events — event 8\'s gate', () => {
  it('permits event 8 when the response is completed and the report is returned', () => {
    // **The PRD's conjunction, both halves holding.**
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: 'Completed — Report Returned',
    });

    expect(decision.kind).toBe('Permitted');
  });

  it('refuses event 8 at match confirmed', () => {
    // **The PRD says it explicitly: "It does NOT fire when Match Confirmed
    // is initially recorded."** Firing here would tell a responder their
    // recovery had succeeded before the item had been handed over.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: 'Match Confirmed',
    });

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe(
      'ResponseStatusGateNotMet',
    );
  });

  it('refuses event 8 when the report has not returned', () => {
    // **Both halves of the conjunction are required.** The response alone
    // does not carry the event.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Verification Pending',
      responseStatus: 'Completed — Report Returned',
    });

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe(
      'ReportStatusGateNotMet',
    );
  });

  it('refuses event 8 for a standby responder', () => {
    // **A standby response is not a match.** A responder whose response is
    // still `Submitted` while another is selected has no completed
    // recovery, and must not be told otherwise.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: 'Submitted',
    });

    expect(decision.kind).toBe('Refused');
  });

  it('refuses event 8 for a resolved responder', () => {
    // **A resolved response has already ended.** Rewriting its outcome in a
    // message would mis-record what happened to it.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: 'Resolved — Report Returned',
    });

    expect(decision.kind).toBe('Refused');
  });

  it('refuses event 8 when the response status is missing', () => {
    // **A missing status is not a satisfied status.** The gate is evaluated,
    // never assumed.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: null,
    });

    expect(decision.kind).toBe('Refused');
  });

  it('is the only event that requires the report to have returned', () => {
    const requiring = LOST_SIDE_NOTIFICATION_EVENTS.filter(
      (event) => LOST_SIDE_NOTIFICATION_GATES[event].requiresReportReturned,
    );

    expect(requiring).toEqual(['recovery_completed']);
  });
});

// ── The gate's evaluation order ─────────────────────────────────────────────

describe('the Lost-side notification events — the gate\'s order', () => {
  it('reports the report\'s condition first when both fail', () => {
    // **The report's condition is the coarser one,** and its refusal explains
    // the absence far better than the response's does.
    const decision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Verification Pending',
      responseStatus: 'Submitted',
    });

    expect(decision.kind === 'Refused' && decision.reason).toBe('ReportStatusGateNotMet');
  });

  it('permits an event whose gate needs no response status', () => {
    const decision = decideNotification({
      event: 'new_recovery_response' as LostSideNotificationEvent,
      reportStatus: 'Open',
      responseStatus: null,
    });

    expect(decision.kind).toBe('Permitted');
  });
});
