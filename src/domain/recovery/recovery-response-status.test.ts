/**
 * The Recovery Response status model's suite.
 *
 * **The load-bearing assertions are about what the vocabulary does NOT
 * contain.**
 *
 * `Standby` is a display condition, never a persisted status, so it must be
 * absent from the vocabulary — and its absence is asserted directly rather
 * than inferred from the list's length.
 *
 * `Match Confirmed` is **non-terminal**, and that is the single most
 * consequential fact in the Lost-side state machine: it is why the Lost
 * report does not become `Returned` at match time, and why Unit 005 must
 * still confirm the physical hand-off. A test that treated it as terminal
 * would let the workflow close before the item reached its owner — and one
 * such test already existed in the codebase, asserting the wrong thing for
 * the right reason.
 */

import { describe, expect, it } from 'vitest';

import {
  INITIAL_RECOVERY_RESPONSE_STATUS,
  isNonTerminalRecoveryResponseStatus,
  isRecoveryResponseStatus,
  isTerminalRecoveryResponseStatus,
  NON_TERMINAL_RECOVERY_RESPONSE_STATUSES,
  RECOVERY_RESPONSE_STATUSES,
  TERMINAL_RECOVERY_RESPONSE_STATUSES,
} from './recovery-response-status';

describe('the canonical status vocabulary', () => {
  it('is exactly the eight PRD statuses', () => {
    expect(RECOVERY_RESPONSE_STATUSES).toEqual([
      'Submitted',
      'Selected for Verification',
      'Match Confirmed',
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ]);
  });

  it('does not contain Standby', () => {
    // **`Standby` is never persisted** (FR-41, D7). It is a display
    // condition, derived at render time — and a vocabulary that listed it
    // would let it be written.
    expect(RECOVERY_RESPONSE_STATUSES).not.toContain('Standby');
    expect(isRecoveryResponseStatus('Standby')).toBe(false);
  });

  it('does not contain any Lost-report status', () => {
    // **The two state machines share no vocabulary.** `Verification Pending`
    // is a Lost *report* status; a Recovery Response never carries it.
    for (const reportStatus of ['Open', 'Verification Pending', 'Returned', 'Closed']) {
      expect(isRecoveryResponseStatus(reportStatus)).toBe(false);
    }
  });

  it('does not contain any Claim status', () => {
    // **The Found-side Claim and the Lost-side Response share no status
    // enum** (unit brief, rule 1).
    for (const claimStatus of ['Pending', 'Approved', 'Rejected']) {
      expect(isRecoveryResponseStatus(claimStatus)).toBe(false);
    }
  });

  it('recognises each of the eight', () => {
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(isRecoveryResponseStatus(status)).toBe(true);
    }
  });

  it('refuses an unknown value rather than coercing it', () => {
    // **A refusal, not a fallback.** Coercing an unknown value to a nearby
    // status would be inventing a fact about the record.
    expect(isRecoveryResponseStatus('Completed')).toBe(false);
    expect(isRecoveryResponseStatus('selected for verification')).toBe(false);
    expect(isRecoveryResponseStatus('')).toBe(false);
  });

  it('creates every response as Submitted', () => {
    // **A new response is always `Submitted`** — it is not a parameter.
    expect(INITIAL_RECOVERY_RESPONSE_STATUS).toBe('Submitted');
  });
});

describe('terminality', () => {
  it('names exactly the five terminal statuses', () => {
    expect(TERMINAL_RECOVERY_RESPONSE_STATUSES).toEqual([
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ]);
  });

  it('treats Match Confirmed as non-terminal', () => {
    // **The single most consequential fact in the Lost-side state machine.**
    // It records that the owner determined a match — it is not an ending.
    // The Lost report stays `Verification Pending` until an administrator
    // confirms the physical hand-off.
    expect(isTerminalRecoveryResponseStatus('Match Confirmed')).toBe(false);
    expect(isNonTerminalRecoveryResponseStatus('Match Confirmed')).toBe(true);
    expect(TERMINAL_RECOVERY_RESPONSE_STATUSES).not.toContain('Match Confirmed');
  });

  it('treats every terminal status as terminal', () => {
    for (const status of TERMINAL_RECOVERY_RESPONSE_STATUSES) {
      expect(isTerminalRecoveryResponseStatus(status)).toBe(true);
      expect(isNonTerminalRecoveryResponseStatus(status)).toBe(false);
    }
  });

  it('partitions the vocabulary exactly', () => {
    // **Every status is in exactly one set.** A status in both would be a
    // contradiction; a status in neither would be unclassified.
    const terminal = new Set<string>(TERMINAL_RECOVERY_RESPONSE_STATUSES);
    const nonTerminal = new Set<string>(NON_TERMINAL_RECOVERY_RESPONSE_STATUSES);

    expect(terminal.size + nonTerminal.size).toBe(RECOVERY_RESPONSE_STATUSES.length);

    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(terminal.has(status)).not.toBe(nonTerminal.has(status));
    }
  });

  it('derives the non-terminal set as the complement', () => {
    // **The complement, not a second hand-written list.** A status added to
    // the vocabulary is classified by exactly one of the two sets.
    expect(NON_TERMINAL_RECOVERY_RESPONSE_STATUSES).toEqual([
      'Submitted',
      'Selected for Verification',
      'Match Confirmed',
    ]);
  });
});
