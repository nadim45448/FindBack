/**
 * The Lost-side Returned closeout's suite.
 *
 * **The closeout is one decision, and this suite pins the two consequences
 * that could plausibly be got wrong:** *which* response is matched, and
 * *which* responses are resolved.
 *
 * **Four properties carry the module:**
 *
 * 1. **The matched response is named, never inferred.** The module is handed
 *    the id and it completes exactly that response — not the first, not the
 *    last, not the one that happens to be `Match Confirmed`.
 * 2. **A response that is not completable refuses the whole closeout.** The
 *    refusal is total, not partial: a closeout that resolved the other
 *    responses while leaving the matched one alone would leave the report
 *    `Returned` with its successful response still in play.
 * 3. **A terminal response is never touched.** It is *named* in `untouched`,
 *    so the absence of a change is asserted as directly as the presence of
 *    one.
 * 4. **The three statuses are distinct.** The matched response, the resolved
 *    set, and the closure's status are three different strings, and a
 *    mismatch between them would silently mis-record the trail.
 */

import { describe, expect, it } from 'vitest';

import {
  COMPLETED_REPORT_RETURNED_STATUS,
  RESOLVED_REPORT_CLOSED_STATUS,
  RESOLVED_REPORT_RETURNED_STATUS,
  closedCloseoutTargetStatus,
  decideLostReturnedCloseout,
  type CloseoutResponse,
  type LostReturnedCloseoutFacts,
} from './lost-returned-closeout';

// ── The facts ───────────────────────────────────────────────────────────────

/** The facts the closeout decides on. */
function facts(overrides: Partial<LostReturnedCloseoutFacts> = {}): LostReturnedCloseoutFacts {
  return {
    reportId: 'report-1',
    actingAdministratorId: 'admin-1',
    ownerId: 'owner-1',
    matchedResponseId: 'response-2',
    responses: [
      { id: 'response-1', status: 'Submitted' },
      { id: 'response-2', status: 'Match Confirmed' },
      { id: 'response-3', status: 'Selected for Verification' },
    ],
    ...overrides,
  };
}

/** The plan the facts produce. */
function plan(overrides: Partial<LostReturnedCloseoutFacts> = {}) {
  const decision = decideLostReturnedCloseout(facts(overrides));

  if (decision.kind !== 'Planned') {
    throw new Error(`The closeout refused: ${decision.reason}`);
  }

  return decision;
}

// ── The matched response ────────────────────────────────────────────────────

describe('the Lost-side Returned closeout — the matched response', () => {
  it('completes the response the facts name', () => {
    const decision = plan();

    expect(decision.matched.responseId).toBe('response-2');
    expect(decision.matched.targetStatus).toBe(COMPLETED_REPORT_RETURNED_STATUS);
  });

  it('completes the named response even when it is not the first', () => {
    // **The matched response is identified by id, never by position.** A rule
    // that took "the first" would complete the wrong row the moment the
    // owner selected a different one.
    const decision = plan({
      matchedResponseId: 'response-3',
      responses: [
        { id: 'response-1', status: 'Submitted' },
        { id: 'response-2', status: 'Match Confirmed' },
        { id: 'response-3', status: 'Match Confirmed' },
      ],
    });

    expect(decision.matched.responseId).toBe('response-3');
  });

  it('refuses a matched response the report does not have', () => {
    const decision = decideLostReturnedCloseout(facts({ matchedResponseId: 'response-99' }));

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe('NoMatchedResponse');
  });

  it('refuses a matched response that has not been determined as a match', () => {
    const decision = decideLostReturnedCloseout(
      facts({
        matchedResponseId: 'response-3',
        responses: [
          { id: 'response-2', status: 'Match Confirmed' },
          { id: 'response-3', status: 'Selected for Verification' },
        ],
      }),
    );

    // **A response still at `Selected for Verification` has not been
    // determined as a match,** and completing it would assert a determination
    // nobody made.
    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe(
      'MatchedResponseNotCompletable',
    );
  });

  it('refuses a matched response that is already terminal', () => {
    const decision = decideLostReturnedCloseout(
      facts({
        matchedResponseId: 'response-2',
        responses: [{ id: 'response-2', status: 'Not a Match' }],
      }),
    );

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe(
      'MatchedResponseNotCompletable',
    );
  });

  it('resolves nothing when the matched response is refused', () => {
    // **The refusal is total.** A closeout that resolved the other responses
    // while leaving the matched one alone would leave the report `Returned`
    // with its successful response still in play.
    const decision = decideLostReturnedCloseout(
      facts({
        matchedResponseId: 'response-3',
        responses: [
          { id: 'response-2', status: 'Match Confirmed' },
          { id: 'response-3', status: 'Selected for Verification' },
        ],
      }),
    );

    expect(decision.kind).toBe('Refused');
    expect(decision).not.toHaveProperty('resolved');
  });
});

// ── The resolved set ────────────────────────────────────────────────────────

describe('the Lost-side Returned closeout — the resolved set', () => {
  it('resolves every other non-terminal response', () => {
    const decision = plan();

    expect(decision.resolved.map((response) => response.responseId)).toEqual([
      'response-1',
      'response-3',
    ]);
  });

  it('gives every resolved response the same status', () => {
    const decision = plan();

    expect(decision.resolved.every((response) => response.targetStatus === RESOLVED_REPORT_RETURNED_STATUS)).toBe(
      true,
    );
  });

  it('records the previous status of every resolved response', () => {
    const decision = plan();

    expect(decision.resolved[0]?.previousStatus).toBe('Submitted');
    expect(decision.resolved[1]?.previousStatus).toBe('Selected for Verification');
  });

  it('does not resolve the matched response', () => {
    // **The matched response is completed, not resolved.** Listing it here
    // would ask the adapter to write two different statuses to one row.
    const decision = plan();

    expect(decision.resolved.map((response) => response.responseId)).not.toContain(
      'response-2',
    );
  });

  it('leaves a terminal response alone and names it', () => {
    const decision = plan({
      responses: [
        { id: 'response-1', status: 'Not a Match' },
        { id: 'response-2', status: 'Match Confirmed' },
        { id: 'response-3', status: 'Withdrawn' },
      ],
    });

    // **A terminal response is never rewritten.** A `Not a Match` response
    // was ruled out before the handoff; rewriting it would destroy the
    // history the trail depends on.
    expect(decision.resolved).toEqual([]);
    expect(decision.untouched.map((response) => response.responseId)).toEqual([
      'response-1',
      'response-3',
    ]);
  });

  it('keeps the terminal response\'s own status in the untouched list', () => {
    const decision = plan({
      responses: [
        { id: 'response-1', status: 'Not a Match' },
        { id: 'response-2', status: 'Match Confirmed' },
      ],
    });

    expect(decision.untouched[0]?.status).toBe('Not a Match');
  });

  it('resolves nothing when the report holds only the matched response', () => {
    const decision = plan({
      responses: [{ id: 'response-2', status: 'Match Confirmed' }],
    });

    expect(decision.resolved).toEqual([]);
    expect(decision.untouched).toEqual([]);
  });

  it('carries the report, the administrator, and the owner', () => {
    const decision = plan();

    expect(decision.reportId).toBe('report-1');
    expect(decision.actingAdministratorId).toBe('admin-1');
    expect(decision.ownerId).toBe('owner-1');
  });
});

// ── The three statuses ──────────────────────────────────────────────────────

describe('the Lost-side Returned closeout — the statuses', () => {
  it('keeps the three statuses distinct', () => {
    // **A mismatch between them would silently mis-record the trail.** The
    // matched response, the resolved set, and the closure each reach a
    // different canonical status.
    expect(COMPLETED_REPORT_RETURNED_STATUS).toBe('Completed — Report Returned');
    expect(RESOLVED_REPORT_RETURNED_STATUS).toBe('Resolved — Report Returned');
    expect(RESOLVED_REPORT_CLOSED_STATUS).toBe('Resolved — Report Closed');
  });

  it('gives every non-terminal response the closure\'s status', () => {
    // **A closure has no matched exception.** Unlike the Returned closeout,
    // a closure ends everything still in play, whatever its status.
    expect(closedCloseoutTargetStatus('Submitted')).toBe(RESOLVED_REPORT_CLOSED_STATUS);
    expect(closedCloseoutTargetStatus('Selected for Verification')).toBe(
      RESOLVED_REPORT_CLOSED_STATUS,
    );
    expect(closedCloseoutTargetStatus('Match Confirmed')).toBe(RESOLVED_REPORT_CLOSED_STATUS);
  });

  it('refuses to name a target status for a terminal response', () => {
    // **A terminal response is not resolved by a closure,** so asking the
    // function what it would become is a question with no answer.
    expect(() => closedCloseoutTargetStatus('Not a Match')).toThrow();
    expect(() => closedCloseoutTargetStatus('Withdrawn')).toThrow();
    expect(() => closedCloseoutTargetStatus(COMPLETED_REPORT_RETURNED_STATUS)).toThrow();
  });

  it('refuses to name a target status for a response that is already resolved', () => {
    expect(() => closedCloseoutTargetStatus(RESOLVED_REPORT_RETURNED_STATUS)).toThrow();
    expect(() => closedCloseoutTargetStatus(RESOLVED_REPORT_CLOSED_STATUS)).toThrow();
  });
});

// ── The totality ────────────────────────────────────────────────────────────

describe('the Lost-side Returned closeout — the totality', () => {
  it('accounts for every response exactly once', () => {
    // **The plan is complete.** Every response on the report is either the
    // matched one, resolved, or untouched — so a caller cannot apply the
    // plan and leave a response unaccounted for.
    const responses: CloseoutResponse[] = [
      { id: 'response-1', status: 'Submitted' },
      { id: 'response-2', status: 'Match Confirmed' },
      { id: 'response-3', status: 'Selected for Verification' },
      { id: 'response-4', status: 'Not a Match' },
      { id: 'response-5', status: 'Withdrawn' },
    ];

    const decision = plan({ responses });

    const accounted = [
      decision.matched.responseId,
      ...decision.resolved.map((response) => response.responseId),
      ...decision.untouched.map((response) => response.responseId),
    ].sort();

    expect(accounted).toEqual(responses.map((response) => response.id).sort());
  });

  it('never plans the same response twice', () => {
    const decision = plan();

    const ids = [
      decision.matched.responseId,
      ...decision.resolved.map((response) => response.responseId),
      ...decision.untouched.map((response) => response.responseId),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });
});
