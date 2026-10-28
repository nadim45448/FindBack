/**
 * The Recovery Response projector — builds the Response projections for a
 * column set.
 *
 * The Lost-report owner is the **only** non-administrator with cross-response
 * visibility. FR-39's notes are explicit: "The Lost-report owner can see
 * every Recovery Response and every per-Recovery-Response thread on their own
 * Lost report. This is necessary for them to evaluate and select from the
 * responses. The Lost-report owner is the only non-administrator party with
 * cross-response visibility on a Lost report."
 *
 * A recovery responder sees **only their own** response. Other responders'
 * responses, responder-supplied fields, and threads are absent.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { ProjectedRecoveryResponse } from './visibility-projection';

/**
 * A Recovery Response, as read from storage.
 *
 * The Sensitive fields are optional for the same reason the report's are:
 * the read is shaped by the column set.
 */
export interface RecoveryResponseRow {
  readonly id: string;
  readonly reportId: string;
  readonly responderId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly whereFoundExactPlace?: string | null;
  readonly observedIdentifyingDetails?: string | null;
  readonly dateFound?: string | null;
  readonly candidateImageRef?: string | null;
}

/**
 * Project the Recovery Responses for a column set.
 *
 * The responder sees their own response in full. The Lost-report owner sees
 * every response on their own Lost report in full. An administrator sees
 * every response. Everyone else sees none.
 */
export function projectRecoveryResponses(
  rows: readonly RecoveryResponseRow[],
  columns: readonly ProjectionColumn[],
  ownResponseId: string | null,
): readonly ProjectedRecoveryResponse[] {
  if (
    !columns.includes('recoveryResponder') &&
    !columns.includes('lostReportOwner') &&
    !columns.includes('administrator')
  ) {
    return [];
  }

  const isAdministrator = columns.includes('administrator');

  return rows.map((row) => {
    const isOwn = ownResponseId !== null && row.id === ownResponseId;

    const projected: {
      responseId: string;
      status: string;
      submittedAt: string;
      whereFoundExactPlace?: string;
      observedIdentifyingDetails?: string;
      dateFound?: string;
      candidateImageRef?: string;
      isOwn: boolean;
    } = {
      responseId: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
      isOwn,
    };

    // The responder-supplied fields are FR-37 Sensitive Fields. The
    // responder sees their own; the Lost-report owner sees every response on
    // their own report; an administrator sees every response.
    const seesSensitive = isAdministrator || columns.includes('lostReportOwner');

    if (seesSensitive) {
      assign(projected, 'whereFoundExactPlace', row.whereFoundExactPlace);
      assign(projected, 'observedIdentifyingDetails', row.observedIdentifyingDetails);
      assign(projected, 'candidateImageRef', row.candidateImageRef);
    } else if (isOwn) {
      assign(projected, 'whereFoundExactPlace', row.whereFoundExactPlace);
      assign(projected, 'observedIdentifyingDetails', row.observedIdentifyingDetails);
      assign(projected, 'candidateImageRef', row.candidateImageRef);
    }

    // The date found is part of the responder's own response and is granted
    // with it.
    if (seesSensitive || isOwn) {
      assign(projected, 'dateFound', row.dateFound);
    }

    return projected;
  });
}

/**
 * The Recovery Responses a column set may see.
 *
 * The responder sees only their own. The Lost-report owner sees every
 * response on their own Lost report. An administrator sees all.
 */
export function visibleResponseIds(
  rows: readonly RecoveryResponseRow[],
  columns: readonly ProjectionColumn[],
  ownResponseId: string | null,
): readonly string[] {
  if (columns.includes('administrator') || columns.includes('lostReportOwner')) {
    return rows.map((row) => row.id);
  }

  if (columns.includes('recoveryResponder') && ownResponseId !== null) {
    return rows.filter((row) => row.id === ownResponseId).map((row) => row.id);
  }

  return [];
}

/**
 * Copy a value onto the projection, **only** when it is present.
 *
 * An absent value leaves the key off the projection entirely — never `null`.
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
