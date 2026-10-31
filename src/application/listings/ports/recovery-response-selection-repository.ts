/**
 * The Recovery Response selection port — the writes FR-43's selection and
 * determination need.
 *
 * **The atomic-selection rule is enforced at the data layer** (FR-41, FR-43,
 * and the §10 concurrency NFR): *"A Lost report may have exactly one
 * Recovery Response in `Selected for Verification` status at any time."*
 *
 * **The database's partial unique index is the rule; the application check
 * is the explanation.** The service reads the currently-selected response
 * and refuses a second selection, but two requests racing could both pass
 * that read. The index cannot race: PostgreSQL serialises the two inserts
 * and the second fails.
 *
 * ## The transaction handle is a required parameter
 *
 * Exactly as `ClaimRepository.create` and `AuditWriter.record` do. There is
 * no overload that opens its own transaction. A response written outside
 * the transaction that also writes its audit event would leave the two
 * disagreeing — and the audit trail is append-only with no correction path
 * (ADR-6), so an audit record for a selection that did not happen is
 * permanent.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { RecoveryResponseStatus } from '@/domain/recovery';

/** The facts about a Lost report's responses the selection needs. */
export interface RecoveryResponseSelectionFacts {
  /**
   * The response currently `Selected for Verification` on the report.
   *
   * **`null` when no response is selected.** The report's selection slot is
   * empty.
   */
  readonly selectedResponseId: string | null;
  /** The selected response's status, when one is selected. */
  readonly selectedResponseStatus: RecoveryResponseStatus | null;
}

/** The atomic-selection refusal. */
export class ConcurrentSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Moves Recovery Responses between the lifecycle's statuses. */
export interface RecoveryResponseSelectionRepository {
  /**
   * Move a response to `Selected for Verification`.
   *
   * **The write is conditional on the response still being `Submitted`.** A
   * response that was decided between the caller's read and this write is
   * not selected — the write lands nothing.
   *
   * @throws {ConcurrentSelectionError} when another response already holds
   * the report's selection slot. **This is the database's partial unique
   * index firing**, not an application check — the check in
   * `decideSelection` is the user-facing half, and this is the fact.
   */
  selectForVerification(
    responseId: string,
    transaction: TransactionHandle,
  ): Promise<boolean>;

  /**
   * Move a response to a determination's status.
   *
   * **The write is conditional on the response still being `Selected for
   * Verification`.** A response that was determined between the caller's
   * read and this write is not determined again — the write lands nothing.
   *
   * @throws {ConcurrentSelectionError} when the response is no longer
   * selected, so two administrators cannot both determine it.
   */
  determine(
    responseId: string,
    status: RecoveryResponseStatus,
    transaction: TransactionHandle,
  ): Promise<boolean>;

  /**
   * Read the report's selection facts.
   *
   * @returns the facts, or `null` when no report carries that id.
   */
  readSelectionFacts(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseSelectionFacts | null>;

  /**
   * Read the status of one response on a report.
   *
   * @returns the response's status, or `null` when no response carries that
   * id on that report.
   */
  readResponseStatus(
    reportId: string,
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseStatus | null>;
}
