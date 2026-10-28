/**
 * The FR-27 account-approved email.
 *
 * **The `accounts` module owns this email end to end** — the trigger, the
 * content, and the transport (ADR-14). The rule that decided it: *an email's
 * owner is the module that owns its trigger*, and FR-27 is the only one of
 * the eight workflow emails whose trigger is an account lifecycle
 * transition.
 *
 * FR-27 requires three things of the message:
 *
 * 1. it is sent to the account's registered email address;
 * 2. it contains a link to the application login page; and
 * 3. it contains **no auto-login token**.
 *
 * The third is a security property, not a copy preference: a link that
 * carried a credential would let anyone who saw the email become the
 * account holder. The message therefore links to the login page and asks the
 * member to sign in with their password.
 *
 * **The copy is UX-governed.** `coding-standards.md` requires user-facing
 * wording to match `EXPERIENCE.md`, and editing it re-opens frozen UX and
 * requires explicit approval. The body below is therefore assembled from
 * named parts, so a copy change is a visible edit in one place.
 */

import type { OutboundEmail } from '@/application/ports/email-sender';

/** The subject line for the account-approved email. */
export const ACCOUNT_APPROVED_SUBJECT = 'Your FindBack account is approved';

/** The link the member signs in through. */
export const LOGIN_PATH = '/login';

/** The FR-27 email's body, as a set of named parts. */
export interface AccountApprovedEmailParts {
  /** The member's display name. */
  readonly displayName: string;
  /** The absolute URL of the login page. */
  readonly loginUrl: string;
}

/**
 * Build the FR-27 email.
 *
 * The recipient is the account's registered email address, and the body
 * carries **no token of any kind**.
 */
export function buildAccountApprovedEmail(
  to: string,
  parts: AccountApprovedEmailParts,
): OutboundEmail {
  const greeting = parts.displayName.trim() || 'there';

  const textBody = [
    `Hi ${greeting},`,
    '',
    'Your FindBack account has been approved by an administrator.',
    '',
    `You can sign in now: ${parts.loginUrl}`,
    '',
    'If you were not expecting this, contact your administrator.',
    '',
    '— The FindBack team',
  ].join('\n');

  const htmlBody = [
    `<p>Hi ${escapeHtml(greeting)},</p>`,
    '<p>Your FindBack account has been approved by an administrator.</p>',
    `<p>You can sign in now: <a href="${escapeHtml(parts.loginUrl)}">${escapeHtml(
      parts.loginUrl,
    )}</a></p>`,
    '<p>If you were not expecting this, contact your administrator.</p>',
    '<p>— The FindBack team</p>',
  ].join('\n');

  return {
    to,
    subject: ACCOUNT_APPROVED_SUBJECT,
    textBody,
    htmlBody,
  };
}

/**
 * Escape text for an HTML body.
 *
 * A member's display name is user input, and the HTML body is rendered by
 * the recipient's mail client. The name is escaped rather than trusted, so a
 * name containing markup cannot become markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
