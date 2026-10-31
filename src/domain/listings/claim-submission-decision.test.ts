/**
 * The Claim submission gate's suite.
 *
 * **The gate is a pure function of the facts**, so every rule can be
 * asserted against fixtures with no database and no network. That is the
 * reason the gate lives in the domain at all.
 *
 * **Each refusal is asserted separately, with its own reason.** The reasons
 * are distinguishable because the member's remedy differs — a member who
 * claimed their own report is told so, a member whose account is not active
 * is told so, and a member who already has a pending claim is told so.
 * Collapsing them into one "not allowed" would leave the member with no path
 * forward.
 */

import { describe, expect, it } from 'vitest';

import {
  claimSubmissionBlockMessage,
  decideClaimSubmission,
  REPORT_STATUSES,
  type ClaimSubmissionFacts,
} from '@/domain/listings';

/** The facts of a claim against an open Found report by another member. */
const PERMITTED_FACTS: ClaimSubmissionFacts = {
  reportType: 'Found',
  reportStatus: 'Open',
  reportOwnerId: 'the-finder',
  hasPendingClaim: false,
};

/**
 * Decide with the permitted facts, overriding one of them.
 */
function decide(
  overrides: Partial<ClaimSubmissionFacts>,
  claimantId = 'the-claimant',
  isAccountActive = true,
) {
  return decideClaimSubmission({
    claimantId,
    isAccountActive,
    facts: { ...PERMITTED_FACTS, ...overrides },
  });
}

describe('the claim submission gate', () => {
  it('permits a claim against an open Found report', () => {
    expect(decide({})).toEqual({ kind: 'Permitted' });
  });

  it('permits a claim against a report already at Claim Requested', () => {
    // A second member's claim on an item that already has one is
    // legitimate — the report is in exactly the state a first claim put it
    // in.
    expect(decide({ reportStatus: 'Claim Requested' })).toEqual({ kind: 'Permitted' });
  });

  it('refuses a claim from an account that is not active', () => {
    expect(decide({}, 'the-claimant', false)).toEqual({
      kind: 'Blocked',
      reason: 'AccountNotActive',
    });
  });

  it('refuses a claim on a report that does not exist', () => {
    expect(decide({ reportType: null, reportStatus: null })).toEqual({
      kind: 'Blocked',
      reason: 'NotFoundReport',
    });
  });

  it('refuses a claim on a Lost report', () => {
    expect(decide({ reportType: 'Lost' })).toEqual({
      kind: 'Blocked',
      reason: 'NotAFoundReport',
    });
  });

  it('refuses a member claiming their own report', () => {
    expect(decide({}, 'the-finder')).toEqual({
      kind: 'Blocked',
      reason: 'OwnReport',
    });
  });

  it('refuses a claim on a report that has been approved', () => {
    expect(decide({ reportStatus: 'Claim Approved' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForClaims',
    });
  });

  it('refuses a claim on a returned report', () => {
    expect(decide({ reportStatus: 'Returned' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForClaims',
    });
  });

  it('refuses a claim on a closed report', () => {
    expect(decide({ reportStatus: 'Closed' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForClaims',
    });
  });

  it('refuses a claim on a report whose status it does not recognise', () => {
    // **The rule is a whitelist.** `Open` and `Claim Requested` accept a
    // claim and nothing else does — so a status this bolt has not seen is
    // refused rather than waved through. A gate that permits by default
    // fails open.
    expect(decide({ reportStatus: 'Verification Pending' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForClaims',
    });
  });

  it('refuses a claim on a report whose status could not be read', () => {
    // **A null status is an absence, not a permission.** The report exists
    // — the type was read — but its status is unknown, so the claim waits.
    expect(decide({ reportStatus: null })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForClaims',
    });
  });

  it('permits a claim only on Open and Claim Requested', () => {
    // **The whitelist, stated as a property.** Every one of the six
    // canonical report statuses is checked against the same two.
    const permitted = REPORT_STATUSES.filter(
      (status) =>
        decide({ reportStatus: status }).kind === 'Permitted',
    );

    expect(permitted).toEqual(['Open', 'Claim Requested']);
  });

  it('refuses a second pending claim from the same member', () => {
    expect(decide({ hasPendingClaim: true })).toEqual({
      kind: 'Blocked',
      reason: 'AlreadyPendingClaim',
    });
  });

  it('refuses an inactive account before it says anything about the report', () => {
    // The account check runs first. Telling a member whose account is
    // pending that the report is closed would leak a fact they were not
    // entitled to.
    expect(decide({ reportStatus: 'Closed' }, 'the-claimant', false)).toEqual({
      kind: 'Blocked',
      reason: 'AccountNotActive',
    });
  });

  it('refuses an own-report claim before it says anything about the status', () => {
    // The ownership check runs before the status check, so a member who
    // claimed their own report is told that — not that the report happens to
    // be closed.
    expect(decide({ reportStatus: 'Closed' }, 'the-finder')).toEqual({
      kind: 'Blocked',
      reason: 'OwnReport',
    });
  });
});

describe('the claim submission block messages', () => {
  it('gives every reason a distinct message', () => {
    const messages = [
      'OwnReport',
      'AccountNotActive',
      'NotFoundReport',
      'NotAFoundReport',
      'ReportNotOpenForClaims',
      'AlreadyPendingClaim',
    ].map((reason) =>
      claimSubmissionBlockMessage(
        reason as Parameters<typeof claimSubmissionBlockMessage>[0],
      ),
    );

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('names the path forward for a duplicate pending claim', () => {
    expect(claimSubmissionBlockMessage('AlreadyPendingClaim')).toContain('already');
  });

  it('carries no blame', () => {
    // The claimant did nothing wrong in any of these cases, so the copy
    // never says they are at fault.
    const messages = [
      'OwnReport',
      'AccountNotActive',
      'NotFoundReport',
      'NotAFoundReport',
      'ReportNotOpenForClaims',
      'AlreadyPendingClaim',
    ].map((reason) =>
      claimSubmissionBlockMessage(
        reason as Parameters<typeof claimSubmissionBlockMessage>[0],
      ),
    );

    for (const message of messages) {
      expect(message.toLowerCase()).not.toContain('invalid');
      expect(message.toLowerCase()).not.toContain('error');
      expect(message.toLowerCase()).not.toContain('not allowed');
    }
  });

  it('refuses a reason it does not know rather than answering for it', () => {
    // **The switch is exhaustive, and the guard proves it.** A new reason
    // added to the union without a message would be a compile error at the
    // `never` assignment — and a reason that reaches the function from
    // outside the type is refused rather than given a wrong message.
    expect(() =>
      claimSubmissionBlockMessage(
        'SomethingElse' as Parameters<typeof claimSubmissionBlockMessage>[0],
      ),
    ).toThrow();
  });
});
