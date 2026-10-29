/**
 * The report lifecycle decisions' suite.
 *
 * **These are pure functions, and that is the point.** The four gates —
 * delete, withdraw, edit, and the administrator's edit — decide whether a
 * member or an administrator may change a report. Each of those rules is
 * stated in the PRD, and each is a pure function of a report's status, its
 * type, and the facts about the records that depend on it.
 *
 * **The load-bearing assertions are the boundaries.** The type asymmetry
 * (Found's interaction is a Claim, Lost's is a Recovery Response) and the
 * terminal block (`Returned` and `Closed` accept no change from anyone) are
 * where the rules would silently break if they were implemented the other way
 * round.
 */

import { describe, expect, it } from 'vitest';

import {
  asTerminalStatus,
  decideDeletion,
  decideWithdrawal,
  hasInteraction,
  isNonTerminalRecoveryResponseStatus,
  NO_INTERACTIONS,
  terminalEditMessage,
  withdrawalBlockMessage,
  type InteractionFacts,
} from '@/domain/listings';

describe('asTerminalStatus', () => {
  it('names Returned and Closed, and only those two', () => {
    expect(asTerminalStatus('Returned')).toBe('Returned');
    expect(asTerminalStatus('Closed')).toBe('Closed');
  });

  it('is null for every non-terminal status', () => {
    for (const status of ['Open', 'Claim Requested', 'Claim Approved', 'Verification Pending'] as const) {
      expect(asTerminalStatus(status)).toBeNull();
    }
  });
});

describe('terminalEditMessage', () => {
  it('uses the PRD\'s two separate strings, not a template', () => {
    expect(terminalEditMessage('Returned')).toBe('Returned reports cannot be edited.');
    expect(terminalEditMessage('Closed')).toBe('Closed reports cannot be edited.');
  });
});

describe('hasInteraction', () => {
  it('counts a Claim for a Found report and ignores a Recovery Response', () => {
    const facts: InteractionFacts = {
      hasClaim: true,
      hasRecoveryResponse: false,
      hasApprovedClaim: false,
      hasMatchConfirmed: false,
    };

    expect(hasInteraction('Found', facts)).toBe(true);
  });

  it('counts a Recovery Response for a Lost report and ignores a Claim', () => {
    const facts: InteractionFacts = {
      hasClaim: false,
      hasRecoveryResponse: true,
      hasApprovedClaim: false,
      hasMatchConfirmed: false,
    };

    expect(hasInteraction('Lost', facts)).toBe(true);
  });

  it('is false for an untouched report', () => {
    expect(hasInteraction('Found', NO_INTERACTIONS)).toBe(false);
    expect(hasInteraction('Lost', NO_INTERACTIONS)).toBe(false);
  });
});

describe('decideDeletion', () => {
  it('permits an interaction-free Open report', () => {
    expect(decideDeletion('Open', 'Found', NO_INTERACTIONS)).toEqual({
      kind: 'Permitted',
      facts: NO_INTERACTIONS,
    });
    expect(decideDeletion('Open', 'Lost', NO_INTERACTIONS).kind).toBe('Permitted');
  });

  it('blocks a Found report that has a Claim', () => {
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasClaim: true };

    expect(decideDeletion('Open', 'Found', facts)).toEqual({ kind: 'BlockedByInteraction' });
  });

  it('blocks a Lost report that has a Recovery Response', () => {
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasRecoveryResponse: true };

    expect(decideDeletion('Open', 'Lost', facts)).toEqual({ kind: 'BlockedByInteraction' });
  });

  it('does not count a Claim against a Lost report', () => {
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasClaim: true };

    expect(decideDeletion('Open', 'Lost', facts).kind).toBe('Permitted');
  });

  it('does not count a Recovery Response against a Found report', () => {
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasRecoveryResponse: true };

    expect(decideDeletion('Open', 'Found', facts).kind).toBe('Permitted');
  });

  it('blocks a report that is not Open, by status', () => {
    for (const status of ['Claim Requested', 'Claim Approved', 'Verification Pending', 'Returned', 'Closed'] as const) {
      expect(decideDeletion(status, 'Found', NO_INTERACTIONS)).toEqual({
        kind: 'BlockedByStatus',
      });
    }
  });

  it('blocks by status even when the report carries an interaction', () => {
    // **The status check runs first**, so a `Returned` report with a Claim
    // is refused for the status reason — the member's remedy is not
    // Withdraw, because a `Returned` report cannot be withdrawn either.
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasClaim: true };

    expect(decideDeletion('Returned', 'Found', facts)).toEqual({ kind: 'BlockedByStatus' });
  });

  it('counts a rejected Claim as an existing Claim', () => {
    // **Interaction-free means no interaction *exists*.** A rejected Claim is
    // a terminal Claim, and its existence still blocks deletion.
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasClaim: true };

    expect(decideDeletion('Open', 'Found', facts).kind).toBe('BlockedByInteraction');
  });
});

describe('decideWithdrawal — Found side', () => {
  it('permits an Open Found report', () => {
    expect(decideWithdrawal('Open', 'Found', NO_INTERACTIONS)).toEqual({ kind: 'Permitted' });
  });

  it('permits a Claim Requested Found report', () => {
    expect(decideWithdrawal('Claim Requested', 'Found', NO_INTERACTIONS)).toEqual({
      kind: 'Permitted',
    });
  });

  it('blocks a Claim Approved Found report', () => {
    expect(decideWithdrawal('Claim Approved', 'Found', NO_INTERACTIONS)).toEqual({
      kind: 'Blocked',
      reason: 'ClaimApproved',
    });
  });

  it('blocks a Found report whose Claim has been approved, even while it is still Open', () => {
    // **The dependent record's state is consulted, not only the report's own
    // status.** A report can be mid-transition between the two writes.
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasApprovedClaim: true };

    expect(decideWithdrawal('Open', 'Found', facts)).toEqual({
      kind: 'Blocked',
      reason: 'ClaimApproved',
    });
  });

  it('blocks a terminal report before consulting the facts', () => {
    expect(decideWithdrawal('Returned', 'Found', NO_INTERACTIONS)).toEqual({
      kind: 'Blocked',
      reason: 'TerminalStatus',
    });
    expect(decideWithdrawal('Closed', 'Found', NO_INTERACTIONS)).toEqual({
      kind: 'Blocked',
      reason: 'TerminalStatus',
    });
  });

  it('does not block on a merely Pending Claim', () => {
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasClaim: true };

    expect(decideWithdrawal('Claim Requested', 'Found', facts).kind).toBe('Permitted');
  });
});

describe('decideWithdrawal — Lost side', () => {
  it('permits an Open Lost report', () => {
    expect(decideWithdrawal('Open', 'Lost', NO_INTERACTIONS)).toEqual({ kind: 'Permitted' });
  });

  it('permits a Verification Pending Lost report before Match Confirmed', () => {
    expect(decideWithdrawal('Verification Pending', 'Lost', NO_INTERACTIONS)).toEqual({
      kind: 'Permitted',
    });
  });

  it('blocks once Match Confirmed has been recorded, even while the report is still Verification Pending', () => {
    // **Match Confirmed is a Recovery Response status, not a report status.**
    // The report's own status cannot express the block, so the gate reads
    // the dependent record's state.
    const facts: InteractionFacts = { ...NO_INTERACTIONS, hasMatchConfirmed: true };

    expect(decideWithdrawal('Verification Pending', 'Lost', facts)).toEqual({
      kind: 'Blocked',
      reason: 'MatchConfirmed',
    });
  });

  it('blocks a terminal report before consulting the facts', () => {
    expect(decideWithdrawal('Returned', 'Lost', NO_INTERACTIONS)).toEqual({
      kind: 'Blocked',
      reason: 'TerminalStatus',
    });
  });
});

describe('withdrawalBlockMessage', () => {
  it('gives each reason its own message', () => {
    expect(withdrawalBlockMessage('TerminalStatus')).toBe(
      'This report has already been closed.',
    );
    expect(withdrawalBlockMessage('ClaimApproved')).toBe(
      'A claim has been approved for this item, so it can no longer be withdrawn.',
    );
    expect(withdrawalBlockMessage('MatchConfirmed')).toBe(
      'This item has been matched, so it can no longer be withdrawn.',
    );
  });

  it('does not blame the member', () => {
    for (const reason of ['TerminalStatus', 'ClaimApproved', 'MatchConfirmed'] as const) {
      expect(withdrawalBlockMessage(reason)).not.toMatch(/your fault|you should|invalid/i);
    }
  });
});

describe('isNonTerminalRecoveryResponseStatus', () => {
  it('is true for the two statuses a withdrawal resolves', () => {
    expect(isNonTerminalRecoveryResponseStatus('Submitted')).toBe(true);
    expect(isNonTerminalRecoveryResponseStatus('Selected for Verification')).toBe(true);
  });

  it('is false for every terminal status', () => {
    for (const status of [
      'Match Confirmed',
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      expect(isNonTerminalRecoveryResponseStatus(status)).toBe(false);
    }
  });
});
