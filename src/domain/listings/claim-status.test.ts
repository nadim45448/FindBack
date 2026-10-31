/**
 * The Claim status vocabulary's suite.
 *
 * **The vocabulary is four statuses, not three.** `Returned` is a real Claim
 * status: a Claim that was returned to its owner is a distinct end state
 * from a Claim that was refused. A suite that asserted three would be
 * asserting a wrong fact — so the count is asserted directly.
 *
 * **The set is frozen and the predicates read from it.** `isClaimStatus` and
 * `isTerminalClaimStatus` are the only answers to "is this a status?" and
 * "is this an ending?", and they read the same constants, so the two cannot
 * disagree about the same status.
 */

import { describe, expect, it } from 'vitest';

import {
  CLAIM_REJECTED_STATUS,
  CLAIM_STATUSES,
  isClaimStatus,
  isTerminalClaimStatus,
  TERMINAL_CLAIM_STATUSES,
} from '@/domain/listings';

describe('the Claim status vocabulary', () => {
  it('has exactly four statuses', () => {
    // **Four, not three.** `Returned` is the fourth — a Claim returned to
    // its owner is not a Claim that was refused.
    expect(CLAIM_STATUSES).toHaveLength(4);
  });

  it('names the PRD\'s statuses, verbatim', () => {
    expect([...CLAIM_STATUSES]).toEqual([
      'Pending',
      'Approved',
      'Rejected',
      'Returned',
    ]);
  });

  it('is frozen, so a caller cannot add to it', () => {
    expect(Object.isFrozen(CLAIM_STATUSES)).toBe(true);
  });

  it('recognises each of its own statuses', () => {
    for (const status of CLAIM_STATUSES) {
      expect(isClaimStatus(status)).toBe(true);
    }
  });

  it('refuses a status that is not one of the four', () => {
    expect(isClaimStatus('pending')).toBe(false);
    expect(isClaimStatus('Cancelled')).toBe(false);
    expect(isClaimStatus('')).toBe(false);
  });

  it('names three terminal statuses', () => {
    expect([...TERMINAL_CLAIM_STATUSES]).toEqual(['Approved', 'Rejected', 'Returned']);
  });

  it('treats Pending as the only non-terminal status', () => {
    // **A Claim that is `Pending` is the only one that can still change.**
    // The other three are endings, and Claim history is preserved (FR-17).
    for (const status of CLAIM_STATUSES) {
      expect(isTerminalClaimStatus(status)).toBe(status !== 'Pending');
    }
  });

  it('rejects a Claim with the status a withdrawal gives it', () => {
    expect(CLAIM_REJECTED_STATUS).toBe('Rejected');
    expect(isTerminalClaimStatus(CLAIM_REJECTED_STATUS)).toBe(true);
  });

  it('does not share a vocabulary with the Recovery Response', () => {
    // The Found side's Claim and the Lost side's Recovery Response are
    // different aggregates with different vocabularies.
    expect(isClaimStatus('Submitted')).toBe(false);
    expect(isClaimStatus('Verification Pending')).toBe(false);
  });
});
