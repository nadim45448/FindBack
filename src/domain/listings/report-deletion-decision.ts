/**
 * The `DeletionDecision` — may this report be hard-deleted?
 *
 * **The two blocked cases are distinguishable, because they answer
 * differently.**
 *
 * - **`BlockedByInteraction`** — the report has a Claim (Found) or a
 *   Recovery Response (Lost). Deletion has become unavailable, but **a
 *   remaining path exists**: the reporter may Withdraw instead. FR-10
 *   answers this with **HTTP 409** and a message pointing at Withdraw.
 * - **`BlockedByStatus`** — the report is not `Open`. FR-10's advice would be
 *   **wrong here**: a `Returned` report cannot be withdrawn either, so
 *   pointing at Withdraw would send the member somewhere with no exit.
 *
 * Collapsing the two into one "cannot delete" answer would produce a 409
 * whose advice is a dead end.
 *
 * **The gate is type-asymmetric.** FR-10: a Found report's interaction is a
 * Claim; a Lost report's is a Recovery Response. A Found report with a
 * Recovery Response is not a valid combination, and a Lost report has no
 * Claims.
 *
 * **The gate reads interaction *existence*, not activity.** A Claim that was
 * already rejected is a terminal Claim, and its existence still blocks
 * deletion — the same holds for a terminal Recovery Response. "Interaction-
 * free" means *no interaction exists*, not *no live interaction*.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/** The interaction facts the gate reads. */
export interface InteractionFacts {
  /** Whether a Claim exists on the report. Found-side only. */
  readonly hasClaim: boolean;
  /** Whether a Recovery Response exists on the report. Lost-side only. */
  readonly hasRecoveryResponse: boolean;
  /** Whether a Claim on the report has been approved. Found-side only. */
  readonly hasApprovedClaim: boolean;
  /** Whether a Recovery Response on the report has matched. Lost-side only. */
  readonly hasMatchConfirmed: boolean;
}

/** No interaction facts — the report is untouched. */
export const NO_INTERACTIONS: InteractionFacts = Object.freeze({
  hasClaim: false,
  hasRecoveryResponse: false,
  hasApprovedClaim: false,
  hasMatchConfirmed: false,
});

/**
 * The outcome of the hard-delete gate.
 *
 * `Permitted` carries the interaction facts that were verified empty, so
 * the caller records the check that passed rather than assuming it.
 */
export type DeletionDecision =
  | { readonly kind: 'Permitted'; readonly facts: InteractionFacts }
  | { readonly kind: 'BlockedByInteraction' }
  | { readonly kind: 'BlockedByStatus' };

/**
 * Decide whether a report may be hard-deleted.
 *
 * **The order matters.** The interaction check runs first, because a report
 * that is not `Open` *and* has an interaction is refused for the status
 * reason — the member's remedy is not Withdraw, because a `Returned` report
 * cannot be withdrawn either.
 */
export function decideDeletion(
  status: ReportStatus,
  type: ReportType,
  facts: InteractionFacts,
): DeletionDecision {
  if (status !== 'Open') {
    return { kind: 'BlockedByStatus' };
  }

  if (hasInteraction(type, facts)) {
    return { kind: 'BlockedByInteraction' };
  }

  return { kind: 'Permitted', facts };
}

/**
 * Whether the report carries an interaction.
 *
 * **The type decides which fact counts.** A Found report's interaction is a
 * Claim; a Lost report's is a Recovery Response. The type is immutable, so
 * this is decided once and cannot change under the gate.
 */
export function hasInteraction(type: ReportType, facts: InteractionFacts): boolean {
  switch (type) {
    case 'Found':
      return facts.hasClaim;
    case 'Lost':
      return facts.hasRecoveryResponse;
    default: {
      const unreachable: never = type;
      throw new Error(`Unhandled report type: ${String(unreachable)}`);
    }
  }
}
