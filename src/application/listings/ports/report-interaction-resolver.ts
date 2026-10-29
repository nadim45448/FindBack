/**
 * The report interaction resolver port.
 *
 * **The withdrawal changes records that live in other modules.** A Found
 * report's withdrawal rejects its Pending Claims; a Lost report's withdrawal
 * resolves its non-terminal Recovery Responses. Those records belong to the
 * claims and recovery-response contexts, so this module does not write them
 * directly — it names the transitions and lets the owning module perform
 * them.
 *
 * **The transitions are named, not performed.** The port's methods say
 * *what* must happen (`rejectPendingClaim`, `resolveRecoveryResponse`) and
 * take the transaction handle, so the writes commit with the report's status
 * change. That is the whole point: FR-11 says the report transitions to
 * `Closed` **and** its dependent records transition — and "and" means one
 * transaction, not two.
 *
 * **The audit events for the dependent transitions are the owning module's
 * to write.** A Claim's rejection is a Claim event (FR-48's catalog); this
 * module does not know its number, and inventing one would breach ADR-9. So
 * the resolver returns what it did, and the caller — which has the catalog
 * through the audit module — writes the events.
 *
 * **The batch resolution set is obtained by the implementation, not by the
 * caller** (ADR-10). The caller asks for "the Pending Claims on this report"
 * and the implementation returns the rows it resolved, using a single
 * `UPDATE … RETURNING` where it can. A caller that assembled the set itself
 * would have a read-then-write race: a Claim created between the read and the
 * write would survive a withdrawal that was supposed to end it.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type {
  NonTerminalRecoveryResponseToResolve,
  PendingClaimToReject,
} from '@/domain/listings';

/** A Claim that was rejected by a withdrawal. */
export interface RejectedClaim {
  readonly claimId: string;
  readonly claimStatus: string;
  /** The reason recorded against the rejection. */
  readonly reason: string;
  /**
   * The claimant's email address.
   *
   * **The address travels with the rejection.** The FR-29 notification must
   * reach exactly the claimants whose Claims were rejected — and a Claim that
   * was rejected by a *concurrent* withdrawal must not be notified twice, or
   * not at all. Reading the addresses after the fact cannot distinguish those
   * cases: the Claims are no longer `Pending`, so a "read the Pending Claims"
   * query would find none.
   */
  readonly claimantEmail: string;
}

/** A Recovery Response that was resolved by a withdrawal. */
export interface ResolvedRecoveryResponse {
  readonly recoveryResponseId: string;
  readonly recoveryResponseStatus: string;
}

/**
 * Resolves the records a report withdrawal ends.
 *
 * **Every method takes the caller's transaction.** The dependent
 * transitions and the report's status change are one act — a report that is
 * `Closed` while its Claims are still `Pending` would leave the two
 * disagreeing, and the PRD requires them to agree.
 */
export interface ReportInteractionResolver {
  /**
   * Reject the Pending Claims on a Found report.
   *
   * @param reason the audit reason — FR-11's "report withdrawn by reporter"
   * @returns the Claims that were rejected. The set is the implementation's
   * to determine, so a Claim created concurrently is included rather than
   * missed.
   */
  rejectPendingClaims(
    reportId: string,
    reason: string,
    transaction: TransactionHandle,
  ): Promise<readonly RejectedClaim[]>;

  /**
   * Resolve the non-terminal Recovery Responses on a Lost report.
   *
   * @returns the responses that were resolved.
   */
  resolveNonTerminalRecoveryResponses(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedRecoveryResponse[]>;
}

/** The records the withdrawal reads, before it resolves them. */
export interface ReportInteractionRecords {
  readonly pendingClaims: readonly PendingClaimToReject[];
  readonly nonTerminalRecoveryResponses: readonly NonTerminalRecoveryResponseToResolve[];
}
