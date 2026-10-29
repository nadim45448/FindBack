/**
 * The `ReportDeletionService` — FR-10's hard delete.
 *
 * **Hard deletion is the narrowest operation in the system, and every part of
 * it is a gate.**
 *
 * FR-10 says a member may delete their own report only when:
 *
 * ```text
 * 1. the report status is Open, AND
 * 2. for a Found report, no Claim exists on it,
 * 3. for a Lost report, no Recovery Response exists on it.
 * ```
 *
 * The rule is **symmetric across the two types** and there is **no exception
 * path through any other requirement** — the PRD is explicit about both. So
 * the gate is one function, `decideDeletion`, and the type only decides
 * *which* interaction counts.
 *
 * **The sequence is the mechanism:**
 *
 * ```text
 * 1. read the report
 * 2. check ownership            → refuse a non-reporter
 * 3. read the interaction facts → decide the gate
 * 4. BEGIN
 * 5.   SET LOCAL findback.allow_audit_delete = 'on'
 * 6.   delete the report's audit entries
 * 7.   delete the report row
 * 8. COMMIT
 * 9. delete the blob (after the commit, compensating)
 * ```
 *
 * **The audit trail goes with the report.** PRD §10 says so: "When the report
 * is hard-deleted under FR-10, the related Claims / Recovery Responses /
 * messages / audit entries are removed with it." A deleted report whose trail
 * survived would leave orphan trail entries pointing at a report that no
 * longer exists.
 *
 * **The deletion window is opened only after the gate passes.** The flag is
 * transaction-scoped (`SET LOCAL`, not `SET`), so it is discarded at commit
 * or rollback and cannot leak onto a reused pooled connection. A report that
 * fails the gate never opens a window at all — the flag names its single
 * permitted caller, and there is no general-purpose "may delete audit rows"
 * switch.
 *
 * **The blob is deleted after the commit, not inside it.** A blob store
 * cannot join a PostgreSQL transaction, so the delete is **compensating**:
 * if it fails, the failure is recorded for retry rather than silently leaked.
 * The same mechanism the create path uses, so there is one retry path in the
 * system rather than two.
 *
 * **The deletion and the audit removal are in one transaction.** Either both
 * happen or neither does — a report row removed with its trail intact, or a
 * trail removed with its report still present, are both defects.
 *
 * Pure orchestration — the ports do the I/O.
 */

import type { TransactionFactory } from '@/application/ports/transaction-factory';

import {
  decideDeletion,
  deletionBlockedMessage,
  type DeletionDecision,
  type InteractionFacts,
  type PersistedReport,
} from '@/domain/listings';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

import type { ReportInteractionReader } from './ports/report-interaction-reader';
import type { ImageStore } from './ports/image-store';
import type { ReportRepository } from './ports/report-repository';

/** The reporter's identity. */
export interface ReportDeletionActor {
  readonly actorId: string;
}

/** What the caller supplies. */
export interface DeleteReportRequest {
  readonly reportId: string;
  readonly actor: ReportDeletionActor;
}

/** What the service returns. */
export interface DeleteReportResult {
  /** The report as it was, immediately before it was deleted. */
  readonly report: PersistedReport;
  /** The facts the gate decided on. */
  readonly facts: InteractionFacts;
}

/** The image store's delete is best-effort; a failure is recorded for retry. */
export interface ReportDeletionLogger {
  /** Record that a blob delete failed and needs a retry. */
  recordBlobDeleteFailure(path: string, error: unknown): void;
}

/**
 * Deletes a report, permanently.
 *
 * @throws {NotFoundError} when no report carries that id.
 * @throws {PermissionDeniedError} when the actor is not the reporter.
 * @throws {ConflictError} when the report is not interaction-free `Open`.
 * The message names the Withdraw action (FR-10).
 */
export class ReportDeletionService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly interactions: ReportInteractionReader,
    private readonly auditTrailDeletion: AuditTrailDeletion,
    private readonly images: ImageStore,
    private readonly transactions: TransactionFactory,
    private readonly logger: ReportDeletionLogger,
  ) {}

  async delete(request: DeleteReportRequest): Promise<DeleteReportResult> {
    const report = await this.reports.findById(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // ── Ownership ───────────────────────────────────────────────────────────
    //
    // **The reporter is derived from the session, never from the request.**
    // A member who is not the reporter is refused, whether or not the report
    // is visible to them through FR-39.
    if (report.reporterId !== request.actor.actorId) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── The gate ────────────────────────────────────────────────────────────
    //
    // **The status check runs first**, inside `decideDeletion`. A report that
    // is not `Open` is refused regardless of its interactions — a `Returned`
    // report is not deletable even if it somehow carries no interaction,
    // because it holds a historical return fact.
    const facts = await this.interactions.read(request.reportId);

    const decision = decideDeletion(report.status, report.type, facts);

    if (decision.kind !== 'Permitted') {
      throw new ConflictError(deletionBlockedMessage(decision));
    }

    // ── The deletion, in one transaction ────────────────────────────────────
    //
    // The audit trail goes with the report (PRD §10), and the two deletions
    // are one act: a report row removed with its trail intact, or a trail
    // removed with its report still present, are both defects.
    await this.transactions.run((transaction) =>
      this.deleteReportAndTrail(report, transaction),
    );

    // ── The blob, after the commit ─────────────────────────────────────────
    //
    // A blob store cannot join a PostgreSQL transaction, so the delete is
    // **compensating** and is issued **after** the database side has settled**.
    // A delete inside a transaction that is about to roll back would be
    // undone by that rollback and orphan the blob anyway.
    if (report.imageRef) {
      await this.deleteImage(report.imageRef.path);
    }

    return { report, facts };
  }

  /**
   * Delete the report's trail and the report row, in the caller's transaction.
   *
   * **The trail goes first.** The audit deletion opens the FR-10 window
   * (`SET LOCAL findback.allow_audit_delete = 'on'`), and the report deletion
   * cascades from there — so the order is the trail, then the row.
   */
  private async deleteReportAndTrail(
    report: PersistedReport,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<void> {
    await this.auditTrailDeletion.deleteForParent('report', report.id, transaction);

    await this.reports.delete(report.id, transaction);
  }

  /**
   * Delete the report's image.
   *
   * **A failed delete does not mask the deletion.** The report is gone — that
   * is what the member asked for and what the PRD requires — and an orphaned
   * blob is an operational problem, not theirs. The failure is recorded for
   * retry instead.
   */
  private async deleteImage(path: string): Promise<void> {
    try {
      await this.images.delete(path);
    } catch (error) {
      this.logger.recordBlobDeleteFailure(path, error);
    }
  }
}

/**
 * The audit-trail deletion the service depends on.
 *
 * **A port, not a direct import of the infrastructure helper.** The helper
 * that sets `SET LOCAL findback.allow_audit_delete` lives in the audit
 * infrastructure module, and the application layer must not import from
 * infrastructure. The port names the one operation the FR-10 path needs.
 *
 * **The port is deliberately narrow.** It deletes a parent's trail and
 * nothing else — it cannot delete an arbitrary audit row, and it cannot open
 * the deletion window on its own. The implementation sets the flag and
 * deletes; the rule that decides *whether* it may is FR-10's, and that rule
 * lives in the domain.
 */
export interface AuditTrailDeletion {
  /**
   * Delete the audit entries for one parent.
   *
   * **The caller must have already established eligibility.** The
   * implementation opens the FR-10 deletion window and deletes the parent's
   * entries; it does not evaluate the rule that decides whether the window
   * may be opened.
   */
  deleteForParent(
    parentType: string,
    parentId: string,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<number>;
}

/** The decision's shape, re-exported for the route's tests. */
export type { DeletionDecision };
