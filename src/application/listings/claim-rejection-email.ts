/**
 * The FR-29 claim-rejection email — the message a withdrawn report's
 * claimants receive.
 *
 * **The reason travels with the message.** FR-29 says a rejection email
 * carries a brief reason, and the reason for a withdrawal's rejection is
 * "report withdrawn by reporter" (FR-11). The same builder serves the
 * administrator's rejection and the auto-rejection's other two triggers
 * (FR-17's "another claim was approved for this item" and FR-21's "report
 * closed by administrator"), because the PRD treats them as one email event
 * with a varying reason.
 *
 * **The copy is plain and carries no blame** (EXPERIENCE.md §4.9). The
 * claimant did nothing wrong: the person who found the item withdrew their
 * report, and the claim ends because the report does. The message says that,
 * without apologising or assigning fault.
 *
 * **No Sensitive Field is carried.** The email names the claim's reference
 * and the reason; it does not carry the item's description, the exact place,
 * or the identifying details. Those are FR-37 Sensitive Fields, and an email
 * is a channel outside the application's access control.
 *
 * Pure — the builder produces a message; the transport sends it.
 */

import type { ClaimRejectionEmailBuilder } from './report-withdrawal-service';

/**
 * The subject line for a claim-rejection email.
 *
 * **The same subject for every rejection trigger.** The PRD treats these as
 * one event with a varying reason, and a subject that changed with the
 * reason would make the trigger visible to the recipient in a way the UX
 * does not intend.
 */
export const CLAIM_REJECTION_SUBJECT = 'Your claim was not accepted';

/**
 * The plain-text body for a claim-rejection email.
 *
 * @param reason the brief reason the PRD names
 */
export function claimRejectionTextBody(reason: string): string {
  return [
    'Your claim was not accepted.',
    '',
    `Reason: ${reason}.`,
    '',
    'The report this claim was made against is no longer active.',
    'Any messages you have sent on the claim thread remain available to read.',
  ].join('\n');
}

/**
 * The HTML body for a claim-rejection email.
 *
 * **The same content as the plain-text body, in the same order.** A
 * recipient whose client does not render HTML must read the same facts, and
 * an HTML body that carries more than the text body is a divergence waiting
 * to happen.
 */
export function claimRejectionHtmlBody(reason: string): string {
  const escaped = escapeHtml(reason);

  return [
    '<p>Your claim was not accepted.</p>',
    `<p>Reason: ${escaped}.</p>`,
    '<p>The report this claim was made against is no longer active.</p>',
    '<p>Any messages you have sent on the claim thread remain available to read.</p>',
  ].join('');
}

/** The application-layer claim-rejection email builder. */
export class DefaultClaimRejectionEmailBuilder implements ClaimRejectionEmailBuilder {
  build(
    recipientEmail: string,
    _claimId: string,
    reason: string,
  ): { readonly to: string; readonly subject: string; readonly textBody: string; readonly htmlBody: string } {
    return {
      to: recipientEmail,
      subject: CLAIM_REJECTION_SUBJECT,
      textBody: claimRejectionTextBody(reason),
      htmlBody: claimRejectionHtmlBody(reason),
    };
  }
}

/**
 * Escape the characters that carry meaning in HTML.
 *
 * **The reason is administrator- or system-supplied free text**, and it goes
 * into an HTML body. Without escaping, a reason containing `<` could inject
 * markup into the recipient's client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
