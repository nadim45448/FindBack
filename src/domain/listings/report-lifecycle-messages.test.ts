/**
 * The lifecycle refusal copy suite.
 *
 * **The copy is frozen, so it is asserted literally.** These strings are the
 * frozen UX's wording (EXPERIENCE.md §10.4) and the PRD's; `coding-standards.md`
 * § Error handling forbids editing user-facing wording while writing code.
 * A test that asserted only "the message is non-empty" would let the copy
 * drift without anything failing.
 *
 * **A refusal points the way forward.** FR-10 says the delete refusal "returns
 * HTTP 409 with a message pointing to the Withdraw action". A member whose
 * report has a Claim cannot delete it, but they can withdraw it — so the
 * message has to name that path, or the refusal is a dead end.
 *
 * **Each refusal has exactly one home.** The delete message is here because
 * the delete decision is here. The two terminal refusals live with the
 * modules that own their reasons — `terminal-status.ts` and
 * `report-withdrawal-decision.ts` — and this suite asserts that the modules
 * that *do* own them are the ones that produce them, so a second copy
 * cannot creep in.
 */

import { describe, expect, it } from 'vitest';

import {
  DELETE_CONFIRMATION_COPY,
  deletionBlockedMessage,
  WITHDRAW_CONFIRMATION_COPY,
} from './report-lifecycle-messages';

import { terminalEditMessage } from './terminal-status';
import { NO_INTERACTIONS } from './report-deletion-decision';
import { withdrawalBlockMessage } from './report-withdrawal-decision';

describe('the delete refusal copy', () => {
  it('names the Withdraw path when an interaction blocks the delete', () => {
    // **FR-10 names this explicitly.** The message must point at the
    // Withdraw action, because the member's remedy is to withdraw.
    const message = deletionBlockedMessage({ kind: 'BlockedByInteraction' });

    expect(message).toContain('withdraw');
  });

  it('says the report can no longer be deleted when an interaction blocks it', () => {
    const message = deletionBlockedMessage({ kind: 'BlockedByInteraction' });

    expect(message).toContain('can no longer be deleted');
  });

  it('names the Withdraw path when the status blocks the delete', () => {
    const message = deletionBlockedMessage({ kind: 'BlockedByStatus' });

    expect(message).toContain('withdraw');
  });

  it('says only an open report can be deleted', () => {
    const message = deletionBlockedMessage({ kind: 'BlockedByStatus' });

    expect(message).toContain('open report');
  });

  it('carries no blame', () => {
    // **EXPERIENCE.md §4.9's tone: no blame.** The member did nothing
    // wrong; somebody else interacted with their report.
    for (const decision of [
      { kind: 'BlockedByInteraction' },
      { kind: 'BlockedByStatus' },
    ] as const) {
      const message = deletionBlockedMessage(decision);

      expect(message).not.toMatch(/you (failed|mistake|wrong)/i);
      expect(message).not.toMatch(/your fault/i);
    }
  });

  it('refuses to produce a message for a permitted deletion', () => {
    // **A permitted decision is not a blocked one.** The function is only
    // called for a refusal; reaching the permitted case means a caller
    // asked for the message of a decision that was never blocked.
    expect(() =>
      deletionBlockedMessage({ kind: 'Permitted', facts: NO_INTERACTIONS }),
    ).toThrow(/permitted deletion has no blocked message/);
  });
});

describe('the modal confirmation copy', () => {
  it('warns that a delete cannot be undone', () => {
    // **The UX's wording, verbatim** (EXPERIENCE.md §10.4 §Delete).
    expect(DELETE_CONFIRMATION_COPY).toBe(
      'Delete this report? This cannot be undone. The report will be removed from listings.',
    );
  });

  it('says a withdrawn report leaves the listings but keeps its history', () => {
    // **The UX's wording, verbatim** (EXPERIENCE.md §10.4 §Withdraw).
    expect(WITHDRAW_CONFIRMATION_COPY).toBe(
      'Withdraw this report? It will be removed from listings. The administrator can still see it in history.',
    );
  });
});

describe('each refusal has exactly one home', () => {
  it('owns the terminal-edit message in the module that owns the status type', () => {
    // **The terminal-edit refusal belongs to `terminal-status.ts`,** which
    // owns the `TerminalStatus` type. The two messages are separate strings,
    // not one template.
    expect(terminalEditMessage('Returned')).toBe('Returned reports cannot be edited.');
    expect(terminalEditMessage('Closed')).toBe('Closed reports cannot be edited.');
  });

  it('gives the two terminal-edit messages different wording', () => {
    // **A member who sees "Closed reports cannot be edited." on a `Returned`
    // report has been told something false.**
    expect(terminalEditMessage('Returned')).not.toBe(terminalEditMessage('Closed'));
  });

  it('owns the terminal-withdrawal message in the module that owns the reasons', () => {
    // **The withdrawal refusal belongs to `report-withdrawal-decision.ts`,**
    // which owns the block reasons.
    expect(withdrawalBlockMessage('TerminalStatus')).toBe('This report has already been closed.');
  });

  it('gives each withdrawal reason its own message', () => {
    // **The member's remedy differs per reason,** so the messages must too.
    const messages = [
      withdrawalBlockMessage('TerminalStatus'),
      withdrawalBlockMessage('ClaimApproved'),
      withdrawalBlockMessage('MatchConfirmed'),
    ];

    expect(new Set(messages).size).toBe(3);
  });
});
