/**
 * The report's campus area — one of the deployment's configured areas.
 *
 * **The stored value, never the display label and never the exact-place free
 * text.** The campus area is the coarse, **non-sensitive** location; the
 * exact place is a separate Sensitive Field. Conflating the two is what
 * FR-39's `campusArea` (public) / `exactPlace` (Sensitive) split forbids.
 *
 * **A value outside the configured set is a validation rejection**, and the
 * set is **injected** rather than hard-coded, because it is per-deployment
 * external data (FR-8, A4) whose configuration mechanism is ADR-20's.
 *
 * **The membership check lives here, but the set is supplied.** The value
 * object holds the chosen area; the validator asks it whether the area is in
 * the deployment's active set. The check is a *validation* rule, not a
 * *referential* one, which is exactly why `reports.campus_area` carries no
 * foreign key (ADR-20).
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** One of the deployment's configured campus areas. */
export interface CampusArea {
  /** The stored enum value. */
  readonly value: string;
  /** The display label. Not stored on a report. */
  readonly label: string;
  /** Whether the area accepts new submissions. */
  readonly active: boolean;
}

/** A report's campus area — the stored enum value. */
export interface CampusAreaValue {
  readonly value: string;
}

/**
 * Build a report's campus-area value.
 *
 * The value is checked against the deployment's active set **here**, so a
 * caller cannot construct a `CampusAreaValue` for an area the deployment does
 * not have.
 *
 * @throws {ValidationError} when the value is not in the active set.
 */
export function createCampusAreaValue(
  value: string,
  activeAreas: readonly CampusArea[],
): CampusAreaValue {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('campusArea', 'Choose a campus area.');
  }

  const isActive = activeAreas.some((area) => area.value === trimmed && area.active);

  if (!isActive) {
    throw new ValidationError('campusArea', 'Choose a campus area from the list of available areas.');
  }

  return { value: trimmed };
}
