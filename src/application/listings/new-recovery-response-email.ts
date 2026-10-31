/**
 * The FR-46 event-4 email — the message the **Lost-report owner** receives
 * when a recovery response arrives on their Lost report.
 *
 * **The owner is told that a response exists, and nothing more.** The
 * response's exact place, observed identifying details, and candidate image
 * are FR-37 Sensitive Fields; the owner *may* see them through the
 * authenticated surface (FR-39 grants the Lost-report owner every response
 * on their own report), but they do not travel by email — an email is
 * forwarded, printed, and left in inboxes.
 *
 * **That is why the builder takes no response content as a parameter.** The
 * message cannot carry the response's fields because it has no way to
 * receive them. This is the same content boundary the new-claim email draws,
 * from the other side of the product.
 *
 * **The link requires login.** The Lost report's detail page is member-only,
 * so the link is a signed-in link; the builder takes the base URL rather
 * than building one from an id, because the id is not secret and the base URL
 * is a deployment's configuration.
 *
 * **The wording lives here so the trigger and the content are one
 * implementation point.** The submission use case dispatches the email after
 * the commit; the content is this module.
 *
 * Pure — the builder produces a message; the transport sends it.
 */

/** The subject line for a new-recovery-response email. */
export const NEW_RECOVERY_RESPONSE_SUBJECT =
  'Someone submitted a recovery response on your lost item';

/**
 * The plain-text body for a new-recovery-response email.
 *
 * @param itemName the Lost report's name, so the owner knows which item
 * @param reportPath the path to the Lost report's detail page
 */
export function newRecoveryResponseTextBody(itemName: string, reportPath: string): string {
  return [
    'Someone has submitted a recovery response on a lost item you reported.',
    '',
    `Item: ${itemName}`,
    '',
    'Sign in to review the response.',
    reportPath,
    '',
    'You do not need to do anything else right now. You may select one response for verification.',
  ].join('\n');
}

/**
 * The HTML body for a new-recovery-response email.
 *
 * **The same content as the plain-text body, in the same order.** A
 * recipient whose client does not render HTML must read the same facts, and
 * an HTML body that carries more than the text body is a divergence waiting
 * to happen.
 */
export function newRecoveryResponseHtmlBody(itemName: string, reportPath: string): string {
  const escapedName = escapeHtml(itemName);
  const escapedPath = escapeHtml(reportPath);

  return [
    '<p>Someone has submitted a recovery response on a lost item you reported.</p>',
    `<p>Item: ${escapedName}</p>`,
    '<p>Sign in to review the response.</p>',
    `<p><a href="${escapedPath}">Review the response</a></p>`,
    '<p>You do not need to do anything else right now. You may select one response for verification.</p>',
  ].join('');
}

/** The application-layer new-recovery-response email builder. */
export class DefaultNewRecoveryResponseEmailBuilder
  implements NewRecoveryResponseEmailBuilder
{
  build(input: {
    readonly recipientEmail: string;
    readonly itemName: string;
    readonly reportPath: string;
  }): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  } {
    return {
      to: input.recipientEmail,
      subject: NEW_RECOVERY_RESPONSE_SUBJECT,
      textBody: newRecoveryResponseTextBody(input.itemName, input.reportPath),
      htmlBody: newRecoveryResponseHtmlBody(input.itemName, input.reportPath),
    };
  }
}

/** The email template the new-recovery-response notification uses. */
export interface NewRecoveryResponseEmailBuilder {
  /**
   * Build the FR-46 event-4 email.
   *
   * **The parameters carry no Sensitive Field.** The owner is told that a
   * response exists and is invited to review it — never what the responder
   * wrote — so the builder has no way to receive the exact place, the
   * observed identifying details, or the image.
   */
  build(input: {
    readonly recipientEmail: string;
    readonly itemName: string;
    readonly reportPath: string;
  }): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  };
}

/**
 * Escape the characters that carry meaning in HTML.
 *
 * **The item's name is member-supplied free text**, and it goes into an HTML
 * body. Without escaping, a name containing `<` could inject markup into the
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
