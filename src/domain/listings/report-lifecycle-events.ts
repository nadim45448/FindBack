/**
 * The three domain events this bolt fires: `ReportEdited`,
 * `ReportWithdrawn`, and the administrator's edit.
 *
 * **All four audit events already exist in the frozen catalog**, with their
 * numbers and their required field sets:
 *
 * - Event 8 `report.edited_by_reporter` — `changedFieldsSnapshot`
 * - Event 9 `report.found_withdrawn_by_reporter` — `previousFoundStatus`
 * - Event 23 `report.lost_withdrawn_by_reporter` — `previousLostStatus`
 * - Non-numbered `report.edited_by_administrator` — `changedFields`,
 *   `previousValues`
 *
 * **This bolt adds no event and no event number.** The catalog is frozen, and
 * ADR-9's guarantee is structural — a firing module cannot invent an event
 * number or omit a required field. The interesting part is therefore **which
 * fields each event actually carries**, because the catalog's required-field
 * list is a *minimum*.
 *
 * **The reporter's edit and the administrator's edit write different-shaped
 * records, and they are not unified.** The catalog's whole point is that the
 * *type* of the event tells you its shape. A unified record would have to
 * carry a "which kind was this" flag, and the two kinds genuinely differ:
 * FR-19's previous values are **conditional** on an interaction, while
 * FR-53's are **unconditional**.
 *
 * **The Found-side and Lost-side withdrawals are separate events.** Event 9
 * and event 23 are different numbers for different sides of the product.
 *
 * Pure — no I/O, no framework imports.
 */

import type { FieldSnapshot } from './report-edit-snapshot';
import type { ReportStatus } from './report-status';

/** The catalog type discriminator for event 8. */
export const REPORT_EDITED_BY_REPORTER_EVENT_TYPE = 'report.edited_by_reporter';

/** The catalog type discriminator for event 9. */
export const REPORT_FOUND_WITHDRAWN_EVENT_TYPE = 'report.found_withdrawn_by_reporter';

/** The catalog type discriminator for event 23. */
export const REPORT_LOST_WITHDRAWN_EVENT_TYPE = 'report.lost_withdrawn_by_reporter';

/** The catalog type discriminator for the non-numbered administrator edit. */
export const REPORT_EDITED_BY_ADMINISTRATOR_EVENT_TYPE = 'report.edited_by_administrator';

/**
 * The reporter's edit — event 8.
 *
 * **`changedFieldsSnapshot` is the changed fields, and the previous values
 * when the report carries an interaction.**
 *
 * FR-19 has two halves. The first is unconditional: every edit is recorded
 * with actor, timestamp, and a snapshot of the changed fields. The second is
 * conditional: **once any Claim exists on a Found report, or any Recovery
 * Response exists on a Lost report**, every subsequent edit is recorded with
 * the changed fields **and the previous values**.
 *
 * The conditional half is expressed as the **presence or absence of the
 * previous values**, not as a flag — so a snapshot without previous values
 * is a different *kind of thing* from one with them.
 *
 * **The previous values are the values, including Sensitive Fields.** FR-19
 * governs what the trail must preserve, not what may change: an over-long
 * exact place is still editable by its reporter, and the consequence is that
 * its previous value joins an administrator-only record (FR-32).
 */
export interface ReportEditedByReporter {
  readonly type: typeof REPORT_EDITED_BY_REPORTER_EVENT_TYPE;
  readonly reportId: string;
  readonly reporterId: string;
  readonly payload: {
    /**
     * The changed fields.
     *
     * **The snapshot's shape depends on whether previous values are
     * present** — so the payload field is a union, and a caller cannot
     * supply a snapshot with previous values to an event that must not carry
     * them.
     */
    readonly changedFieldsSnapshot:
      | { readonly kind: 'FieldsOnly'; readonly fields: readonly string[] }
      | {
          readonly kind: 'FieldsWithPreviousValues';
          readonly fields: readonly string[];
          readonly previousValues: Readonly<Record<string, string | undefined>>;
        };
  };
}

/**
 * Build the reporter's edit event.
 *
 * @param snapshots the changed fields
 * @param includePreviousValues whether the report carries an interaction, so
 * the previous values must be recorded (FR-19's conditional half)
 */
export function buildReportEditedByReporterEvent(input: {
  readonly reportId: string;
  readonly reporterId: string;
  readonly snapshots: readonly FieldSnapshot[];
  readonly includePreviousValues: boolean;
}): ReportEditedByReporter {
  const fields = input.snapshots.map((snapshot) => snapshot.field);

  if (!input.includePreviousValues) {
    return {
      type: REPORT_EDITED_BY_REPORTER_EVENT_TYPE,
      reportId: input.reportId,
      reporterId: input.reporterId,
      payload: {
        changedFieldsSnapshot: { kind: 'FieldsOnly', fields },
      },
    };
  }

  const previousValues: Record<string, string | undefined> = {};

  for (const snapshot of input.snapshots) {
    previousValues[snapshot.field] = snapshot.previousValue;
  }

  return {
    type: REPORT_EDITED_BY_REPORTER_EVENT_TYPE,
    reportId: input.reportId,
    reporterId: input.reporterId,
    payload: {
      changedFieldsSnapshot: {
        kind: 'FieldsWithPreviousValues',
        fields,
        previousValues,
      },
    },
  };
}

/**
 * The administrator's edit — the non-numbered record.
 *
 * **The previous values are unconditional.** FR-53 says the record carries
 * "the changed fields, and the previous values" — there is no interaction
 * condition, and none is invented here.
 *
 * **It is non-numbered**, so it introduces no new FR-31 or FR-48 event
 * number. FR-31's rule is that the non-numbered set grows only when a
 * requirement explicitly asks for a record; FR-53 does.
 */
export interface ReportEditedByAdministrator {
  readonly type: typeof REPORT_EDITED_BY_ADMINISTRATOR_EVENT_TYPE;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    readonly changedFields: readonly string[];
    readonly previousValues: Readonly<Record<string, string | undefined>>;
  };
}

/**
 * The administrator's edit — the non-numbered record.
 *
 * **The previous values are unconditional.** FR-53 says the record carries
 * "the changed fields, and the previous values" — there is no interaction
 * condition, and none is invented here.
 *
 * **It is non-numbered**, so it introduces no new FR-31 or FR-48 event
 * number. FR-31's rule is that the non-numbered set grows only when a
 * requirement explicitly asks for a record; FR-53 does.
 */
export interface ReportEditedByAdministrator {
  readonly type: typeof REPORT_EDITED_BY_ADMINISTRATOR_EVENT_TYPE;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    readonly changedFields: readonly string[];
    readonly previousValues: Readonly<Record<string, string | undefined>>;
  };
}

/**
 * The field name an image replacement is recorded under.
 *
 * **It matches `ADMINISTRATOR_EDITABLE_FIELDS`'s own entry**, so the audit
 * trail names the same thing the whitelist names. The image is not a column
 * on the report — the replacement is an *operation* — but it is one of
 * FR-53's editable things, so an edit that replaced it changed it.
 */
export const IMAGE_REPLACEMENT_FIELD = 'imageReplacement';

/**
 * Build the administrator's edit event.
 *
 * **An image replacement is a changed field.** `imageReplacement` is in
 * FR-53's editable set, so a record that replaced the image and said
 * nothing about it would be an incomplete record. The previous value is the
 * blob path the report pointed at, or `undefined` when it had no image —
 * the same "was not set" distinction the content fields use.
 */
export function buildReportEditedByAdministratorEvent(input: {
  readonly reportId: string;
  readonly administratorId: string;
  readonly snapshots: readonly FieldSnapshot[];
  /** The blob path the report pointed at before the edit, if it had one. */
  readonly previousImagePath?: string;
  /** Whether the edit replaced the image. */
  readonly imageReplaced?: boolean;
}): ReportEditedByAdministrator {
  const previousValues: Record<string, string | undefined> = {};

  for (const snapshot of input.snapshots) {
    previousValues[snapshot.field] = snapshot.previousValue;
  }

  const changedFields: string[] = input.snapshots.map((snapshot) => snapshot.field);

  if (input.imageReplaced) {
    changedFields.push(IMAGE_REPLACEMENT_FIELD);
    previousValues[IMAGE_REPLACEMENT_FIELD] = input.previousImagePath;
  }

  return {
    type: REPORT_EDITED_BY_ADMINISTRATOR_EVENT_TYPE,
    reportId: input.reportId,
    administratorId: input.administratorId,
    payload: {
      changedFields,
      previousValues,
    },
  };
}

/**
 * The reporter's withdrawal — event 9 (Found) or event 23 (Lost).
 *
 * **The two sides are separate events**, and the previous status is a
 * **required field of both** — `previousFoundStatus` on event 9,
 * `previousLostStatus` on event 23.
 *
 * The previous status is not incidental: it is what makes the trail show
 * where the report was before it was withdrawn, and it is the field the
 * catalog names for exactly this event.
 */
export interface ReportWithdrawn {
  readonly type:
    | typeof REPORT_FOUND_WITHDRAWN_EVENT_TYPE
    | typeof REPORT_LOST_WITHDRAWN_EVENT_TYPE;
  readonly reportId: string;
  readonly reporterId: string;
  readonly payload:
    | { readonly previousFoundStatus: ReportStatus }
    | { readonly previousLostStatus: ReportStatus };
}

/**
 * Build the withdrawal event for whichever side the report is on.
 *
 * @param type the report's type — `Found` fires event 9, `Lost` fires
 * event 23
 */
export function buildReportWithdrawnEvent(input: {
  readonly reportId: string;
  readonly reporterId: string;
  readonly type: 'Found' | 'Lost';
  readonly previousStatus: ReportStatus;
}): ReportWithdrawn {
  if (input.type === 'Found') {
    return {
      type: REPORT_FOUND_WITHDRAWN_EVENT_TYPE,
      reportId: input.reportId,
      reporterId: input.reporterId,
      payload: { previousFoundStatus: input.previousStatus },
    };
  }

  return {
    type: REPORT_LOST_WITHDRAWN_EVENT_TYPE,
    reportId: input.reportId,
    reporterId: input.reporterId,
    payload: { previousLostStatus: input.previousStatus },
  };
}
