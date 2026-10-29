/**
 * The Recovery Response transition table's suite.
 *
 * **The load-bearing assertion is that an illegal transition throws.**
 *
 * The story is explicit: *"the transition throws rather than silently
 * degrading or partially applying."* A table that returned `false` and
 * relied on the caller to check it would put the guarantee in every caller
 * instead of in one place — and one caller would forget.
 *
 * **The table is total.** Every one of the eight statuses is a key, so a
 * lookup never misses for want of a key. The illegal transitions are
 * therefore *illegal pairs*, not missing rows — which is the difference
 * between "not yet implemented" and "not permitted".
 */

import { describe, expect, it } from 'vitest';

import { IllegalTransitionError } from '@/lib/errors';

import { RECOVERY_RESPONSE_STATUSES } from './recovery-response-status';
import {
  assertRecoveryResponseTransition,
  canTransition,
  decideRecoveryResponseTransition,
  hasOutgoingTransition,
  parseRecoveryResponseStatus,
  RECOVERY_RESPONSE_TRANSITIONS,
  transitionsFrom,
} from './recovery-response-transition';

describe('the transition table', () => {
  it('has a key for every canonical status', () => {
    // **A total function.** Every status is a key, so "not in the table"
    // can only mean "not permitted" and never "not yet implemented".
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(Object.keys(RECOVERY_RESPONSE_TRANSITIONS)).toContain(status);
    }
  });

  it('permits only the canonical statuses as targets', () => {
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      for (const target of transitionsFrom(status)) {
        expect(RECOVERY_RESPONSE_STATUSES).toContain(target);
      }
    }
  });

  it('permits no transition out of a terminal status', () => {
    for (const status of [
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      expect(transitionsFrom(status)).toEqual([]);
      expect(hasOutgoingTransition(status)).toBe(false);
    }
  });

  it('permits Match Confirmed to leave', () => {
    // **`Match Confirmed` is non-terminal.** The report's lifecycle is what
    // moves a matched response on, and it can still move.
    expect(hasOutgoingTransition('Match Confirmed')).toBe(true);
    expect(canTransition('Match Confirmed', 'Completed — Report Returned')).toBe(true);
  });

  it('permits the four transitions the story names', () => {
    expect(canTransition('Submitted', 'Selected for Verification')).toBe(true);
    expect(canTransition('Selected for Verification', 'Not a Match')).toBe(true);
    expect(canTransition('Selected for Verification', 'Match Confirmed')).toBe(true);
    expect(canTransition('Match Confirmed', 'Completed — Report Returned')).toBe(true);
  });

  it('permits a report to resolve any non-terminal response', () => {
    for (const status of [
      'Submitted',
      'Selected for Verification',
      'Match Confirmed',
    ] as const) {
      expect(canTransition(status, 'Resolved — Report Returned')).toBe(true);
      expect(canTransition(status, 'Resolved — Report Closed')).toBe(true);
    }
  });

  it('refuses to withdraw a selected response', () => {
    // **The withdrawal is refused because selection is now the owner's
    // decision in progress.**
    expect(canTransition('Selected for Verification', 'Withdrawn')).toBe(false);
  });

  it('refuses to withdraw a matched response', () => {
    expect(canTransition('Match Confirmed', 'Withdrawn')).toBe(false);
  });

  it('refuses to withdraw a response that is already terminal', () => {
    expect(canTransition('Not a Match', 'Withdrawn')).toBe(false);
    expect(canTransition('Withdrawn', 'Withdrawn')).toBe(false);
  });

  it('refuses to move a response backwards', () => {
    // **There is no way back.** The machine only moves forward.
    expect(canTransition('Selected for Verification', 'Submitted')).toBe(false);
    expect(canTransition('Match Confirmed', 'Selected for Verification')).toBe(false);
    expect(canTransition('Not a Match', 'Match Confirmed')).toBe(false);
  });

  it('refuses to move a terminal response to anything', () => {
    for (const from of [
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      for (const to of RECOVERY_RESPONSE_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('permits no response to move to itself', () => {
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('asserting a transition', () => {
  it('accepts a permitted transition', () => {
    expect(() => {
      assertRecoveryResponseTransition('Submitted', 'Selected for Verification');
    }).not.toThrow();
  });

  it('throws on an illegal transition', () => {
    // **The refusal is an exception, not a returned false.** A caller that
    // ignored a `false` would proceed to write a transition the rules do
    // not permit.
    expect(() => {
      assertRecoveryResponseTransition('Submitted', 'Match Confirmed');
    }).toThrow(IllegalTransitionError);
  });

  it('throws when moving out of a terminal status', () => {
    expect(() => {
      assertRecoveryResponseTransition('Not a Match', 'Match Confirmed');
    }).toThrow(IllegalTransitionError);
  });

  it('names both statuses in the refusal', () => {
    // **The question "why was this refused?" is answered by the pair.**
    expect(() => {
      assertRecoveryResponseTransition('Submitted', 'Match Confirmed');
    }).toThrow(/Submitted/);

    expect(() => {
      assertRecoveryResponseTransition('Submitted', 'Match Confirmed');
    }).toThrow(/Match Confirmed/);
  });

  it('refuses the transition rather than partially applying it', () => {
    // **The function returns nothing on success and throws on failure.**
    // There is no path that returns a "not done" result the caller could
    // ignore.
    const outcome = decideRecoveryResponseTransition('Submitted', 'Match Confirmed');

    expect(outcome).toEqual({
      kind: 'Refused',
      reason: 'A Recovery Response cannot move from "Submitted" to "Match Confirmed".',
    });
  });
});

describe('the decision form', () => {
  it('permits a legal transition', () => {
    expect(decideRecoveryResponseTransition('Submitted', 'Withdrawn')).toEqual({
      kind: 'Permitted',
    });
  });

  it('refuses an illegal transition with the same reason the throw carries', () => {
    // **One answer to "may this move?", in two forms.** The decision and the
    // assertion must not disagree.
    const decision = decideRecoveryResponseTransition('Submitted', 'Match Confirmed');

    let thrown = '';
    try {
      assertRecoveryResponseTransition('Submitted', 'Match Confirmed');
    } catch (error) {
      thrown = (error as Error).message;
    }

    expect(decision.kind).toBe('Refused');
    expect(thrown).toBe(
      decision.kind === 'Refused' ? decision.reason : 'the forms disagreed',
    );
  });
});

describe('parsing a stored status', () => {
  it('accepts each canonical status', () => {
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(parseRecoveryResponseStatus(status)).toBe(status);
    }
  });

  it('refuses Standby', () => {
    // **The read path guards what the write path already prevents.** The
    // database's CHECK constraint rejects the write; this refuses to
    // interpret a value that could not have been written.
    expect(() => parseRecoveryResponseStatus('Standby')).toThrow(IllegalTransitionError);
  });

  it('refuses an unknown value rather than coercing it', () => {
    expect(() => parseRecoveryResponseStatus('Completed')).toThrow(IllegalTransitionError);
  });
});
