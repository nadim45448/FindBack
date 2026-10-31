/**
 * The owner's determination, recorded by an administrator — FR-43's
 * owner-determines / administrator-records split.
 *
 * **This is the product's most distinctive integrity property, so the
 * load-bearing assertions are about the split.**
 *
 * The two halves are checked **separately**: the recorder must be an
 * administrator, and the maker must be the report's owner. A rule that
 * checked only one half would let a member record a determination (there
 * would be no administrator check) or let an administrator decide on the
 * owner's behalf (there would be no owner check).
 *
 * **The check is about role, not identity.** The same person may fill both
 * halves in two capacities, and refusing that would push operators toward
 * fabricating a second identity.
 *
 * **The two outcomes move the report differently, and the `Match Confirmed`
 * non-terminality is the load-bearing fact.** The item has been *identified*;
 * it has not yet been *physically returned*.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import {
  assertDeterminationPermitted,
  decideDetermination,
  decideDeterminationOutcome,
  determinationRefusalMessage,
  DETERMINATION_REPORT_STATUSES,
  DETERMINATION_RESPONSE_STATUSES,
  type DeterminationFacts,
} from './recovery-response-determination';

/** The facts of a plain, permitted determination. */
function facts(overrides: Partial<DeterminationFacts> = {}): DeterminationFacts {
  return {
    recorderId: 'admin-1',
    isAdministrator: true,
    reportOwnerId: 'owner-1',
    determinedByUserId: 'owner-1',
    responseStatus: 'Selected for Verification',
    ...overrides,
  };
}

describe('the determination rule', () => {
  it('permits an administrator to record the owner’s determination', () => {
    expect(decideDetermination(facts()).kind).toBe('Permitted');
  });

  it('refuses a recorder who is not an administrator', () => {
    const decision = decideDetermination(facts({ isAdministrator: false }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'NotAdministrator' });
  });

  it('refuses a recording with no owner determination', () => {
    // **A recording with no maker is the administrator deciding on their
    // own** — precisely what FR-43 forbids.
    const decision = decideDetermination(facts({ determinedByUserId: null }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'NoOwnerDetermination' });
  });

  it('refuses a maker who is not the report owner', () => {
    const decision = decideDetermination(facts({ determinedByUserId: 'someone-else' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'DeterminerIsNotOwner' });
  });

  it('refuses a response that is not Selected for Verification', () => {
    const decision = decideDetermination(facts({ responseStatus: 'Submitted' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'ResponseNotSelected' });
  });

  it('refuses a response that has already been determined', () => {
    const decision = decideDetermination(facts({ responseStatus: 'Match Confirmed' }));

    expect(decision).toEqual({ kind: 'Refused', reason: 'ResponseNotSelected' });
  });
});

describe('the two halves are checked separately', () => {
  it('checks the recorder first', () => {
    // **A non-administrator may not record anything, whatever else is
    // true.** The check that comes first is the one that cannot be
    // satisfied by any other fact.
    const decision = decideDetermination(
      facts({ isAdministrator: false, determinedByUserId: null }),
    );

    expect(decision).toEqual({ kind: 'Refused', reason: 'NotAdministrator' });
  });

  it('checks the maker’s completeness before the maker’s identity', () => {
    const decision = decideDetermination(
      facts({ determinedByUserId: null, reportOwnerId: 'someone-else' }),
    );

    expect(decision).toEqual({ kind: 'Refused', reason: 'NoOwnerDetermination' });
  });

  it('lets the same person fill both halves when they are both roles', () => {
    // **The check is about role, not identity.** Where the Lost-report owner
    // is themselves an administrator acting in their administrator capacity,
    // that is a legitimate determination.
    const decision = decideDetermination(
      facts({ recorderId: 'owner-1', reportOwnerId: 'owner-1', determinedByUserId: 'owner-1' }),
    );

    expect(decision.kind).toBe('Permitted');
  });
});

describe('the outcomes', () => {
  it('moves the response to Match Confirmed and leaves the report pending', () => {
    // **The `Match Confirmed` non-terminality is the load-bearing fact.**
    // The item has been identified; it has not been physically returned.
    const outcome = decideDeterminationOutcome('match_confirmed');

    expect(outcome.responseStatus).toBe('Match Confirmed');
    expect(outcome.reportStatus).toBe('Verification Pending');
  });

  it('moves the response to Not a Match and returns the report to Open', () => {
    const outcome = decideDeterminationOutcome('not_a_match');

    expect(outcome.responseStatus).toBe('Not a Match');
    expect(outcome.reportStatus).toBe('Open');
  });

  it('refuses an outcome outside the two the PRD names', () => {
    expect(() =>
      decideDeterminationOutcome('maybe' as 'match_confirmed'),
    ).toThrow(ConflictError);
  });

  it('maps each outcome to exactly one response status and one report status', () => {
    expect(Object.keys(DETERMINATION_RESPONSE_STATUSES)).toEqual([
      'match_confirmed',
      'not_a_match',
    ]);
    expect(Object.keys(DETERMINATION_REPORT_STATUSES)).toEqual([
      'match_confirmed',
      'not_a_match',
    ]);
  });
});

describe('the refusal messages', () => {
  it('names the remedy for each reason', () => {
    for (const reason of [
      'NotAdministrator',
      'NoOwnerDetermination',
      'DeterminerIsNotOwner',
      'ResponseNotSelected',
    ] as const) {
      expect(determinationRefusalMessage(reason)).toMatch(/\S/);
    }
  });

  it('tells a non-administrator that only an administrator may record', () => {
    expect(determinationRefusalMessage('NotAdministrator')).toMatch(/administrator/i);
  });

  it('tells the recorder that the owner’s determination is required', () => {
    expect(determinationRefusalMessage('NoOwnerDetermination')).toMatch(/determination/i);
  });

  it('tells the recorder that only the owner may determine', () => {
    expect(determinationRefusalMessage('DeterminerIsNotOwner')).toMatch(/owner/i);
  });
});

describe('assertDeterminationPermitted', () => {
  it('returns the permitted decision without throwing', () => {
    expect(assertDeterminationPermitted(facts()).kind).toBe('Permitted');
  });

  it('throws a permission failure when the recorder is not an administrator', () => {
    expect(() =>
      assertDeterminationPermitted(facts({ isAdministrator: false })),
    ).toThrow(PermissionDeniedError);
  });

  it('throws a permission failure when no determination was supplied', () => {
    expect(() =>
      assertDeterminationPermitted(facts({ determinedByUserId: null })),
    ).toThrow(PermissionDeniedError);
  });

  it('throws a permission failure when the maker is not the owner', () => {
    expect(() =>
      assertDeterminationPermitted(facts({ determinedByUserId: 'someone-else' })),
    ).toThrow(PermissionDeniedError);
  });

  it('throws a conflict when the response is not awaiting determination', () => {
    expect(() =>
      assertDeterminationPermitted(facts({ responseStatus: 'Submitted' })),
    ).toThrow(ConflictError);
  });
});
