/**
 * The claim thread domain's suite.
 *
 * **Every rule in this bolt's domain layer is a pure function of its
 * facts,** so the whole suite runs without a database. That is the reason
 * these rules live in the domain: the boundary between "who may take part
 * in this thread?" and "what does posting a message do?" is a boundary
 * between *facts* and *effects*, and only the facts belong here.
 *
 * **Four properties carry the bolt:**
 *
 * 1. **The participation check is a whitelist.** Exactly three
 *    relationships grant the thread — the claimant, the finder, and the
 *    administrator — and everything else is refused.
 * 2. **Participation grants no private evidence.** The finder takes part in
 *    the thread and never sees the claimant's reason or identifying
 *    details: a message is not a reason and not an identifying detail.
 * 3. **The read-only reason names what closed the thread.** A decided
 *    claim and an ended report are different facts, and a reader of the
 *    refusal must be able to tell them apart.
 * 4. **The body is bounded and trimmed before it is measured.** A body of
 *    2000 spaces is not 2000 characters of message, and a body of one
 *    space is not a message at all.
 */

import { describe, expect, it } from 'vitest';

import {
  CLAIM_THREAD_ACCESS_DENIED_MESSAGE,
  CLAIM_THREAD_MESSAGE_MAX_LENGTH,
  CLAIM_THREAD_MESSAGE_MIN_LENGTH,
  REPORT_CLOSURE_REASON_MAX_LENGTH,
  REPORT_CLOSURE_REASON_MIN_LENGTH,
  buildClaimThreadMessagePostedEvent,
  buildReportFoundClosedByAdministratorEvent,
  claimThreadReadOnlyMessage,
  createClaimThreadMessageBody,
  createReportClosureReason,
  decideClaimThreadParticipation,
  decideClaimThreadWritability,
  isClaimThreadWritable,
  mayAccessClaimThread,
  reportLocksThreads,
  type ClaimThreadParticipation,
} from '@/domain/listings';

import { ValidationError } from '@/lib/errors';

// ── The participation rule ───────────────────────────────────────────────

describe('decideClaimThreadParticipation', () => {
  const facts = {
    viewerId: 'viewer-1',
    claimantId: 'claimant-1',
    foundReportOwnerId: 'finder-1',
    isAdministrator: false,
  };

  it('names the claimant the claimant', () => {
    expect(decideClaimThreadParticipation({ ...facts, viewerId: 'claimant-1' })).toBe('Claimant');
  });

  it('names the finder the finder', () => {
    expect(decideClaimThreadParticipation({ ...facts, viewerId: 'finder-1' })).toBe(
      'FoundReportOwner',
    );
  });

  it('names an administrator the administrator', () => {
    expect(decideClaimThreadParticipation({ ...facts, isAdministrator: true })).toBe(
      'Administrator',
    );
  });

  it('refuses a member who is neither the claimant nor the finder', () => {
    expect(decideClaimThreadParticipation(facts)).toBe('None');
  });

  it('reports an administrator who is also the claimant as an administrator', () => {
    // **The administrator check comes first.** The rights are the same
    // either way, so the order is a matter of which name the decision
    // reports — not of what it permits.
    expect(
      decideClaimThreadParticipation({
        ...facts,
        viewerId: 'claimant-1',
        isAdministrator: true,
      }),
    ).toBe('Administrator');
  });

  it('reports an administrator who is also the finder as an administrator', () => {
    expect(
      decideClaimThreadParticipation({
        ...facts,
        viewerId: 'finder-1',
        isAdministrator: true,
      }),
    ).toBe('Administrator');
  });

  it('refuses a member whose id matches neither participant', () => {
    expect(decideClaimThreadParticipation({ ...facts, viewerId: 'stranger' })).toBe('None');
  });

  it('refuses a member whose id is empty', () => {
    expect(decideClaimThreadParticipation({ ...facts, viewerId: '' })).toBe('None');
  });

  it('refuses every id when every participant id is the same empty string', () => {
    // **The check is equality, not set membership.** A member whose id
    // happened to equal both participant ids would be granted the thread
    // twice over — and the rule is about *who* the viewer is, not about how
    // many times the grant fires.
    expect(
      decideClaimThreadParticipation({
        viewerId: '',
        claimantId: '',
        foundReportOwnerId: '',
        isAdministrator: false,
      }),
    ).toBe('Claimant');
  });
});

describe('mayAccessClaimThread', () => {
  it('grants the three participants', () => {
    const participants: ClaimThreadParticipation[] = [
      'Claimant',
      'FoundReportOwner',
      'Administrator',
    ];

    for (const participant of participants) {
      expect(mayAccessClaimThread(participant)).toBe(true);
    }
  });

  it('refuses everyone else', () => {
    expect(mayAccessClaimThread('None')).toBe(false);
  });
});

describe('CLAIM_THREAD_ACCESS_DENIED_MESSAGE', () => {
  it('says nothing about whether the claim exists', () => {
    // **The refusal must not leak a fact about another member's claim.**
    const message = CLAIM_THREAD_ACCESS_DENIED_MESSAGE.toLowerCase();

    expect(message).not.toContain('claim');
    expect(message).not.toContain('not found');
    expect(message).not.toContain('exist');
  });
});

// ── The writability rule ─────────────────────────────────────────────────

describe('decideClaimThreadWritability', () => {
  it('is writable while the claim is pending and the report is open', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Pending', reportStatus: 'Open' }),
    ).toEqual({ kind: 'Writable' });
  });

  it('is writable while the claim is pending and the report is claim requested', () => {
    expect(
      decideClaimThreadWritability({
        claimStatus: 'Pending',
        reportStatus: 'Claim Requested',
      }),
    ).toEqual({ kind: 'Writable' });
  });

  it('is writable while the claim is pending and the report is claim approved', () => {
    // **A `Claim Approved` report is not a terminal report.** The claim that
    // was approved is `Approved` and its own thread is read-only for that
    // reason — but a *second* pending claim's thread is still writable,
    // because the report is still active.
    expect(
      decideClaimThreadWritability({
        claimStatus: 'Pending',
        reportStatus: 'Claim Approved',
      }),
    ).toEqual({ kind: 'Writable' });
  });

  it('is read-only because the claim was decided when the claim is approved', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Approved', reportStatus: 'Open' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ClaimDecided' });
  });

  it('is read-only because the claim was decided when the claim is rejected', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Rejected', reportStatus: 'Open' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ClaimDecided' });
  });

  it('is read-only because the claim was decided when the claim is returned', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Returned', reportStatus: 'Open' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ClaimDecided' });
  });

  it('is read-only because the report ended when the report is returned', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Pending', reportStatus: 'Returned' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ReportEnded' });
  });

  it('is read-only because the report ended when the report is closed', () => {
    expect(
      decideClaimThreadWritability({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ReportEnded' });
  });

  it('names the decided claim when both the claim and the report have ended', () => {
    // **The claim's status is checked first.** A decided claim on an ended
    // report was won or lost — the report's ending is not what closed the
    // thread.
    expect(
      decideClaimThreadWritability({ claimStatus: 'Rejected', reportStatus: 'Closed' }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ClaimDecided' });
  });

  it('refuses a status the vocabulary does not own', () => {
    // **A whitelist, not a list of refusals.** The check is "is this
    // `Pending`?", so a status the domain does not own is refused rather
    // than waved through.
    expect(
      decideClaimThreadWritability({
        claimStatus: 'Awaiting Inspection' as never,
        reportStatus: 'Open',
      }),
    ).toEqual({ kind: 'ReadOnly', reason: 'ClaimDecided' });
  });
});

describe('reportLocksThreads', () => {
  it('locks on returned and closed', () => {
    expect(reportLocksThreads('Returned')).toBe(true);
    expect(reportLocksThreads('Closed')).toBe(true);
  });

  it('does not lock on the active Found-side statuses', () => {
    expect(reportLocksThreads('Open')).toBe(false);
    expect(reportLocksThreads('Claim Requested')).toBe(false);
    expect(reportLocksThreads('Claim Approved')).toBe(false);
  });

  it('locks on a status the vocabulary does not own', () => {
    // **The rule is a whitelist.** A status nobody has thought about is
    // refused rather than waved through — which is exactly the one a
    // corrupted row or a future vocabulary change would carry.
    expect(reportLocksThreads('Awaiting Inspection' as never)).toBe(true);
  });

  it('locks on the Lost side\'s status', () => {
    // **`Verification Pending` is the Lost side\'s status.** A Found
    // report in it is a contradiction, and the thread must be read-only.
    expect(reportLocksThreads('Verification Pending')).toBe(true);
  });
});

describe('isClaimThreadWritable', () => {
  it('is writable while the claim is pending and the report is active', () => {
    // **The predicate is the decision, restated as a boolean.** It exists
    // so a caller that does not need the *reason* can ask the simpler
    // question — and it asks the same rule, so the two can never disagree.
    expect(
      isClaimThreadWritable({ claimStatus: 'Pending', reportStatus: 'Open' }),
    ).toBe(true);
  });

  it('is not writable once the claim is decided', () => {
    expect(
      isClaimThreadWritable({ claimStatus: 'Approved', reportStatus: 'Open' }),
    ).toBe(false);
  });

  it('is not writable once the report has ended', () => {
    expect(
      isClaimThreadWritable({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ).toBe(false);
  });
});

describe('claimThreadReadOnlyMessage', () => {
  it('names the decided claim', () => {
    const message = claimThreadReadOnlyMessage('ClaimDecided');

    expect(message).toContain('claim');
    expect(message).toContain('decided');
  });

  it('names the ended report', () => {
    const message = claimThreadReadOnlyMessage('ReportEnded');

    expect(message).toContain('report');
    expect(message).toContain('no longer active');
  });

  it('gives the two reasons different messages', () => {
    expect(claimThreadReadOnlyMessage('ClaimDecided')).not.toBe(
      claimThreadReadOnlyMessage('ReportEnded'),
    );
  });

  it('refuses a reason the vocabulary does not own', () => {
    // **The defensive guard.** The switch is exhaustive over the two
    // reasons, so a third would be a compile error — and the guard is
    // what turns that error into a runtime refusal if the type is ever
    // widened without the switch being widened with it.
    expect(() => claimThreadReadOnlyMessage('SomethingElse' as never)).toThrow(
      'Unhandled claim thread read-only reason',
    );
  });
});

// ── The message body ─────────────────────────────────────────────────────

describe('createClaimThreadMessageBody', () => {
  it('accepts a body of one character', () => {
    expect(createClaimThreadMessageBody('a').value).toBe('a');
  });

  it('states a minimum of one and a maximum of two thousand', () => {
    // **The bound is the story's own bound.** The story says "Member posts
    // 2001 characters | Refused; the 2000-character limit is enforced", and
    // a minimum of 1 is what makes an empty post a refusal rather than a
    // stored blank.
    expect(CLAIM_THREAD_MESSAGE_MIN_LENGTH).toBe(1);
    expect(CLAIM_THREAD_MESSAGE_MAX_LENGTH).toBe(2000);
  });

  it('accepts a body of exactly the maximum length', () => {
    const text = 'x'.repeat(CLAIM_THREAD_MESSAGE_MAX_LENGTH);

    expect(createClaimThreadMessageBody(text).value).toBe(text);
  });

  it('refuses a body one character over the maximum', () => {
    const text = 'x'.repeat(CLAIM_THREAD_MESSAGE_MAX_LENGTH + 1);

    expect(() => createClaimThreadMessageBody(text)).toThrow(ValidationError);
  });

  it('refuses an empty body', () => {
    expect(() => createClaimThreadMessageBody('')).toThrow(ValidationError);
  });

  it('refuses a whitespace-only body', () => {
    // **A body of one space is not a message at all.** The body is trimmed
    // before it is measured, so the space does not satisfy the minimum.
    expect(() => createClaimThreadMessageBody(' ')).toThrow(ValidationError);
  });

  it('trims the body before it measures it', () => {
    // **A body of 2000 spaces is not 2000 characters of message.** The
    // bound is on the text a reader would actually see.
    expect(() => createClaimThreadMessageBody(' '.repeat(2000))).toThrow(ValidationError);
  });

  it('trims the body it stores', () => {
    expect(createClaimThreadMessageBody('  hello  ').value).toBe('hello');
  });

  it('counts an emoji as one character', () => {
    // **The length is measured in code points, not UTF-16 code units.** An
    // emoji is one character to the member and one to `char_length`.
    const text = '🙂'.repeat(CLAIM_THREAD_MESSAGE_MAX_LENGTH);

    expect(createClaimThreadMessageBody(text).value).toBe(text);
  });

  it('refuses a body that is not text at all', () => {
    expect(() => createClaimThreadMessageBody(undefined as never)).toThrow(ValidationError);
    expect(() => createClaimThreadMessageBody(null as never)).toThrow(ValidationError);
    expect(() => createClaimThreadMessageBody(42 as never)).toThrow(ValidationError);
  });

  it('names the body field in the error', () => {
    try {
      createClaimThreadMessageBody('');
      expect.unreachable('The body should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('body');
    }
  });

  it('never carries the body value in the error', () => {
    // **The error names the field, never the value.** A message body may
    // itself carry something sensitive.
    const secret = 'my bank details are 12345';

    try {
      createClaimThreadMessageBody(secret);
      expect.unreachable('The body should have been refused.');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('carries the brand', () => {
    expect(createClaimThreadMessageBody('hello').brand).toBe('claim-thread-message-body');
  });
});

// ── The audit event ──────────────────────────────────────────────────────

describe('buildClaimThreadMessagePostedEvent', () => {
  it('carries exactly the one field the catalog names', () => {
    const event = buildClaimThreadMessagePostedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      messageId: 'message-1',
      authorId: 'author-1',
      body: { value: 'hello' },
    });

    expect(event.type).toBe('thread.claim_message_posted');
    expect(Object.keys(event.payload)).toEqual(['messageText']);
    expect(event.payload.messageText).toBe('hello');
  });

  it('names the claim, the report, the message, and the author', () => {
    const event = buildClaimThreadMessagePostedEvent({
      claimId: 'claim-1',
      reportId: 'report-1',
      messageId: 'message-1',
      authorId: 'author-1',
      body: { value: 'hello' },
    });

    expect(event.claimId).toBe('claim-1');
    expect(event.reportId).toBe('report-1');
    expect(event.messageId).toBe('message-1');
    expect(event.authorId).toBe('author-1');
  });
});

// ── The closure reason ───────────────────────────────────────────────────

describe('createReportClosureReason', () => {
  it('accepts a reason of exactly the minimum length', () => {
    const text = 'x'.repeat(REPORT_CLOSURE_REASON_MIN_LENGTH);

    expect(createReportClosureReason(text).value).toBe(text);
  });

  it('accepts a reason of exactly the maximum length', () => {
    const text = 'x'.repeat(REPORT_CLOSURE_REASON_MAX_LENGTH);

    expect(createReportClosureReason(text).value).toBe(text);
  });

  it('refuses a reason one character under the minimum', () => {
    const text = 'x'.repeat(REPORT_CLOSURE_REASON_MIN_LENGTH - 1);

    expect(() => createReportClosureReason(text)).toThrow(ValidationError);
  });

  it('refuses a reason one character over the maximum', () => {
    const text = 'x'.repeat(REPORT_CLOSURE_REASON_MAX_LENGTH + 1);

    expect(() => createReportClosureReason(text)).toThrow(ValidationError);
  });

  it('refuses an omitted reason', () => {
    expect(() => createReportClosureReason('')).toThrow(ValidationError);
  });

  it('refuses a whitespace-only reason', () => {
    expect(() => createReportClosureReason('     ')).toThrow(ValidationError);
  });

  it('refuses a reason that is not text at all', () => {
    // **A `null` must not become the string "null"** and pass a length
    // check — the trail would record "null" as an administrator's reason.
    expect(() => createReportClosureReason(undefined as never)).toThrow(ValidationError);
    expect(() => createReportClosureReason(null as never)).toThrow(ValidationError);
    expect(() => createReportClosureReason(42 as never)).toThrow(ValidationError);
  });

  it('carries the brand', () => {
    expect(createReportClosureReason('a good enough reason').brand).toBe('closure-reason');
  });
});

describe('buildReportFoundClosedByAdministratorEvent', () => {
  it('carries exactly the two fields the catalog names', () => {
    const event = buildReportFoundClosedByAdministratorEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      previousStatus: 'Claim Requested',
      closureReason: { value: 'This item is not appropriate.' },
    });

    expect(event.type).toBe('report.found_closed_by_administrator');
    expect(Object.keys(event.payload).sort()).toEqual(['closureReason', 'previousFoundStatus']);
    expect(event.payload.previousFoundStatus).toBe('Claim Requested');
    expect(event.payload.closureReason).toBe('This item is not appropriate.');
  });

  it('keeps the administrator\'s reason verbatim', () => {
    // **The softening rule is about the auto-rejection's visible copy,** not
    // to an administrator's stated reason for closing a report.
    const reason = 'Another claim was approved for this item.';

    const event = buildReportFoundClosedByAdministratorEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      previousStatus: 'Open',
      closureReason: { value: reason },
    });

    expect(event.payload.closureReason).toBe(reason);
  });
});
