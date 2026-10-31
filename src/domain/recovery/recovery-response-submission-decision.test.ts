/**
 * The Recovery Response submission gate's suite.
 *
 * **The gate is a pure function of the facts**, so every rule can be
 * asserted against fixtures with no database and no network. That is the
 * reason the gate lives in the domain at all.
 *
 * **Each refusal is asserted separately, with its own reason.** The reasons
 * are distinguishable because the responder's remedy differs — a responder
 * who responded to their own Lost report is told so, a responder whose
 * account is not active is told so, and a responder who already holds a live
 * response is told so. Collapsing them into one "not allowed" would leave the
 * responder with no path forward.
 */

import { describe, expect, it } from 'vitest';

import { REPORT_STATUSES } from '@/domain/listings';

import {
  decideRecoveryResponseSubmission,
  LIVE_RECOVERY_RESPONSE_STATUSES,
  recoveryResponseSubmissionBlockMessage,
  type RecoveryResponseSubmissionBlockReason,
  type RecoveryResponseSubmissionFacts,
} from '@/domain/recovery';

/** The facts of a response against an open Lost report by another member. */
const PERMITTED_FACTS: RecoveryResponseSubmissionFacts = {
  reportType: 'Lost',
  reportStatus: 'Open',
  reportOwnerId: 'the-owner',
  hasMatchConfirmed: false,
  hasLiveResponse: false,
};

/**
 * Decide with the permitted facts, overriding one of them.
 */
function decide(
  overrides: Partial<RecoveryResponseSubmissionFacts>,
  responderId = 'the-responder',
  isAccountActive = true,
) {
  return decideRecoveryResponseSubmission({
    responderId,
    isAccountActive,
    facts: { ...PERMITTED_FACTS, ...overrides },
  });
}

describe('the recovery response submission gate', () => {
  it('permits a response against an open Lost report', () => {
    expect(decide({})).toEqual({ kind: 'Permitted' });
  });

  it('permits a response against a report at Verification Pending', () => {
    // FR-40's nuance: the window runs *through* `Verification Pending`, so
    // a second responder arriving while the owner is verifying is still
    // accepted.
    expect(decide({ reportStatus: 'Verification Pending' })).toEqual({
      kind: 'Permitted',
    });
  });

  it('refuses a response from an account that is not active', () => {
    expect(decide({}, 'the-responder', false)).toEqual({
      kind: 'Blocked',
      reason: 'AccountNotActive',
    });
  });

  it('refuses a response on a report that does not exist', () => {
    expect(decide({ reportType: null, reportStatus: null })).toEqual({
      kind: 'Blocked',
      reason: 'NotFoundReport',
    });
  });

  it('refuses a response on a Found report', () => {
    // The Found side uses Claims. A Response against a Found report has no
    // meaning.
    expect(decide({ reportType: 'Found' })).toEqual({
      kind: 'Blocked',
      reason: 'NotALostReport',
    });
  });

  it('refuses a member responding to their own Lost report', () => {
    expect(decide({}, 'the-owner')).toEqual({
      kind: 'Blocked',
      reason: 'OwnReport',
    });
  });

  it('refuses a response on a closed report', () => {
    expect(decide({ reportStatus: 'Closed' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForResponses',
    });
  });

  it('refuses a response on a returned report', () => {
    expect(decide({ reportStatus: 'Returned' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForResponses',
    });
  });

  it('refuses a response on a report whose status it does not recognise', () => {
    // **The rule is a whitelist.** `Open` and `Verification Pending` accept a
    // response and nothing else does — so a status this bolt has not seen is
    // refused rather than waved through. A gate that permits by default
    // fails open.
    expect(decide({ reportStatus: 'Claim Requested' })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForResponses',
    });
  });

  it('refuses a response on a report whose status could not be read', () => {
    // **A null status is an absence, not a permission.** The report exists
    // — the type was read — but its status is unknown, so the response
    // waits.
    expect(decide({ reportStatus: null })).toEqual({
      kind: 'Blocked',
      reason: 'ReportNotOpenForResponses',
    });
  });

  it('permits a response only on Open and Verification Pending', () => {
    // **The whitelist, stated as a property.** Every one of the canonical
    // report statuses is checked against the same two.
    const permitted = REPORT_STATUSES.filter(
      (status) => decide({ reportStatus: status }).kind === 'Permitted',
    );

    expect(permitted).toEqual(['Open', 'Verification Pending']);
  });

  it('refuses a response once the match has been confirmed', () => {
    // FR-40's cutoff: the workflow proceeds to physical handoff, and a new
    // responder arriving now would be responding to a settled outcome.
    expect(decide({ reportStatus: 'Verification Pending', hasMatchConfirmed: true })).toEqual({
      kind: 'Blocked',
      reason: 'MatchAlreadyConfirmed',
    });
  });

  it('refuses a response on an Open report whose match has been confirmed', () => {
    // **The cutoff is unconditional on the report's status.** The workflow
    // never produces this state, but a path that did would want the refusal.
    expect(decide({ reportStatus: 'Open', hasMatchConfirmed: true })).toEqual({
      kind: 'Blocked',
      reason: 'MatchAlreadyConfirmed',
    });
  });

  it('refuses a second live response from the same responder', () => {
    expect(decide({ hasLiveResponse: true })).toEqual({
      kind: 'Blocked',
      reason: 'AlreadyHasLiveResponse',
    });
  });

  it('refuses an inactive account before it says anything about the report', () => {
    // The account check runs first. Telling a responder whose account is
    // pending that the report is closed would leak a fact they were not
    // entitled to.
    expect(decide({ reportStatus: 'Closed' }, 'the-responder', false)).toEqual({
      kind: 'Blocked',
      reason: 'AccountNotActive',
    });
  });

  it('refuses an own-report response before it says anything about the status', () => {
    // The ownership check runs before the status check, so a responder who
    // responded to their own report is told that — not that the report
    // happens to be closed.
    expect(decide({ reportStatus: 'Closed' }, 'the-owner')).toEqual({
      kind: 'Blocked',
      reason: 'OwnReport',
    });
  });

  it('refuses the match cutoff before it says anything about the duplicate', () => {
    // The workflow's own cutoff outranks the responder's own history: a
    // settled match is the reason to refuse, whatever else is true.
    expect(
      decide({ hasMatchConfirmed: true, hasLiveResponse: true }),
    ).toEqual({
      kind: 'Blocked',
      reason: 'MatchAlreadyConfirmed',
    });
  });
});

describe('the live recovery response statuses', () => {
  it('counts Match Confirmed as live', () => {
    // **The least obvious member of the set.** FR-41 makes it non-terminal
    // — the report stays `Verification Pending` until the administrator
    // confirms the physical hand-off — so a responder holding one still
    // holds a live response and may not add another.
    expect(LIVE_RECOVERY_RESPONSE_STATUSES).toContain('Match Confirmed');
  });

  it('counts the three non-terminal statuses and no more', () => {
    expect(LIVE_RECOVERY_RESPONSE_STATUSES).toEqual([
      'Submitted',
      'Selected for Verification',
      'Match Confirmed',
    ]);
  });
});

describe('the recovery response submission block messages', () => {
  it('gives every reason a distinct message', () => {
    const messages = [
      'OwnReport',
      'AccountNotActive',
      'NotFoundReport',
      'NotALostReport',
      'ReportNotOpenForResponses',
      'MatchAlreadyConfirmed',
      'AlreadyHasLiveResponse',
    ].map((reason) =>
      recoveryResponseSubmissionBlockMessage(
        reason as RecoveryResponseSubmissionBlockReason,
      ),
    );

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('names the path forward for a duplicate live response', () => {
    expect(recoveryResponseSubmissionBlockMessage('AlreadyHasLiveResponse')).toContain(
      'already',
    );
  });

  it('carries no blame', () => {
    // The responder did nothing wrong in any of these cases, so the copy
    // never says they are at fault.
    const messages = [
      'OwnReport',
      'AccountNotActive',
      'NotFoundReport',
      'NotALostReport',
      'ReportNotOpenForResponses',
      'MatchAlreadyConfirmed',
      'AlreadyHasLiveResponse',
    ].map((reason) =>
      recoveryResponseSubmissionBlockMessage(
        reason as RecoveryResponseSubmissionBlockReason,
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
      recoveryResponseSubmissionBlockMessage(
        'SomethingElse' as RecoveryResponseSubmissionBlockReason,
      ),
    ).toThrow();
  });
});
