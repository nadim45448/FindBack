/**
 * The Recovery Response repository port.
 *
 * **The transaction handle is a required parameter**, exactly as
 * `ClaimRepository.create` and `AuditWriter.record` do. There is no overload
 * that opens its own transaction. A Response written outside the transaction
 * that also writes its audit event would leave the two disagreeing — and the
 * audit trail is append-only with no correction path (ADR-6), so an audit
 * record for a Response that does not exist is permanent.
 *
 * **The write path is the reason the port exists in this shape.** FR-40
 * requires that a Response and its audit event happen together, and that a
 * refused submission writes nothing to the Response or the audit trail. One
 * transaction is the only mechanism that gives both.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type {
  PersistedRecoveryResponse,
  ValidatedRecoveryResponse,
} from '@/domain/recovery';

/** Writes and reads Recovery Responses. */
export interface RecoveryResponseRepository {
  /**
   * Insert a Recovery Response inside the caller's transaction.
   *
   * The Response arrives **without an id**: the id is minted here, once, so it
   * cannot be supplied by a caller or invented by the domain. The returned
   * Response carries it.
   *
   * @throws {DuplicateLiveRecoveryResponseError} when the responder already
   * holds a **non-terminal** Response on this report. **The uniqueness
   * constraint is the database's**, so this refusal is the constraint firing
   * and not an application check — the check in
   * `decideRecoveryResponseSubmission` is the user-facing half, and this is
   * the fact.
   */
  create(
    response: ValidatedRecoveryResponse,
    transaction: TransactionHandle,
  ): Promise<PersistedRecoveryResponse>;

  /**
   * Read a Recovery Response by id.
   *
   * @returns the Response, or `null` when no Response carries that id.
   */
  findById(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<PersistedRecoveryResponse | null>;
}

/**
 * The duplicate-live-Response refusal.
 *
 * **A named error, because the refusals mean different things.** A
 * duplicate is a **conflict** — the responder already holds a live response
 * and must wait — while responding to one's own report is a **permission**
 * failure. The transport maps them to **409** and **403** respectively, and a
 * responder who is told "409" and one who is told "403" are in genuinely
 * different situations.
 */
export class DuplicateLiveRecoveryResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
