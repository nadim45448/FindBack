/**
 * The thread read-only notices — bolt `014`, story 006.
 *
 * **These are the tests for the rule that decides why a thread stopped.**
 *
 * §13.5 names four Claim-side variants and §13.5b names four Lost-side
 * variants, and the story's own technical note is blunt about why: *"Each
 * read-only condition has its own named notice. A single generic read-only
 * message would fail to tell the user why the conversation stopped."*
 *
 * So the tests here are about **distinctness**:
 *
 * - the four Claim-side conditions name four different things;
 * - the four Lost-side conditions name four different things;
 * - the two families never share a sentence;
 * - every notice ends with §13.5's shared tail, word for word; and
 * - a **writable** thread has **no** notice at all — including the
 *   `Match Confirmed` case, which §13.5b explicitly exempts.
 */

import { describe, expect, it } from 'vitest';

import type { RecoveryResponseStatus } from '@/domain/recovery';

import {
  claimThreadReadOnlyNotice,
  claimThreadReadOnlyVariant,
  MATCH_CONFIRMED_THREAD_MESSAGE,
  READ_ONLY_NOTICE_TAIL,
  recoveryResponseThreadReadOnlyNotice,
  recoveryResponseThreadReadOnlyVariant,
} from './thread-read-only-notice';

describe('the Claim-side read-only notice', () => {
  it('names the approval, and points at the handoff', () => {
    // **The approved case has a path forward** — an administrator will
    // arrange the handoff — which is exactly why it cannot share a sentence
    // with the rejected case.
    expect(claimThreadReadOnlyVariant({ claimStatus: 'Approved', reportStatus: 'Open' })).toBe(
      'Approved',
    );

    const notice = claimThreadReadOnlyNotice({
      claimStatus: 'Approved',
      reportStatus: 'Open',
    });

    expect(notice).toContain('this claim has been approved');
    expect(notice).toContain('An administrator will arrange the handoff.');
  });

  it('names the rejection', () => {
    expect(claimThreadReadOnlyVariant({ claimStatus: 'Rejected', reportStatus: 'Open' })).toBe(
      'Rejected',
    );
    expect(
      claimThreadReadOnlyNotice({ claimStatus: 'Rejected', reportStatus: 'Open' }),
    ).toContain('this claim has been rejected');
  });

  it('names the returned item', () => {
    // **The report ended, but the item came back** — a different fact from
    // a closure, and a different sentence.
    expect(claimThreadReadOnlyVariant({ claimStatus: 'Pending', reportStatus: 'Returned' })).toBe(
      'Returned',
    );
    expect(
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Returned' }),
    ).toContain('the item has been returned');
  });

  it('names the closed report', () => {
    expect(claimThreadReadOnlyVariant({ claimStatus: 'Pending', reportStatus: 'Closed' })).toBe(
      'Closed',
    );
    expect(
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ).toContain('this report has been closed');
  });

  it('gives the four conditions four different sentences', () => {
    // **The property the story's note is about.** Four conditions, four
    // sentences — a member can tell *why* the conversation stopped.
    const notices = [
      claimThreadReadOnlyNotice({ claimStatus: 'Approved', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Rejected', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Returned' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ];

    expect(new Set(notices).size).toBe(4);
  });

  it('ends every notice with §13.5’s shared tail', () => {
    // **§13.5 says plainly: "Each variant ends with: 'Existing messages
    // remain available for reference, but no new messages can be posted.'"**
    const notices = [
      claimThreadReadOnlyNotice({ claimStatus: 'Approved', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Rejected', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Returned' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ];

    for (const notice of notices) {
      expect(notice.endsWith(READ_ONLY_NOTICE_TAIL)).toBe(true);
    }
  });

  it('has no notice for a writable thread', () => {
    // **A writable thread has no read-only notice.** The notice exists only
    // for a locked thread, so the resolver returns `null` — and asking for
    // the full notice is a programming error, not a `null`.
    expect(claimThreadReadOnlyVariant({ claimStatus: 'Pending', reportStatus: 'Open' })).toBeNull();
    expect(() =>
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Open' }),
    ).toThrow(/read-only notice/i);
  });

  it('reads the Claim’s own status first', () => {
    // **§13.5's list begins with the Claim's own conditions,** so a decided
    // Claim is read-only whatever the report's status — the notice names
    // the Claim, not the report.
    expect(
      claimThreadReadOnlyVariant({ claimStatus: 'Approved', reportStatus: 'Closed' }),
    ).toBe('Approved');
    expect(
      claimThreadReadOnlyVariant({ claimStatus: 'Rejected', reportStatus: 'Returned' }),
    ).toBe('Rejected');
  });

  it('reads a Returned Claim as the item being returned', () => {
    // **A `Returned` Claim is the Found report's own `Returned` status** —
    // the item has been handed back, so the item's notice is the right one.
    expect(
      claimThreadReadOnlyVariant({ claimStatus: 'Returned', reportStatus: 'Open' }),
    ).toBe('Returned');
  });
});

describe('the Lost-side read-only notice', () => {
  it('names the not-a-match', () => {
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Not a Match',
        reportStatus: 'Open',
      }),
    ).toBe('NotAMatch');
    expect(
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Not a Match',
        reportStatus: 'Open',
      }),
    ).toContain('this response was not a match');
  });

  it('names the withdrawal', () => {
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Withdrawn',
        reportStatus: 'Open',
      }),
    ).toBe('Withdrawn');
    expect(
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Withdrawn',
        reportStatus: 'Open',
      }),
    ).toContain('you withdrew this response');
  });

  it('names the resolved parent report', () => {
    // **The parent case covers a non-terminal response on a resolved
    // report** — `Returned` and `Closed` both count.
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Submitted',
        reportStatus: 'Returned',
      }),
    ).toBe('ParentResolved');
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Submitted',
        reportStatus: 'Closed',
      }),
    ).toBe('ParentResolved');
    expect(
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Submitted',
        reportStatus: 'Closed',
      }),
    ).toContain('the parent Lost report has been resolved');
  });

  it('names the terminal response', () => {
    // **The terminal case is checked before the parent case,** because a
    // terminal response on a resolved report has two true conditions and
    // the terminal one is the more specific.
    const terminal: readonly RecoveryResponseStatus[] = [
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
    ];

    for (const responseStatus of terminal) {
      expect(
        recoveryResponseThreadReadOnlyVariant({ responseStatus, reportStatus: 'Open' }),
      ).toBe('Terminal');
      expect(
        recoveryResponseThreadReadOnlyVariant({ responseStatus, reportStatus: 'Closed' }),
      ).toBe('Terminal');
    }

    expect(
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Completed — Report Returned',
        reportStatus: 'Open',
      }),
    ).toContain('the recovery response is in a terminal state');
  });

  it('gives the four conditions four different sentences', () => {
    const notices = [
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Not a Match',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Withdrawn',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Submitted',
        reportStatus: 'Returned',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Resolved — Report Closed',
        reportStatus: 'Open',
      }),
    ];

    expect(new Set(notices).size).toBe(4);
  });

  it('has no notice for a Match Confirmed thread', () => {
    // **§13.5b forbids it.** `Match Confirmed` is non-terminal — the
    // physical handoff is still pending, so the thread stays writable and
    // shows the informational message instead of a read-only notice.
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Match Confirmed',
        reportStatus: 'Verification Pending',
      }),
    ).toBeNull();
    expect(() =>
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Match Confirmed',
        reportStatus: 'Verification Pending',
      }),
    ).toThrow(/read-only notice/i);
  });

  it('has no notice for a submitted response on an open report', () => {
    expect(
      recoveryResponseThreadReadOnlyVariant({
        responseStatus: 'Submitted',
        reportStatus: 'Open',
      }),
    ).toBeNull();
  });

  it('never shares a sentence with the Claim side', () => {
    // **The two families are separate notices.** A member reading a Claim
    // thread must never be told about "the parent Lost report".
    const claimNotices = [
      claimThreadReadOnlyNotice({ claimStatus: 'Approved', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Rejected', reportStatus: 'Open' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Returned' }),
      claimThreadReadOnlyNotice({ claimStatus: 'Pending', reportStatus: 'Closed' }),
    ];

    const lostNotices = [
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Not a Match',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Withdrawn',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Submitted',
        reportStatus: 'Returned',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Resolved — Report Closed',
        reportStatus: 'Open',
      }),
    ];

    for (const claimNotice of claimNotices) {
      for (const lostNotice of lostNotices) {
        expect(claimNotice).not.toBe(lostNotice);
      }
    }
  });

  it('ends every notice with §13.5b’s shared tail', () => {
    const notices = [
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Not a Match',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Withdrawn',
        reportStatus: 'Open',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Submitted',
        reportStatus: 'Returned',
      }),
      recoveryResponseThreadReadOnlyNotice({
        responseStatus: 'Resolved — Report Closed',
        reportStatus: 'Open',
      }),
    ];

    for (const notice of notices) {
      expect(notice.endsWith(READ_ONLY_NOTICE_TAIL)).toBe(true);
    }
  });

  it('carries a Match Confirmed message that does not imply a lock', () => {
    // **§13.5b permits the informational message and forbids it from
    // implying the thread is locked.** So the message says the handoff is
    // pending and the thread is still the place to coordinate it — it never
    // says "read-only".
    expect(MATCH_CONFIRMED_THREAD_MESSAGE).toContain('Physical handoff is pending');
    expect(MATCH_CONFIRMED_THREAD_MESSAGE).not.toMatch(/read-only/i);
    expect(MATCH_CONFIRMED_THREAD_MESSAGE).not.toContain(READ_ONLY_NOTICE_TAIL);
  });
});
