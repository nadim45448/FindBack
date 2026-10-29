/**
 * The report interaction reader port.
 *
 * **It answers one question: does this report carry an interaction?**
 *
 * FR-10's hard-delete gate and FR-11's withdrawal gate both need to know
 * whether a Claim exists on a Found report, or a Recovery Response exists on
 * a Lost report. That is the *existence* of a record in another module — not
 * its content — and the port deliberately carries no content.
 *
 * **A count, not a boolean.** The absence of an interaction must be
 * distinguishable from "the question was not asked". A boolean port cannot
 * tell "no Claim" from "the reader did not look", and the difference between
 * those two is the difference between a successful delete and a
 * wrongly-permitted one.
 *
 * **It reads existence, not activity.** A Claim that was already rejected is
 * a terminal Claim, and its existence still blocks deletion — the same
 * holds for a terminal Recovery Response. "Interaction-free" means *no
 * interaction exists*, not *no live interaction*.
 *
 * **The counts are separate, and the caller applies the type.** A Found
 * report's interaction is a Claim; a Lost report's is a Recovery Response.
 * The port returns both counts because the caller — the domain, which knows
 * the type — is the one that decides which count counts. The port does not
 * apply the rule, so it cannot get the type wrong.
 *
 * **The second method carries the records the withdrawal must resolve.** That
 * is a different question from "is there an interaction" — it asks *which*
 * records exist and what state they are in — so it is a separate method
 * rather than an extra field on the first one. A caller that wants only the
 * gate's answer does not pay for the list.
 *
 * Pure — no I/O, no framework imports.
 */

import type {
  InteractionFacts,
  NonTerminalRecoveryResponseToResolve,
  PendingClaimToReject,
} from '@/domain/listings';

/** Reads the interaction facts for a report. */
export interface ReportInteractionReader {
  /**
   * Read the interaction facts for a report.
   *
   * @returns the facts. Every field is `false` for a report nobody has
   * interacted with.
   */
  read(reportId: string): Promise<InteractionFacts>;

  /**
   * Read the Pending Claims on a Found report.
   *
   * **Only `Pending` Claims are returned.** A decided Claim is history, and
   * the withdrawal preserves history — it does not rewrite it.
   *
   * @returns the Pending Claims, empty for a report nobody has claimed.
   */
  readPendingClaims(reportId: string): Promise<readonly PendingClaimToReject[]>;

  /**
   * Read the non-terminal Recovery Responses on a Lost report.
   *
   * @returns the responses, empty for a report nobody has responded to.
   */
  readNonTerminalRecoveryResponses(
    reportId: string,
  ): Promise<readonly NonTerminalRecoveryResponseToResolve[]>;
}
