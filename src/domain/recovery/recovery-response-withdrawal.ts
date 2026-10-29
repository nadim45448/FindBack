/**
 * The responder's withdrawal — story 007's rule.
 *
 * **Withdrawal is the responder's own exit, and it is deliberately narrow.**
 * It is permitted only while the response is untouched `Submitted` and
 * unselected. Once the owner has selected it, **the decision belongs to the
 * owner and the administrator**, not to the responder.
 *
 * The story's three refusals, each for a different reason:
 *
 * | State | Outcome | Why |
 * |---|---|---|
 * | `Submitted`, not selected | `Withdrawn` | The responder's own exit |
 * | `Selected for Verification` | refused | The owner's decision is in progress |
 * | `Match Confirmed` or any terminal | refused | The outcome is already recorded |
 *
 * ## Deactivation is not withdrawal
 *
 * **FR-5 preserves everything.** A responder whose account is deactivated
 * keeps their responses: they remain intact and their history is preserved.
 * A deactivated responder's responses must not cascade into withdrawal or
 * deletion, and this module has no path that would do so — deactivation
 * reaches this rule only as *"the account cannot act"*, never as *"the
 * responses change."*
 *
 * ## The withdrawal does not touch the report
 *
 * A withdrawn response leaves the Lost report's status **unaffected**. The
 * report may be `Verification Pending` because of a *different* selection,
 * and withdrawing one response does not change that; and if the withdrawn
 * response was the only one, the report simply remains `Open`.
 *
 * Pure — no I/O, no framework imports.
 */

import { ConflictError } from '@/lib/errors';

import type { RecoveryResponseStatus } from './recovery-response-status';
import { canTransition } from './recovery-response-transition';

/** The status a withdrawn response reaches. */
export const WITHDRAWN_STATUS: RecoveryResponseStatus = 'Withdrawn';

/**
 * Why a withdrawal was refused.
 *
 * **The reasons differ in kind, and the member's remedy differs with them.**
 *
 * - `AlreadySelected` — the owner is deciding; the responder waits.
 * - `NotSubmitted` — the response has moved past the point where the
 *   responder alone can withdraw it.
 * - `Terminal` — the outcome is already recorded.
 */
export type WithdrawalRefusalReason =
  | 'AlreadySelected'
  | 'NotSubmitted'
  | 'Terminal';

/**
 * The outcome of a withdrawal decision.
 *
 * **A permitted outcome carries the status it reaches,** so the caller
 * writes the status the decision named rather than repeating the literal.
 */
export type WithdrawalDecision =
  | { readonly kind: 'Permitted'; readonly status: RecoveryResponseStatus }
  | { readonly kind: 'Refused'; readonly reason: WithdrawalRefusalReason };

/**
 * Decide whether a responder may withdraw a response.
 *
 * **The rule is narrow by design.** Only a `Submitted` response that has not
 * been selected may be withdrawn — and "not been selected" is not a separate
 * flag: it is a property of the status, because selection *is* the status
 * `Selected for Verification`.
 *
 * @param status the response's current stored status
 */
export function decideWithdrawal(status: RecoveryResponseStatus): WithdrawalDecision {
  if (status === 'Submitted') {
    return { kind: 'Permitted', status: WITHDRAWN_STATUS };
  }

  if (status === 'Selected for Verification') {
    return { kind: 'Refused', reason: 'AlreadySelected' };
  }

  if (status === 'Match Confirmed') {
    // **Non-terminal, but past the responder's exit.** The owner's
    // determination has been recorded; the response is still in play, but
    // the responder no longer decides it.
    return { kind: 'Refused', reason: 'NotSubmitted' };
  }

  return { kind: 'Refused', reason: 'Terminal' };
}

/**
 * The message that explains why a withdrawal was refused.
 *
 * **One message per reason, and the reason names the remedy.** The copy
 * lives here so that every caller tells the responder the same thing.
 */
export function withdrawalRefusalMessage(reason: WithdrawalRefusalReason): string {
  switch (reason) {
    case 'AlreadySelected':
      return 'This response is being reviewed, so it can no longer be withdrawn.';
    case 'NotSubmitted':
      return 'This response has already been decided, so it can no longer be withdrawn.';
    case 'Terminal':
      return 'This response is closed, so it can no longer be withdrawn.';
  }
}

/**
 * Assert that a response may be withdrawn, or refuse.
 *
 * **The refusal throws rather than returning `false`.** A caller that ignored
 * a `false` would proceed to write a `Withdrawn` status the rules do not
 * permit — and the story requires that the refusal be unmistakable.
 *
 * @throws {ConflictError} when the withdrawal is refused. A `ConflictError`
 * is the codebase's **409**: the request is well-formed, but the current
 * state of the world conflicts with it.
 */
export function assertWithdrawalPermitted(status: RecoveryResponseStatus): void {
  const decision = decideWithdrawal(status);

  if (decision.kind === 'Refused') {
    throw new ConflictError(withdrawalRefusalMessage(decision.reason));
  }
}

/**
 * True when the response may be withdrawn.
 *
 * **The same decision as `decideWithdrawal`,** read as a question — there is
 * no second answer to "may this response be withdrawn?".
 */
export function mayWithdraw(status: RecoveryResponseStatus): boolean {
  return decideWithdrawal(status).kind === 'Permitted';
}

/**
 * True when the transition table permits the withdrawal itself.
 *
 * **The withdrawal is a transition, so the table must agree with the rule.**
 * This is the cross-check that the two cannot drift: if a status were ever
 * removed from `Submitted`'s outgoing transitions without the withdrawal rule
 * changing, this would fail.
 */
export function withdrawalIsATransition(status: RecoveryResponseStatus): boolean {
  return status === 'Submitted' && canTransition(status, WITHDRAWN_STATUS);
}
