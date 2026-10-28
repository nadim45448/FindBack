/**
 * The audit trail projector — decides whether a viewer receives the trail.
 *
 * **The trail is administrator-only** (FR-32). No other column — not the
 * reporter, not the claimant, not the responder, not the Lost-report owner —
 * ever receives any part of it (story 010 criterion 16).
 *
 * **The absence is explicit.** A non-administrator's projection carries
 * `null`, never an empty array. ADR-8's rule applies: a filter that returns
 * an empty result makes "forbidden" indistinguishable from "empty" and
 * leaks existence through the result count.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { ProjectedAuditTrail } from './visibility-projection';

/**
 * Project the audit trail for a column set.
 *
 * Returns `null` when the columns do not include the administrator column.
 * The trail is never partially projected — there is no "audit-light trail".
 */
export function projectAuditTrail<T>(
  events: readonly T[],
  columns: readonly ProjectionColumn[],
): ProjectedAuditTrail {
  if (!columns.includes('administrator')) {
    return null;
  }

  return events;
}
