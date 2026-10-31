/**
 * The report repository port.
 *
 * **The transaction handle is a required parameter**, exactly as
 * `AuditWriter.record` does. There is no overload that opens its own
 * transaction. A report written outside the transaction that also writes its
 * audit event would produce an audit record for a report that may not exist —
 * and the audit trail is append-only with no correction path (ADR-6), so that
 * error is permanent.
 */

import type {
  EditableContentField,
  FieldSnapshot,
  PersistedReport,
  ReportStatus,
  ValidatedReport,
} from '@/domain/listings';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The fields a write may change on a report. */
export interface ReportFieldUpdate {
  readonly name?: string;
  readonly category?: string;
  readonly description?: string;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly date?: string;
  readonly campusArea?: string;
  readonly exactPlace?: string | null;
  readonly identifyingDetails?: string | null;
  /** The new blob path. `null` removes the image. */
  readonly imageRef?: string | null;
  /**
   * The report's lifecycle status.
   *
   * **The status is here, and that is a deliberate exception.** FR-9 and
   * FR-53 say an *edit* never changes the status — and that is true of
   * every edit path, which simply never puts a status in its update. But
   * FR-11's *withdrawal* is not an edit: it is a lifecycle transition, and
   * it is the one reporter-side operation that legitimately moves the
   * status to `Closed`.
   *
   * The distinction is carried by **who writes what**: the edit paths build
   * their update from `REPORTER_EDITABLE_FIELDS`, which does not include
   * `status`, so an edit structurally cannot change it. The withdrawal path
   * writes exactly `{ status: 'Closed' }` and nothing else.
   */
  readonly status?: ReportStatus;
}

/** Writes and reads reports. */
export interface ReportRepository {
  /**
   * Insert a report inside the caller's transaction.
   *
   * **The id is minted by the caller and passed in.** The report arrives
   * **without an id**, and the repository writes the one it is given — it
   * does not invent one and it does not let the database default one.
   *
   * **Why the id crosses the boundary.** The image is uploaded **before** the
   * row is written (image-handling §5), and the blob's path is namespaced by
   * the owning entity's id (`reports/{entityId}/`, image-handling §4) so
   * storage usage is attributable per entity. The path therefore needs the
   * id *before* the row exists — and the only way to have an id before the
   * row exists is to mint it up front.
   *
   * **The caller mints it, once, and the domain never invents one.** The id
   * still cannot be supplied by a member: it is produced inside the
   * application layer, from `crypto.randomUUID()`, and the route never sees
   * a way to pass one in. The repository's contract is that the id it is
   * given is the id the row carries.
   */
  create(
    reportId: string,
    report: ValidatedReport,
    transaction: TransactionHandle,
  ): Promise<PersistedReport>;

  /**
   * Read a report by id.
   *
   * @returns the report, or `null` when no report carries that id. A missing
   * report and an invisible report are the same answer here — FR-39's
   * "never loaded" property is the read path's concern, and this bolt's
   * callers check ownership themselves.
   */
  findById(reportId: string, transaction?: TransactionHandle): Promise<PersistedReport | null>;

  /**
   * Apply an edit to a report inside the caller's transaction.
   *
   * **Only the fields present in `update` are written.** The caller has
   * already decided which fields changed, and the snapshot it wrote to the
   * audit trail must match the fields this write touched — so the update
   * carries exactly the changed fields and no others.
   *
   * **The status is not among them.** An edit never changes the lifecycle
   * status (FR-9, FR-53), and the omission is structural: there is no
   * status field in the update, so there is no value to change it to.
   *
   * @returns the updated report.
   */
  update(
    reportId: string,
    update: ReportFieldUpdate,
    transaction: TransactionHandle,
  ): Promise<PersistedReport>;

  /**
   * Delete a report inside the caller's transaction.
   *
   * **The caller's transaction must already have opened the audit-deletion
   * window** (ADR-6's `SET LOCAL findback.allow_audit_delete`), and must
   * delete the report's audit entries in the same transaction. The report row
   * and its trail are removed together — a deleted report whose audit history
   * survived would leave orphan trail entries pointing at a report that no
   * longer exists.
   */
  delete(reportId: string, transaction: TransactionHandle): Promise<void>;
}

/** The persisted report's shape, re-exported for the repository's callers. */
export type { EditableContentField, FieldSnapshot, ReportStatus };
