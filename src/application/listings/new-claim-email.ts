/**
 * The FR-28 new-claim email — the message the **finder** receives when a
 * claim arrives on their Found report.
 *
 * **The finder is told that a claim exists, and nothing more.** FR-39 and
 * UJ-2 are the reason: the claimant's reason and identifying details are
 * FR-37 Sensitive Fields, visible only to the claimant and administrators.
 * The finder learns that someone has claimed their item and is invited to
 * look at it — **never what the claimant said**. That is the whole content
 * boundary of this email, and it is why the builder takes no reason and no
 * identifying details as parameters: the message cannot carry them because
 * it has no way to receive them.
 *
 * **The link requires login.** The claim's detail page is member-only, so
 * the link is a signed-in link; the builder takes the base URL rather than
 * building one from an id, because the id is not secret and the base URL is
 * a deployment's configuration.
 *
 * **Story 008 owns the content; this bolt owns the trigger.** The
 * submission use case dispatches the email after the commit; the wording
 * lives here so the trigger and the content are one implementation point.
 *
 * Pure — the builder produces a message; the transport sends it.
 */

/** The subject line for a new-claim email. */
export const NEW_CLAIM_SUBJECT = 'Someone has claimed your found item';

/**
 * The plain-text body for a new-claim email.
 *
 * @param itemName the found item's name, so the finder knows which item
 * @param claimPath the path to the claim's detail page
 */
export function newClaimTextBody(itemName: string, claimPath: string): string {
  return [
    'Someone has made a claim on the item you found.',
    '',
    `Item: ${itemName}`,
    '',
    'Sign in to review the claim.',
    claimPath,
    '',
    'You do not need to do anything else right now. An administrator will review the claim and you will be notified of the outcome.',
  ].join('\n');
}

/**
 * The HTML body for a new-claim email.
 *
 * **The same content as the plain-text body, in the same order.** A
 * recipient whose client does not render HTML must read the same facts, and
 * an HTML body that carries more than the text body is a divergence waiting
 * to happen.
 */
export function newClaimHtmlBody(itemName: string, claimPath: string): string {
  const escapedName = escapeHtml(itemName);
  const escapedPath = escapeHtml(claimPath);

  return [
    '<p>Someone has made a claim on the item you found.</p>',
    `<p>Item: ${escapedName}</p>`,
    '<p>Sign in to review the claim.</p>',
    `<p><a href="${escapedPath}">Review the claim</a></p>`,
    '<p>You do not need to do anything else right now. An administrator will review the claim and you will be notified of the outcome.</p>',
  ].join('');
}

/** The application-layer new-claim email builder. */
export class DefaultNewClaimEmailBuilder implements NewClaimEmailBuilder {
  build(input: {
    readonly recipientEmail: string;
    readonly itemName: string;
    readonly claimPath: string;
  }): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  } {
    return {
      to: input.recipientEmail,
      subject: NEW_CLAIM_SUBJECT,
      textBody: newClaimTextBody(input.itemName, input.claimPath),
      htmlBody: newClaimHtmlBody(input.itemName, input.claimPath),
    };
  }
}

/** The email template the new-claim notification uses. */
export interface NewClaimEmailBuilder {
  /**
   * Build the FR-28 new-claim email.
   *
   * **The parameters carry no Sensitive Field.** The finder is told that a
   * claim exists and is invited to review it — never what the claimant
   * said — so the builder has no way to receive the reason or the
   * identifying details.
   */
  build(input: {
    readonly recipientEmail: string;
    readonly itemName: string;
    readonly claimPath: string;
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
