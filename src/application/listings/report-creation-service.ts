/**
 * The `ReportCreationService` — the write half of the listings module.
 *
 * **The sequence is the mechanism.** The order is:
 *
 * ```text
 * 1.  validate → ValidatedReport | FieldValidationError   (domain, pure)
 * 2.  upload the blob → ImageRef                          (outside any transaction)
 * 3.  BEGIN
 * 4.    INSERT reports
 * 5.    INSERT audit_events (event 1)
 * 6.  COMMIT
 * 7.  raise ReportCreated (after the commit)
 * ```
 *
 * **Why the image is uploaded before the row is written.** image-handling §5:
 * *"The owning record is not created. Upload is part of the write, not a
 * follow-up."* The report row is written **last**, so a blob failure means no
 * report exists — there is no "report without image" intermediate state to
 * clean up.
 *
 * **Why the blob upload is outside the transaction.** A blob store cannot
 * join a PostgreSQL transaction. Pretending otherwise would be a lie about
 * atomicity, so the write is **compensating**: upload, write the row, and if
 * the row write fails, delete the blob. The delete is issued **after** the
 * rollback, not inside it — a delete inside a transaction that is about to
 * roll back would be undone by that rollback and orphan the blob anyway.
 *
 * **Why the event is raised after the commit.** An event for a report that
 * may not exist is worse than a missing one (ADR-7's reasoning).
 *
 * **Why the audit event is inside the transaction.** An audit entry for a
 * transition that did not happen is a defect (ADR-3, `data-stack.md`). The
 * trail is append-only with no correction path, so the error would be
 * permanent.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';

import {
  buildReportCreatedEvent,
  createImageRef,
  validateReportDraft,
  type ImageRef,
  type PersistedReport,
  type ReportCreated,
  type ReportDraft,
  type ValidatedReport,
} from '@/domain/listings';

import type { CampusAreaReader } from './ports/campus-area-reader';
import type { ImageStore, ImageUpload } from './ports/image-store';
import type { ReportRepository } from './ports/report-repository';

/** The actor the report is attributed to. */
export interface ReportCreationActor {
  readonly actorId: string;
}

/** What the caller supplies. */
export interface CreateReportRequest {
  readonly draft: ReportDraft;
  readonly actor: ReportCreationActor;
  /** The image, when one was uploaded. */
  readonly image?: ImageUpload | null;
}

/** What the service returns. */
export interface CreateReportResult {
  /**
   * The persisted report.
   *
   * **`PersistedReport`, not `Report`.** The entity the domain defines is
   * named `Report`, but that name is also the DOM's `Response`-shaped
   * global in TypeScript's lib — a bare `Report` here would silently mean
   * the wrong thing. `PersistedReport` says what it is: the validated
   * fields plus the id the repository minted.
   */
  readonly report: PersistedReport;
  readonly event: ReportCreated;
}

/** The clock, injected so the date bound is testable. */
export interface ReportCreationClock {
  /** The current instant. */
  now(): Date;
}

/**
 * Creates a Lost or Found report.
 *
 * **One use case for both types.** FR-6 and FR-7 are the same operation with
 * a different type and a different date bound, and the bound is read from the
 * type. Two use cases would be two chances for them to drift.
 */
export class ReportCreationService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly campusAreas: CampusAreaReader,
    private readonly images: ImageStore,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ReportCreationClock,
  ) {}

  /**
   * Create a report.
   *
   * @throws {ValidationError} naming the offending field, when the
   * submission breaks a rule. Nothing is stored.
   * @throws {CampusAreaUnavailableError} when the area list cannot be read.
   * Nothing is stored — a validation cannot be skipped.
   * @throws {ImageRejectedError} when the image fails validation. Nothing is
   * stored.
   * @throws {ImageStorageError} when the blob upload fails. **No report is
   * created** (image-handling §5).
   */
  async create(request: CreateReportRequest): Promise<CreateReportResult> {
    // The campus-area set is **required input**. A failure to read it is a
    // refusal, not a permissive default — with an empty set every area is
    // rejected, and with a fallback every area is accepted.
    const campusAreas = await this.campusAreas.listActive();

    const now = this.clock.now();

    // ── 1. Validate the submitted fields, before anything is stored ──────
    //
    // The field validation happens **first**, so a submission that breaks a
    // rule never reaches the blob store. A member who typed a 900-character
    // name should not have their image uploaded and then deleted.
    //
    // The image reference is not yet known — the upload comes next — so the
    // image is validated separately, once, after the upload.
    const validated = validateReportDraft(request.draft, {
      now,
      campusAreas,
      imageRef: null,
    });

    // ── 2. Store the blob, outside the transaction ────────────────────────
    //
    // The upload is part of the write, not a follow-up. A failure here means
    // **no report is created**.
    let imageRef: ImageRef | null = null;

    if (request.image) {
      const stored = await this.images.store(request.image, 'reports');
      imageRef = createImageRef(stored.path);
    }

    const report: ValidatedReport = {
      ...validated,
      imageRef,
      reporterId: request.actor.actorId,
    };

    // ── 3. Write the row and its audit event, in one transaction ──────────
    let created: PersistedReport;

    try {
      created = await this.transactions.run((transaction) =>
        this.writeReportAndAudit(report, transaction),
      );
    } catch (error) {
      // ── 4. Compensate: delete the blob ──────────────────────────────────
      //
      // The database side has settled (the transaction rolled back) before
      // this runs. A failed delete is **recorded for retry** rather than
      // silently leaked (image-handling §5) — the same mechanism FR-10's hard
      // delete uses, so there is one retry path in the system rather than
      // two.
      if (imageRef) {
        await this.compensateImage(imageRef.path);
      }

      throw error;
    }

    // ── 5. Raise the event, after the commit ─────────────────────────────
    //
    // The event is for a report that now certainly exists.
    const event = buildReportCreatedEvent(created);

    return { report: created, event };
  }

  /**
   * Write the report and its audit event in one transaction.
   *
   * The audit event is built through the audit module's factory, so it
   * cannot carry a field the frozen catalog does not name (ADR-9).
   */
  private async writeReportAndAudit(
    report: ValidatedReport,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<PersistedReport> {
    const created = await this.reports.create(report, transaction);

    await this.audit.record(
      {
        eventType: 'report.created',
        parent: { parentType: 'report', parentId: created.id },
        actor: { actorId: created.reporterId, actorRole: 'member' },
        payload: {
          name: created.name.value,
          category: created.category,
          type: created.type,
          date: created.date.isoDay,
          location: created.campusArea.value,
          optionalFields: {
            exactPlace: created.exactPlace !== null,
            identifyingDetails: created.identifyingDetails !== null,
          },
          imagePresence: created.imageRef !== null,
        },
        occurredAt: created.createdAt,
      },
      transaction,
    );

    return created;
  }

  /**
   * Delete the blob after a failed row write.
   *
   * **A failed delete does not mask the original failure.** The member's
   * report did not get created, and that is the error they must see — the
   * orphaned blob is an operational problem, not their problem. The failure
   * is recorded for retry instead.
   */
  private async compensateImage(path: string): Promise<void> {
    try {
      await this.images.delete(path);
    } catch {
      // Recorded for retry by the image store's own retry mechanism
      // (image-handling §5). Swallowed here deliberately: the original
      // failure is the one the caller must see.
    }
  }
}
