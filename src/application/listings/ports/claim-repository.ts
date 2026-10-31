/**
 * The claim repository port.
 *
 * **The transaction handle is a required parameter**, exactly as
 * `ReportRepository.create` and `AuditWriter.record` do. There is no
 * overload that opens its own transaction. A Claim written outside the
 * transaction that also writes its audit event and moves the report to
 * `Claim Requested` would leave the three disagreeing — and the audit trail
 * is append-only with no correction path (ADR-6), so an audit record for a
 * Claim that does not exist is permanent.
 *
 * **The write path is the reason the port exists in this shape.** The
 * story requires that a Claim and the report's move to `Claim Requested`
 * happen together, and that a refused submission writes nothing to the
 * Claim, the report, *or* the audit trail. One transaction is the only
 * mechanism that gives all three.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { PersistedClaim, ValidatedClaim } from '@/domain/listings';

/** Writes and reads Claims. */
export interface ClaimRepository {
  /**
   * Insert a Claim inside the caller's transaction.
   *
   * The Claim arrives **without an id**: the id is minted here, once, so it
   * cannot be supplied by a caller or invented by the domain. The returned
   * Claim carries it.
   *
   * @throws {DuplicatePendingClaimError} when the member already has a
   * `Pending` Claim on this report. **The uniqueness constraint is the
   * database's**, so this refusal is the constraint firing and not an
   * application check — the check in `decideClaimSubmission` is the
   * user-facing half, and this is the fact.
   */
  create(claim: ValidatedClaim, transaction: TransactionHandle): Promise<PersistedClaim>;

  /**
   * Read a Claim by id.
   *
   * @returns the Claim, or `null` when no Claim carries that id.
   */
  findById(claimId: string, transaction?: TransactionHandle): Promise<PersistedClaim | null>;
}

/**
 * The duplicate-pending-Claim refusal.
 *
 * **A named error, because the two refusals mean different things.** A
 * duplicate is a **conflict** — the member already has a claim pending and
 * must wait — while a claim on one's own report is a **permission** failure.
 * The transport maps them to **409** and **403** respectively, and a member
 * who is told "409" and one who is told "403" are in genuinely different
 * situations.
 */
export class DuplicatePendingClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
