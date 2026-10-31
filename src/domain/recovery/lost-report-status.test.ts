/**
 * The Lost-side report status machine — FR-42's auto-transitions.
 *
 * **The load-bearing assertion is the no-op row.**
 *
 * `Match Confirmed` does not move the report. The item has been
 * *identified*; it has not been *physically returned*. A table that treated
 * the confirmation as an ending would close the workflow before the item
 * reached its owner.
 *
 * **The row is present rather than absent,** and that is deliberate — a
 * reader can tell "deliberately a no-op" from "not yet implemented".
 *
 * **The machine is the Lost side's only.** A Found report is not in it, and
 * the Found side's statuses are refused — the two workflows never share a
 * transition function, an aggregate, or a status enum.
 */

import { describe, expect, it } from 'vitest';

import {
  assertLostReportTransition,
  decideLostReportTransition,
  isLostReportActiveStatus,
  LOST_REPORT_ACTIVE_STATUSES,
  lostReportTransitionTarget,
  type LostReportTransitionCause,
} from './lost-report-status';

describe('the Lost-side status machine', () => {
  it('owns exactly the two non-terminal Lost statuses', () => {
    expect(LOST_REPORT_ACTIVE_STATUSES).toEqual(['Open', 'Verification Pending']);
  });

  it('refuses the Found side’s statuses', () => {
    // **The two state machines share no vocabulary.** `Claim Requested` and
    // `Claim Approved` belong to the Found side, and a machine that owned
    // them would permit a combination that cannot occur.
    expect(isLostReportActiveStatus('Claim Requested')).toBe(false);
    expect(isLostReportActiveStatus('Claim Approved')).toBe(false);
  });

  it('refuses the terminal statuses', () => {
    expect(isLostReportActiveStatus('Returned')).toBe(false);
    expect(isLostReportActiveStatus('Closed')).toBe(false);
  });
});

describe('the transitions', () => {
  it('moves an Open report to Verification Pending when a response is selected', () => {
    expect(decideLostReportTransition('Lost', 'Open', 'ResponseSelected')).toEqual({
      kind: 'Moved',
      from: 'Open',
      to: 'Verification Pending',
    });
  });

  it('leaves the report Verification Pending when the match is confirmed', () => {
    // **The deliberate no-op.** The row exists to state that the
    // determination was considered and deliberately lands here.
    expect(decideLostReportTransition('Lost', 'Verification Pending', 'MatchConfirmed')).toEqual({
      kind: 'Unchanged',
      status: 'Verification Pending',
    });
  });

  it('returns the report to Open when the response is not a match', () => {
    expect(decideLostReportTransition('Lost', 'Verification Pending', 'NotAMatch')).toEqual({
      kind: 'Moved',
      from: 'Verification Pending',
      to: 'Open',
    });
  });

  it('closes the report when the reporter withdraws it', () => {
    expect(decideLostReportTransition('Lost', 'Open', 'ReporterWithdrawn')).toEqual({
      kind: 'Moved',
      from: 'Open',
      to: 'Closed',
    });
  });

  it('closes the report when an administrator closes it', () => {
    expect(decideLostReportTransition('Lost', 'Verification Pending', 'AdministratorClosed')).toEqual({
      kind: 'Moved',
      from: 'Verification Pending',
      to: 'Closed',
    });
  });
});

describe('the refusals', () => {
  it('refuses a report that is not a Lost report', () => {
    expect(decideLostReportTransition('Found', 'Open', 'ResponseSelected')).toEqual({
      kind: 'Refused',
      reason: 'NotALostReport',
    });
  });

  it('refuses a terminal report — nothing leaves Returned or Closed', () => {
    expect(decideLostReportTransition('Lost', 'Closed', 'ReporterWithdrawn')).toEqual({
      kind: 'Refused',
      reason: 'TerminalStatus',
    });
    expect(decideLostReportTransition('Lost', 'Returned', 'AdministratorClosed')).toEqual({
      kind: 'Refused',
      reason: 'TerminalStatus',
    });
  });

  it('refuses a cause that does not apply to the current status', () => {
    // **A selection applies to an `Open` report.** The report reaches
    // `Verification Pending` *by* being selected into.
    expect(decideLostReportTransition('Lost', 'Verification Pending', 'ResponseSelected')).toEqual({
      kind: 'Refused',
      reason: 'CauseNotApplicable',
    });
  });

  it('refuses a not-a-match on a report that is not Verification Pending', () => {
    expect(decideLostReportTransition('Lost', 'Open', 'NotAMatch')).toEqual({
      kind: 'Refused',
      reason: 'CauseNotApplicable',
    });
  });

  it('refuses a status this machine does not own', () => {
    expect(decideLostReportTransition('Lost', 'Claim Approved', 'ResponseSelected')).toEqual({
      kind: 'Refused',
      reason: 'NotALostReport',
    });
  });
});

describe('the transition targets', () => {
  it('names a target for every cause', () => {
    // **The table is total over the causes,** so an illegal transition is a
    // lookup that misses rather than "not yet implemented".
    const causes: LostReportTransitionCause[] = [
      'ResponseSelected',
      'MatchConfirmed',
      'NotAMatch',
      'ReporterWithdrawn',
      'AdministratorClosed',
    ];

    for (const cause of causes) {
      expect(lostReportTransitionTarget(cause)).toMatch(/\S/);
    }
  });

  it('does not offer Returned', () => {
    // **`Returned` is reachable only through Unit 005's explicit Confirm
    // Returned action.** A table that listed it would make the thing the
    // story forbids one line away.
    for (const cause of [
      'ResponseSelected',
      'MatchConfirmed',
      'NotAMatch',
      'ReporterWithdrawn',
      'AdministratorClosed',
    ] as LostReportTransitionCause[]) {
      expect(lostReportTransitionTarget(cause)).not.toBe('Returned');
    }
  });

  it('throws for a cause outside the five', () => {
    expect(() => lostReportTransitionTarget('Returned' as LostReportTransitionCause)).toThrow();
  });
});

describe('assertLostReportTransition', () => {
  it('returns the transition without throwing when it is permitted', () => {
    expect(assertLostReportTransition('Lost', 'Open', 'ResponseSelected').kind).toBe('Moved');
  });

  it('throws when the transition is refused', () => {
    expect(() => assertLostReportTransition('Found', 'Open', 'ResponseSelected')).toThrow();
    expect(() => assertLostReportTransition('Lost', 'Closed', 'ReporterWithdrawn')).toThrow();
  });
});
