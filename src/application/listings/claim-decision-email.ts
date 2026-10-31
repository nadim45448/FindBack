/**
 * The FR-29 claim-decision email — the message an approved or rejected
 * claimant receives.
 *
 * **Two different messages, because two different outcomes.** An approval
 * tells the claimant they won the claim; a rejection tells them they did
 * not. The PRD treats them as one email *event* with a varying reason, and
 * this module keeps one builder with two shapes rather than two unrelated
 * templates.
 *
 * **The rejection's copy is the softened copy, not the stored reason.**
 * Story 006: for the approval trigger, "the visible copy states that
 * another claim on the same item was approved without the wording 'another
 * claim was approved for this item' appearing verbatim". The stored reason
 * is verbatim; the visible copy is not. The two live in separate modules
 * and the mapping between them is explicit.
 *
 * **An administrator's own rejection carries the administrator's reason.**
 * The softening rule is about the *auto*-rejection: the member did nothing
 * wrong when another claim won or when the report ended. An administrator
 * who rejected a claim gave a reason the claimant is entitled to read, and
 * softening it would be softening the accountability, not the blame.
 *
 * **No Sensitive Field is carried.** The email names the claim's reference
 * and the outcome; it does not carry the item's description, the exact
 * place, the reason, or the identifying details. Those are FR-37 Sensitive
 * Fields, and an email is a channel outside the application's access
 * control.
 *
 * **No decision email ever reaches the finder.** Story 003: "no claim
 * decision email of any kind is sent to the finder (reporter) of the Found
 * report". The builder has no way to name the reporter, and the service
 * only ever addresses claimants.
 *
 * Pure — the builder produces a message; the transport sends it.
 */

import {
  autoRejectionCopy,
  autoRejectionText,
  type ClaimAutoRejectionTrigger,
} from '@/domain/listings';

/** The subject line for an approved claim. */
export const CLAIM_APPROVED_SUBJECT = 'Your claim was accepted';

/** The subject line for a rejected claim. */
export const CLAIM_REJECTED_SUBJECT = 'Your claim was not accepted';

/**
 * The plain-text body for an approved claim.
 *
 * **It names no other party and no evidence.** The claimant learns that
 * their claim was accepted and where to find it; they do not learn what
 * anyone else said, because that is another member's FR-37 evidence.
 */
export function claimApprovedTextBody(claimId: string): string {
  return [
    'Your claim was accepted.',
    '',
    `Claim reference: ${claimId}.`,
    '',
    'The administrator reviewing the claims approved your claim.',
    'You can view the claim and its messages from your claims page.',
  ].join('\n');
}

/** The HTML body for an approved claim. */
export function claimApprovedHtmlBody(claimId: string): string {
  return [
    '<p>Your claim was accepted.</p>',
    `<p>Claim reference: ${escapeHtml(claimId)}.</p>`,
    '<p>The administrator reviewing the claims approved your claim.</p>',
    '<p>You can view the claim and its messages from your claims page.</p>',
  ].join('');
}

/**
 * The plain-text body for a rejection the administrator made.
 *
 * **The administrator's reason is carried verbatim.** It is the finding
 * against the claim, the claimant is entitled to it, and softening it would
 * soften the accountability rather than the blame.
 */
export function claimRejectedTextBody(claimId: string, reason: string): string {
  return [
    'Your claim was not accepted.',
    '',
    `Claim reference: ${claimId}.`,
    '',
    `Reason: ${reason}.`,
    '',
    'If you believe this is wrong, contact an administrator and quote your claim reference.',
  ].join('\n');
}

/** The HTML body for a rejection the administrator made. */
export function claimRejectedHtmlBody(claimId: string, reason: string): string {
  return [
    '<p>Your claim was not accepted.</p>',
    `<p>Claim reference: ${escapeHtml(claimId)}.</p>`,
    `<p>Reason: ${escapeHtml(reason)}.</p>`,
    '<p>If you believe this is wrong, contact an administrator and quote your claim reference.</p>',
  ].join('');
}

/**
 * The plain-text body for an auto-rejection.
 *
 * **The softened copy, never the stored reason.** The stored reason is
 * verbatim for the trail; the member reads this.
 */
export function claimAutoRejectedTextBody(
  claimId: string,
  trigger: ClaimAutoRejectionTrigger,
): string {
  return [
    'Your claim was not accepted.',
    '',
    `Claim reference: ${claimId}.`,
    '',
    autoRejectionCopy(trigger).body,
    '',
    autoRejectionCopy(trigger).contactPath,
  ].join('\n');
}

/** The HTML body for an auto-rejection. */
export function claimAutoRejectedHtmlBody(
  claimId: string,
  trigger: ClaimAutoRejectionTrigger,
): string {
  const copy = autoRejectionCopy(trigger);

  return [
    '<p>Your claim was not accepted.</p>',
    `<p>Claim reference: ${escapeHtml(claimId)}.</p>`,
    `<p>${escapeHtml(copy.body)}</p>`,
    `<p>${escapeHtml(copy.contactPath)}</p>`,
  ].join('');
}

/**
 * The email the claim decision service sends.
 *
 * **Three shapes, discriminated by kind** — so a caller cannot build an
 * approval with a rejection's subject, or an auto-rejection without the
 * trigger that produced it.
 */
export type ClaimDecisionEmail =
  | {
      readonly kind: 'Approved';
      readonly to: string;
      readonly subject: string;
      readonly textBody: string;
      readonly htmlBody: string;
    }
  | {
      readonly kind: 'RejectedByAdministrator';
      readonly to: string;
      readonly subject: string;
      readonly textBody: string;
      readonly htmlBody: string;
    }
  | {
      readonly kind: 'AutoRejected';
      readonly to: string;
      readonly subject: string;
      readonly textBody: string;
      readonly htmlBody: string;
    };

/**
 * The email builder the claim decision service depends on.
 *
 * **A port, so the service does not build copy.** The service knows *that*
 * a decision happened and *to whom*; the builder knows what the message
 * says. A test asserts on the message; the service's test asserts that a
 * message was sent to the right address.
 */
export interface ClaimDecisionEmailBuilder {
  /** Build the approval email. */
  buildApproved(recipientEmail: string, claimId: string): ClaimDecisionEmail;

  /** Build the administrator's rejection email. */
  buildRejected(
    recipientEmail: string,
    claimId: string,
    reason: string,
  ): ClaimDecisionEmail;

  /** Build the auto-rejection email. */
  buildAutoRejected(
    recipientEmail: string,
    claimId: string,
    trigger: ClaimAutoRejectionTrigger,
  ): ClaimDecisionEmail;
}

/** The default claim-decision email builder. */
export class DefaultClaimDecisionEmailBuilder implements ClaimDecisionEmailBuilder {
  buildApproved(recipientEmail: string, claimId: string): ClaimDecisionEmail {
    return {
      kind: 'Approved',
      to: recipientEmail,
      subject: CLAIM_APPROVED_SUBJECT,
      textBody: claimApprovedTextBody(claimId),
      htmlBody: claimApprovedHtmlBody(claimId),
    };
  }

  buildRejected(
    recipientEmail: string,
    claimId: string,
    reason: string,
  ): ClaimDecisionEmail {
    return {
      kind: 'RejectedByAdministrator',
      to: recipientEmail,
      subject: CLAIM_REJECTED_SUBJECT,
      textBody: claimRejectedTextBody(claimId, reason),
      htmlBody: claimRejectedHtmlBody(claimId, reason),
    };
  }

  buildAutoRejected(
    recipientEmail: string,
    claimId: string,
    trigger: ClaimAutoRejectionTrigger,
  ): ClaimDecisionEmail {
    return {
      kind: 'AutoRejected',
      to: recipientEmail,
      // **The same subject for every auto-rejection trigger.** A subject
      // that changed with the trigger would make the trigger visible to the
      // recipient in a way the UX does not intend — and the withdrawal's
      // rejection email already uses it.
      subject: CLAIM_REJECTED_SUBJECT,
      textBody: claimAutoRejectedTextBody(claimId, trigger),
      htmlBody: claimAutoRejectedHtmlBody(claimId, trigger),
    };
  }
}

/**
 * The softened copy as plain text, re-exported for the email's callers.
 */
export { autoRejectionText };

/**
 * Escape the characters that carry meaning in HTML.
 *
 * **The reason and the claim's reference are administrator- or
 * system-supplied free text**, and they go into an HTML body. Without
 * escaping, a reason containing `<` could inject markup into the
 * recipient's client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
