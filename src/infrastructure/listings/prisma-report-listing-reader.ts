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
 * **The keyword is matched by the trigram indexes.** The `pg_trgm` GIN
 * indexes answer the partial match — a substring of the name or the
 * description — and they answer it without a sequential scan, which is what
 * FR-14 requires. See `keywordFragments` for why the `tsvector` index is
 * not part of the match.
 *
 * **The `tsvector` expression is the index's expression exactly.** The
 * migration created the GIN index over
 * `to_tsvector('simple', name || ' ' || description)`; PostgreSQL only uses
 * an index when the query's expression matches the index's *exactly*. A
 * near-miss — a different configuration, a missing `coalesce`, a missing
 * space — silently falls back to a sequential scan, so the expression lives
 * in **one constant** here and the same constant is what the migration's
 * index is built over.
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
 * **A thread is addressed by its parent, so the thread id is the parent id.**
 * There is no `threads` table and no thread entity: a thread *is* the set of
 * messages hanging from a `(parent_type, parent_id)` pair, and the route
 * that serves it is `/api/claims/[id]/thread` — the Claim's own id in the
 * path. So the `threadId` a participation row carries is **the Claim's id**,
 * or the Recovery Response's id, and no join to `thread_messages` is needed
 * to produce it.
 *
 * **The id is present even when the thread is empty.** A thread with no
 * messages is still a thread — it is the Claim's conversation, and it is
 * where the member would post. The link is to the conversation, not to a
 * message in it, so a `null` here would mean "this conversation does not
 * exist", which is a different and wrong claim.
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
 * **One artefact, used by the query-plan assertion.** Bolt `007` created the
 * GIN index `idx_reports_search` over `to_tsvector('simple', name || ' ' ||
 * description)`. PostgreSQL only uses an index when the query's expression
 * matches the index's *exactly*, so this is that expression, character for
 * character. A near-miss — a different configuration, a `coalesce` wrapper,
 * a missing space — silently falls back to a sequential scan, so the
 * expression lives in **one constant** here and the query-plan assertion is
 * what proves it still matches.
 *
 * **The keyword match itself is the trigram path's, not this one's.** A
 * `tsquery` is a token language: it matches whole lexemes and, in its
 * prefix form, lexemes that *begin* with the caller's text. It cannot
 * express a substring in the *middle* of a word — `lue` is not a prefix of
 * `blue` — so it cannot answer FR-14's "partial match". See
 * `keywordFragments`.
 *
 * **This constant is still exported** because the index it names is still in
 * the schema, and the suites assert that index is still usable by an
 * expression that matches it exactly. The assertion is a claim about the
 * index's presence, and it is the same claim bolt `007` made.
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
            c.${Prisma.raw(quoteName(PHYSICAL.claim.id))} AS thread_id,
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
            rr.${Prisma.raw(quoteName(PHYSICAL.response.id))} AS thread_id,
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
      fragments.push(...this.keywordFragments(filter.keyword, alias));
    }

    return fragments;
  }

  /**
   * The fragments that implement FR-14's **partial** keyword match.
   *
   * **FR-14 says "case-insensitive, partial match".** The PRD is normative
   * — `requirements.md` states that where the PRD and the stories differ,
   * the PRD wins — and the PRD says: *"Keyword matches against item name and
   * description (case-insensitive, partial match)."*
   *
   * **The obvious implementation is wrong, and it is wrong in a way no
   * functional test would catch.** `plainto_tsquery` splits the keyword into
   * lexemes and requires each lexeme to be a **whole token** in the
   * document's vector. So `walle` does not match a document containing
   * `wallet` — the lexeme `walle` is not a token; `wallet` is. A member
   * searching for `walle` is looking for `wallet`, and the whole-token form
   * silently returns nothing.
   *
   * **The naive repair is also wrong.** `name ILIKE '%walle%'` has exactly
   * the right matching semantics, and it cannot satisfy the rest of FR-14:
   * a leading-wildcard `ILIKE` has no usable B-tree index, so every search
   * becomes a sequential scan over the reports table — which FR-14 forbids
   * ("Search and listing queries must be index-backed. A full scan over
   * reports is not acceptable at this data volume") and which the bolt's own
   * success criteria make a claim about ("no full table scan over
   * reports").
   *
   * **So the match is answered by the trigram indexes alone.** The
   * `gin_trgm_ops` operator class makes `ILIKE '%substring%'` an
   * index-backed operation rather than a scan, and — because the pattern
   * carries the **whole keyword** rather than a lexeme at a time — it
   * expresses exactly what "partial match" means: the keyword appears as a
   * substring of the field.
   *
   * **The `tsvector` index is not part of the match, and that is the
   * correction an earlier draft got wrong.** A `tsquery` is a **token**
   * language: it matches whole lexemes and, in its prefix form, lexemes
   * that *begin* with the caller's text. It cannot express a substring in
   * the *middle* of a word — `lue` is not a prefix of `blue`, so
   * `to_tsquery('simple', 'lue:*')` does not match `A blue wallet` even
   * though `lue` is plainly a substring of it.
   *
   * ANDing the two predicates therefore *narrows the match wrongly*: the
   * trigram says yes and the tsquery says no, so the row is excluded even
   * though the keyword is genuinely a substring of its name. The two
   * predicates do not agree about what a partial match is, so they cannot
   * be combined at all.
   *
   * **The `tsvector` index stays in the schema** — it is bolt `007`'s, and
   * it answers the whole-word question at the index level for any reader
   * that asks it. But the keyword *match* is the trigram's, because the
   * trigram is the only one of the two that can answer the question FR-14
   * asks.
   *
   * **The trigram predicate is on `name` OR `description`, not on their
   * concatenation.** A single index over `name || ' ' || description` would
   * match a trigram straddling the two columns — the last character of a
   * name and the first of a description — which appears in neither field.
   * Two indexes, two predicates, `OR`-ed: the keyword must be a substring
   * of the name **or** of the description, which is exactly FR-14's "matches
   * against item name and description".
   *
   * **The keyword is a bind parameter throughout.** The `ILIKE` pattern is
   * built by escaping the caller's substring and wrapping it in `%`, and the
   * escaped value is bound — never interpolated.
   *
   * **The escaped pattern is what makes the match a literal substring.**
   * A keyword of `%` or `_` would otherwise be a wildcard — `_` matches any
   * single character — and a member searching for `blue_bag` would match
   * `blueXbag`. The escaping puts a backslash before each metacharacter,
   * and PostgreSQL's `LIKE` honours the escape character.
   *
   * @param keyword the caller's keyword.
   * @param alias the report table's alias in the query.
   */
  private keywordFragments(keyword: string, alias: string): Prisma.Sql[] {
    const escaped = escapeLikePattern(keyword);
    const pattern = `%${escaped}%`;

    // **A keyword with no searchable text has no text to match.** A keyword
    // of only punctuation — `!!!` — has no letters or digits, and a
    // `LIKE` pattern of `%!!!%` would match only a row that literally
    // contains those marks. The keyword still contributes its predicate, so
    // the result is a search that finds nothing rather than a search that
    // finds everything.
    return [
      // **The trigram path — the partial match, and the whole of it.**
      // Two predicates, `OR`-ed, because the keyword may be a substring of
      // either covered column.
      Prisma.sql`(
        ${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.name))} ILIKE ${pattern}
        OR ${Prisma.raw(alias)}.${Prisma.raw(quoteName(PHYSICAL.report.description))} ILIKE ${pattern}
      )`,
    ];
  }

  /**
   * Build the participation query's `WHERE` clause.
   *
   * **The membership predicate is first**, because it is the one that makes
   * the partition disjoint — the query returns only the member's own Claims
   * or Responses.
   *
   * **The ownership exclusion is second, and it is part of the partition's
   * definition rather than a filter applied afterwards.** FR-49 says the
   * `claims` partition holds "only Claims they submitted on **other members'**
   * Found reports", and the `recovery_responses` partition the same for Lost
   * reports. A member's own report is in `mine`; a Claim on one's own report
   * is not a thing (FR-15 forbids claiming on your own report), so this is
   * belt-and-braces against the same report appearing in two partitions.
   *
   * The exclusion is a predicate in the query for the same reason `browse`
   * carries its own: a reader that loaded the participation rows and then
   * filtered out the member's own reports would be the load-then-filter
   * defect FR-39 names, applied to the partition instead of to a field.
   *
   * **The remaining report filters apply to the related report**, because
   * that is what the row shows.
   *
   * **The participation's own status filter applies to the participation
   * table.** §9.4's `My Claims` tabs are `Pending`, `Approved`, and
   * `Rejected` — the **Claim's** status, not the report's. A Claim on a
   * `Claim Requested` report is still a `Pending` Claim, so a filter on
   * the report's status would answer a different question than the tab
   * asks. The predicate is on the participation's `status` column, and it
   * is a predicate **in the query** for the same reason the partition is.
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
      Prisma.sql`${Prisma.raw(reportAlias)}.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))} <> ${viewerId}`,
    ];

    fragments.push(...this.reportFilterFragments(filter, statuses, reportAlias));

    const participationStatuses = filter.participationStatuses;

    if (participationStatuses !== null && participationStatuses !== undefined && participationStatuses.length > 0) {
      fragments.push(
        Prisma.sql`${Prisma.raw(participationAlias)}.${Prisma.raw(quoteName(PHYSICAL.claim.status))} IN (${Prisma.join(participationStatuses)})`,
      );
    }

    return whereOf(fragments);
  }
}

/**
 * Escape the `LIKE` metacharacters in a keyword.
 *
 * **The keyword is a literal substring, not a pattern.** `ILIKE` treats `%`
 * as "any run of characters" and `_` as "any single character", so a
 * keyword of `blue_bag` would otherwise match `blueXbag`, and a keyword of
 * `%` would match every row. The escaping puts a backslash before each
 * metacharacter, and PostgreSQL's `LIKE` honours the escape character — so
 * the caller's text is matched literally.
 *
 * **The escape character itself is escaped first**, so a keyword ending in
 * a backslash cannot escape the closing wildcard it is followed by.
 *
 * The result is still bound as a parameter — this function only decides
 * *what* the pattern says, never how it reaches the database.
 *
 * @param keyword the caller's keyword.
 */
function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
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
