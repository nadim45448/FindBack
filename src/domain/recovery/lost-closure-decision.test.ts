/**
 * The Lost-side closure decision's suite.
 *
 * **The two routes are the whole point of this module.** An ordinary close
 * and an exceptional cancellation both end in `Closed` and both resolve every
 * non-terminal response — but they are different administrative acts with
 * different records, and an ordinary close must not be able to absorb the
 * exceptional one.
 *
 * **Three properties carry the module:**
 *
 * 1. **The route is a fact about the responses, not a flag.** A response at
 *    `Match Confirmed` makes the close exceptional, and nothing a client
 *    sends can change that.
 * 2. **A terminal report is refused.** `Returned` and `Closed` are refused
 *    with their own reason, distinct from a status this machine does not
 *    own.
 * 3. **The reason is required on both routes and validated first.** A close
 *    with no usable reason is refused before the report is even read.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  CLOSABLE_LOST_REPORT_STATUSES,
  decideLostClosure,
  type LostClosureFacts,
} from './lost-closure-decision';

// ── The facts ───────────────────────────────────────────────────────────────

/** The administrator's reason. */
const REASON = 'The owner could not be reached and the item is no longer circulating.';

/** The facts the decision reads. */
function facts(overrides: Partial<LostClosureFacts> = {}): LostClosureFacts {
  return {
    reportId: 'report-1',
    actingAdministratorId: 'admin-1',
    reportStatus: 'Verification Pending',
    responses: [{ id: 'response-1', status: 'Submitted' }],
    reason: REASON,
    ...overrides,
  };
}

// ── The reason ──────────────────────────────────────────────────────────────

describe('the Lost-side closure decision — the reason', () => {
  it('refuses a close with no reason', () => {
    expect(() => decideLostClosure(facts({ reason: '' }))).toThrow(ValidationError);
  });

  it('refuses a reason shorter than ten characters', () => {
    expect(() => decideLostClosure(facts({ reason: 'Too short' }))).toThrow(ValidationError);
  });

  it('refuses a reason longer than five hundred characters', () => {
    expect(() => decideLostClosure(facts({ reason: 'x'.repeat(501) }))).toThrow(ValidationError);
  });

  it('refuses a whitespace-only reason', () => {
    expect(() => decideLostClosure(facts({ reason: '          ' }))).toThrow(
      ValidationError,
    );
  });

  it('keeps the reason verbatim', () => {
    // **The administrator's own words are the record.** A softened or
    // normalised reason would not be the reason the administrator gave.
    const decision = decideLostClosure(facts());

    expect(decision.kind).toBe('Permitted');
    expect(decision.kind === 'Permitted' && decision.reason.value).toBe(REASON);
  });
});

// ── The terminal report ─────────────────────────────────────────────────────

describe('the Lost-side closure decision — the terminal report', () => {
  it('refuses a returned report', () => {
    const decision = decideLostClosure(facts({ reportStatus: 'Returned' }));

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe('TerminalReport');
  });

  it('refuses an already-closed report', () => {
    const decision = decideLostClosure(facts({ reportStatus: 'Closed' }));

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe('TerminalReport');
  });

  it('refuses a status this machine does not own', () => {
    // **A Found-side status is not a Lost-side closure.** The refusal is a
    // different reason from a terminal report, because the remedy is
    // different: this one is a different operation, not an ended one.
    const decision = decideLostClosure(facts({ reportStatus: 'Claim Requested' }));

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe('StatusNotApplicable');
  });

  it('names the two statuses that may still be closed', () => {
    expect(CLOSABLE_LOST_REPORT_STATUSES).toEqual(['Open', 'Verification Pending']);
  });
});

// ── The ordinary route ──────────────────────────────────────────────────────

describe('the Lost-side closure decision — the ordinary route', () => {
  it('closes an open report ordinarily', () => {
    const decision = decideLostClosure(facts({ reportStatus: 'Open' }));

    expect(decision.kind).toBe('Permitted');
    expect(decision.kind === 'Permitted' && decision.route).toBe('OrdinaryClosure');
  });

  it('closes a verification-pending report ordinarily when nothing is confirmed', () => {
    // **PRD Edge Case C.** The report is closed *before* `Match Confirmed`.
    const decision = decideLostClosure(
      facts({
        responses: [
          { id: 'response-1', status: 'Submitted' },
          { id: 'response-2', status: 'Selected for Verification' },
        ],
      }),
    );

    expect(decision.kind === 'Permitted' && decision.route).toBe('OrdinaryClosure');
  });

  it('names no matched responses on the ordinary route', () => {
    const decision = decideLostClosure(facts());

    expect(decision.kind === 'Permitted' && decision.matchedResponses).toEqual([]);
  });
});

// ── The exceptional route ───────────────────────────────────────────────────

describe('the Lost-side closure decision — the exceptional route', () => {
  it('takes the exceptional route when a response is match confirmed', () => {
    // **PRD Edge Case D.** The report is closed *after* `Match Confirmed` —
    // the owner has determined the candidate is theirs and the handoff is
    // pending, so closing it now is a cancellation.
    const decision = decideLostClosure(
      facts({
        responses: [
          { id: 'response-1', status: 'Submitted' },
          { id: 'response-2', status: 'Match Confirmed' },
        ],
      }),
    );

    expect(decision.kind).toBe('Permitted');
    expect(decision.kind === 'Permitted' && decision.route).toBe('ExceptionalCancellation');
  });

  it('names the matched responses that made it exceptional', () => {
    const decision = decideLostClosure(
      facts({ responses: [{ id: 'response-2', status: 'Match Confirmed' }] }),
    );

    expect(decision.kind === 'Permitted' && decision.matchedResponses).toEqual([
      { responseId: 'response-2', status: 'Match Confirmed' },
    ]);
  });

  it('is decided by the responses and not by the report\'s status', () => {
    // **The report's status cannot tell the two apart.** `Verification
    // Pending` covers both the pre- and post-determination phases, so the
    // responses are what the rule is stated over.
    const preDetermination = decideLostClosure(
      facts({
        reportStatus: 'Verification Pending',
        responses: [{ id: 'response-1', status: 'Selected for Verification' }],
      }),
    );

    const postDetermination = decideLostClosure(
      facts({
        reportStatus: 'Verification Pending',
        responses: [{ id: 'response-1', status: 'Match Confirmed' }],
      }),
    );

    expect(preDetermination.kind === 'Permitted' && preDetermination.route).toBe(
      'OrdinaryClosure',
    );
    expect(postDetermination.kind === 'Permitted' && postDetermination.route).toBe(
      'ExceptionalCancellation',
    );
  });

  it('does not take the exceptional route for a terminal response', () => {
    // **A `Not a Match` response was already ruled out.** It is not a
    // pending handoff, so it does not make the close exceptional.
    const decision = decideLostClosure(
      facts({ responses: [{ id: 'response-1', status: 'Not a Match' }] }),
    );

    expect(decision.kind === 'Permitted' && decision.route).toBe('OrdinaryClosure');
  });
});

// ── What the decision carries ───────────────────────────────────────────────

describe('the Lost-side closure decision — what it carries', () => {
  it('carries the report, the administrator, and the reason', () => {
    const decision = decideLostClosure(facts());

    expect(decision.kind === 'Permitted' && decision.reportId).toBe('report-1');
    expect(decision.kind === 'Permitted' && decision.actingAdministratorId).toBe('admin-1');
    expect(decision.kind === 'Permitted' && decision.reason.value).toBe(REASON);
  });
});
