/**
 * The `ReportEditService` — the reporter's edit (FR-9, FR-19).
 *
 * **The sequence is the mechanism:**
 *
 * ```text
 * 1. read the report
 * 2. check ownership            → refuse a non-reporter
 * 3. check the terminal status  → refuse Returned and Closed, each with its own message
 * 4. validate the submitted fields (bolt 007's validator, unchanged)
 * 5. build the changed-field snapshots
 * 6. BEGIN
 * 7.   UPDATE reports
 * 8.   INSERT audit_events (event 8)
 * 9. COMMIT
 * ```
 *
 * **The validation happens before anything is written**, so a submission that
 * breaks a rule never reaches the database.
 *
 * **The audit event is inside the transaction.** An audit entry for an edit
 * that did not happen is a defect (ADR-3, `data-stack.md`) — the trail is
 * append-only with no correction path, so the error would be permanent.
 *
 * **FR-19's conditional half.** The previous values are recorded **only when
 * the report carries an interaction** — a Claim on a Found report, or a
 * Recovery Response on a Lost report. Before any interaction, the event
 * carries the changed fields alone. This is the rule that makes silent
 * evidence mutation impossible: once other people have interacted with the
 * report, a change to it is reconstructable.
 *
 * **An edit that changes nothing writes no record.** The outcome is
 * `Unchanged`, and no audit event is fired.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';

import {
  asTerminalStatus,
  buildEditOutcome,
  buildReportEditedByReporterEvent,
  hasInteraction,
  isChangeKey,
  orderSnapshots,
  REPORTER_EDITABLE_FIELDS,
  snapshotIfChanged,
  terminalEditMessage,
  validateReportDraft,
  type CampusArea,
  type EditableContentField,
  type EditOutcome,
  type FieldSnapshot,
  type PersistedReport,
  type ReportDraft,
  type ReportEditedByReporter,
} from '@/domain/listings';

import {
  TerminalStateError,
  PermissionDeniedError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';

import type { CampusAreaReader } from './ports/campus-area-reader';
import type { ReportInteractionReader } from './ports/report-interaction-reader';
import type { ReportFieldUpdate, ReportRepository } from './ports/report-repository';

/** The reporter's identity. */
export interface ReportEditActor {
  readonly actorId: string;
}

/** The submitted changes. */
export interface EditReportRequest {
  readonly reportId: string;
  readonly actor: ReportEditActor;
  /**
   * The submitted fields.
   *
   * **Every field is optional**, because an edit changes what the member
   * chose to change. A field the member left alone is absent here, and
   * absent means "unchanged".
   */
  readonly changes: Partial<ReportDraft>;
}

/** What the service returns. */
export interface EditReportResult {
  readonly outcome: EditOutcome;
  readonly report: PersistedReport;
  readonly event: ReportEditedByReporter | null;
}

/** The clock, injected so the date bound is testable. */
export interface ReportEditClock {
  now(): Date;
}

/**
 * Edits a report the actor reported.
 *
 * @throws {NotFoundError} when no report carries that id.
 * @throws {PermissionDeniedError} when the actor is not the reporter.
 * @throws {TerminalStateError} when the report is `Returned` or `Closed`.
 * @throws {ValidationError} when the submitted fields break a rule. Nothing
 * is written.
 */
export class ReportEditService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly interactions: ReportInteractionReader,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ReportEditClock,
    private readonly campusAreas: CampusAreaReader,
  ) {}

  async edit(request: EditReportRequest): Promise<EditReportResult> {
    const report = await this.reports.findById(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // ── Ownership ───────────────────────────────────────────────────────────
    //
    // **The reporter is derived from the session, never from the request** —
    // and here it is compared against the stored reporter. A member who is
    // not the reporter is refused, whether or not the report is visible to
    // them through FR-39.
    if (report.reporterId !== request.actor.actorId) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── The terminal-status block ──────────────────────────────────────────
    //
    // **The check narrows the status**, so the message that comes out is the
    // one that belongs to *that* status. "Returned reports cannot be edited."
    // and "Closed reports cannot be edited." are separate strings, not a
    // template.
    const terminal = asTerminalStatus(report.status);

    if (terminal !== null) {
      throw new TerminalStateError(terminalEditMessage(terminal));
    }

    // ── The field whitelist ────────────────────────────────────────────────
    //
    // **A field that is not on the whitelist is refused, not ignored.** The
    // route's parser already drops an unknown key, so this check is a second
    // line of defence rather than the first — but it is the line that makes
    // the service safe on its own. A caller that reaches the service
    // directly, with a `status` or a `reporterId` in the change set, is told
    // the field cannot be changed; a silently dropped field is a lie about
    // what was changed.
    //
    // **The whitelist is the domain's.** `isChangeKey` is the domain module's
    // answer to "may this name be a key in the change map?", and this is
    // the only place that question is asked on the reporter's path.
    this.assertEditableFields(request.changes);

    // ── Validate the submitted fields ──────────────────────────────────────
    //
    // **Bolt 007's validator, unchanged.** The bounds are enforced
    // identically on create and on edit, by construction rather than by two
    // implementations that agree today.
    //
    // The edit carries the report's **existing** values for the fields the
    // member did not change, so the validator sees the whole submission.
    const merged = mergeForValidation(report, request.changes);

    // **The validator throws on a broken rule, and that is its whole
    // contribution here.** The write carries only the changed fields; the
    // merged draft exists so the validator sees the *whole* submission, not
    // so it can be written.
    validateReportDraft(merged, {
      now: this.clock.now(),
      campusAreas: await this.readCampusAreas(),
      imageRef: report.imageRef,
    });

    // ── The changed-field snapshots ────────────────────────────────────────
    const snapshots = this.buildSnapshots(report, request.changes);

    const outcome = buildEditOutcome(snapshots);

    // **An edit that changes nothing is a no-op**, and it writes no record.
    if (outcome.kind === 'Unchanged') {
      return { outcome, report, event: null };
    }

    // ── FR-19's conditional half ───────────────────────────────────────────
    //
    // **The previous values are recorded only once the report carries an
    // interaction.** Before that, an edit is a correction of a private
    // record; after it, an edit changes evidence other people have acted on.
    const facts = await this.interactions.read(request.reportId);

    const includePreviousValues = hasInteraction(report.type, facts);

    const event = buildReportEditedByReporterEvent({
      reportId: report.id,
      reporterId: request.actor.actorId,
      snapshots: outcome.snapshots,
      includePreviousValues,
    });

    // ── Write the report and its audit event, in one transaction ───────────
    const updated = await this.transactions.run((transaction) =>
      this.writeEditAndAudit(report, request.changes, event, transaction),
    );

    return { outcome, report: updated, event };
  }

  /**
   * Refuse a submission that names a field the reporter may not change.
   *
   * @throws {ValidationError} naming the offending field.
   */
  private assertEditableFields(changes: Partial<ReportDraft>): void {
    for (const key of Object.keys(changes)) {
      if (!isChangeKey(key)) {
        throw new ValidationError(
          key,
          `The field "${key}" cannot be changed through a report edit.`,
        );
      }
    }
  }

  /**
   * Write the edit and its audit event in one transaction.
   *
   * The audit event is built through the audit module's factory, so it cannot
   * carry a field the frozen catalog does not name (ADR-9).
   */
  private async writeEditAndAudit(
    report: PersistedReport,
    changes: Partial<ReportDraft>,
    event: ReportEditedByReporter,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<PersistedReport> {
    const updated = await this.reports.update(
      report.id,
      this.toFieldUpdate(report, changes),
      transaction,
    );

    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'report', parentId: report.id },
        actor: { actorId: event.reporterId, actorRole: 'member' },
        // **The payload's top-level key is the catalog's field name.** The
        // sanitizer denies by default, so the payload must be keyed by
        // `changedFieldsSnapshot` — the snapshot itself is the value.
        payload: {
          changedFieldsSnapshot: event.payload.changedFieldsSnapshot as unknown as Record<
            string,
            unknown
          >,
        },
        occurredAt: this.clock.now(),
      },
      transaction,
    );

    return updated;
  }

  /**
   * Build the changed-field snapshots.
   *
   * **The comparison is on the rendered value**, so re-submitting the same
   * text is not a change — which is what makes "no change" detectable.
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

    return orderSnapshots(snapshots, REPORTER_EDITABLE_FIELDS);
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
   * Read the deployment's active campus areas.
   *
   * **A read failure is a refusal, not a permissive default.** The reader
   * throws rather than returning an empty set, and that failure propagates:
   * an empty set would reject every campus area, and a fallback set would
   * accept an unvalidated one. The edit path validates against the same set
   * the create path does.
   */
  private async readCampusAreas(): Promise<readonly CampusArea[]> {
    return this.campusAreas.listActive();
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

/** The next value of a field, as the client submitted it. */
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
 * The validator sees a **whole submission**, so a field the member left
 * alone is carried over from the stored report rather than being blank.
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
