/**
 * The per-Recovery-Response thread's domain suite.
 *
 * **The rules are asserted where they live.** The whitelist of postable
 * statuses, the participation decision, and the read-only reasons are the
 * domain's own, and this suite proves each of them independently of the
 * ports that carry them.
 *
 * **The refusal of an unknown status is asserted as a refusal.** The
 * whitelist is written as the *permitted* statuses, so a status the
 * vocabulary does not own must be refused rather than waved through — and a
 * test that only checked the known-locking statuses would not catch a list
 * written the other way round.
 */

import { describe, expect, it } from 'vitest';

import {
  createRecoveryResponseThreadMessageBody,
  decideRecoveryResponseThreadParticipation,
  decideRecoveryResponseThreadWritability,
  isRecoveryResponseThreadWritable,
  lostReportLocksThreads,
  mayAccessRecoveryResponseThread,
  POSTABLE_LOST_REPORT_STATUSES,
  POSTABLE_RECOVERY_RESPONSE_STATUSES,
  RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE,
  RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH,
  RECOVERY_RESPONSE_THREAD_MESSAGE_MIN_LENGTH,
  recoveryResponseThreadReadOnlyMessage,
} from '@/domain/recovery';

import type { ReportStatus } from '@/domain/listings';
import {
  NON_TERMINAL_RECOVERY_RESPONSE_STATUSES,
  TERMINAL_RECOVERY_RESPONSE_STATUSES,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { ValidationError } from '@/lib/errors';

// ── The body ───────────────────────────────────────────────────────────────

describe('a recovery response thread message body', () => {
  it('accepts a plain-text body', () => {
    expect(createRecoveryResponseThreadMessageBody('I found it by the library.').value).toBe(
      'I found it by the library.',
    );
  });

  it('trims the body before it stores it', () => {
    // **The bound is on the text a reader would actually see.** A body of
    // 2000 spaces is not 2000 characters of message.
    expect(createRecoveryResponseThreadMessageBody('  Hello  ').value).toBe('Hello');
  });

  it('refuses an empty body', () => {
    expect(() => createRecoveryResponseThreadMessageBody('')).toThrow(ValidationError);
  });

  it('refuses a body of only whitespace', () => {
    // **Trimmed first, then measured** — so a body of one space is not a
    // message at all.
    expect(() => createRecoveryResponseThreadMessageBody('   ')).toThrow(ValidationError);
  });

  it('refuses a body one character over the maximum', () => {
    const body = 'x'.repeat(RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH + 1);

    expect(() => createRecoveryResponseThreadMessageBody(body)).toThrow(ValidationError);
  });

  it('accepts a body of exactly the maximum length', () => {
    const body = 'x'.repeat(RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH);

    expect(createRecoveryResponseThreadMessageBody(body).value).toHaveLength(
      RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH,
    );
  });

  it('accepts a body of exactly one character', () => {
    expect(createRecoveryResponseThreadMessageBody('a').value).toBe('a');
  });

  it('counts characters in code points, not UTF-16 code units', () => {
    // **An emoji is one character to the member who typed it** — and it is
    // one character to the database's `char_length` too. Counting UTF-16 code
    // units would refuse a body of 1000 emoji that the member sees as 1000
    // characters.
    const body = '🙂'.repeat(RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH);

    expect(() => createRecoveryResponseThreadMessageBody(body)).not.toThrow();
  });

  it('names the field in the refusal, and never the value', () => {
    // **The error carries the field name, never the value** — a message body
    // may itself carry something sensitive.
    //
    // **The body is refused on its *trimmed* value,** so the refusal's
    // message text is the generic bound and never the text that was typed.
    try {
      createRecoveryResponseThreadMessageBody('   \t  ');
      expect.unreachable('The whitespace-only body should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('body');
      expect((error as ValidationError).message).not.toContain('\t');
      expect((error as ValidationError).message).not.toContain('   ');
    }
  });

  it('states the minimum in the refusal', () => {
    expect(() => createRecoveryResponseThreadMessageBody('')).toThrow(
      `at least ${RECOVERY_RESPONSE_THREAD_MESSAGE_MIN_LENGTH} character`,
    );
  });
});

// ── The writability ────────────────────────────────────────────────────────

describe('a recovery response thread\'s writability', () => {
  it('is writable while the response is Submitted', () => {
    // **The story names three writable statuses, verbatim.**
    expect(
      isRecoveryResponseThreadWritable({ responseStatus: 'Submitted', reportStatus: 'Open' }),
    ).toBe(true);
  });

  it('is writable while the response is Selected for Verification', () => {
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Selected for Verification',
        reportStatus: 'Verification Pending',
      }),
    ).toBe(true);
  });

  it('is writable while the response is Match Confirmed', () => {
    // **`Match Confirmed` is non-terminal** — the item has been identified
    // but not yet handed over, so the handover is still to be arranged.
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Match Confirmed',
        reportStatus: 'Verification Pending',
      }),
    ).toBe(true);
  });

  it('is read-only once the response is Not a Match', () => {
    expect(
      isRecoveryResponseThreadWritable({ responseStatus: 'Not a Match', reportStatus: 'Open' }),
    ).toBe(false);
  });

  it('is read-only once the response is Withdrawn', () => {
    expect(
      isRecoveryResponseThreadWritable({ responseStatus: 'Withdrawn', reportStatus: 'Open' }),
    ).toBe(false);
  });

  it('is read-only once the response is Completed — Report Returned', () => {
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Completed — Report Returned',
        reportStatus: 'Verification Pending',
      }),
    ).toBe(false);
  });

  it('is read-only once the response is Resolved — Report Returned', () => {
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Resolved — Report Returned',
        reportStatus: 'Verification Pending',
      }),
    ).toBe(false);
  });

  it('is read-only once the response is Resolved — Report Closed', () => {
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Resolved — Report Closed',
        reportStatus: 'Verification Pending',
      }),
    ).toBe(false);
  });

  it('is read-only once the report is Returned', () => {
    expect(
      isRecoveryResponseThreadWritable({ responseStatus: 'Submitted', reportStatus: 'Returned' }),
    ).toBe(false);
  });

  it('is read-only once the report is Closed', () => {
    expect(
      isRecoveryResponseThreadWritable({ responseStatus: 'Submitted', reportStatus: 'Closed' }),
    ).toBe(false);
  });

  it('refuses a response status the vocabulary does not own', () => {
    // **The whitelist is written as the permitted statuses,** so a status
    // nobody has thought about is refused rather than waved through.
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Awaiting Inspection' as unknown as RecoveryResponseStatus,
        reportStatus: 'Open',
      }),
    ).toBe(false);
  });

  it('refuses a report status the vocabulary does not own', () => {
    expect(
      isRecoveryResponseThreadWritable({
        responseStatus: 'Submitted',
        reportStatus: 'Awaiting Inspection' as unknown as ReportStatus,
      }),
    ).toBe(false);
  });

  it('reports a terminal response as the reason', () => {
    const decision = decideRecoveryResponseThreadWritability({
      responseStatus: 'Withdrawn',
      reportStatus: 'Open',
    });

    expect(decision.kind).toBe('ReadOnly');
    expect(decision.kind === 'ReadOnly' ? decision.reason : null).toBe('ResponseEnded');
  });

  it('reports an ended report as the reason', () => {
    const decision = decideRecoveryResponseThreadWritability({
      responseStatus: 'Submitted',
      reportStatus: 'Closed',
    });

    expect(decision.kind).toBe('ReadOnly');
    expect(decision.kind === 'ReadOnly' ? decision.reason : null).toBe('ReportEnded');
  });

  it('reports the response ending first when both have ended', () => {
    // **The response's status is checked first.** The two reasons are
    // distinct facts about the item, and the trail should be able to tell
    // them apart.
    const decision = decideRecoveryResponseThreadWritability({
      responseStatus: 'Not a Match',
      reportStatus: 'Closed',
    });

    expect(decision.kind === 'ReadOnly' ? decision.reason : null).toBe('ResponseEnded');
  });

  it('names exactly the three writable response statuses', () => {
    expect([...POSTABLE_RECOVERY_RESPONSE_STATUSES]).toEqual([
      'Submitted',
      'Selected for Verification',
      'Match Confirmed',
    ]);
  });

  it('names exactly the two active lost report statuses', () => {
    // **The Lost side's own two.** The Found side's `Claim Requested` and
    // `Claim Approved` are absent.
    expect([...POSTABLE_LOST_REPORT_STATUSES]).toEqual(['Open', 'Verification Pending']);
  });

  it('locks the threads of a report in any non-active status', () => {
    expect(lostReportLocksThreads('Open')).toBe(false);
    expect(lostReportLocksThreads('Verification Pending')).toBe(false);
    expect(lostReportLocksThreads('Returned')).toBe(true);
    expect(lostReportLocksThreads('Closed')).toBe(true);
  });

  it('is read-only for every terminal status the vocabulary owns', () => {
    // **The rule is checked against the vocabulary's own terminal set,** so
    // a status added to that set is read-only without this suite naming it
    // — and a status the vocabulary does not own cannot slip through
    // either.
    for (const status of TERMINAL_RECOVERY_RESPONSE_STATUSES) {
      expect(
        isRecoveryResponseThreadWritable({ responseStatus: status, reportStatus: 'Open' }),
      ).toBe(false);
    }
  });

  it('is writable for every non-terminal status the vocabulary owns', () => {
    // **The complement, checked the same way.** `Match Confirmed` is
    // non-terminal — the item has been identified but not yet handed over.
    for (const status of NON_TERMINAL_RECOVERY_RESPONSE_STATUSES) {
      expect(
        isRecoveryResponseThreadWritable({ responseStatus: status, reportStatus: 'Open' }),
      ).toBe(true);
    }
  });
});

// ── The read-only message ──────────────────────────────────────────────────

describe('the read-only message', () => {
  it('names the response when the response ended', () => {
    expect(recoveryResponseThreadReadOnlyMessage('ResponseEnded')).toContain('response is closed');
  });

  it('names the report when the report ended', () => {
    expect(recoveryResponseThreadReadOnlyMessage('ReportEnded')).toContain('no longer active');
  });

  it('refuses a reason it does not own', () => {
    expect(() =>
      recoveryResponseThreadReadOnlyMessage('ClaimDecided' as unknown as 'ResponseEnded'),
    ).toThrow(/Unhandled/);
  });
});

// ── The participation ──────────────────────────────────────────────────────

describe('a recovery response thread\'s participation', () => {
  it('is the responder', () => {
    expect(
      decideRecoveryResponseThreadParticipation({
        viewerId: 'responder-1',
        responderId: 'responder-1',
        lostReportOwnerId: 'owner-1',
        isAdministrator: false,
      }),
    ).toBe('Responder');
  });

  it('is the Lost report\'s owner', () => {
    expect(
      decideRecoveryResponseThreadParticipation({
        viewerId: 'owner-1',
        responderId: 'responder-1',
        lostReportOwnerId: 'owner-1',
        isAdministrator: false,
      }),
    ).toBe('LostReportOwner');
  });

  it('is an administrator', () => {
    expect(
      decideRecoveryResponseThreadParticipation({
        viewerId: 'admin-1',
        responderId: 'responder-1',
        lostReportOwnerId: 'owner-1',
        isAdministrator: true,
      }),
    ).toBe('Administrator');
  });

  it('is None for a member who is neither the responder nor the owner', () => {
    expect(
      decideRecoveryResponseThreadParticipation({
        viewerId: 'stranger-1',
        responderId: 'responder-1',
        lostReportOwnerId: 'owner-1',
        isAdministrator: false,
      }),
    ).toBe('None');
  });

  it('reports an administrator who is also the responder as an administrator', () => {
    // **The order decides which name is reported, not what it permits** —
    // and an administrator has the same rights either way.
    expect(
      decideRecoveryResponseThreadParticipation({
        viewerId: 'responder-1',
        responderId: 'responder-1',
        lostReportOwnerId: 'owner-1',
        isAdministrator: true,
      }),
    ).toBe('Administrator');
  });

  it('grants the thread to the three participants', () => {
    expect(mayAccessRecoveryResponseThread('Responder')).toBe(true);
    expect(mayAccessRecoveryResponseThread('LostReportOwner')).toBe(true);
    expect(mayAccessRecoveryResponseThread('Administrator')).toBe(true);
  });

  it('grants the thread to nobody else', () => {
    // **`None` is a relationship, not an absence** — and it grants nothing.
    expect(mayAccessRecoveryResponseThread('None')).toBe(false);
  });

  it('says nothing about whether the response exists', () => {
    // **The refusal must not leak a fact about another member's response.**
    expect(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE).toBe('You do not have access to this.');
    expect(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE).not.toContain('response');
    expect(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE).not.toContain('exist');
  });
});
