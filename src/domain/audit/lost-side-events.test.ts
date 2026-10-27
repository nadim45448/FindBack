import { describe, expect, it } from 'vitest';

import {
  BatchResolutionError,
  DeterminationActorError,
  EventPairingError,
  LostSideFieldError,
  SystemActorCauseError,
  assertBatchShape,
  assertDeterminationPair,
  assertReturnedPairing,
  isPriorLostReportStatus,
  isRecoveryResponseStatus,
  resolveSystemActor,
  RECOVERY_RESPONSE_STATUSES,
} from './lost-side-events';

/**
 * The guards are the PRD's per-event rules, written once so a firing module
 * cannot satisfy them accidentally in one place and violate them in another.
 */
describe('determination pair', () => {
  const owner = 'owner-1';
  const admin = 'admin-1';

  it('accepts a determination made by the report owner', () => {
    expect(() =>
      assertDeterminationPair(
        'recovery_response.determined_match_confirmed',
        { determinedByUserId: owner, recordedByAdministratorId: admin },
        owner,
      ),
    ).not.toThrow();
  });

  it('refuses a missing determined_by half', () => {
    expect(() =>
      assertDeterminationPair(
        'recovery_response.determined_match_confirmed',
        { determinedByUserId: '', recordedByAdministratorId: admin },
        owner,
      ),
    ).toThrow(DeterminationActorError);
  });

  it('refuses a missing recorded_by half', () => {
    expect(() =>
      assertDeterminationPair(
        'recovery_response.determined_match_confirmed',
        { determinedByUserId: owner, recordedByAdministratorId: '' },
        owner,
      ),
    ).toThrow(DeterminationActorError);
  });

  it('refuses a maker who is not the report owner', () => {
    expect(() =>
      assertDeterminationPair(
        'recovery_response.determined_match_confirmed',
        { determinedByUserId: 'someone-else', recordedByAdministratorId: admin },
        owner,
      ),
    ).toThrow(DeterminationActorError);
  });

  it('accepts the same person in both capacities when the owner is an administrator', () => {
    // `administrator` is a flag on an Account, not a disjoint role. A
    // determination on an administrator-owned report is legitimate, and
    // refusing it would push operators toward fabricating a second identity.
    expect(() =>
      assertDeterminationPair(
        'recovery_response.determined_match_confirmed',
        { determinedByUserId: admin, recordedByAdministratorId: admin },
        admin,
      ),
    ).not.toThrow();
  });
});

describe('system actor resolution', () => {
  it('names the administrator in both the actor and the acting column', () => {
    const actor = resolveSystemActor('report.lost_returned_child_response_resolution', {
      actingAdministratorId: 'admin-1',
      actingMemberId: null,
      triggeredByRole: 'administrator',
    });

    expect(actor.actorId).toBe('admin-1');
    expect(actor.actorRole).toBe('system');
    expect(actor.actingAdministratorId).toBe('admin-1');
  });

  it('carries a member cause in the actor with no administrator', () => {
    const actor = resolveSystemActor('report.lost_transition_to_verification_pending', {
      actingAdministratorId: null,
      actingMemberId: 'owner-1',
      triggeredByRole: 'owner',
    });

    expect(actor.actorId).toBe('owner-1');
    expect(actor.actorRole).toBe('system');
    expect(actor.actingAdministratorId).toBeNull();
  });

  it('refuses a system event that names no human', () => {
    expect(() =>
      resolveSystemActor('report.lost_closed_child_response_resolution', {
        actingAdministratorId: null,
        actingMemberId: null,
        triggeredByRole: 'reporter',
      }),
    ).toThrow(SystemActorCauseError);
  });
});

describe('batch shape', () => {
  const eventType = 'report.lost_returned_child_response_resolution';

  it('accepts a non-empty set with a prior status on every entry', () => {
    expect(() =>
      assertBatchShape(eventType, {
        resolvedResponses: [
          { recoveryResponseId: 'rr-1', previousStatus: 'Submitted' },
          { recoveryResponseId: 'rr-2', previousStatus: 'Selected for Verification' },
        ],
        targetStatus: 'Resolved — Report Returned',
      }),
    ).not.toThrow();
  });

  it('refuses an empty set', () => {
    expect(() =>
      assertBatchShape(eventType, {
        resolvedResponses: [],
        targetStatus: 'Resolved — Report Returned',
      }),
    ).toThrow(BatchResolutionError);
  });

  it('refuses an entry with no response id', () => {
    expect(() =>
      assertBatchShape(eventType, {
        resolvedResponses: [{ recoveryResponseId: '', previousStatus: 'Submitted' }],
        targetStatus: 'Resolved — Report Returned',
      }),
    ).toThrow(BatchResolutionError);
  });

  it('refuses a prior status outside the canonical set', () => {
    expect(() =>
      assertBatchShape(eventType, {
        resolvedResponses: [{ recoveryResponseId: 'rr-1', previousStatus: 'Standby' as never }],
        targetStatus: 'Resolved — Report Returned',
      }),
    ).toThrow(BatchResolutionError);
  });
});

describe('returned pairing', () => {
  it('accepts a matched response the two events agree on', () => {
    expect(() => assertReturnedPairing('rr-1', 'rr-1')).not.toThrow();
  });

  it('refuses a pair the two events disagree on', () => {
    expect(() => assertReturnedPairing('rr-1', 'rr-2')).toThrow(EventPairingError);
  });
});

describe('canonical statuses', () => {
  it('holds FR-41 eight statuses and no Standby', () => {
    expect(RECOVERY_RESPONSE_STATUSES).toHaveLength(8);
    expect(RECOVERY_RESPONSE_STATUSES).not.toContain('Standby');
  });

  it('recognises only the canonical statuses', () => {
    expect(isRecoveryResponseStatus('Match Confirmed')).toBe(true);
    expect(isRecoveryResponseStatus('Standby')).toBe(false);
    expect(isRecoveryResponseStatus('Verification Pending')).toBe(false);
  });

  it('recognises only the two prior Lost-report statuses', () => {
    expect(isPriorLostReportStatus('Open')).toBe(true);
    expect(isPriorLostReportStatus('Verification Pending')).toBe(true);
    // `Match Confirmed` is a Recovery Response status, never a Lost-report
    // status, and the PRD says so explicitly.
    expect(isPriorLostReportStatus('Match Confirmed')).toBe(false);
    expect(isPriorLostReportStatus('Returned')).toBe(false);
  });
});

describe('lost side field error', () => {
  it('names the event and the field it refused', () => {
    const error = new LostSideFieldError('report.lost_closed_by_administrator', 'reason');

    expect(error.eventType).toBe('report.lost_closed_by_administrator');
    expect(error.field).toBe('reason');
  });
});
