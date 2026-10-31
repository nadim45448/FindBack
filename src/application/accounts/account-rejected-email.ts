/**
 * The account-rejected email.
 *
 * Sent to the applicant's registered address after an administrator
 * rejects a pending registration. The reason the administrator recorded
 * travels with the message so the applicant knows why.
 *
 * **The send happens after the decision commits.** A failed send never
 * rolls the rejection back.
 */

import type { OutboundEmail } from '@/application/ports/email-sender';

/** The subject line for the account-rejected email. */
export const ACCOUNT_REJECTED_SUBJECT = 'Your FindBack registration was not approved';

/** The FR-3 rejection email's body, as a set of named parts. */
export interface AccountRejectedEmailParts {
  /** The member's display name. */
  readonly displayName: string;
  /** The administrator's reason, or `null` when none was recorded. */
  readonly reason: string | null;
}

/**
 * Build the rejection email.
 *
 * The recipient is the account's registered email address. The reason is
 * included when one was recorded.
 */
export function buildAccountRejectedEmail(
  to: string,
  parts: AccountRejectedEmailParts,
): OutboundEmail {
  const greeting = parts.displayName.trim() || 'there';
  const reason = parts.reason?.trim() ?? '';

  const reasonLines =
    reason.length > 0
      ? ['', `Reason: ${reason}`, '']
      : ['', ''];

  const textBody = [
    `Hi ${greeting},`,
    '',
    'An administrator did not approve your FindBack account.',
    ...reasonLines,
    'You can register again with this email address if you believe this was a mistake.',
    '',
    '— The FindBack team',
  ].join('\n');

  const htmlReason =
    reason.length > 0 ? `<p>Reason: ${escapeHtml(reason)}</p>\n` : '';

  const htmlBody = [
    `<p>Hi ${escapeHtml(greeting)},</p>`,
    '<p>An administrator did not approve your FindBack account.</p>',
    htmlReason,
    '<p>You can register again with this email address if you believe this was a mistake.</p>',
    '<p>— The FindBack team</p>',
  ].join('\n');

  return {
    to,
    subject: ACCOUNT_REJECTED_SUBJECT,
    textBody,
    htmlBody,
  };
}

/**
 * Escape text for an HTML body.
 *
 * A member's display name and the administrator's reason are user input.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
