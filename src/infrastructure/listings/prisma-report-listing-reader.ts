/**
 * The Prisma implementation of the report listing reader.
 *
 * **The partition is a `WHERE` clause, not a post-filter.** The reader is
 * handed the *resolved* partition and the viewer's id, and the partition
 * becomes a predicate in the SQL:
 *
 * - `mine` becomes `reporter_id = $viewer`.
 * - `browse` becomes `reporter_id <> $viewer` — the exclusion is **in the
 *   query**, so there is no code path where it could be forgotten. A reader
 *   that loaded `browse` and then filtered its own reports out would be the
 *   load-then-filter defect FR-39 names, applied to the partition instead of
 *   to a field.
 * - `public` places no predicate on the reporter at all.
 *
 * **The keyword is an index-backed `tsvector` match, and the expression is
 * the index's expression exactly.** The migration created the GIN index over
 * `to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description,
 * ''))`; PostgreSQL only uses an index when the query's expression matches
 * the index's *exactly*. A near-miss — a different configuration, a missing
 * `coalesce`, a missing space — silently falls back to a sequential scan, so
 * the expression lives in **one constant** here and the same constant is
 * what the migration's index is built over.
 *
 * **The keyword surface is `name` and `description` only.** `exact_place` and
 * `identifying_details` are FR-37 Sensitive Fields, and a GIN index over them
 * would let a caller who does not hold them *infer* that a word appears in
 * one — the index has to contain the value, and the index is readable by the
 * query planner whether or not the row is.
 *
 * **The listing selects only the FR-38 summary columns.** `description` is
 * in the *search* surface but not in the *select* surface: a member may
 * search on a description, and the listing row still does not carry it.
 *
 * **The count and the page are read in one query** via a window function, so
 * the total and the rows cannot disagree — a count taken separately could
 * see a different snapshot than the page.
 *
 * **The participation rows carry no thread id yet.** The thread table
 * (`thread_messages`) belongs to Unit 003 — the Claims workflow — and it does
 * not exist in the schema. The `threadId` on a participation row is
 * therefore always `null` in this bolt, and the reader does not invent a
 * join to a table that is not there. The column is part of the domain's row
 * shape already, so Unit 003 can populate it without changing the shape.
 *
 * **Raw SQL, not the Prisma query builder.** The same reason the visibility
 * readers use raw SQL: the emitted SQL must be **assertable in a test**. The
 * query-plan assertion — that the search is index-backed and not a
 * sequential scan — can only be written against SQL the reader actually
 * emits.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { ReportListingReader } from '@/application/listings/ports/report-listing-reader';
import {
  listingPage,
  type ClaimListingRow,
  type ListingPage,
  type RecoveryResponseListingRow,
  type ReportListingFilter,
  type ReportListingRow,
  type ReportPage,
  type ReportPartition,
} from '@/domain/listings';

import { PHYSICAL, TABLES, physical, quoteName } from './physical-columns';

/**
 * The `tsvector` expression the keyword index is built over.
 *
 * **One artefact, used by the query.** Bolt `007` created the GIN index
 * `idx_reports_search` over `to_tsvector('simple', name || ' ' ||
 * description)`. PostgreSQL only uses an index when the query's expression
 * matches the index's *exactly*, so this is that expression, character for
 * character. A near-miss — a different configuration, a `coalesce` wrapper,
 * a missing space — silently falls back to a sequential scan, so the
 * expression lives in **one constant** here and the query-plan assertion is
 * what proves it still matches.
 *
 * **No `coalesce`, because the columns are `NOT NULL`.** A `NULL` in a `||`
 * would collapse the whole vector to `NULL`, but `name` and `description`
 * cannot be null — bolt `007` declared them so, and this bolt does not
 * change that.
 *
 * **The space separator matters:** without it, the last word of the name and
 * the first word of the description would concatenate into one token.
 *
 * **The alias is a parameter** because the participation queries join the
 * report table under a different alias — and PostgreSQL matches an index's
 * expression *modulo the alias*, so the alias may vary but nothing else may.
 */
export function searchVectorExpression(alias = 'r'): string {
  return `to_tsvector('simple', ${alias}.${quoteName(PHYSICAL.report.name)} || ' ' || ${alias}.${quoteName(PHYSICAL.report.description)})`;
}

/** The report columns the listing selects — the FR-38 summary set. */
const REPORT_SELECT = [
  `r.${physical('id', PHYSICAL.report)} AS id`,
  `r.${physical('type', PHYSICAL.report)} AS type`,
  `r.${physical('status', PHYSICAL.report)} AS status`,
  `r.${physical('name', PHYSICAL.report)} AS name`,
  `r.${physical('category', PHYSICAL.report)} AS category`,
  `r.${physical('date', PHYSICAL.report)} AS date`,
  `r.${physical('campusArea', PHYSICAL.report)} AS campus_area`,
].join(', ');

/** The report row the query returns. */
interface ReportQueryRow {
  id: string;
  type: string;
  status: string;
  name: string | null;
  category: string | null;
  date: Date | null;
  campus_area: string | null;
}

/** The participation row the query returns. */
interface ParticipationQueryRow {
  id: string;
  status: string | null;
  submitted_at: Date | null;
  thread_id: string | null;
  report_id: string;
  report_type: string;
  report_status: string;
  report_name: string;
  report_category: string;
  report_date: Date | null;
  report_campus_area: string | null;
}

/** The Prisma report listing reader. */
export class PrismaReportListingReader implements ReportListingReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * List the reports of a partition.
   *
   * @param partition the resolved partition.
   * @param filter the resolved filter.
   * @param statuses the statuses the partition's status view permits.
   * @param viewerId the viewer's id — **the `browse` exclusion**.
   * @param page the page to return.
   */
  async listReports(
    partition: ReportPartition,
    filter: ReportListingFilter,
    statuses: readonly string[],
    viewerId: string | null,
    page: ReportPage,
  ): Promise<ListingPage<ReportListingRow>> {
    const where = this.buildReportPredicate(partition, filter, statuses, viewerId);

    // **The count and the page are two queries, not one.**
    //
    // The obvious single-query form — `COUNT(*) OVER ()` beside the rows —
    // has a defect that only shows on an empty page: the window function
    // lives on the *rows*, so a page beyond the end returns no rows and the
    // count goes with them. The caller would be told "0 results" for a
    // filter that matches forty.
    //
    // The fix that keeps one query materialises the whole filtered set
    // before the page is cut from it — which defeats the index-backed
    // paging this reader exists for. Two queries is the trade the product
    // needs: the count is exact, the page is served from the index.
    const [rows, total] = await Promise.all([
      this.client.$queryRaw<ReportQueryRow[]>(
        Prisma.sql`
          SELECT
            ${Prisma.raw(REPORT_SELECT)}
          FROM ${Prisma.raw(quoteName(TABLES.report))} r
          ${where}
          ORDER BY r.${Prisma.raw(quoteName(PHYSICAL.report.date))} DESC, r.${Prisma.raw(quoteName(PHYSICAL.report.id))} ASC
          ${Prisma.raw(limitOffset(page))}
        `,
      ),
      this.countMatching(where),
    ]);

    return listingPage(
      rows.map((row) => toReportRow(row)),
      total,
      page.number,
      page.size,
    );
  }

  /**
   * Count the rows a `WHERE` clause matches.
   *
   * **The clause is the reader's own, so the count is over exactly the set
   * the page is drawn from.** The count query is the same predicate with
   * `COUNT(*)` in place of the select list — not a second, separately-built
   * filter that could drift from the first.
   */
  private async countMatching(where: Prisma.Sql): Promise<number> {
    const rows = await this.client.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ${Prisma.raw(quoteName(TABLES.report))} r
        ${where}
      `,
    );

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * List a member's Claims, with the related report's summary fields.
   *
   * **The filter applies to the related report**, because that is what the
   * row shows — the report's name, category, date and area. The Claim's own
   * status is carried, but the Claim's evidence is not.
   */
  async listClaims(
    viewerId: string,
    filter: ReportListingFilter,
    statuses: readonly string[],
    page: ReportPage,
  ): Promise<ListingPage<ClaimListingRow>> {
    const where = this.buildParticipationPredicate(
      'c',
      'r',
      filter,
      statuses,
      viewerId,
      'claimant_id',
    );

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<ParticipationQueryRow[]>(
        Prisma.sql`
          SELECT
            c.${Prisma.raw(quoteName(PHYSICAL.claim.id))} AS id,
            c.${Prisma.raw(quoteName(PHYSICAL.claim.status))} AS status,
            c.${Prisma.raw(quoteName(PHYSICAL.claim.submittedAt))} AS submitted_at,
            NULL::uuid AS thread_id,
            r.${Prisma.raw(quoteName(PHYSICAL.report.id))} AS report_id,
            r.${Prisma.raw(quoteName(PHYSICAL.report.type))} AS report_type,
            r.${Prisma.raw(quoteName(PHYSICAL.report.status))} AS report_status,
            r.${Prisma.raw(quoteName(PHYSICAL.report.name))} AS report_name,
            r.${Prisma.raw(quoteName(PHYSICAL.report.category))} AS report_category,
            r.${Prisma.raw(quoteName(PHYSICAL.report.date))} AS report_date,
            r.${Prisma.raw(quoteName(PHYSICAL.report.campusArea))} AS report_campus_area
          FROM ${Prisma.raw(quoteName(TABLES.claim))} c
          INNER JOIN ${Prisma.raw(quoteName(TABLES.report))} r
            ON r.${Prisma.raw(quoteName(PHYSICAL.report.id))} = c.${Prisma.raw(quoteName(PHYSICAL.claim.reportId))}
          ${where}
          ORDER BY c.${Prisma.raw(quoteName(PHYSICAL.claim.submittedAt))} DESC, c.${Prisma.raw(quoteName(PHYSICAL.claim.id))} ASC
          ${Prisma.raw(limitOffset(page))}
        `,
      ),
      this.countParticipationMatching(TABLES.claim, 'c', 'r', where),
    ]);

    return listingPage(
      rows.map((row) => toClaimRow(row)),
      total,
      page.number,
      page.size,
    );
  }

  /**
   * List a member's Recovery Responses, with the related report's summary
   * fields.
   */
  async listRecoveryResponses(
    viewerId: string,
    filter: ReportListingFilter,
    statuses: readonly string[],
    page: ReportPage,
  ): Promise<ListingPage<RecoveryResponseListingRow>> {
    const where = this.buildParticipationPredicate(
      'rr',
      'r',
      filter,
      statuses,
      viewerId,
      'responder_id',
    );

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<ParticipationQueryRow[]>(
        Prisma.sql`
          SELECT
            rr.${Prisma.raw(quoteName(PHYSICAL.response.id))} AS id,
            rr.${Prisma.raw(quoteName(PHYSICAL.response.status))} AS status,
            rr.${Prisma.raw(quoteName(PHYSICAL.response.submittedAt))} AS submitted_at,
            NULL::uuid AS thread_id,
            r.${Prisma.raw(quoteName(PHYSICAL.report.id))} AS report_id,
            r.${Prisma.raw(quoteName(PHYSICAL.report.type))} AS report_type,
            r.${Prisma.raw(quoteName(PHYSICAL.report.status))} AS report_status,
            r.${Prisma.raw(quoteName(PHYSICAL.report.name))} AS report_name,
            r.${Prisma.raw(quoteName(PHYSICAL.report.category))} AS report_category,
            r.${Prisma.raw(quoteName(PHYSICAL.report.date))} AS report_date,
            r.${Prisma.raw(quoteName(PHYSICAL.report.campusArea))} AS report_campus_area
          FROM ${Prisma.raw(quoteName(TABLES.response))} rr
          INNER JOIN ${Prisma.raw(quoteName(TABLES.report))} r
            ON r.${Prisma.raw(quoteName(PHYSICAL.report.id))} = rr.${Prisma.raw(quoteName(PHYSICAL.response.reportId))}
          ${where}
          ORDER BY rr.${Prisma.raw(quoteName(PHYSICAL.response.submittedAt))} DESC, rr.${Prisma.raw(quoteName(PHYSICAL.response.id))} ASC
          ${Prisma.raw(limitOffset(page))}
        `,
      ),
      this.countParticipationMatching(TABLES.response, 'rr', 'r', where),
    ]);

    return listingPage(
      rows.map((row) => toRecoveryResponseRow(row)),
      total,
      page.number,
      page.size,
    );
  }

  /**
   * Count the participation rows a `WHERE` clause matches.
   *
   * **The join is the same join the page query makes**, so the count is
   * over exactly the set the page is drawn from.
   *
   * **The participation table is a parameter**, because the Claims and the
   * Recovery Responses are different tables with the same shape — and a
   * count that read the wrong table would report a number the page could
   * never justify.
   */
  private async countParticipationMatching(
    participationTable: string,
    participationAlias: string,
    reportAlias: string,
    where: Prisma.Sql,
  ): Promise<number> {
    const rows = await this.client.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ${Prisma.raw(quoteName(participationTable))} ${Prisma.raw(participationAlias)}
        INNER JOIN ${Prisma.raw(quoteName(TABLES.report))} ${Prisma.raw(reportAlias)}
          ON ${Prisma.raw(reportAlias)}.${Prisma.raw(quoteName(PHYSICAL.report.id))} = ${Prisma.raw(participationAlias)}.${Prisma.raw(quoteName(PHYSICAL.claim.reportId))}
        ${where}
      `,
    );

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Build the report query's `WHERE` clause.
   *
   * **The values are bind parameters, never interpolated.** The keyword, the
   * category, the campus area and the statuses are all caller-supplied, and
   * none of them may become a fragment of SQL.
   *
   * **The clause is assembled from fixed fragments.** The only dynamic parts
   * are the *presence* of a filter — `WHERE 1 = 1` is the base, and each
   * present filter appends its own `AND` fragment with a placeholder. So a
   * caller cannot influence the shape of the SQL at all, only which
   * fragments are present.
   *
   * **The placeholders are Prisma's, not hand-numbered.** The fragment is a
   * `Prisma.Sql`, so Prisma numbers the parameters as it composes the
   * statement. A hand-written `$1` would collide with Prisma's own `$1` —
   * the parameter would bind to the wrong slot, or to nothing at all.
   */
  private buildReportPredicate(
    partition: ReportPartition,
    filter: ReportListingFilter,
    statuses: readonly string[],
    viewerId: string | null,
  ): Prisma.Sql {
    const fragments: Prisma.Sql[] = [];

    // **The partition predicate.** `mine` selects the viewer's own reports;
    // `browse` excludes them; `public` places no predicate.
    if (partition === 'mine') {
      fragments.push(
        Prisma.sql`r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))} = ${viewerId}`,
      );
    } else if (partition === 'browse') {
      fragments.push(
        Prisma.sql`r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))} <> ${viewerId}`,
      );
    }

    fragments.push(...this.reportFilterFragments(filter, statuses, 'r'));

    return whereOf(fragments);
  }

  /**
   * The filter fragments that apply to the report table.
   *
   * **Shared by the report query and the participation queries.** The
   * participation queries filter on the *related report*, so they need the
   * same fragments under a different alias — and a second implementation of
   * "what the filter narrows" would be a second answer to that question.
   */
  private reportFilterFragments(
    filter: ReportListingFilter,
    statuses: readonly string[],
    alias: string,
  ): Prisma.Sql[] {
    const fragments: Prisma.Sql[] = [];

    // **The status view.** The statuses are the resolved view, so an
    // explicit filter and the default view are indistinguishable here.
    if (statuses.length > 0) {
      fragments.push(
        Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.status))} IN (${Prisma.join(statuses)})`,
      );
    }

    if (filter.type !== null) {
      fragments.push(
        Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.type))} = ${filter.type}`,
      );
    }

    if (filter.category !== null) {
      fragments.push(
        Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.category))} = ${filter.category}`,
      );
    }

    if (filter.campusArea !== null) {
      fragments.push(
        Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.campusArea))} = ${filter.campusArea}`,
      );
    }

    if (filter.dateRange !== null) {
      if (filter.dateRange.from !== null) {
        fragments.push(
          Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.date))} >= ${filter.dateRange.from}::date`,
        );
      }

      if (filter.dateRange.to !== null) {
        fragments.push(
          Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.date))} <= ${filter.dateRange.to}::date`,
        );
      }
    }

    if (filter.keyword !== null && filter.keyword.length > 0) {
      // **The expression is the index's expression.** A near-miss would
      // silently fall back to a sequential scan.
      fragments.push(
        Prisma.sql`${Prisma.raw(searchVectorExpression(alias))} @@ plainto_tsquery('simple', ${filter.keyword})`,
      );
    }

    return fragments;
  }

  /**
   * Build the participation query's `WHERE` clause.
   *
   * **The membership predicate is first**, because it is the one that makes
   * the partition disjoint — the query returns only the member's own Claims
   * or Responses.
   *
   * **The remaining filters apply to the related report**, because that is
   * what the row shows.
   */
  private buildParticipationPredicate(
    participationAlias: string,
    reportAlias: string,
    filter: ReportListingFilter,
    statuses: readonly string[],
    viewerId: string,
    participationColumn: 'claimant_id' | 'responder_id',
  ): Prisma.Sql {
    const fragments: Prisma.Sql[] = [
      Prisma.sql`${Prisma.raw(participationAlias)}.${Prisma.raw(quoteName(participationColumn))} = ${viewerId}`,
    ];

    fragments.push(...this.reportFilterFragments(filter, statuses, reportAlias));

    return whereOf(fragments);
  }
}

/**
 * The `WHERE` clause for a list of fragments.
 *
 * **An empty filter set still produces a valid clause.** `WHERE 1 = 1` is
 * the base — a reader with no filter at all still returns the whole set,
 * and a query with no `WHERE` would read differently (and would not use
 * the same plan).
 */
function whereOf(fragments: readonly Prisma.Sql[]): Prisma.Sql {
  if (fragments.length === 0) {
    return Prisma.sql`WHERE 1 = 1`;
  }

  return Prisma.sql`WHERE ${Prisma.join(fragments, ' AND ')}`;
}

/** The offset for a page. */
function offsetFor(page: ReportPage): number {
  return (page.number - 1) * page.size;
}

/**
 * The `LIMIT`/`OFFSET` fragment.
 *
 * **The casts are not optional.** Prisma's tagged template binds a number as
 * text, and PostgreSQL's `OFFSET` demands a `bigint` — so an uncast offset
 * is a query error, not a coercion. `LIMIT` accepts the text form, but it is
 * cast too so the two read the same way.
 */
function limitOffset(page: ReportPage): string {
  return `LIMIT ${page.size}::int OFFSET ${offsetFor(page)}::bigint`;
}

/**
 * Map a query row to a report listing row.
 *
 * **The row shape is the FR-38 summary set.** A null in the database would
 * produce a null in the domain type — but the columns are `NOT NULL` in the
 * schema, and the fallbacks here are the only place a null could be papered
 * over. They are defensive, not a second source of truth.
 */
function toReportRow(row: ReportQueryRow): ReportListingRow {
  return {
    id: row.id,
    type: row.type === 'Found' ? 'Found' : 'Lost',
    status: row.status as ReportListingRow['status'],
    name: row.name ?? '',
    category: row.category as ReportListingRow['category'],
    date: toCalendarDay(row.date),
    campusArea: row.campus_area ?? '',
  };
}

/** Map a query row to a Claim listing row. */
function toClaimRow(row: ParticipationQueryRow): ClaimListingRow {
  return {
    id: row.id,
    status: row.status ?? '',
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : '',
    report: toNestedReportRow(row),
    threadId: row.thread_id,
  };
}

/** Map a query row to a Recovery Response listing row. */
function toRecoveryResponseRow(row: ParticipationQueryRow): RecoveryResponseListingRow {
  return {
    id: row.id,
    status: row.status ?? '',
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : '',
    report: toNestedReportRow(row),
    threadId: row.thread_id,
  };
}

/** The related report's summary fields, from a participation row. */
function toNestedReportRow(row: ParticipationQueryRow): ReportListingRow {
  return {
    id: row.report_id,
    type: row.report_type === 'Found' ? 'Found' : 'Lost',
    status: row.report_status as ReportListingRow['status'],
    name: row.report_name,
    category: row.report_category as ReportListingRow['category'],
    date: toCalendarDay(row.report_date),
    campusArea: row.report_campus_area ?? '',
  };
}

/**
 * A `date` column, as `YYYY-MM-DD`.
 *
 * **The calendar day, not the timestamp.** The `date` column is a
 * PostgreSQL `date`, so the driver returns it at midnight UTC — and the
 * listing row's contract is a calendar day. The `.slice(0, 10)` is what
 * guarantees the row carries `2026-10-01` and not
 * `2026-10-01T00:00:00.000Z`.
 */
function toCalendarDay(value: Date | null): string {
  if (value === null) {
    return '';
  }

  return value.toISOString().slice(0, 10);
}
