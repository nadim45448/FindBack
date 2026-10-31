/**
 * The Lost-side notification dispatcher's suite.
 *
 * **Three properties carry the dispatcher:**
 *
 * 1. **The recipient's address and the item's name travel in.** The
 *    dispatcher does not go back to the database — a dispatcher that did
 *    would read them at a later moment, after the commit, when the response
 *    set could have moved on.
 * 2. **The item's name is escaped.** A name carrying markup must not become
 *    markup in an email body.
 * 3. **A send failure never propagates.** PRD §10: an email send failure is
 *    logged and never rolls back or blocks the action that triggered it. The
 *    dispatcher returns a boolean — *was it sent* — and the caller records
 *    that without treating a `false` as an error.
 *
 * **The dispatcher refuses an event it does not own.** Events 4 and 6 belong
 * to the Recovery Response workflow's own senders (ADR-14), so they are
 * refused rather than sent with the wrong content.
 */

import { describe, expect, it } from 'vitest';

import type { OutboundEmail } from '@/application/ports/email-sender';

import { DefaultLostSideNotificationDispatcher } from './lost-side-notification-dispatcher';

// ── The harness ─────────────────────────────────────────────────────────────

/** The base URL the deployment serves from. */
const BASE_URL = 'https://findback.example.test';

/** The item's name. */
const ITEM_NAME = 'A set of house keys';

/** The report the event is about. */
const REPORT_ID = '00000000-0000-4000-8000-000000000801';

/** The response the event is about. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000802';

/**
 * A recording fake of the `EmailSender`.
 */
class Harness {
  readonly sent: OutboundEmail[] = [];

  /** When the transport fails. */
  failure: Error | null = null;

  readonly dispatcher = new DefaultLostSideNotificationDispatcher(
    {
      send: async (message: OutboundEmail): Promise<void> => {
        this.sent.push(message);

        if (this.failure !== null) {
          throw this.failure;
        }
      },
    },
    { value: BASE_URL },
  );
}

// ── The routing ─────────────────────────────────────────────────────────────

describe('the Lost-side notification dispatcher — the routing', () => {
  it('sends event 5 to the responder with the subject the PRD names', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'selected_for_verification',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    expect(harness.sent[0]?.to).toBe('responder@example.test');
    expect(harness.sent[0]?.subject).toBe(
      'Your recovery response was selected for verification',
    );
  });

  it('sends event 7 to the owner with the subject the PRD names', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: ITEM_NAME,
    });

    expect(harness.sent[0]?.to).toBe('owner@example.test');
    expect(harness.sent[0]?.subject).toBe('Your lost item has been returned');
  });

  it('sends event 8 to the responder with the subject the PRD names', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'recovery_completed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    expect(harness.sent[0]?.to).toBe('responder@example.test');
    expect(harness.sent[0]?.subject).toBe(
      'Your recovery is complete — the item was returned',
    );
  });

  it('points the owner at their report', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: ITEM_NAME,
    });

    // **The link points at the surface the recipient actually uses.** FR-39
    // grants the owner their report in *My Reports*.
    expect(harness.sent[0]?.textBody).toContain(`${BASE_URL}/my-reports/${REPORT_ID}`);
  });

  it('points the responder at their own response', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'recovery_completed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    expect(harness.sent[0]?.textBody).toContain(
      `${BASE_URL}/my-recovery-responses/${RESPONSE_ID}`,
    );
  });

  it('falls back to the report when a responder event names no response', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'recovery_completed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: ITEM_NAME,
    });

    // **The link needs an id, and the report's is always present.** A
    // responder event that names no response still points at a real surface
    // — the report — rather than at a link with an empty segment in it.
    expect(harness.sent[0]?.textBody).toContain(
      `${BASE_URL}/my-recovery-responses/${REPORT_ID}`,
    );
  });

  it('refuses event 4, which belongs to the Recovery Response workflow', async () => {
    const harness = new Harness();

    const sent = await harness.dispatcher.dispatch({
      event: 'new_recovery_response',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    // **An event this dispatcher does not own is refused, not sent with the
    // wrong content.** ADR-14 gives the trigger's module ownership of its
    // email's content.
    expect(sent).toBe(false);
    expect(harness.sent).toEqual([]);
  });

  it('refuses event 6, which belongs to the Recovery Response workflow', async () => {
    const harness = new Harness();

    const sent = await harness.dispatcher.dispatch({
      event: 'verification_failed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    expect(sent).toBe(false);
    expect(harness.sent).toEqual([]);
  });
});

// ── The escaping ────────────────────────────────────────────────────────────

describe('the Lost-side notification dispatcher — the escaping', () => {
  it('escapes a name carrying markup', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: '<script>alert("x")</script>',
    });

    // **The item's name is member-supplied,** and a name carrying markup
    // must not become markup in an email body.
    expect(harness.sent[0]?.htmlBody).not.toContain('<script>');
    expect(harness.sent[0]?.htmlBody).toContain('&lt;script&gt;');
  });

  it('keeps the name verbatim in the plain-text body', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: '<b>A set of keys</b>',
    });

    // **The plain-text body is text.** The escaping is the HTML body's
    // concern, and the text body is not markup.
    expect(harness.sent[0]?.textBody).toContain('<b>A set of keys</b>');
  });
});

// ── The content boundary ────────────────────────────────────────────────────

describe('the Lost-side notification dispatcher — the content boundary', () => {
  it('carries no Sensitive Field', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'recovery_completed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    // **The responder is told their recovery completed** — they are not told
    // where the item was found, what they had observed, or anything about
    // the other responses on the report.
    const body = harness.sent[0]!.textBody + harness.sent[0]!.htmlBody;

    expect(body).not.toContain('whereFound');
    expect(body).not.toContain('observedIdentifyingDetails');
    expect(body).not.toContain('exactPlace');
    expect(body).not.toContain('identifyingDetails');
  });

  it('names no other responder', async () => {
    const harness = new Harness();

    await harness.dispatcher.dispatch({
      event: 'recovery_completed',
      recipientId: RESPONSE_ID,
      recipientEmail: 'responder@example.test',
      reportId: REPORT_ID,
      responseId: RESPONSE_ID,
      itemName: ITEM_NAME,
    });

    expect(harness.sent[0]?.textBody).not.toContain('other responder');
    expect(harness.sent[0]?.textBody).not.toContain('standby');
  });
});

// ── The failure ─────────────────────────────────────────────────────────────

describe('the Lost-side notification dispatcher — the failure', () => {
  it('reports a send failure as not sent, and does not throw', async () => {
    const harness = new Harness();
    harness.failure = new Error('The transport is down.');

    const sent = await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: ITEM_NAME,
    });

    // **A send failure never propagates.** The transition that triggered it
    // has already committed and stands.
    expect(sent).toBe(false);
  });

  it('reports a successful send as sent', async () => {
    const harness = new Harness();

    const sent = await harness.dispatcher.dispatch({
      event: 'lost_report_returned',
      recipientId: 'owner-1',
      recipientEmail: 'owner@example.test',
      reportId: REPORT_ID,
      responseId: null,
      itemName: ITEM_NAME,
    });

    expect(sent).toBe(true);
  });
});
