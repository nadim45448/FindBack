/**
 * The owner's provisional selection — FR-43's selection rule.
 *
 * **The load-bearing assertions are about the refusals and the one no-op.**
 *
 * The permitted path is the easy half. What the rule must get right is the
 * set of things it *refuses* — and the order it refuses them in, because a
 * confirmed match stops the workflow regardless of who is asking.
 *
 * **The `Match Confirmed` lock is unconditional.** It is checked before
 * ownership, before the report's status, and before the response's own
 * status. A report whose selected response has been confirmed is a report
 * whose outcome is settled, and a settled outcome stops the workflow
 * whatever else the facts say.
 *
 * **The already-selected case is a no-op, not a refusal.** The owner
 * clicking twice is a repeated request for a state that already holds — not
 * a mistake that needs an error message, and not a second audit entry.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import {
  assertSelectionPermitted,
  decideSelection,
  maySelect,
  selectionRefusalMessage,
  SELECTED_FOR_VERIFICATION_STATUS,
  VERIFICATION_PENDING_REPORT_STATUS,
  type SelectionFacts,
} from './recovery-response-selection';

/** The facts of a plain, permitted selection. */
function facts(overrides: Partial<SelectionFacts> = {}): SelectionFacts {
  return {
    actorId: 'owner-1',
    reportOwnerId: 'owner-1',
    reportStatus: 'Open',
    responseStatus: 'Submitted',
    hasMatchConfirmed: false,
    ...overrides,
  };
}

describe('the selection rule', () => {
  it('permits the owner to select a Submitted response on an Open report', () => {
    const decision = decideSelection(facts());

    expect(decision).toEqual({
      kind: 'Permitted',
      responseStatus: SELECTED_FOR_VERIFICATION_STATUS,
      reportStatus: VERIFICATION_PENDING_REPORT_STATUS,
    });
  });

  it('moves the report to Verification Pending as part of the decision', () => {
    // **The report's move is not optional.** A selection that left the
    // report `Open` would mean the owner's choice had no effect on the
    // workflow.
    const decision = decideSelection(facts());

    expect(decision.kind === 'Permitted' ? decision.reportStatus : null).toBe('Verification Pending');
  });

  it('refuses an actor who is not the report owner', () => {
    const decision = decideSelection(facts({ actorId: 'someone-else' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'NotOwner' });
  });

  it('refuses a report that is not Open', () => {
    const decision = decideSelection(facts({ reportStatus: 'Closed' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'ReportNotOpen' });
  });

  it('refuses a response that is not Submitted', () => {
    const decision = decideSelection(facts({ responseStatus: 'Withdrawn' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'ResponseNotSubmitted' });
  });

  it('treats the already-selected response as an idempotent no-op', () => {
    const decision = decideSelection(
      facts({ responseStatus: 'Selected for Verification' }),
    );

    expect(decision.kind).toBe('AlreadySelected');
  });

  it('answers the same question the same way through maySelect', () => {
    expect(maySelect(facts())).toBe(true);
    expect(maySelect(facts({ actorId: 'someone-else' }))).toBe(false);
    expect(maySelect(facts({ hasMatchConfirmed: true }))).toBe(false);
  });
});

describe('the Match Confirmed lock', () => {
  it('refuses a selection once the match has been confirmed', () => {
    const decision = decideSelection(facts({ hasMatchConfirmed: true }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'MatchConfirmed' });
  });

  it('is checked unconditionally — before ownership', () => {
    // **The lock is not conditional on who is asking.** A settled outcome
    // stops the workflow whatever else the facts say, and a non-owner
    // discovering the lock first would leak the outcome to them.
    const decision = decideSelection(
      facts({ actorId: 'someone-else', hasMatchConfirmed: true }),
    );

    expect(decision).toEqual({ kind: 'Refused', reason: 'MatchConfirmed' });
  });

  it('is checked before the report status', () => {
    const decision = decideSelection(
      facts({ reportStatus: 'Open', hasMatchConfirmed: true }),
    );

    expect(decision).toEqual({ kind: 'Refused', reason: 'MatchConfirmed' });
  });

  it('is checked before the already-selected no-op', () => {
    // **A repeated selection on a report whose match is confirmed is not a
    // no-op.** The workflow has moved on, and the honest answer is the lock.
    const decision = decideSelection(
      facts({ responseStatus: 'Selected for Verification', hasMatchConfirmed: true }),
    );

    expect(decision).toEqual({ kind: 'Refused', reason: 'MatchConfirmed' });
  });
});

describe('the refusal messages', () => {
  it('names the remedy for each reason', () => {
    for (const reason of [
      'NotOwner',
      'ReportNotOpen',
      'MatchConfirmed',
      'ResponseNotSubmitted',
    ] as const) {
      expect(selectionRefusalMessage(reason)).toMatch(/\S/);
    }
  });

  it('tells a non-owner that only the owner may select', () => {
    expect(selectionRefusalMessage('NotOwner')).toMatch(/owner/i);
  });

  it('tells the owner that a confirmed match stops the workflow', () => {
    expect(selectionRefusalMessage('MatchConfirmed')).toMatch(/match/i);
  });
});

describe('assertSelectionPermitted', () => {
  it('returns the permitted decision without throwing', () => {
    expect(assertSelectionPermitted(facts()).kind).toBe('Permitted');
  });

  it('returns the already-selected decision without throwing', () => {
    // **A no-op is not a refusal.** The caller checks the kind to learn that
    // nothing is to be written.
    expect(
      assertSelectionPermitted(
        facts({ responseStatus: 'Selected for Verification' }),
      ).kind,
    ).toBe('AlreadySelected');
  });

  it('throws a permission failure when the actor is not the owner', () => {
    expect(() =>
      assertSelectionPermitted(facts({ actorId: 'someone-else' })),
    ).toThrow(PermissionDeniedError);
  });

  it('throws a conflict when the workflow state refuses the selection', () => {
    expect(() => assertSelectionPermitted(facts({ reportStatus: 'Closed' }))).toThrow(
      ConflictError,
    );
    expect(() => assertSelectionPermitted(facts({ hasMatchConfirmed: true }))).toThrow(
      ConflictError,
    );
  });
});
