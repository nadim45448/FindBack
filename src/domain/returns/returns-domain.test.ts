/**
 * The returns domain's suite — FR-23, FR-24, and FR-25.
 *
 * **The suite proves three things.**
 *
 * 1. **There is one implementation, not one per direction.** The same
 *    decision function serves both directions, and the report's type is
 *    what selects between the two preconditions and the two receiver
 *    rules. The suite exercises both directions against the *same* function
 *    — so a rule that quietly became Found-only or Lost-only would fail
 *    here rather than in production.
 * 2. **The guard is absolute.** FR-25 refuses a Returned with no receiver,
 *    and the refusal is at the domain boundary — not only in the form.
 * 3. **The relationship set is closed.** A relationship the PRD does not
 *    name is refused, not stored.
 *
 * **The precondition table is proven against the vocabulary it names.** A
 * test that hard-codes the two statuses would still pass if the domain's
 * table changed — so the suite reads the statuses the domain's own
 * function returns and compares them against the PRD's names.
 */

import { describe, expect, it } from 'vitest';

import {
  assertConfirmReturnedPermitted,
  assertDefaultReceiver,
  buildReturnedConfirmationEvent,
  confirmReturnedRefusalMessage,
  createAuthorizationAffirmation,
  createSubstituteReceiver,
  createSubstituteReceiverName,
  createSubstituteRelationship,
  decideConfirmReturned,
  deriveDefaultReceiver,
  isSubstituteRelationship,
  requiredPreconditionStatus,
  RETURNED_CONFIRMED_DEFAULT_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_LOST_DEFAULT_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_LOST_SUBSTITUTE_RECEIVER_EVENT_TYPE,
  RETURNED_CONFIRMED_SUBSTITUTE_RECEIVER_EVENT_TYPE,
  SUBSTITUTE_RELATIONSHIPS,
  type ConfirmReturnedFacts,
} from '@/domain/returns';

import type { ReportType } from '@/domain/listings';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

/** The facts of a Found report awaiting its return. */
const FOUND_READY: ConfirmReturnedFacts = {
  reportType: 'Found',
  reportStatus: 'Claim Approved',
  reporterId: 'finder-1',
  approvedClaimantId: 'claimant-1',
  isAdministrator: true,
  substitute: null,
};

/** The facts of a Lost report awaiting its return. */
const LOST_READY: ConfirmReturnedFacts = {
  reportType: 'Lost',
  reportStatus: 'Verification Pending',
  reporterId: 'owner-1',
  approvedClaimantId: null,
  isAdministrator: true,
  substitute: null,
};

/** A well-formed substitute. */
const SUBSTITUTE = {
  name: 'Sam Okafor',
  authorizationConfirmed: true,
  relationship: 'Friend',
};

// ── The precondition table ─────────────────────────────────────────────────

describe('the return precondition table', () => {
  it('requires Claim Approved for a Found report', () => {
    // **FR-23: "An administrator can confirm Returned on a report whose
    // status is Claim Approved."**
    expect(requiredPreconditionStatus('Found')).toBe('Claim Approved');
  });

  it('requires Verification Pending for a Lost report', () => {
    // **FR-45: "The Lost report transitions from Verification Pending to
    // Returned."**
    expect(requiredPreconditionStatus('Lost')).toBe('Verification Pending');
  });

  it('gives the two directions different preconditions', () => {
    // **The directions differ, and a single list would let a Found report
    // be confirmed from the Lost side's precondition** — a report state
    // that cannot exist for it.
    expect(requiredPreconditionStatus('Found')).not.toBe(
      requiredPreconditionStatus('Lost'),
    );
  });

  it('refuses a report type outside the table', () => {
    // **The table is total over the two types,** and a type outside it is a
    // defect rather than a default. A silent fallback would name the wrong
    // precondition for a report whose type is unknown.
    expect(() =>
      requiredPreconditionStatus('Mislaid' as unknown as ReportType),
    ).toThrow(/not a report type/);
  });
});

// ── The default receiver's derivation ──────────────────────────────────────

describe('the default receiver', () => {
  it('is the approved claimant on a Found report', () => {
    // **FR-23: "The default receiver is the claimant on the approved
    // claim."**
    const receiver = deriveDefaultReceiver({
      reportType: 'Found',
      reporterId: 'finder-1',
      approvedClaimantId: 'claimant-1',
    });

    expect(receiver?.accountId).toBe('claimant-1');
  });

  it('is not the finder on a Found report', () => {
    // **Story 001: "Then it is the approved claimant and not the finder."**
    const receiver = deriveDefaultReceiver({
      reportType: 'Found',
      reporterId: 'finder-1',
      approvedClaimantId: 'claimant-1',
    });

    expect(receiver?.accountId).not.toBe('finder-1');
  });

  it('is the Lost-report owner on a Lost report', () => {
    // **FR-45: the default is the Lost-report owner.**
    const receiver = deriveDefaultReceiver({
      reportType: 'Lost',
      reporterId: 'owner-1',
      approvedClaimantId: null,
    });

    expect(receiver?.accountId).toBe('owner-1');
  });

  it('does not exist on a Found report with no approved Claim', () => {
    // **Story 001's edge case: "Found report with no approved Claim —
    // Cannot reach Returned; the precondition does not exist."**
    const receiver = deriveDefaultReceiver({
      reportType: 'Found',
      reporterId: 'finder-1',
      approvedClaimantId: null,
    });

    expect(receiver).toBeNull();
  });

  it('ignores the reporter when the report is Found', () => {
    // **The Found branch must not be able to reach the owner.** The
    // derivation is *given* the owner, and the Found branch does not use
    // it.
    const receiver = deriveDefaultReceiver({
      reportType: 'Found',
      reporterId: 'finder-1',
      approvedClaimantId: 'claimant-1',
    });

    expect(receiver?.accountId).not.toBe('finder-1');
  });
});

// ── The substitute's fields ────────────────────────────────────────────────

describe('the substitute receiver', () => {
  it('accepts each of the PRD\'s five relationships', () => {
    // **The set is the PRD's, verbatim.**
    expect([...SUBSTITUTE_RELATIONSHIPS]).toEqual([
      'Friend',
      'Family Member',
      'Colleague',
      'Classmate',
      'Other',
    ]);
  });

  it('refuses a relationship outside the closed set', () => {
    // **A relationship the PRD does not name is refused, not stored.**
    expect(() => createSubstituteRelationship('Neighbour')).toThrow(ValidationError);
  });

  it('refuses a relationship that is merely close to the set', () => {
    expect(() => createSubstituteRelationship('family member')).toThrow(ValidationError);
  });

  it('recognises exactly the five relationships', () => {
    for (const relationship of SUBSTITUTE_RELATIONSHIPS) {
      expect(isSubstituteRelationship(relationship)).toBe(true);
    }

    expect(isSubstituteRelationship('Neighbour')).toBe(false);
  });

  it('accepts a single-character name', () => {
    // **Story 002's edge case: "Substitute name is a single character —
    // Accepted within length bounds."**
    expect(createSubstituteReceiverName('X').value).toBe('X');
  });

  it('refuses an empty name', () => {
    expect(() => createSubstituteReceiverName('')).toThrow(ValidationError);
  });

  it('refuses a whitespace-only name', () => {
    // **Story 003's edge case: "Receiver field present but whitespace only
    // — Treated as no receiver; refused."**
    expect(() => createSubstituteReceiverName('   \t  ')).toThrow(ValidationError);
  });

  it('trims a name before storing it', () => {
    expect(createSubstituteReceiverName('  Sam  ').value).toBe('Sam');
  });

  it('accepts a name of exactly eighty characters', () => {
    const name = 'a'.repeat(80);

    expect(createSubstituteReceiverName(name).value).toBe(name);
  });

  it('refuses a name of eighty-one characters', () => {
    expect(() => createSubstituteReceiverName('a'.repeat(81))).toThrow(ValidationError);
  });

  it('refuses an unconfirmed authorization', () => {
    // **FR-24: the authorization is required.** An unconfirmed affirmation
    // is the absence of the fact the record exists to preserve.
    expect(() => createAuthorizationAffirmation(false)).toThrow(ValidationError);
  });

  it('accepts a confirmed authorization', () => {
    expect(createAuthorizationAffirmation(true).confirmed).toBe(true);
  });

  it('builds all three fields together', () => {
    const substitute = createSubstituteReceiver(SUBSTITUTE);

    expect(substitute.name.value).toBe('Sam Okafor');
    expect(substitute.authorization.confirmed).toBe(true);
    expect(substitute.relationship).toBe('Friend');
  });

  it('refuses the group when the name is missing', () => {
    expect(() =>
      createSubstituteReceiver({ ...SUBSTITUTE, name: '' }),
    ).toThrow(ValidationError);
  });

  it('refuses the group when the authorization is missing', () => {
    expect(() =>
      createSubstituteReceiver({ ...SUBSTITUTE, authorizationConfirmed: false }),
    ).toThrow(ValidationError);
  });

  it('refuses the group when the relationship is outside the set', () => {
    expect(() =>
      createSubstituteReceiver({ ...SUBSTITUTE, relationship: 'Neighbour' }),
    ).toThrow(ValidationError);
  });
});

// ── The decision, both directions ──────────────────────────────────────────

describe('the confirm-returned decision', () => {
  it('permits a Found report in Claim Approved', () => {
    const decision = decideConfirmReturned(FOUND_READY);

    expect(decision.kind).toBe('Permitted');
  });

  it('permits a Lost report in Verification Pending', () => {
    // **The same function serves both directions.** That is the whole point
    // of this module.
    const decision = decideConfirmReturned(LOST_READY);

    expect(decision.kind).toBe('Permitted');
  });

  it('names the approved claimant as the Found report\'s receiver', () => {
    const decision = decideConfirmReturned(FOUND_READY);

    expect(
      decision.kind === 'Permitted' ? decision.defaultReceiver?.accountId : null,
    ).toBe('claimant-1');
  });

  it('names the Lost-report owner as the Lost report\'s receiver', () => {
    const decision = decideConfirmReturned(LOST_READY);

    expect(
      decision.kind === 'Permitted' ? decision.defaultReceiver?.accountId : null,
    ).toBe('owner-1');
  });

  it('moves the report to Returned', () => {
    const decision = decideConfirmReturned(LOST_READY);

    expect(decision.kind === 'Permitted' ? decision.reportStatus : null).toBe(
      'Returned',
    );
  });

  it('refuses a member who is not an administrator', () => {
    // **FR-23: "Returned is confirmed by an administrator only."**
    const decision = decideConfirmReturned({ ...LOST_READY, ...MEMBER });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'NotAdministrator',
    );
  });

  it('refuses the Lost-report owner confirming their own report', () => {
    // **Story 001: "Given a Lost report, when the owner attempts to confirm
    // Returned on their own report, then the action is refused."**
    //
    // The owner is a member, not an administrator, so the administrator
    // check refuses them. The rule is about the *role*, not about identity
    // — which is why the check is the role check.
    const decision = decideConfirmReturned({
      ...LOST_READY,
      isAdministrator: false,
      reporterId: 'owner-1',
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'NotAdministrator',
    );
  });

  it('refuses a Found report that is not Claim Approved', () => {
    // **A Found report in `Open` has no approved Claim yet.**
    const decision = decideConfirmReturned({
      ...FOUND_READY,
      reportStatus: 'Open',
      approvedClaimantId: null,
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'PreconditionNotMet',
    );
  });

  it('refuses a Lost report that is Open', () => {
    const decision = decideConfirmReturned({ ...LOST_READY, reportStatus: 'Open' });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'PreconditionNotMet',
    );
  });

  it('refuses a Found report in the Lost side\'s precondition status', () => {
    // **A Found report in `Verification Pending` cannot exist** — and the
    // precondition table refuses it rather than accepting the Lost side's
    // status for a Found report.
    const decision = decideConfirmReturned({
      ...FOUND_READY,
      reportStatus: 'Verification Pending',
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'PreconditionNotMet',
    );
  });

  it('refuses a Lost report in the Found side\'s precondition status', () => {
    const decision = decideConfirmReturned({
      ...LOST_READY,
      reportStatus: 'Claim Approved',
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'PreconditionNotMet',
    );
  });

  it('refuses a report that is already Returned', () => {
    // **`Returned` is terminal.**
    const decision = decideConfirmReturned({ ...LOST_READY, reportStatus: 'Returned' });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'TerminalStatus',
    );
  });

  it('refuses a report that is already Closed', () => {
    // **`Closed` is terminal too.**
    const decision = decideConfirmReturned({ ...LOST_READY, reportStatus: 'Closed' });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'TerminalStatus',
    );
  });

  it('refuses a Found report with no approved Claim', () => {
    const decision = decideConfirmReturned({
      ...FOUND_READY,
      approvedClaimantId: null,
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'NoDefaultReceiver',
    );
  });

  it('refuses a Found report with no approved Claim even with a substitute', () => {
    // **The authorization is the default receiver's consent** — and without
    // the default receiver there is nobody whose consent could be recorded.
    const decision = decideConfirmReturned({
      ...FOUND_READY,
      approvedClaimantId: null,
      substitute: SUBSTITUTE,
    });

    expect(decision.kind === 'Refused' ? decision.reason : null).toBe(
      'NoDefaultReceiver',
    );
  });
});

// ── FR-25 — the guard ──────────────────────────────────────────────────────

describe('the no-receiver-no-returned guard', () => {
  it('permits a confirmation whose default receiver exists', () => {
    // **FR-25: "The system refuses to confirm Returned without a recorded
    // receiver (default or substitute)."** A default receiver is a receiver.
    const decision = decideConfirmReturned(LOST_READY);

    expect(decision.kind).toBe('Permitted');
  });

  it('permits a confirmation with a substitute', () => {
    const decision = decideConfirmReturned({ ...LOST_READY, substitute: SUBSTITUTE });

    expect(decision.kind).toBe('Permitted');
  });

  it('refuses a substitute with no name', () => {
    // **Story 003: "Given a substitute receiver is supplied without a name,
    // when the confirmation is submitted, then the action is refused."**
    expect(() =>
      decideConfirmReturned({
        ...LOST_READY,
        substitute: { ...SUBSTITUTE, name: '   ' },
      }),
    ).toThrow(ValidationError);
  });

  it('refuses a substitute with an unconfirmed authorization', () => {
    expect(() =>
      decideConfirmReturned({
        ...LOST_READY,
        substitute: { ...SUBSTITUTE, authorizationConfirmed: false },
      }),
    ).toThrow(ValidationError);
  });

  it('refuses a substitute with a relationship outside the set', () => {
    expect(() =>
      decideConfirmReturned({
        ...LOST_READY,
        substitute: { ...SUBSTITUTE, relationship: 'Neighbour' },
      }),
    ).toThrow(ValidationError);
  });

  it('records no substitute when the default receiver received the item', () => {
    // **Story 002: "Given the substitute IS the default receiver, when
    // Returned is confirmed, then authorization and relationship are not
    // applicable and are not recorded."**
    const decision = decideConfirmReturned(LOST_READY);

    expect(decision.kind === 'Permitted' ? decision.substitute : 'not permitted').toBeNull();
  });
});

// ── The assert ─────────────────────────────────────────────────────────────

describe('assertConfirmReturnedPermitted', () => {
  it('returns the permitted decision', () => {
    const decision = assertConfirmReturnedPermitted(LOST_READY);

    expect(decision.kind).toBe('Permitted');
  });

  it('throws a permission failure for a member', () => {
    expect(() =>
      assertConfirmReturnedPermitted({ ...LOST_READY, ...MEMBER }),
    ).toThrow(PermissionDeniedError);
  });

  it('throws a conflict for a terminal report', () => {
    expect(() =>
      assertConfirmReturnedPermitted({ ...LOST_READY, reportStatus: 'Returned' }),
    ).toThrow(ConflictError);
  });

  it('names the rule in the refusal message', () => {
    // **The message names the remedy, and one message per reason.**
    expect(confirmReturnedRefusalMessage('TerminalStatus')).toMatch(/already returned/);
    expect(confirmReturnedRefusalMessage('NoReceiver')).toMatch(/receiver is required/i);
    expect(confirmReturnedRefusalMessage('NotAdministrator')).toMatch(/administrator/i);
  });

  it('names the missing report in the refusal message', () => {
    // **Every reason has a message, including the one the service answers
    // with a 404.** A reason without a message would fall through to a
    // generic answer — and the administrator would not know the report does
    // not exist.
    expect(confirmReturnedRefusalMessage('ReportNotFound')).toMatch(/does not exist/);
  });

  it('names the missing approved claim in the refusal message', () => {
    expect(confirmReturnedRefusalMessage('NoDefaultReceiver')).toMatch(/approved claim/);
  });
});

// ── The default receiver's assertion ──────────────────────────────────────

describe('assertDefaultReceiver', () => {
  it('returns the receiver it was given', () => {
    const receiver = deriveDefaultReceiver({
      reportType: 'Lost',
      reporterId: 'owner-1',
      approvedClaimantId: null,
    });

    expect(assertDefaultReceiver(receiver)?.accountId).toBe('owner-1');
  });

  it('refuses a receiver that could not be derived', () => {
    // **The absence is a precondition that has not been met,** and the
    // assertion says so rather than passing `null` on.
    expect(() => assertDefaultReceiver(null)).toThrow(ValidationError);
  });

  it('names the missing approved claim in the refusal', () => {
    expect(() => assertDefaultReceiver(null)).toThrow(/approved claim/);
  });
});

// ── The audit event ────────────────────────────────────────────────────────

describe('the returned-confirmation event', () => {
  it('writes event 6 for a Found default receiver', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Found',
      defaultReceiverAccountId: 'claimant-1',
      substitute: null,
    });

    expect(event.type).toBe(RETURNED_CONFIRMED_DEFAULT_RECEIVER_EVENT_TYPE);
  });

  it('writes event 7 for a Found substitute receiver', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Found',
      defaultReceiverAccountId: 'claimant-1',
      substitute: createSubstituteReceiver(SUBSTITUTE),
    });

    expect(event.type).toBe(RETURNED_CONFIRMED_SUBSTITUTE_RECEIVER_EVENT_TYPE);
  });

  it('writes event 21 for a Lost default receiver', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Lost',
      defaultReceiverAccountId: 'owner-1',
      substitute: null,
    });

    expect(event.type).toBe(RETURNED_CONFIRMED_LOST_DEFAULT_RECEIVER_EVENT_TYPE);
  });

  it('writes event 22 for a Lost substitute receiver', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Lost',
      defaultReceiverAccountId: 'owner-1',
      substitute: createSubstituteReceiver(SUBSTITUTE),
    });

    expect(event.type).toBe(RETURNED_CONFIRMED_LOST_SUBSTITUTE_RECEIVER_EVENT_TYPE);
  });

  it('refuses a report type outside the two', () => {
    // **The event catalog is frozen at four events,** and each of them
    // belongs to one of the two directions. A third type has no event — so
    // the builder refuses rather than naming an event that does not exist.
    expect(() =>
      buildReturnedConfirmationEvent({
        reportId: 'report-1',
        administratorId: 'admin-1',
        reportType: 'Mislaid' as unknown as ReportType,
        defaultReceiverAccountId: 'someone-1',
        substitute: null,
      }),
    ).toThrow(/not a report type/);
  });

  it('carries the receiver and nothing else on the default-receiver event', () => {
    // **The sanitizer denies by default,** so the payload carries exactly
    // the catalog's one field.
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Lost',
      defaultReceiverAccountId: 'owner-1',
      substitute: null,
    });

    expect(event.payload).toEqual({ receiver: 'owner-1' });
    expect(Object.keys(event.payload)).toEqual(['receiver']);
  });

  it('carries the substitute\'s three fields and nothing else', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Found',
      defaultReceiverAccountId: 'claimant-1',
      substitute: createSubstituteReceiver(SUBSTITUTE),
    });

    expect(Object.keys(event.payload).sort()).toEqual([
      'authorizationAffirmation',
      'relationship',
      'substituteReceiverName',
    ]);
  });

  it('records the substitute\'s name and relationship', () => {
    // **Story 002: "the record contains the substitute name and relationship
    // but no recovery identifying details."**
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Found',
      defaultReceiverAccountId: 'claimant-1',
      substitute: createSubstituteReceiver(SUBSTITUTE),
    });

    expect(event.payload).toMatchObject({
      substituteReceiverName: 'Sam Okafor',
      relationship: 'Friend',
    });
  });

  it('carries no Sensitive Field from the recovery conversation', () => {
    // **The report's exact place and identifying details are not on the
    // event at all** — the event builder has no parameter that could carry
    // them.
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Lost',
      defaultReceiverAccountId: 'owner-1',
      substitute: createSubstituteReceiver(SUBSTITUTE),
    });

    expect(Object.keys(event.payload)).not.toContain('exactPlace');
    expect(Object.keys(event.payload)).not.toContain('identifyingDetails');
    expect(Object.keys(event.payload)).not.toContain('whereFound');
  });

  it('records the administrator as the actor', () => {
    const event = buildReturnedConfirmationEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      reportType: 'Lost',
      defaultReceiverAccountId: 'owner-1',
      substitute: null,
    });

    expect(event.administratorId).toBe('admin-1');
  });
});
