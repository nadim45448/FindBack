/**
 * The thread projector — builds the thread projections for a column set.
 *
 * **A thread's visibility is exactly its parent's visibility.** There is no
 * independent rule for threads; the thread set is derived from the Claims and
 * the Recovery Responses the viewer already has. A thread is therefore never
 * granted on its own, and a thread can never widen the set of Claims or
 * Responses.
 *
 * **Participation in a thread grants no private evidence.** A Found-report
 * owner who participates in a per-Claim thread still sees neither the
 * claimant's reason nor the claimant's identifying details. The administrator
 * evaluates private ownership evidence; the finder does not (FR-39's notes;
 * story 010 criterion 19).
 *
 * **One thread per Recovery Response, never per Lost report.** A thread is
 * addressed by its parent, and the parent is what determines visibility.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type {
  ProjectedThread,
  ProjectedThreadMessage,
  ThreadParentType,
} from './visibility-projection';

/** A thread message, as read from storage. */
export interface ThreadMessageRow {
  readonly id: string;
  readonly parentType: ThreadParentType;
  readonly parentId: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly postedAt: string;
}

/**
 * The thread parents a column set may see.
 *
 * A per-Claim thread is granted to the claimant (own Claim), the
 * Found-report owner (Claims on their own Found report), and the
 * administrator. A per-Response thread is granted to the recovery responder
 * (own response), the Lost-report owner (responses on their own Lost
 * report), and the administrator.
 */
export interface ThreadParents {
  readonly claimIds: readonly string[];
  readonly responseIds: readonly string[];
}

/**
 * The threads a column set may see.
 *
 * The parents are the **already-scoped** set of Claims and Responses. The
 * projector cannot widen them — it can only narrow, by dropping any parent
 * the columns do not grant.
 */
export function projectThreads(
  rows: readonly ThreadMessageRow[],
  columns: readonly ProjectionColumn[],
  parents: ThreadParents,
): readonly ProjectedThread[] {
  const isAdministrator = columns.includes('administrator');

  const claimsGranted =
    isAdministrator ||
    columns.includes('claimant') ||
    columns.includes('foundReportOwner');

  const responsesGranted =
    isAdministrator ||
    columns.includes('recoveryResponder') ||
    columns.includes('lostReportOwner');

  const claimIds = new Set(claimsGranted ? parents.claimIds : []);
  const responseIds = new Set(responsesGranted ? parents.responseIds : []);

  const grouped = new Map<string, { parentType: ThreadParentType; messages: ProjectedThreadMessage[] }>();

  for (const row of rows) {
    const permitted =
      row.parentType === 'claim'
        ? claimIds.has(row.parentId)
        : responseIds.has(row.parentId);

    if (!permitted) {
      continue;
    }

    const key = `${row.parentType}:${row.parentId}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.messages.push({
        id: row.id,
        authorDisplayName: row.authorDisplayName,
        body: row.body,
        postedAt: row.postedAt,
      });
      continue;
    }

    grouped.set(key, {
      parentType: row.parentType,
      messages: [
        {
          id: row.id,
          authorDisplayName: row.authorDisplayName,
          body: row.body,
          postedAt: row.postedAt,
        },
      ],
    });
  }

  return [...grouped.entries()].map(([key, group]) => ({
    parentType: group.parentType,
    parentId: key.slice(group.parentType.length + 1),
    messages: group.messages,
  }));
}
