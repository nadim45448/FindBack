/**
 * The Lost-side email builders — FR-46 events 5, 7, and 8.
 *
 * **One module, three builders, and the same content boundary as the rest
 * of the product's email.** Events 4 and 6 already have their own builders
 * — `new-recovery-response-email.ts` and
 * `recovery-response-determination-email.ts` — because their *triggers* live
 * in the Recovery Response workflow (ADR-14: an email's owner is the module
 * that owns its trigger). Events 7 and 8 are triggered by the report's
 * terminal transitions, which this bolt owns, so their content lives here.
 *
 * ## No builder can carry a Sensitive Field
 *
 * **Every builder here takes no response content as a parameter.** The
 * responder is told that their recovery completed; the owner is told that
 * their item came home. Neither is told where the item was found, what the
 * responder observed, or who else responded — and because the builder has
 * no way to receive those values, the message *cannot* carry them.
 *
 * That is the same content boundary the other email builders draw, and it
 * is enforced by the signature rather than by a review.
 *
 * ## Event 8 says the item was returned, because it is
 *
 **Event 8 fires only at the transition where the report reached `Returned`
 * and the response reached `Completed — Report Returned`.** By the time it
 * is sent, the handoff *has* happened — so unlike event 6's confirmed-match
 * message, which says the team will be in touch about returning the item,
 * event 8 may say the item was returned.
 *
 * **That difference is exactly why event 8's gate is narrow.** An earlier
 * event 8 would have told a responder their recovery was complete before
 * the item was in the owner's hand.
 *
 * Pure — the builders produce messages; the transport sends them.
 */

/** The subject line for the event-5 email — the responder was selected. */
export const SELECTED_FOR_VERIFICATION_SUBJECT =
  'Your recovery response was selected for verification';

/** The subject line for the event-7 email — the owner's item came home. */
export const LOST_REPORT_RETURNED_SUBJECT = 'Your lost item has been returned';

/** The subject line for the event-8 email — the recovery completed. */
export const RECOVERY_COMPLETED_SUBJECT = 'Your recovery is complete — the item was returned';

/**
 * The plain-text body for the event-5 email.
 *
 * **The responder is told they were selected and what happens next.** They
 * are not told what the owner wrote, what the item looks like, or whether
 * anyone else responded.
 */
export function selectedForVerificationTextBody(itemName: string, reportPath: string): string {
  return [
    'The owner of a lost item you responded to has selected your recovery response for verification.',
    '',
    `Item: ${itemName}`,
    '',
    'Sign in to see the details.',
    reportPath,
    '',
    'The team will contact you about returning the item.',
  ].join('\n');
}

/** The HTML body for the event-5 email. */
export function selectedForVerificationHtmlBody(itemName: string, reportPath: string): string {
  const escapedName = escapeHtml(itemName);
  const escapedPath = escapeHtml(reportPath);

  return [
    '<p>The owner of a lost item you responded to has selected your recovery response for verification.</p>',
    `<p>Item: ${escapedName}</p>`,
    '<p>Sign in to see the details.</p>',
    `<p><a href="${escapedPath}">View your recovery response</a></p>`,
    '<p>The team will contact you about returning the item.</p>',
  ].join('');
}

/**
 * The plain-text body for the event-7 email.
 *
 * **The owner is told their item was returned.** They are not told who
 * received it beyond the fact of the return — the handover's details live on
 * the report.
 */
export function lostReportReturnedTextBody(itemName: string, reportPath: string): string {
  return [
    'Good news — the lost item you reported has been returned.',
    '',
    `Item: ${itemName}`,
    '',
    'Sign in to see the details.',
    reportPath,
  ].join('\n');
}

/** The HTML body for the event-7 email. */
export function lostReportReturnedHtmlBody(itemName: string, reportPath: string): string {
  const escapedName = escapeHtml(itemName);
  const escapedPath = escapeHtml(reportPath);

  return [
    '<p>Good news — the lost item you reported has been returned.</p>',
    `<p>Item: ${escapedName}</p>`,
    '<p>Sign in to see the details.</p>',
    `<p><a href="${escapedPath}">View your report</a></p>`,
  ].join('');
}

/**
 * The plain-text body for the event-8 email.
 *
 * **The responder is told their recovery completed.** They are not told
 * where the item was found, what they had observed, or anything about the
 * other responses on the report.
 */
export function recoveryCompletedTextBody(itemName: string, reportPath: string): string {
  return [
    'Your recovery response was successful — the item has been returned to its owner.',
    '',
    `Item: ${itemName}`,
    '',
    'Sign in to see the details.',
    reportPath,
    '',
    'Thank you for helping.',
  ].join('\n');
}

/** The HTML body for the event-8 email. */
export function recoveryCompletedHtmlBody(itemName: string, reportPath: string): string {
  const escapedName = escapeHtml(itemName);
  const escapedPath = escapeHtml(reportPath);

  return [
    '<p>Your recovery response was successful — the item has been returned to its owner.</p>',
    `<p>Item: ${escapedName}</p>`,
    '<p>Sign in to see the details.</p>',
    `<p><a href="${escapedPath}">View your recovery response</a></p>`,
    '<p>Thank you for helping.</p>',
  ].join('');
}

/** The message a builder produces. */
export interface BuiltEmail {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

/**
 * Escape the characters that carry meaning in HTML.
 *
 * **The same escape the other email builders use.** An item's name is
 * member-supplied, and a name carrying markup must not become markup in an
 * email body.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
