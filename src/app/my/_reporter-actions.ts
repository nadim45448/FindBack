/**
 * The reporter's action plan, derived from the FR-39 projection.
 *
 * ## The plan is the domain's; this module only supplies the facts
 *
 * `planReporterActions` owns the interlocks between Edit, Delete, and
 * Withdraw. **This module reads the projection and hands the domain its
 * facts** — it does not decide anything.
 *
 * ## The interaction facts come from the projection
 *
 * The projection carries the report's Claims and Recovery Responses with
 * their statuses, so the four facts the gate reads are **derivable from
 * what the server already sent**:
 *
 * - `hasClaim` — a Claim exists on the report.
 * - `hasRecoveryResponse` — a Recovery Response exists on the report.
 * - `hasApprovedClaim` — a Claim on the report is `Approved`.
 * - `hasMatchConfirmed` — a Recovery Response on the report is
 *   `Match Confirmed`.
 *
 * **A Claim that was already rejected still counts as an interaction.** The
 * deletion decision reads *interaction existence*, not activity — the
 * domain's own `hasInteraction` says so, and this module does not
 * re-derive it.
 *
 * ## The type decides which fact counts
 *
 * **A Found report's interaction is a Claim; a Lost report's is a Recovery
 * Response.** The gate already knows this — it is `hasInteraction`'s rule —
 * so this module supplies all four facts and lets the gate choose.
 */

import {
  ownerColumnFor,
  planReporterActions,
  type InteractionFacts,
  type ReporterActionPlan,
  type VisibilityProjection,
} from '@/domain/listings';

/**
 * The reporter's action plan for a report the viewer may act on.
 *
 * @returns the plan, or `null` when the viewer is not the report's
 * reporter — in which case there are no reporter actions to offer.
 */
export function reporterActionPlan(
  projection: VisibilityProjection,
): ReporterActionPlan | null {
  // **Only the reporter has reporter actions.** The projection's column
  // set carries the owner column — `foundReportOwner` or
  // `lostReportOwner` — when the viewer authored the report, and the
  // resolver puts it there **by equality of ids**, never by a
  // client-asserted flag. So the column set is the structural evidence
  // that the viewer is the reporter.
  if (!projection.columns.includes(ownerColumnFor(projection.report.type))) {
    return null;
  }

  const facts = interactionFacts(projection);

  return planReporterActions({
    status: projection.report.status as Parameters<typeof planReporterActions>[0]['status'],
    type: projection.report.type,
    interactions: facts,
  });
}

/**
 * The interaction facts, read from the projection.
 */
function interactionFacts(projection: VisibilityProjection): InteractionFacts {
  const hasApprovedClaim = projection.claims.some((claim) => claim.status === 'Approved');

  const hasMatchConfirmed = projection.recoveryResponses.some(
    (response) => response.status === 'Match Confirmed',
  );

  return {
    hasClaim: projection.claims.length > 0,
    hasRecoveryResponse: projection.recoveryResponses.length > 0,
    hasApprovedClaim,
    hasMatchConfirmed,
  };
}
