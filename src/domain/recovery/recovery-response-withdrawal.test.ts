/**
 * The responder withdrawal rule's suite.
 *
 * **The load-bearing assertion is how narrow the permission is.**
 *
 * Withdrawal is the responder's own exit, and it is open only while the
 * response is untouched `Submitted` and unselected. Once the owner has
 * selected it, the decision belongs to the owner and the administrator — so
 * the permission is refused there, and it is refused for a *different
 * reason* than a terminal response, because the member's remedy differs.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/lib/errors';

import { RECOVERY_RESPONSE_STATUSES } from './recovery-response-status';
import {
  assertWithdrawalPermitted,
  decideWithdrawal,
  mayWithdraw,
  withdrawalIsATransition,
  withdrawalRefusalMessage,
  WITHDRAWN_STATUS,
} from './recovery-response-withdrawal';

describe('the permitted withdrawal', () => {
  it('is permitted for an unselected Submitted response', () => {
    expect(decideWithdrawal('Submitted')).toEqual({
      kind: 'Permitted',
      status: 'Withdrawn',
    });
  });

  it('reaches Withdrawn', () => {
    expect(WITHDRAWN_STATUS).toBe('Withdrawn');
  });

  it('is the only status a withdrawal may reach', () => {
    // **A withdrawal is one transition, not a family of them.** The
    // responder's exit always lands in the same place.
    const permitted = RECOVERY_RESPONSE_STATUSES.filter((status) => mayWithdraw(status));

    expect(permitted).toEqual(['Submitted']);
  });

  it('agrees with the transition table', () => {
    // **The rule and the table cannot drift.** A withdrawal is a
    // transition, so the table must permit it.
    expect(withdrawalIsATransition('Submitted')).toBe(true);
  });
});

describe('the refused withdrawals', () => {
  it('refuses a selected response because the owner is deciding', () => {
    // **Selection is now the owner's decision in progress.**
    expect(decideWithdrawal('Selected for Verification')).toEqual({
      kind: 'Refused',
      reason: 'AlreadySelected',
    });
  });

  it('refuses a matched response because the decision is recorded', () => {
    // **`Match Confirmed` is non-terminal, but it is past the responder's
    // exit.** The response is still in play; the responder no longer
    // decides it.
    expect(decideWithdrawal('Match Confirmed')).toEqual({
      kind: 'Refused',
      reason: 'NotSubmitted',
    });
  });

  it('refuses every terminal status as terminal', () => {
    for (const status of [
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      expect(decideWithdrawal(status)).toEqual({ kind: 'Refused', reason: 'Terminal' });
    }
  });

  it('refuses every status except Submitted', () => {
    for (const status of RECOVERY_RESPONSE_STATUSES) {
      expect(mayWithdraw(status)).toBe(status === 'Submitted');
    }
  });

  it('gives each refusal reason its own message', () => {
    // **The reasons differ in kind, and so do the messages.** A responder
    // waiting on the owner should not be told the response is closed.
    const messages = new Set([
      withdrawalRefusalMessage('AlreadySelected'),
      withdrawalRefusalMessage('NotSubmitted'),
      withdrawalRefusalMessage('Terminal'),
    ]);

    expect(messages.size).toBe(3);
  });
});

describe('asserting the withdrawal', () => {
  it('accepts a permitted withdrawal', () => {
    expect(() => {
      assertWithdrawalPermitted('Submitted');
    }).not.toThrow();
  });

  it('throws on a refused withdrawal', () => {
    // **The refusal throws rather than returning `false`.** A caller that
    // ignored a `false` would proceed to write a `Withdrawn` status the
    // rules do not permit.
    expect(() => {
      assertWithdrawalPermitted('Selected for Verification');
    }).toThrow(ConflictError);
  });

  it('throws on every terminal status', () => {
    for (const status of [
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      expect(() => {
        assertWithdrawalPermitted(status);
      }).toThrow(ConflictError);
    }
  });

  it('carries the domain message', () => {
    expect(() => {
      assertWithdrawalPermitted('Selected for Verification');
    }).toThrow(withdrawalRefusalMessage('AlreadySelected'));
  });
});

describe('what a withdrawal does not touch', () => {
  it('does not change the report', () => {
    // **A withdrawn response leaves the Lost report's status unaffected.**
    // The rule is about the response alone — it decides nothing about the
    // report it sat on, so the rule has no opinion to express about it.
    const decision = decideWithdrawal('Submitted');

    expect(Object.keys(decision)).toEqual(['kind', 'status']);
  });

  it('does not reach the responder', () => {
    // **FR-5 preserves everything.** A deactivated responder's responses
    // must not cascade into withdrawal or deletion — and this rule has no
    // path that could, because it acts on a response's status and nothing
    // else.
    expect(decideWithdrawal('Submitted')).toEqual({
      kind: 'Permitted',
      status: 'Withdrawn',
    });
  });
});
