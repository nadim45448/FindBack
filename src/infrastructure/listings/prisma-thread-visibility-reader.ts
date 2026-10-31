/**
 * The Prisma implementation of the thread visibility reader.
 *
 * **A thread's visibility is exactly its parent's visibility.** The reader
 * is handed the already-scoped Claim ids and Recovery Response ids, and it
 * selects only the messages whose parent is in one of those sets. The reader
 * **cannot widen** its own scope — there is no path by which a thread grants
 * a Claim, a Response, or any evidence attached to either.
 *
 * The messages carry no private evidence: a Claim's reason and identifying
 * details, and a Response's where-found and observed details, live on the
 * parent records, and the projection grants them separately.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { ThreadVisibilityReader } from '@/application/listings/ports';
import type { ProjectionColumn, ThreadMessageRow } from '@/domain/listings';
import { renderSelectList, threadSelectColumns } from './select-builder';
import { PHYSICAL, TABLES, physical, quoteName } from './physical-columns';

/** The row shape the thread query returns. */
interface ThreadQueryRow {
  id: string;
  parent_type: string;
  parent_id: string;
  author_display_name: string;
  body: string;
  posted_at: Date;
}

/** The Prisma thread visibility reader. */
export class PrismaThreadVisibilityReader implements ThreadVisibilityReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load the thread messages for the scoped parents.
   *
   * An empty parent set returns early — no query is issued, and the reader
   * has no path by which it could read a thread it was not given.
   *
   * **The column set is not consulted, and that is the design.** A thread's
   * visibility is exactly its parent's, and the parent set has already been
   * scoped by the column set upstream. The parameter is kept so the port
   * stays uniform across the five readers — a caller cannot accidentally
   * read one reader's contract and assume another's — and it is named
   * `_columns` to say plainly that the reader derives nothing from it.
   */
  async loadThreadsForViewer(
    claimIds: readonly string[],
    responseIds: readonly string[],
    _columns: readonly ProjectionColumn[],
  ): Promise<readonly ThreadMessageRow[]> {
    if (claimIds.length === 0 && responseIds.length === 0) {
      return [];
    }

    const selectColumns = threadSelectColumns();
    const selectList = selectColumns
      .map((column) => `t.${physical(column, PHYSICAL.thread)}`)
      .join(', ');

    // The parent filter is a disjunction over the two parent kinds that are
    // actually in scope. Empty id lists omit their branch entirely — a
    // placeholder value would be cast to uuid in Postgres and fail.
    const parentTypeCol = Prisma.raw(quoteName(PHYSICAL.thread.parentType));
    const parentIdCol = Prisma.raw(quoteName(PHYSICAL.thread.parentId));
    const parentClauses: Prisma.Sql[] = [];

    if (claimIds.length > 0) {
      parentClauses.push(
        Prisma.sql`(t.${parentTypeCol} = 'claim' AND t.${parentIdCol} IN (${Prisma.join(claimIds)}))`,
      );
    }

    if (responseIds.length > 0) {
      parentClauses.push(
        Prisma.sql`(t.${parentTypeCol} = 'recovery_response' AND t.${parentIdCol} IN (${Prisma.join(responseIds)}))`,
      );
    }

    const parentFilter =
      parentClauses.length === 1
        ? parentClauses[0]!
        : Prisma.sql`(${Prisma.join(parentClauses, ' OR ')})`;

    const rows = await this.client.$queryRaw<ThreadQueryRow[]>(
      Prisma.sql`
        SELECT
          ${Prisma.raw(selectList)}
        FROM ${Prisma.raw(quoteName(TABLES.thread))} t
        WHERE ${parentFilter}
        ORDER BY t.${Prisma.raw(quoteName(PHYSICAL.thread.postedAt))} ASC
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      parentType: row.parent_type === 'claim' ? 'claim' : 'recovery_response',
      parentId: row.parent_id,
      authorDisplayName: row.author_display_name,
      body: row.body,
      postedAt: row.posted_at.toISOString(),
    }));
  }
}

export { renderSelectList };
