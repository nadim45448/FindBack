/**
 * The `ReportAdministratorEditService` — FR-53's moderation edit.
 *
 * **The administrator's edit is a narrow operational capability, not
 * unrestricted database editing.** FR-53 says so in its first line, and the
 * shape of this service is the statement:
 *
 * ```text
 * 1. read the report
 * 2. check the terminal status  → refuse Returned and Closed
 * 3. check the field whitelist  → refuse a non-editable field
 * 4. validate the submitted fields (bolt 007's validator, unchanged)
 * 5. build the changed-field snapshots
 * 6. BEGIN
 * 7.   UPDATE reports
 * 8.   INSERT audit_events (the non-numbered FR-53 record)
 * 9. COMMIT
 * 10. delete the replaced blob (after the commit, compensating)
 * ```
 *
 * **The whitelist is a whitelist, not a blacklist.** FR-53 names exactly
 * what may change — name, category, description, date, location (campus area
 * and exact place), identifying details, image replacement — and names
 * exactly what may not. A field that is neither on the list nor on the
 * blocklist is **not editable**, because "not editable" is the safe default
 * for a moderation capability.
 *
 * **The terminal check comes first.** FR-53 says the administrator's edit
 * "does not bypass the edit blocklist in FR-9 for terminal reports" — and
 * FR-9's blocklist is `Returned` and `Closed`. So the check runs before the
 * whitelist is even consulted: a report that is `Closed` cannot be edited by
 * anyone, for any reason.
 *
 * **The previous values are unconditional.** FR-53 says the record carries
 * "the changed fields, and the previous values" — there is no interaction
 * condition, and none is invented. This is what distinguishes the
 * administrator's record from the reporter's: the reporter's previous values
 * are **conditional** on an interaction (FR-19), the administrator's are not.
 *
 * **The audit record is non-numbered.** FR-31's rule is that the numbered
 * set grows only when a requirement explicitly asks for a number; FR-53 does
 * not, so the record carries no event number. The audit module's catalog
 * holds the entry, and this module goes through its factory so the record
 * cannot carry a field the catalog does not name (ADR-9).
 *
 * **The image is replaced, never overwritten.** The new blob is uploaded
 * first; the report then points at the new path; and only after the commit
 * is the old blob deleted. A blob store cannot join a PostgreSQL
 * transaction, so the write is **compensating** — the same mechanism the
 * create path uses, so there is one retry path in the system rather than
 * two.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';

import {
  ADMINISTRATOR_EDITABLE_FIELDS,
  asTerminalStatus,
  buildEditOutcome,
  buildReportEditedByAdministratorEvent,
  isChangeKey,
  orderSnapshots,
  REPORTER_EDITABLE_FIELDS,
  snapshotIfChanged,
  terminalEditMessage,
  validateReportDraft,
  type EditableContentField,
  type EditOutcome,
  type FieldSnapshot,
  type PersistedReport,
  type ReportDraft,
  type ReportEditedByAdministrator,
} from '@/domain/listings';

import { TerminalStateError, NotFoundError, ValidationError } from '@/lib/errors';

import type { CampusAreaReader } from './ports/campus-area-reader';
import type { ImageStore, ImageUpload } from './ports/image-store';
import type { ReportFieldUpdate, ReportRepository } from './ports/report-repository';

/** The administrator's identity. */
export interface ReportAdministratorEditActor {
  readonly actorId: string;
}

/** The submitted changes. */
export interface EditReportAsAdministratorRequest {
  readonly reportId: string;
  readonly actor: ReportAdministratorEditActor;
  /**
   * The submitted content fields.
   *
   * **Every field is optional**, because an edit changes what the
   * administrator chose to change. A field left alone is absent, and absent
   * means "unchanged".
   */
  readonly changes: Partial<ReportDraft>;
  /** The replacement image, when the administrator replaced one. */
  readonly image?: ImageUpload | null;
}

/** What the service returns. */
export interface EditReportAsAdministratorResult {
  readonly outcome: EditOutcome;
  readonly report: PersistedReport;
  readonly event: ReportEditedByAdministrator | null;
}

/** The clock, injected so the date bound is testable. */
export interface ReportAdministratorEditClock {
  now(): Date;
}

/**
 * Edits a report as an administrator.
 *
 * @throws {NotFoundError} when no report carries that id.
 * @throws {TerminalStateError} when the report is `Returned` or `Closed`.
 * @throws {ValidationError} when the submitted fields break a rule, or name
 * a field that is not editable. Nothing is written.
 */
export class ReportAdministratorEditService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly campusAreas: CampusAreaReader,
    private readonly images: ImageStore,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ReportAdministratorEditClock,
  ) {}

  async edit(
    request: EditReportAsAdministratorRequest,
  ): Promise<EditReportAsAdministratorResult> {
    const report = await this.reports.findById(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // ── The terminal-status block ──────────────────────────────────────────
    //
    // **The check narrows the status**, so the message that comes out is the
    // one that belongs to *that* status. FR-9's blocklist applies to the
    // administrator's edit too — FR-53 says so explicitly.
    const terminal = asTerminalStatus(report.status);

    if (terminal !== null) {
      throw new TerminalStateError(terminalEditMessage(terminal));
    }

    // ── The field whitelist ────────────────────────────────────────────────
    //
    // **A field that is not on the whitelist is refused.** The whitelist is
    // `ADMINISTRATOR_EDITABLE_FIELDS` — the eight things FR-53 names. The
    // content fields it covers are the same seven the reporter may edit, and
    // `imageReplacement` is the eighth. `status`, `type`, and `reporterId` are
    // not on it, so a request naming one is refused rather than silently
    // ignored — a silently ignored field is a lie about what was changed.
    //
    // **The check is the domain's own predicate,** not a local copy of the
    // list. The domain module is the single place the whitelist is written
    // down; a second copy here would be a second answer to the same
    // question, and the two would drift.
    this.assertEditableFields(request.changes);

    // ── Validate the submitted fields ──────────────────────────────────────
    //
    // **Bolt 007's validator, unchanged.** The edit carries the report's
    // existing values for the fields the administrator did not change, so
    // the validator sees the whole submission.
    const merged = mergeForValidation(report, request.changes);

    // **The validator throws on a broken rule, and that is its whole
    // contribution here.** The write carries only the changed fields; the
    // merged draft exists so the validator sees the *whole* submission, not
    // so it can be written.
    validateReportDraft(merged, {
      now: this.clock.now(),
      campusAreas: await this.campusAreas.listActive(),
      imageRef: report.imageRef,
    });

    // ── The changed-field snapshots ────────────────────────────────────────
    const snapshots = this.buildSnapshots(report, request.changes);

    const outcome = buildEditOutcome(snapshots);

    // ── The image replacement ──────────────────────────────────────────────
    //
    // **The blob is uploaded before the transaction.** A blob store cannot
    // join a PostgreSQL transaction, so the upload happens outside it and the
    // write is compensating: if the row write fails, the new blob is
    // deleted.
    const imageReplacement = request.image
      ? await this.images.store(request.image, 'reports')
      : null;

    const imageChanged = imageReplacement !== null && report.imageRef !== null;

    // ── The outcome, once the image is known ───────────────────────────────
    //
    // **An image replacement is a change.** FR-53 names image replacement as
    // one of the editable things, so an edit that replaced the image and
    // changed nothing else is a *changed* edit — and an edit that changed
    // nothing at all is the only one that writes no record.
    const imageReplaced = imageReplacement !== null;

    const effectiveOutcome: EditOutcome =
      outcome.kind === 'Changed' || imageReplaced
        ? { kind: 'Changed', snapshots: outcome.kind === 'Changed' ? outcome.snapshots : [] }
        : outcome;

    // **An edit that changes nothing writes no record.** FR-53's edge cases
    // name it: "Edit made with no field changed → No-op; no change snapshot
    // is recorded".
    if (effectiveOutcome.kind === 'Unchanged') {
      return { outcome: effectiveOutcome, report, event: null };
    }

    // ── The event, before the write ────────────────────────────────────────
    //
    // **The previous values are unconditional.** FR-53 names them, and there
    // is no interaction condition to invent.
    const event = buildReportEditedByAdministratorEvent({
      reportId: report.id,
      administratorId: request.actor.actorId,
      snapshots: effectiveOutcome.kind === 'Changed' ? effectiveOutcome.snapshots : [],
      imageReplaced,
      previousImagePath: report.imageRef?.path,
    });

    // ── Write the report and its audit record, in one transaction ──────────
    let updated: PersistedReport;

    try {
      updated = await this.transactions.run((transaction) =>
        this.writeEditAndAudit(
          report,
          request.changes,
          imageReplacement?.path ?? null,
          event,
          transaction,
        ),
      );
    } catch (error) {
      // ── Compensate: delete the new blob ─────────────────────────────────
      //
      // The database side has settled (the transaction rolled back) before
      // this runs. The old blob was never touched, so the report still points
      // at a blob that exists.
      if (imageReplacement) {
        await this.compensateImage(imageReplacement.path);
      }

      throw error;
    }

    // ── Delete the old blob, after the commit ──────────────────────────────
    //
    // **The old blob is deleted only after the report points elsewhere.** A
    // delete inside the transaction would be undone by a rollback and would
    // leave a report pointing at a blob that no longer exists.
    if (imageChanged && report.imageRef) {
      await this.deleteReplacedImage(report.imageRef.path);
    }

    return { outcome: effectiveOutcome, report: updated, event };
  }

  /**
   * Write the edit and its audit record in one transaction.
   *
   * The audit record is built through the audit module's factory, so it
   * cannot carry a field the frozen catalog does not name (ADR-9).
   */
  private async writeEditAndAudit(
    report: PersistedReport,
    changes: Partial<ReportDraft>,
    imagePath: string | null,
    event: ReportEditedByAdministrator,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<PersistedReport> {
    const update: Record<string, unknown> = { ...this.toFieldUpdate(report, changes) };

    // **A replaced image is written as the new path.** The old path is never
    // written back — a report whose image was replaced points at the new
    // blob, and the old blob is deleted after the commit.
    if (imagePath !== null) {
      update['imageRef'] = imagePath;
    }

    const updated = await this.reports.update(
      report.id,
      update as ReportFieldUpdate,
      transaction,
    );

    await this.audit.recordNonNumbered(
      {
        eventType: event.type,
        parent: { parentType: 'report', parentId: report.id },
        actor: { actorId: event.administratorId, actorRole: 'administrator' },
        // **The payload's top-level keys are the catalog's field names.** The
        // non-numbered FR-53 entry names `changedFields` and `previousValues`
        // separately — unlike event 8, whose single named field carries the
        // whole snapshot. The sanitizer denies by default, so a key the
        // catalog does not name is refused rather than dropped.
        payload: {
          changedFields: { fields: event.payload.changedFields },
          previousValues: event.payload.previousValues as Record<string, unknown>,
        },
        occurredAt: this.clock.now(),
      },
      transaction,
    );

    return updated;
  }

  /**
   * Refuse a submission that names a field the administrator may not change.
   *
   * **The whitelist is the domain's.** `isChangeKey` is the domain module's
   * answer to "may this name be a key in the change map?", and this is the
   * only place that question is asked on the administrator's path.
   *
   * **The image is not a change key.** FR-53 makes image replacement
   * editable, but it is an operation rather than a column, so it travels as
   * its own request member. Offered as a key here, it would be silently
   * dropped — and a silently dropped field is a lie about what was changed.
   *
   * @throws {ValidationError} naming the offending field.
   */
  private assertEditableFields(changes: Partial<ReportDraft>): void {
    for (const key of Object.keys(changes)) {
      if (!isChangeKey(key)) {
        throw new ValidationError(
          key,
          `The field "${key}" cannot be changed through an administrator edit.`,
        );
      }
    }
  }

  /**
   * Build the changed-field snapshots.
   *
   * **The comparison is on the rendered value**, so re-submitting the same
   * text is not a change.
   */
  private buildSnapshots(
    report: PersistedReport,
    changes: Partial<ReportDraft>,
  ): FieldSnapshot[] {
    const snapshots: FieldSnapshot[] = [];

    for (const field of REPORTER_EDITABLE_FIELDS) {
      if (!(field in changes)) {
        continue;
      }

      const snapshot = snapshotIfChanged(
        field,
        currentValueOf(report, field),
        nextValueOf(changes, field),
      );

      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return orderSnapshots(snapshots, ADMINISTRATOR_EDITABLE_FIELDS as readonly EditableContentField[]);
  }

  /**
   * Turn the submitted changes into the repository's field update.
   *
   * **Only the changed fields are written.** The audit snapshot and the
   * write must agree, and the snapshot names exactly the fields that
   * changed.
   */
  private toFieldUpdate(
    report: PersistedReport,
    changes: Partial<ReportDraft>,
  ): ReportFieldUpdate {
    const update: Record<string, unknown> = {};

    for (const field of REPORTER_EDITABLE_FIELDS) {
      if (!(field in changes)) {
        continue;
      }

      const previous = currentValueOf(report, field);
      const next = nextValueOf(changes, field);

      if (previous === next) {
        continue;
      }

      update[field] = next;
    }

    return update as ReportFieldUpdate;
  }

  /**
   * Delete a blob after a failed row write.
   *
   * **A failed delete does not mask the original failure.** The edit did not
   * happen, and that is the error the administrator must see.
   */
  private async compensateImage(path: string): Promise<void> {
    try {
      await this.images.delete(path);
    } catch {
      // Recorded for retry by the image store's own retry mechanism.
      // Swallowed deliberately: the original failure is the one to show.
    }
  }

  /**
   * Delete the replaced blob after the commit.
   *
   * **A failed delete does not fail the edit.** The report points at the new
   * blob and the edit is recorded; the orphaned old blob is an operational
   * problem, recorded for retry rather than surfaced to the administrator.
   */
  private async deleteReplacedImage(path: string): Promise<void> {
    try {
      await this.images.delete(path);
    } catch {
      // Recorded for retry by the image store's own retry mechanism.
    }
  }
}

/** The current rendered value of a field on a report. */
function currentValueOf(
  report: PersistedReport,
  field: EditableContentField,
): string | undefined {
  switch (field) {
    case 'name':
      return report.name.value;
    case 'category':
      return report.category;
    case 'description':
      return report.description.value;
    case 'date':
      return report.date.isoDay;
    case 'campusArea':
      return report.campusArea.value;
    case 'exactPlace':
      return report.exactPlace?.value;
    case 'identifyingDetails':
      return report.identifyingDetails?.value;
    default: {
      const unreachable: never = field;
      throw new Error(`Unhandled editable field: ${String(unreachable)}`);
    }
  }
}

/** The next value of a field, as the administrator submitted it. */
function nextValueOf(changes: Partial<ReportDraft>, field: EditableContentField): string {
  const value = changes[field];

  if (value === undefined || value === null) {
    return '';
  }

  return value;
}

/**
 * Merge the submitted changes over the report's existing values.
 *
 * The validator sees a **whole submission**, so a field the administrator
 * left alone is carried over from the stored report rather than being
 * blank.
 */
function mergeForValidation(
  report: PersistedReport,
  changes: Partial<ReportDraft>,
): ReportDraft {
  return {
    type: report.type,
    name: changes.name ?? report.name.value,
    category: changes.category ?? report.category,
    description: changes.description ?? report.description.value,
    date: changes.date ?? report.date.isoDay,
    campusArea: changes.campusArea ?? report.campusArea.value,
    exactPlace:
      changes.exactPlace === undefined
        ? (report.exactPlace?.value ?? null)
        : changes.exactPlace,
    identifyingDetails:
      changes.identifyingDetails === undefined
        ? (report.identifyingDetails?.value ?? null)
        : changes.identifyingDetails,
  };
}
