/**
 * The claim decision domain's suite.
 *
 * **Every rule in this bolt's domain layer is a pure function of its
 * facts,** so the whole suite runs without a database. That is the reason
 * these rules live in the domain: the boundary between "may this claim be
 * decided?" and "what does deciding it do to the report?" is a boundary
 * between *facts* and *effects*, and only the facts belong here.
 *
 * **Four properties carry the bolt:**
 *
 * 1. **The decision gate is a whitelist.** Only `Pending` may be decided —
 *    every terminal status, every unknown status, and a `null` are refused.
 * 2. **The report's transition is keyed by cause, not by status.** "The last
 *    pending claim was rejected" and "a pending claim was rejected" are
 *    different events with different outcomes, and only a cause can tell
 *    them apart.
 * 3. **The stored reason and the visible copy are different artefacts.**
 *    The audit reason is verbatim; the copy is softened. They are separate
 *    modules, so softening can never rewrite the record.
 * 4. **The audit payload is exactly what the catalog names.** The sanitizer
 *    denies by default, so a builder that put an extra field in would be
 *    refused — and the builders here put in exactly what they must.
 */

import { describe, expect, it } from 'vitest';

import {
  CLAIM_AUTO_REJECTION_REASONS,
  CLAIM_AUTO_REJECTION_TRIGGERS,
  CLAIM_REJECTION_REASON_MAX_LENGTH,
  CLAIM_REJECTION_REASON_MIN_LENGTH,
  REPORT_STATUSES,
  autoRejectionCopy,
  autoRejectionReason,
  autoRejectionText,
  autoRejectionTriggeringAction,
  buildClaimApprovedEvent,
  buildClaimAutoRejectedEvent,
  buildClaimRejectedByAdministratorEvent,
  claimDecisionBlockMessage,
  createClaimRejectionReason,
  decideClaimDecision,
  decideFoundReportTransition,
  foundReportTransitionTarget,
  rejectionCauseFor,
  type ClaimAutoRejectionTrigger,
  type FoundReportTransitionCause,
} from '@/domain/listings';

import { ValidationError } from '@/lib/errors';

// ── The decision gate ────────────────────────────────────────────────────────

describe('the claim decision gate', () => {
  it('permits a pending claim', () => {
    expect(decideClaimDecision({ claimStatus: 'Pending' })).toEqual({ kind: 'Permitted' });
  });

  it('refuses an approved claim', () => {
    expect(decideClaimDecision({ claimStatus: 'Approved' })).toEqual({
      kind: 'Blocked',
      reason: 'ClaimNotPending',
    });
  });

  it('refuses a rejected claim', () => {
    expect(decideClaimDecision({ claimStatus: 'Rejected' })).toEqual({
      kind: 'Blocked',
      reason: 'ClaimNotPending',
    });
  });

  it('refuses a returned claim', () => {
    expect(decideClaimDecision({ claimStatus: 'Returned' })).toEqual({
      kind: 'Blocked',
      reason: 'ClaimNotPending',
    });
  });

  it('refuses a claim whose status it does not recognise', () => {
    // **The rule is a whitelist.** A status this bolt has not seen is
    // refused rather than waved through — a gate that permits by default
    // fails open, and the earlier submission gate failed open that way.
    expect(
      decideClaimDecision({ claimStatus: 'Verification Pending' as never }),
    ).toEqual({ kind: 'Blocked', reason: 'ClaimNotPending' });
  });

  it('refuses a claim whose status could not be read', () => {
    // **A null status is an absence, not a permission.**
    expect(decideClaimDecision({ claimStatus: null })).toEqual({
      kind: 'Blocked',
      reason: 'ClaimNotFound',
    });
  });

  it('permits only the pending status', () => {
    // **The whitelist, stated as a property.** Every canonical status is
    // checked against the same rule.
    const permitted = ['Pending', 'Approved', 'Rejected', 'Returned'].filter(
      (status) => decideClaimDecision({ claimStatus: status as never }).kind === 'Permitted',
    );

    expect(permitted).toEqual(['Pending']);
  });

  it('gives every refusal its own message', () => {
    const messages = (['ClaimNotFound', 'ClaimNotPending'] as const).map((reason) =>
      claimDecisionBlockMessage(reason),
    );

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('tells the administrator who lost the race that they were not wrong', () => {
    // The remedy is to read the recorded decision, so the message points
    // there rather than apologising or blaming.
    expect(claimDecisionBlockMessage('ClaimNotPending')).toContain('already been decided');
  });

  it('refuses a block reason it does not know rather than answering for it', () => {
    expect(() =>
      claimDecisionBlockMessage('SomethingElse' as Parameters<typeof claimDecisionBlockMessage>[0]),
    ).toThrow();
  });
});

// ── The rejection reason ─────────────────────────────────────────────────────

describe('the administrator rejection reason', () => {
  it('accepts a reason at the lower bound', () => {
    const reason = createClaimRejectionReason('a'.repeat(CLAIM_REJECTION_REASON_MIN_LENGTH));

    expect(reason.value).toHaveLength(CLAIM_REJECTION_REASON_MIN_LENGTH);
  });

  it('accepts a reason at the upper bound', () => {
    const reason = createClaimRejectionReason('a'.repeat(CLAIM_REJECTION_REASON_MAX_LENGTH));

    expect(reason.value).toHaveLength(CLAIM_REJECTION_REASON_MAX_LENGTH);
  });

  it('refuses a reason below the bound', () => {
    expect(() =>
      createClaimRejectionReason('a'.repeat(CLAIM_REJECTION_REASON_MIN_LENGTH - 1)),
    ).toThrow(ValidationError);
  });

  it('refuses an empty reason', () => {
    // **A rejection with no reason leaves the claimant with nothing to act
    // on,** so the empty string is inside the refused range rather than
    // beside it.
    expect(() => createClaimRejectionReason('')).toThrow(ValidationError);
  });

  it('refuses a reason above the bound', () => {
    expect(() =>
      createClaimRejectionReason('a'.repeat(CLAIM_REJECTION_REASON_MAX_LENGTH + 1)),
    ).toThrow(ValidationError);
  });

  it('trims the reason before measuring it', () => {
    // **The bound is on the reason, not on the padding.** A reason of nine
    // characters surrounded by spaces is nine characters.
    expect(() =>
      createClaimRejectionReason(`   ${'a'.repeat(CLAIM_REJECTION_REASON_MIN_LENGTH - 1)}   `),
    ).toThrow(ValidationError);
  });

  it('refuses a reason that is not text at all', () => {
    // **The parameter is typed `string`,** so a non-string is a type
    // violation at the call site — but the function does not trust its
    // caller. A value that arrived from untyped input (a JSON body read
    // without a parser, say) is refused as too short rather than crashing
    // on `.trim`.
    expect(() => createClaimRejectionReason(undefined as never)).toThrow(ValidationError);
    expect(() => createClaimRejectionReason(null as never)).toThrow(ValidationError);
    expect(() => createClaimRejectionReason(42 as never)).toThrow(ValidationError);
  });

  it('names the field and never the value', () => {
    try {
      createClaimRejectionReason('too short');
      expect.unreachable('the reason should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('reason');
      expect((error as ValidationError).message).not.toContain('too short');
    }
  });
});

// ── The Found report's transitions ───────────────────────────────────────────

describe('the found report transition', () => {
  it('moves an open report to claim requested when a claim is submitted', () => {
    expect(
      decideFoundReportTransition({ currentStatus: 'Open', cause: 'ClaimSubmitted' }),
    ).toEqual({ kind: 'Moved', from: 'Open', to: 'Claim Requested' });
  });

  it('leaves a report at claim requested when a second claim is submitted', () => {
    expect(
      decideFoundReportTransition({ currentStatus: 'Claim Requested', cause: 'ClaimSubmitted' }),
    ).toEqual({ kind: 'Unchanged', status: 'Claim Requested' });
  });

  it('moves a report at claim requested to claim approved', () => {
    expect(
      decideFoundReportTransition({ currentStatus: 'Claim Requested', cause: 'ClaimApproved' }),
    ).toEqual({ kind: 'Moved', from: 'Claim Requested', to: 'Claim Approved' });
  });

  it('moves an open report to claim approved when a claim is approved', () => {
    // A report whose claim was submitted while it was open and approved
    // before the status was observed still lands in the right place.
    expect(
      decideFoundReportTransition({ currentStatus: 'Open', cause: 'ClaimApproved' }),
    ).toEqual({ kind: 'Moved', from: 'Open', to: 'Claim Approved' });
  });

  it('moves a report at claim requested back to open when the last pending claim is rejected', () => {
    expect(
      decideFoundReportTransition({
        currentStatus: 'Claim Requested',
        cause: 'LastPendingClaimRejected',
      }),
    ).toEqual({ kind: 'Moved', from: 'Claim Requested', to: 'Open' });
  });

  it('moves a report at claim request to closed when the reporter withdraws it', () => {
    expect(
      decideFoundReportTransition({ currentStatus: 'Claim Requested', cause: 'ReporterWithdrawn' }),
    ).toEqual({ kind: 'Moved', from: 'Claim Requested', to: 'Closed' });
  });

  it('moves a report at claim request to closed when an administrator closes it', () => {
    expect(
      decideFoundReportTransition({
        currentStatus: 'Claim Requested',
        cause: 'AdministratorClosed',
      }),
    ).toEqual({ kind: 'Moved', from: 'Claim Requested', to: 'Closed' });
  });

  it('closes a report at claim approved when an administrator closes it', () => {
    expect(
      decideFoundReportTransition({
        currentStatus: 'Claim Approved',
        cause: 'AdministratorClosed',
      }),
    ).toEqual({ kind: 'Moved', from: 'Claim Approved', to: 'Closed' });
  });

  it('never reaches returned on its own', () => {
    // **The `Returned` status is not in the table at all.** Story 005 says
    // the Found-side report never reaches `Returned` through these
    // transitions — only Unit 005's explicit Confirm Returned writes it.
    const causes: FoundReportTransitionCause[] = [
      'ClaimSubmitted',
      'ClaimApproved',
      'LastPendingClaimRejected',
      'ReporterWithdrawn',
      'AdministratorClosed',
    ];

    for (const cause of causes) {
      for (const status of REPORT_STATUSES) {
        const transition = decideFoundReportTransition({ currentStatus: status, cause });

        if (transition.kind === 'Moved') {
          expect(transition.to).not.toBe('Returned');
        }
      }
    }
  });

  it('refuses a move out of a closed report', () => {
    // **A closed report takes no further transition.** The item is done.
    expect(
      decideFoundReportTransition({ currentStatus: 'Closed', cause: 'ClaimApproved' }),
    ).toEqual({ kind: 'Refused', reason: 'TerminalStatus' });
  });

  it('refuses a move out of a returned report', () => {
    expect(
      decideFoundReportTransition({ currentStatus: 'Returned', cause: 'ClaimApproved' }),
    ).toEqual({ kind: 'Refused', reason: 'TerminalStatus' });
  });

  it('refuses a move out of a verification-pending report', () => {
    // **A `Verification Pending` report belongs to the Lost side's
    // machine,** so this one does not own it.
    expect(
      decideFoundReportTransition({
        currentStatus: 'Verification Pending',
        cause: 'ClaimApproved',
      }),
    ).toEqual({ kind: 'Refused', reason: 'NotAFoundReport' });
  });

  it('refuses a claim cause that does not apply to the report’s status', () => {
    // **A `Claim Approved` report has no Pending Claim to reject,** so the
    // rejection cause does not apply to it.
    expect(
      decideFoundReportTransition({
        currentStatus: 'Claim Approved',
        cause: 'LastPendingClaimRejected',
      }),
    ).toEqual({ kind: 'Refused', reason: 'CauseNotApplicable' });
  });

  it('refuses a cause it does not know rather than answering for it', () => {
    // **The switch is exhaustive, and the guard proves it.** A cause added
    // to the union without a rule would be a compile error at the `never`
    // assignment — and a cause that reaches the function from outside the
    // type is refused rather than given a wrong target.
    expect(() =>
      decideFoundReportTransition({
        currentStatus: 'Open',
        cause: 'SomethingElse' as FoundReportTransitionCause,
      }),
    ).toThrow();
  });

  it('refuses a cause it does not know when asked for its target', () => {
    expect(() =>
      foundReportTransitionTarget('SomethingElse' as FoundReportTransitionCause),
    ).toThrow();
  });
});

describe('the rejection cause', () => {
  it('names the last-rejection cause when no pending claim remains', () => {
    expect(rejectionCauseFor(0)).toBe('LastPendingClaimRejected');
  });

  it('names no cause when another pending claim remains', () => {
    // **The report stays at `Claim Requested` while a claim is still
    // waiting on it.** The move back to `Open` belongs to the *last*
    // rejection, and a non-last rejection has no move of its own.
    expect(rejectionCauseFor(1)).toBe('NoChange');
    expect(rejectionCauseFor(4)).toBe('NoChange');
  });
});

// ── The auto-rejection triggers ──────────────────────────────────────────────

describe('the auto-rejection triggers', () => {
  it('has exactly three triggers', () => {
    expect(CLAIM_AUTO_REJECTION_TRIGGERS).toHaveLength(3);
  });

  it('gives every trigger its own reason', () => {
    const reasons = CLAIM_AUTO_REJECTION_TRIGGERS.map((trigger) =>
      autoRejectionReason(trigger),
    );

    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('gives every trigger its own triggering action', () => {
    const actions = CLAIM_AUTO_REJECTION_TRIGGERS.map((trigger) =>
      autoRejectionTriggeringAction(trigger),
    );

    expect(new Set(actions).size).toBe(actions.length);
  });

  it('records the approval as the trigger of an approval-caused auto-rejection', () => {
    expect(autoRejectionReason('AnotherClaimApproved')).toBe(
      CLAIM_AUTO_REJECTION_REASONS.AnotherClaimApproved,
    );
    expect(autoRejectionTriggeringAction('AnotherClaimApproved')).toBe('Claim approval');
  });

  it('records the withdrawal as the trigger of a withdrawal-caused auto-rejection', () => {
    expect(autoRejectionReason('ReportWithdrawnByReporter')).toBe(
      CLAIM_AUTO_REJECTION_REASONS.ReportWithdrawnByReporter,
    );
    expect(autoRejectionTriggeringAction('ReportWithdrawnByReporter')).toBe('Report withdrawal');
  });

  it('records the closure as the trigger of a closure-caused auto-rejection', () => {
    expect(autoRejectionReason('ReportClosedByAdministrator')).toBe(
      CLAIM_AUTO_REJECTION_REASONS.ReportClosedByAdministrator,
    );
    expect(autoRejectionTriggeringAction('ReportClosedByAdministrator')).toBe('Report closure');
  });

  it('keeps the reason and the triggering action separate', () => {
    // **They are two fields on the audit event,** and an event that carried
    // the same text in both would be saying the same thing twice — or, worse,
    // would let one field be mistaken for the other.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      expect(autoRejectionReason(trigger)).not.toBe(autoRejectionTriggeringAction(trigger));
    }
  });

  it('refuses a trigger it does not know rather than answering for it', () => {
    // **The lookups are total over the PRD's three triggers,** so a
    // trigger the module has not seen is a mistake — and a mistake must be
    // refused, not given a wrong reason.
    expect(() =>
      autoRejectionReason('SomethingElse' as ClaimAutoRejectionTrigger),
    ).toThrow();
    expect(() =>
      autoRejectionTriggeringAction('SomethingElse' as ClaimAutoRejectionTrigger),
    ).toThrow();
  });
});

describe('the auto-rejection copy', () => {
  it('gives every trigger its own copy', () => {
    const bodies = CLAIM_AUTO_REJECTION_TRIGGERS.map((trigger) => autoRejectionCopy(trigger).body);

    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('never repeats the audit reason verbatim', () => {
    // **The audit reason is a record; the copy is a message.** The copy is
    // softened, so it must not be the stored reason pasted in — and this is
    // the property that keeps the two artefacts from drifting together.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      expect(autoRejectionCopy(trigger).body).not.toBe(autoRejectionReason(trigger));
      expect(autoRejectionCopy(trigger).body).not.toContain(autoRejectionReason(trigger));
    }
  });

  it('does not blame the claimant', () => {
    // **A claimant who lost a race did nothing wrong.** The copy must not
    // read as an accusation.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      const body = autoRejectionCopy(trigger).body.toLowerCase();

      expect(body).not.toContain('you are wrong');
      expect(body).not.toContain('invalid');
      expect(body).not.toContain('not allowed');
      expect(body).not.toContain('failed');
    }
  });

  it('gives every trigger a headline and a contact path', () => {
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      const copy = autoRejectionCopy(trigger);

      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.contactPath.length).toBeGreaterThan(0);
    }
  });

  it('names the administrator path in every copy', () => {
    // **Story 006 requires a contact-your-administrator path,** so every
    // copy carries one.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      expect(autoRejectionCopy(trigger).contactPath.toLowerCase()).toContain('administrator');
    }
  });

  it('names no winning claimant', () => {
    // **The copy does not say who won.** A member whose claim was rejected
    // learns that another claim was approved — not *who* won, and not *what
    // they said*.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      const copy = autoRejectionCopy(trigger);

      expect(copy.body).not.toMatch(/the (other|successful) claimant/u);
      expect(copy.body).not.toMatch(/@/u);
    }
  });

  it('does not promise a reopen', () => {
    // **There is no `Rejected` to `Pending` transition,** so copy that said
    // "you may claim again" would be a lie about what the system can do.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      const copy = autoRejectionCopy(trigger);

      expect(copy.body.toLowerCase()).not.toContain('claim again');
      expect(copy.body.toLowerCase()).not.toContain('try again');
    }
  });

  it('renders the copy as plain text with the same facts', () => {
    // **A recipient whose client renders only plain text must read the
    // same facts** — in the same order.
    for (const trigger of CLAIM_AUTO_REJECTION_TRIGGERS) {
      const copy = autoRejectionCopy(trigger);
      const text = autoRejectionText(trigger);

      expect(text).toContain(copy.headline);
      expect(text).toContain(copy.body);
      expect(text).toContain(copy.contactPath);
    }
  });

  it('refuses a trigger it does not know rather than answering for it', () => {
    // **The copy is a lookup that misses,** not a guess. A trigger the
    // module has not seen would be a copy the PRD does not describe.
    expect(() =>
      autoRejectionCopy('SomethingElse' as ClaimAutoRejectionTrigger),
    ).toThrow();
  });
});

// ── The audit events ─────────────────────────────────────────────────────────

describe('the claim decision audit events', () => {
  it('builds the approval event with no payload at all', () => {
    // **The catalog names no fields for the approval,** and the sanitizer
    // denies by default — so the event carries no payload rather than an
    // empty one. The claim's id, the report's id, and the administrator
    // travel outside the payload, as standard audit-record fields.
    const event = buildClaimApprovedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      administratorId: 'admin-1',
    });

    expect(event.type).toBe('claim.approved');
    expect(event.claimId).toBe('claim-1');
    expect(event.reportId).toBe('report-1');
    expect(event.administratorId).toBe('admin-1');
    expect('payload' in event).toBe(false);
  });

  it('builds the rejection event with exactly the reason', () => {
    const event = buildClaimRejectedByAdministratorEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      administratorId: 'admin-1',
      reason: { value: 'The item does not match the description.' },
    });

    expect(event.type).toBe('claim.rejected_by_administrator');
    expect(Object.keys(event.payload)).toEqual(['reason']);
    expect(event.payload.reason).toBe('The item does not match the description.');
  });

  it('builds the auto-rejection event with exactly the four catalog fields', () => {
    const event = buildClaimAutoRejectedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      trigger: 'AnotherClaimApproved',
      triggeredBy: 'admin-1',
    });

    expect(event.type).toBe('claim.auto_rejected');
    expect(Object.keys(event.payload).sort()).toEqual([
      'autoRejectionReason',
      'foundReportId',
      'triggeredBy',
      'triggeringAction',
    ]);
  });

  it('takes the auto-rejection event’s reason from the trigger, not the caller', () => {
    // **The caller cannot choose the reason.** The trigger names it, so
    // two auto-rejections of the same kind cannot record different
    // reasons.
    const first = buildClaimAutoRejectedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      trigger: 'AnotherClaimApproved',
      triggeredBy: 'admin-1',
    });
    const second = buildClaimAutoRejectedEvent({
      claimId: 'claim-2',
      reportId: 'report-1',
      trigger: 'AnotherClaimApproved',
      triggeredBy: 'admin-2',
    });

    expect(first.payload.autoRejectionReason).toBe(second.payload.autoRejectionReason);
    expect(first.payload.autoRejectionReason).toBe(
      CLAIM_AUTO_REJECTION_REASONS.AnotherClaimApproved,
    );
  });

  it('names the found report the auto-rejection happened on', () => {
    const event = buildClaimAutoRejectedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      trigger: 'AnotherClaimApproved',
      triggeredBy: 'admin-1',
    });

    expect(event.payload.foundReportId).toBe('report-1');
  });

  it('names the human who caused the auto-rejection', () => {
    const event = buildClaimAutoRejectedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      trigger: 'ReportWithdrawnByReporter',
      triggeredBy: 'the-reporter',
    });

    // **The reporter caused the withdrawal's auto-rejection, and the
    // reporter is not an administrator** — so the trigger's own cause is
    // what the event names.
    expect(event.payload.triggeredBy).toBe('the-reporter');
  });

  it('gives the three triggers three distinct audit reasons', () => {
    const reasons = CLAIM_AUTO_REJECTION_TRIGGERS.map(
      (trigger: ClaimAutoRejectionTrigger) =>
        buildClaimAutoRejectedEvent({
          claimId: 'claim-1',
          reportId: 'report-1',
          trigger,
          triggeredBy: 'admin-1',
        }).payload.autoRejectionReason,
    );

    expect(new Set(reasons).size).toBe(3);
  });
});
