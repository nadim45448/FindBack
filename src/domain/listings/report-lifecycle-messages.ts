/**
 * The messages the report lifecycle operations refuse with.
 *
 * **The copy is the frozen UX's, verbatim.** EXPERIENCE.md §10.4 names the
 * confirmation modals and the gate copy; the PRD's FR-10 names the 409. Where
 * the frozen copy exists it is reproduced exactly, and where it does not the
 * message is written to the same rules — calm, no blame, and it names the way
 * forward (EXPERIENCE.md §4.9).
 *
 * **These are not templates.** "Returned reports cannot be edited." and
 * "Closed reports cannot be edited." are separate strings, because a
 * template that takes the status as a parameter would let a status that has
 * no message of its own be formatted into one.
 *
 * **The messages are separated from the decisions that produce them.** A
 * decision says *whether* an operation is permitted and *why*; this module
 * says what the member is told. Keeping them apart means a decision can be
 * tested without asserting on English, and the copy can be reviewed by
 * someone who does not read the rules.
 *
 * **Each refusal has exactly one home.** The delete message is here because
 * the delete decision is here. The two *terminal* refusals are not: the
 * terminal-edit message belongs to `terminal-status.ts` (which owns the
 * `TerminalStatus` type) and the terminal-withdrawal message belongs to
 * `report-withdrawal-decision.ts` (which owns the withdrawal reasons).
 * A second copy of either would be a second answer to the same question.
 *
 * Pure — no I/O, no framework imports.
 */

import type { DeletionDecision } from './report-deletion-decision';

/**
 * The message for a hard delete that an interaction blocks.
 *
 * **The message points at Withdraw**, because FR-10 says so: "hard deletion
 * returns HTTP 409 with a message pointing to the Withdraw action (FR-11)."
 * A member whose report has a Claim cannot delete it, but they can withdraw
 * it — and the message has to say so, or the refusal is a dead end.
 */
export function deletionBlockedMessage(decision: DeletionDecision): string {
  switch (decision.kind) {
    case 'BlockedByInteraction':
      return 'Someone has responded to this report, so it can no longer be deleted. You can withdraw it instead, which closes it and keeps its history.';
    case 'BlockedByStatus':
      return 'Only an open report can be deleted. You can withdraw it instead, which closes it and keeps its history.';
    case 'Permitted': {
      // **A permitted decision is not a blocked one.** The function is only
      // called for a refusal; reaching here means a caller asked for the
      // message of a decision that was never blocked.
      throw new Error('A permitted deletion has no blocked message.');
    }
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled deletion decision: ${String(unreachable)}`);
    }
  }
}

/**
 * The confirmation copy for the delete modal.
 *
 * **The UX's wording, verbatim** (EXPERIENCE.md §10.4 §Delete).
 *
 * **This copy lives here because the copy is frozen.** The report UI is a
 * later bolt, and a string transcribed into a component when that bolt
 * arrives would be a second copy that could drift from the frozen UX. The
 * constant is the copy's home; the component reads it.
 */
export const DELETE_CONFIRMATION_COPY =
  'Delete this report? This cannot be undone. The report will be removed from listings.';

/**
 * The confirmation copy for the withdraw modal.
 *
 * **The UX's wording, verbatim** (EXPERIENCE.md §10.4 §Withdraw and UJ-1
 * step 14).
 */
export const WITHDRAW_CONFIRMATION_COPY =
  'Withdraw this report? It will be removed from listings. The administrator can still see it in history.';
