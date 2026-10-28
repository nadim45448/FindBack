/**
 * The FR-51 password-reset email.
 *
 * **This is an authentication/security message, not one of the eight FR-46
 * workflow emails.** It carries a credential — the single-use reset token —
 * and it is therefore held to the same rule as FR-27's email: the link
 * authorises exactly one action and nothing else.
 *
 * **The copy is pending a UX edit.** `EXPERIENCE.md` §9.3a defines the
 * confirmation *screen* and classifies the reset email, but defines no
 * subject and no body for the email itself. `coding-standards.md` requires
 * user-facing wording to match the frozen spine, so the wording below is a
 * **placeholder marked `PENDING UX EDIT`**, and the email is assembled from
 * **named parts** so the eventual copy is a single visible edit in one place.
 *
 * This is exactly how bolt `004` shipped the FR-27 approval email's
 * structure while its copy was being settled — the structure is built, and
 * the wording is a named part.
 *
 * **The lifetime statement renders the configured value, not a constant.** If
 * `AUTH_RESET_TOKEN_TTL_SECONDS` is `1800`, the email says 30 minutes; if it
 * is `86400`, it says 24 hours. A member who reads the email must be told
 * the truth about the window they have, so the number in the message is
 * always the number the server enforces (ADR-17).
 *
 * **The email carries no auto-login token and no session** — it carries the
 * reset token, which authorises exactly one password change. FR-27's rule
 * (a link carrying a credential must not confer access) applies with one
 * deliberate difference: a reset token **must** be in the link, because it is
 * the authorisation. The mitigation is the token's own properties —
 * single-use, time-limited, 256-bit random, stored hashed.
 */

import type { OutboundEmail } from '@/application/ports/email-sender';

/**
 * The subject line for the password-reset email.
 *
 * **PENDING UX EDIT** — see the module's doc comment. The requested addition
 * to `EXPERIENCE.md` covers the subject, the body, the message's
 * classification, and the absence of an auto-login token.
 */
export const PASSWORD_RESET_SUBJECT = '[PENDING UX EDIT] Reset your FindBack password';

/** The path the reset link points at. */
export const RESET_PASSWORD_PATH = '/reset-password';

/** The FR-51 email's body, as a set of named parts. */
export interface PasswordResetEmailParts {
  /** The member's display name, for the greeting. */
  readonly displayName: string;
  /** The absolute URL carrying the single-use token. */
  readonly resetUrl: string;
  /**
   * The token's lifetime, in seconds — the **configured** value, rendered
   * into a human-readable duration.
   */
  readonly lifetimeSeconds: number;
}

/**
 * Render a duration in a human-readable form.
 *
 * The unit is chosen from the magnitude, so the email says "1 hour" rather
 * than "3600 seconds". A value that is not a whole number of hours is
 * rendered in minutes — the smallest unit that is still meaningful to a
 * member.
 */
export function renderLifetime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;

  if (safeSeconds === 0) {
    return 'a short time';
  }

  if (safeSeconds % 3600 === 0) {
    const hours = safeSeconds / 3600;

    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  if (safeSeconds % 60 === 0) {
    const minutes = safeSeconds / 60;

    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }

  return `${safeSeconds} seconds`;
}

/**
 * Build the FR-51 password-reset email.
 *
 * The recipient is the account's registered email address. The body carries
 * **the reset token and nothing else** — no session, no auto-login token.
 */
export function buildPasswordResetEmail(
  to: string,
  parts: PasswordResetEmailParts,
): OutboundEmail {
  const greeting = parts.displayName.trim() || 'there';
  const lifetime = renderLifetime(parts.lifetimeSeconds);

  const textBody = [
    `Hi ${greeting},`,
    '',
    'We received a request to reset the password for your FindBack account.',
    '',
    `Choose a new password here: ${parts.resetUrl}`,
    '',
    `This link can be used once, and it expires in ${lifetime}.`,
    'If you did not ask for a password reset, you can ignore this email — your password will not change.',
    '',
    '— The FindBack team',
  ].join('\n');

  const htmlBody = [
    `<p>Hi ${escapeHtml(greeting)},</p>`,
    '<p>We received a request to reset the password for your FindBack account.</p>',
    `<p>Choose a new password here: <a href="${escapeHtml(parts.resetUrl)}">${escapeHtml(
      parts.resetUrl,
    )}</a></p>`,
    `<p>This link can be used once, and it expires in ${escapeHtml(lifetime)}.</p>`,
    '<p>If you did not ask for a password reset, you can ignore this email — your password will not change.</p>',
    '<p>— The FindBack team</p>',
  ].join('\n');

  return {
    to,
    subject: PASSWORD_RESET_SUBJECT,
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
