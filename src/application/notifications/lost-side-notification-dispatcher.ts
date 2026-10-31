/**
 * The Lost-side notification dispatcher — the one place a Lost-side email is
 * sent from.
 *
 * **A dispatcher, not a sender.** The `EmailSender` port can send a message;
 * it does not know which message. This implementation knows:
 *
 * - which builder produces each event's content;
 * - that the sender's failure is logged and swallowed.
 *
 * **The recipient's address and the item's name travel in,** read by the
 * caller from the same rows it wrote. A dispatcher that went back to the
 * database would read them at a later moment — after the commit, when the
 * response set could have moved on.
 *
 * **The item's name is a member-supplied string and is escaped.** The
 * builders escape it; a name carrying markup must not become markup in an
 * email body.
 *
 * **A send failure never propagates.** PRD §10: an email send failure is
 * logged and never rolls back or blocks the action that triggered it. The
 * dispatcher returns a boolean — *was it sent* — and the caller records that
 * without treating a `false` as an error.
 *
 * **Events 4 and 6 are not sent from here.** Their triggers live in the
 * Recovery Response workflow, and ADR-14 gives the trigger's module
 * ownership of its email's content. This dispatcher sends the three events
 * whose triggers belong to the terminal transitions — 5, 7, and 8 — and it
 * refuses an event it does not own rather than sending it with the wrong
 * content.
 */

import type { EmailSender } from '@/application/ports/email-sender';

import type { LostSideNotificationEvent } from '@/domain/notifications';

import {
  LOST_REPORT_RETURNED_SUBJECT,
  RECOVERY_COMPLETED_SUBJECT,
  SELECTED_FOR_VERIFICATION_SUBJECT,
  lostReportReturnedHtmlBody,
  lostReportReturnedTextBody,
  recoveryCompletedHtmlBody,
  recoveryCompletedTextBody,
  selectedForVerificationHtmlBody,
  selectedForVerificationTextBody,
  type BuiltEmail,
} from './lost-side-email-builders';

/** What the dispatcher is asked to send. */
export interface LostSideNotificationRequest {
  /** Which FR-46 event this is. */
  readonly event: LostSideNotificationEvent;
  /** The recipient's account id. */
  readonly recipientId: string;
  /** The recipient's deliverable address. */
  readonly recipientEmail: string;
  /** The report the event is about. */
  readonly reportId: string;
  /** The response the event is about, or `null`. */
  readonly responseId: string | null;
  /** The report's name — the item's name. */
  readonly itemName: string;
}

/**
 * Sends the Lost-side notification events.
 */
export interface LostSideNotificationDispatcher {
  /**
   * Send one Lost-side notification.
   *
   * @returns `true` when the message was handed to the transport, and
   * `false` when the send failed. **A `false` is not an error** — the
   * transition that triggered it has already committed and stands.
   */
  dispatch(request: LostSideNotificationRequest): Promise<boolean>;
}

/** The base URL the deployment serves the application from. */
export interface NotificationBaseUrl {
  /** The origin, without a trailing slash. */
  readonly value: string;
}

/**
 * The dispatcher.
 */
export class DefaultLostSideNotificationDispatcher
  implements LostSideNotificationDispatcher
{
  constructor(
    private readonly emails: EmailSender,
    private readonly baseUrl: NotificationBaseUrl,
  ) {}

  async dispatch(request: LostSideNotificationRequest): Promise<boolean> {
    // ── The event's own path ───────────────────────────────────────────────
    //
    // **The link points at the surface the recipient actually uses.** The
    // owner reads the report from *My Reports*; the responder reads their own
    // response from *My Recovery Responses*. FR-39 grants each of them
    // exactly those views, and the link needs only the id.
    const reportPath =
      request.event === 'lost_report_returned'
        ? `${this.baseUrl.value}/my-reports/${request.reportId}`
        : `${this.baseUrl.value}/my-recovery-responses/${request.responseId ?? request.reportId}`;

    const message = this.build(request, reportPath);

    if (message === null) {
      // **An event this dispatcher does not own is refused, not sent with
      // the wrong content.** Events 4 and 6 belong to the Recovery Response
      // workflow's own senders.
      return false;
    }

    try {
      await this.emails.send(message);
      return true;
    } catch {
      // **A send failure never fails the transition.** PRD §10. The failure
      // is recorded by the transport; the report is already `Returned` and
      // the response is already completed.
      return false;
    }
  }

  /**
   * Build the message for an event, or `null` when this dispatcher does not
   * own the event.
   */
  private build(
    request: LostSideNotificationRequest,
    reportPath: string,
  ): BuiltEmail | null {
    switch (request.event) {
      case 'selected_for_verification':
        return {
          to: request.recipientEmail,
          subject: SELECTED_FOR_VERIFICATION_SUBJECT,
          textBody: selectedForVerificationTextBody(request.itemName, reportPath),
          htmlBody: selectedForVerificationHtmlBody(request.itemName, reportPath),
        };

      case 'lost_report_returned':
        return {
          to: request.recipientEmail,
          subject: LOST_REPORT_RETURNED_SUBJECT,
          textBody: lostReportReturnedTextBody(request.itemName, reportPath),
          htmlBody: lostReportReturnedHtmlBody(request.itemName, reportPath),
        };

      case 'recovery_completed':
        return {
          to: request.recipientEmail,
          subject: RECOVERY_COMPLETED_SUBJECT,
          textBody: recoveryCompletedTextBody(request.itemName, reportPath),
          htmlBody: recoveryCompletedHtmlBody(request.itemName, reportPath),
        };

      // **Events 4 and 6 are owned by the Recovery Response workflow.**
      default:
        return null;
    }
  }
}
