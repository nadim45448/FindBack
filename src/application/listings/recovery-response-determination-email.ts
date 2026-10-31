/**
 * The FR-46 event-6 determination email — the message the **responder**
 * receives when the Lost-report owner has determined their response.
 *
 * **The responder is told the outcome, and nothing about the owner's
 * reasoning.** FR-43's determination is the owner's decision about the
 * owner's own item; the responder learns whether their response was
 * confirmed as a match or was not a match. The builder takes no reason and
 * no identifying details as parameters, so the message cannot carry them.
 *
 * **The two outcomes produce different messages, and the builder encodes
 * that difference in one place.** The subject and the body both branch on
 * the outcome, so a change to one branch cannot leave the other describing
 * the opposite result.
 *
 * **A confirmed match does not say the item was returned.** FR-41 makes
 * `Match Confirmed` non-terminal: the physical return is confirmed later,
 * by Unit 005. The message says the team will be in touch about returning
 * the item — not that the item has been returned.
 *
 * Pure — the builder produces a message; the transport sends it.
 */

import type { DeterminationOutcome } from '@/domain/recovery';

/** The subject line for a `Match Confirmed` determination email. */
export const MATCH_CONFIRMED_SUBJECT = 'Your recovery response was confirmed as a match';

/** The subject line for a `Not a Match` determination email. */
export const NOT_A_MATCH_SUBJECT = 'Your recovery response was not a match';

/**
 * The plain-text body for a determination email.
 *
 * @param outcome the determination the owner made
 */
export function determinationTextBody(outcome: DeterminationOutcome): string {
  return outcome === 'match_confirmed'
    ? [
        'The owner has confirmed your response as a match.',
        '',
        'The team will contact you about returning the item.',
      ].join('\n')
    : [
        'The owner has determined that your response was not a match of their item.',
        '',
        'Thank you for helping.',
      ].join('\n');
}

/**
 * The HTML body for a determination email.
 *
 * **The same content as the plain-text body, in the same order.** A
 * recipient whose client does not render HTML must read the same facts, and
 * an HTML body that carries more than the text body is a divergence waiting
 * to happen.
 */
export function determinationHtmlBody(outcome: DeterminationOutcome): string {
  return outcome === 'match_confirmed'
    ? [
        '<p>The owner has confirmed your response as a match.</p>',
        '<p>The team will contact you about returning the item.</p>',
      ].join('')
    : [
        '<p>The owner has determined that your response was not a match of their item.</p>',
        '<p>Thank you for helping.</p>',
      ].join('');
}

/** The email template the determination notification uses. */
export interface RecoveryResponseDeterminationEmailBuilder {
  /**
   * Build the FR-46 event-6 determination email.
   *
   * **The parameters carry no Sensitive Field.** The responder is told the
   * outcome and nothing else, so the builder has no way to receive the
   * owner's reasoning or identifying details.
   */
  build(input: {
    readonly recipientEmail: string;
    readonly outcome: DeterminationOutcome;
  }): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  };
}

/** The application-layer determination email builder. */
export class DefaultRecoveryResponseDeterminationEmailBuilder
  implements RecoveryResponseDeterminationEmailBuilder
{
  build(input: {
    readonly recipientEmail: string;
    readonly outcome: DeterminationOutcome;
  }): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  } {
    return {
      to: input.recipientEmail,
      subject:
        input.outcome === 'match_confirmed'
          ? MATCH_CONFIRMED_SUBJECT
          : NOT_A_MATCH_SUBJECT,
      textBody: determinationTextBody(input.outcome),
      htmlBody: determinationHtmlBody(input.outcome),
    };
  }
}
