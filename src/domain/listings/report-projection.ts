/**
 * The report projector — builds the report projection for a column set.
 *
 * **The projection decides fields, not existence.** Which reports a viewer
 * may *enumerate* is FR-49's partition concern, owned by bolt
 * `009-reporting-search`. This projector answers a narrower question: of a
 * report the viewer has reached, which fields may they see?
 *
 * Pure — no I/O, no framework imports.
 */

import { reportFieldsFor } from './report-field-set';
import type { ProjectionColumn } from './projection-column';
import type {
  ProjectedReport,
  ProjectedStatusHistory,
} from './visibility-projection';

/**
 * The report, as read from storage.
 *
 * **Every field is optional**, because the read is shaped by the column set:
 * a field the viewer may not see is not selected, so the loaded row simply
 * does not carry it. The projector then copies the fields the matrix grants.
 */
export interface ReportRow {
  readonly id: string;
  readonly type: 'Lost' | 'Found';
  readonly status: string;
  readonly name?: string | null;
  readonly category?: string | null;
  readonly date?: string | null;
  readonly campusArea?: string | null;
  readonly description?: string | null;
  readonly imageRef?: string | null;
  readonly reporterDisplayName?: string | null;
  readonly exactPlace?: string | null;
  readonly identifyingDetails?: string | null;
  readonly reporterEmail?: string | null;
  readonly reporterPhone?: string | null;
  /** The timestamp of the report's most recent audit event, if any. */
  readonly lastActionAt?: string | null;
}

/**
 * Project a report row for a column set.
 *
 * The field set is computed **first**, and every copied field is checked
 * against it. A field that is not in the set is **not copied**, even if the
 * row happens to carry it — so a row loaded with more than was authorised
 * still cannot widen the projection.
 */
export function projectReport(
  row: ReportRow,
  columns: readonly ProjectionColumn[],
): ProjectedReport {
  const fields = reportFieldsFor(columns);

  const projected: {
    id: string;
    type: 'Lost' | 'Found';
    status: string;
    name?: string;
    category?: string;
    date?: string;
    campusArea?: string;
    description?: string;
    imageRef?: string;
    reporterDisplayName?: string;
    statusHistory?: ProjectedStatusHistory;
    exactPlace?: string;
    identifyingDetails?: string;
    reporterEmail?: string;
    reporterPhone?: string;
  } = {
    id: row.id,
    type: row.type,
    status: row.status,
  };

  if (fields.has('summary')) {
    assign(projected, 'name', row.name);
    assign(projected, 'category', row.category);
    assign(projected, 'date', row.date);
    assign(projected, 'campusArea', row.campusArea);
  }

  if (fields.has('description')) {
    assign(projected, 'description', row.description);
  }

  if (fields.has('image')) {
    assign(projected, 'imageRef', row.imageRef);
  }

  if (fields.has('reporterName')) {
    assign(projected, 'reporterDisplayName', row.reporterDisplayName);
  }

  if (fields.has('statusHistory')) {
    projected.statusHistory = {
      status: row.status,
      lastActionAt: row.lastActionAt ?? null,
    };
  }

  if (fields.has('exactPlace')) {
    assign(projected, 'exactPlace', row.exactPlace);
  }

  if (fields.has('identifyingDetails')) {
    assign(projected, 'identifyingDetails', row.identifyingDetails);
  }

  if (fields.has('reporterEmail')) {
    assign(projected, 'reporterEmail', row.reporterEmail);
  }

  if (fields.has('reporterPhone')) {
    assign(projected, 'reporterPhone', row.reporterPhone);
  }

  return projected;
}

/**
 * Copy a value onto the projection, **only** when it is present.
 *
 * An absent value leaves the key off the projection entirely. It does not
 * become `null` — a `null` would tell a client that the field *exists* and
 * is empty, which is itself a small disclosure about the report's schema.
 */
function assign<K extends string, V>(
  target: Record<string, unknown>,
  key: K,
  value: V | null | undefined,
): void {
  if (value !== null && value !== undefined) {
    target[key] = value;
  }
}
