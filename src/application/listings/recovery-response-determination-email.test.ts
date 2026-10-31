/**
 * The FR-46 event-6 determination email's suite.
 *
 * **The load-bearing assertions are about what the message does *not* say.**
 *
 * The responder is told the outcome, and nothing about the owner's
 * reasoning. The builder takes no reason and no identifying details as
 * parameters, so the message cannot carry them — and a test that asserted
 * the absence of the owner's reasoning would be asserting a property the
 * *signature* guarantees rather than one the body maintains.
 *
 * **The HTML body and the plain-text body carry the same facts.** A
 * recipient whose client does not render HTML must read the same thing.
 */

import { describe, expect, it } from 'vitest';

import {
  DefaultRecoveryResponseDeterminationEmailBuilder,
  determinationHtmlBody,
  determinationTextBody,
  MATCH_CONFIRMED_SUBJECT,
  NOT_A_MATCH_SUBJECT,
} from './recovery-response-determination-email';

describe('the determination email', () => {
  const builder = new DefaultRecoveryResponseDeterminationEmailBuilder();

  it('tells the responder that their response was confirmed as a match', () => {
    const message = builder.build({
      recipientEmail: 'responder@example.test',
      outcome: 'match_confirmed',
    });

    expect(message.to).toBe('responder@example.test');
    expect(message.subject).toBe(MATCH_CONFIRMED_SUBJECT);
    expect(message.textBody).toContain('confirmed your response as a match');
  });

  it('tells the responder that their response was not a match', () => {
    const message = builder.build({
      recipientEmail: 'responder@example.test',
      outcome: 'not_a_match',
    });

    expect(message.subject).toBe(NOT_A_MATCH_SUBJECT);
    expect(message.textBody).toContain('not a match');
  });

  it('does not say the item was returned', () => {
    // **A confirmed match does not say the item was returned.** FR-41 makes
    // `Match Confirmed` non-terminal: the physical return is confirmed
    // later, by Unit 005.
    const message = builder.build({
      recipientEmail: 'responder@example.test',
      outcome: 'match_confirmed',
    });

    expect(message.textBody).not.toMatch(/has been returned/i);
    expect(message.textBody).toContain('contact you about returning');
  });

  it('carries no Sensitive Field', () => {
    // **The owner’s reasoning is not in the message.** The builder has no
    // way to receive it.
    const message = builder.build({
      recipientEmail: 'responder@example.test',
      outcome: 'not_a_match',
    });

    expect(message.textBody).not.toMatch(/where found|identifying/i);
    expect(message.htmlBody).not.toMatch(/where found|identifying/i);
  });

  it('says the same thing in the HTML body as in the text body', () => {
    for (const outcome of ['match_confirmed', 'not_a_match'] as const) {
      const text = determinationTextBody(outcome);
      const html = determinationHtmlBody(outcome);

      // **The same content in the same order.** An HTML body that carries
      // more than the text body is a divergence waiting to happen.
      expect(html).toContain(text.split('\n')[0]!);
    }
  });

  it('gives each outcome its own subject', () => {
    expect(MATCH_CONFIRMED_SUBJECT).not.toBe(NOT_A_MATCH_SUBJECT);
  });
});
