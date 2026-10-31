/**
 * The Prisma implementation of the administrator queue reader.
 *
 * ## The filter becomes a `WHERE` clause
 *
 * **Not a post-filter.** The membership rule is the queue, and a reader
 * that loaded a broad set and filtered it in JavaScript would be the
 * load-then-filter defect FR-39 names, applied to a queue rather than to a
 * field. Each filter is a predicate in the SQL:
 *
 * - `AccountStatus` → `accounts.status = 'Pending'`
 * - `ClaimStatus` → `claims.status = 'Pending'` joined to a **Found** report
 * - `ReportStatus` → `reports.status = …` and `reports.type = …`
 *
 * **Each filter fragment carries its own `WHERE` keyword,** so the same
 * fragment can be interpolated into the row query and into the count
 * query — the two are one predicate, not two that must be kept in step.
 *
 * The report's **type** is in the predicate for the report-status filters,
 * so a Lost report cannot appear in the Found-side awaiting-return queue
 * and a Found report cannot appear in the Lost-side verification queue.
 *
 * ## The count is the number of rows
 *
 * The count is read by the same predicate the rows are drawn from, so the
 * dashboard's tile and the queue's rows cannot disagree.
 *
 * ## Oldest first
 *
 * §15.2–§15.5 say the queues sort oldest first by default, and the
 * ordering is the operational intent: an administrator works through the
 * queue in the order the work arrived.
 *
 * **Raw SQL, not the Prisma query builder** — the same reason the other
 * readers use raw SQL: the emitted SQL must be assertable in a test.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { QueueReader, QueueRow } from '@/application/administration/ports/queue-reader';
import type { QueueFilter } from '@/domain/administration';

import { TABLES, physical, quoteName } from './physical-columns';

/** The row the pending-registrations query returns. */
interface PendingRegistrationQueryRow {
  id: string;
  display_name: string;
  email: string;
  self_declared_role: string;
  created_at: Date;
}

/** The row the pending-claims query returns. */
interface PendingClaimQueryRow {
  id: string;
  report_id: string;
  report_name: string;
  claimant_display_name: string;
  submitted_at: Date;
}

/** The row the awaiting-return query returns. */
interface AwaitingReturnQueryRow {
  id: string;
  name: string;
  claimant_display_name: string;
  approved_at: Date;
}

/** The row the in-verification query returns. */
interface VerificationQueryRow {
  id: string;
  name: string;
  owner_id: string;
  owner_display_name: string;
  responder_display_name: string | null;
  verification_started_at: Date | null;
}

/** The count row every count query returns. */
interface CountRow {
  total: bigint;
}

/**
 * The Prisma administrator queue reader.
 */
export class PrismaAdministratorQueueReader implements QueueReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read a queue's rows under a filter.
   */
  async read(filter: QueueFilter, limit: number): Promise<{ rows: readonly QueueRow[]; count: number }> {
    switch (filter.kind) {
      case 'AccountStatus':
        return this.readPendingRegistrations(filter.status, limit);

      case 'ClaimStatus':
        return this.readPendingClaims(filter.reportType, filter.status, limit);

      case 'ReportStatus':
        return filter.reportType === 'Lost'
          ? this.readVerifications(filter.status, limit)
          : this.readAwaitingReturn(filter.status, limit);

      default:
        // **The filter is a closed union,** so an unknown kind is a defect
        // rather than a runtime possibility. The refusal says so rather than
        // silently returning an empty queue, which would look like "there is
        // no work" to the administrator.
        throw new Error(`Unknown queue filter. This is a defect.`);
    }
  }

  /**
   * The Pending Registrations queue — §15.2.
   *
   * **Oldest first, by registration time.** The account's `createdAt` is
   * the registration timestamp.
   */
  private async readPendingRegistrations(
    status: string,
    limit: number,
  ): Promise<{ rows: readonly QueueRow[]; count: number }> {
    const where = Prisma.sql`WHERE a.${Prisma.raw(quoteName('status'))} = ${status}`;

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<PendingRegistrationQueryRow[]>(
        Prisma.sql`
          SELECT
            a.${Prisma.raw(physical('id', PHYSICAL_ACCOUNT))} AS id,
            a.${Prisma.raw(quoteName('displayName'))} AS display_name,
            a.${Prisma.raw(quoteName('email'))} AS email,
            a.${Prisma.raw(quoteName('selfDeclaredRole'))} AS self_declared_role,
            a.${Prisma.raw(quoteName('createdAt'))} AS created_at
          FROM ${Prisma.raw(quoteName(TABLES.account))} a
          ${where}
          ORDER BY a.${Prisma.raw(quoteName('createdAt'))} ASC, a.${Prisma.raw(quoteName('id'))} ASC
          LIMIT ${limit}
        `,
      ),
      this.count(TABLES.account, 'a', where),
    ]);

    return {
      rows: rows.map((row) => ({
        kind: 'PendingRegistration' as const,
        accountId: row.id,
        displayName: row.display_name,
        email: row.email,
        selfDeclaredRole: row.self_declared_role,
        registeredAt: row.created_at,
      })),
      count: total,
    };
  }

  /**
   * The Pending Claims queue — §15.3.
   *
   * **Found-side only.** The join to the report carries `r.type = 'Found'`,
   * so a Lost report's Claims — which do not exist, but which a future
   * defect could create — could not appear here.
   */
  private async readPendingClaims(
    reportType: string,
    status: string,
    limit: number,
  ): Promise<{ rows: readonly QueueRow[]; count: number }> {
    const where = Prisma.sql`
      WHERE c.${Prisma.raw(quoteName('status'))} = ${status}
      AND r.${Prisma.raw(quoteName('type'))} = ${reportType}
    `;

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<PendingClaimQueryRow[]>(
        Prisma.sql`
          SELECT
            c.${Prisma.raw(quoteName('id'))} AS id,
            c.${Prisma.raw(quoteName('report_id'))} AS report_id,
            r.${Prisma.raw(quoteName('name'))} AS report_name,
            claimant.${Prisma.raw(quoteName('displayName'))} AS claimant_display_name,
            c.${Prisma.raw(quoteName('submitted_at'))} AS submitted_at
          FROM ${Prisma.raw(quoteName(TABLES.claim))} c
          JOIN ${Prisma.raw(quoteName(TABLES.report))} r
            ON r.${Prisma.raw(quoteName('id'))} = c.${Prisma.raw(quoteName('report_id'))}
          JOIN ${Prisma.raw(quoteName(TABLES.account))} claimant
            ON claimant.${Prisma.raw(quoteName('id'))} = c.${Prisma.raw(quoteName('claimant_id'))}
          ${where}
          ORDER BY c.${Prisma.raw(quoteName('submitted_at'))} ASC, c.${Prisma.raw(quoteName('id'))} ASC
          LIMIT ${limit}
        `,
      ),
      this.count(TABLES.claim, 'c', where, [
        { table: TABLES.report, alias: 'r', on: 'r."id" = c."report_id"' },
      ]),
    ]);

    return {
      rows: rows.map((row) => ({
        kind: 'PendingClaim' as const,
        claimId: row.id,
        reportId: row.report_id,
        itemName: row.report_name,
        claimantDisplayName: row.claimant_display_name,
        submittedAt: row.submitted_at,
      })),
      count: total,
    };
  }

  /**
   * The Items Awaiting Return queue — §15.4.
   *
   * **Found-side only, and only `Claim Approved`.** The claimant is the
   * **approved** claimant — the one who may receive the item — so the join
   * carries `c.status = 'Approved'`.
   */
  private async readAwaitingReturn(
    status: string,
    limit: number,
  ): Promise<{ rows: readonly QueueRow[]; count: number }> {
    const where = Prisma.sql`
      WHERE r.${Prisma.raw(quoteName('type'))} = ${'Found'}
      AND r.${Prisma.raw(quoteName('status'))} = ${status}
    `;

    const approvedJoin = Prisma.sql`
      JOIN ${Prisma.raw(quoteName(TABLES.claim))} c
        ON c.${Prisma.raw(quoteName('report_id'))} = r.${Prisma.raw(quoteName('id'))}
       AND c.${Prisma.raw(quoteName('status'))} = ${'Approved'}
    `;

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<AwaitingReturnQueryRow[]>(
        Prisma.sql`
          SELECT
            r.${Prisma.raw(quoteName('id'))} AS id,
            r.${Prisma.raw(quoteName('name'))} AS name,
            claimant.${Prisma.raw(quoteName('displayName'))} AS claimant_display_name,
            c.${Prisma.raw(quoteName('decided_at'))} AS approved_at
          FROM ${Prisma.raw(quoteName(TABLES.report))} r
          ${approvedJoin}
          JOIN ${Prisma.raw(quoteName(TABLES.account))} claimant
            ON claimant.${Prisma.raw(quoteName('id'))} = c.${Prisma.raw(quoteName('claimant_id'))}
          ${where}
          ORDER BY c.${Prisma.raw(quoteName('decided_at'))} ASC, r.${Prisma.raw(quoteName('id'))} ASC
          LIMIT ${limit}
        `,
      ),
      this.count(
        TABLES.report,
        'r',
        where,
        [
          {
            table: TABLES.claim,
            alias: 'c',
            on: `c."report_id" = r."id" AND c."status" = 'Approved'`,
          },
        ],
      ),
    ]);

    return {
      rows: rows.map((row) => ({
        kind: 'AwaitingReturn' as const,
        reportId: row.id,
        itemName: row.name,
        claimantName: row.claimant_display_name,
        approvedAt: row.approved_at,
      })),
      count: total,
    };
  }

  /**
   * The Items in Verification queue — §15.5.
   *
   * **Lost-side only.** The selected responder is the one in
   * `Selected for Verification` or `Match Confirmed` — a response that
   * has been selected and is still in play.
   */
  private async readVerifications(
    status: string,
    limit: number,
  ): Promise<{ rows: readonly QueueRow[]; count: number }> {
    const where = Prisma.sql`
      WHERE r.${Prisma.raw(quoteName('type'))} = ${'Lost'}
      AND r.${Prisma.raw(quoteName('status'))} = ${status}
    `;

    const selectedJoin = Prisma.sql`
      LEFT JOIN ${Prisma.raw(quoteName(TABLES.response))} rr
        ON rr.${Prisma.raw(quoteName('report_id'))} = r.${Prisma.raw(quoteName('id'))}
       AND rr.${Prisma.raw(quoteName('status'))} IN (${'Selected for Verification'}, ${'Match Confirmed'})
      LEFT JOIN ${Prisma.raw(quoteName(TABLES.account))} responder
        ON responder.${Prisma.raw(quoteName('id'))} = rr.${Prisma.raw(quoteName('responder_id'))}
    `;

    const [rows, total] = await Promise.all([
      this.client.$queryRaw<VerificationQueryRow[]>(
        Prisma.sql`
          SELECT
            r.${Prisma.raw(quoteName('id'))} AS id,
            r.${Prisma.raw(quoteName('name'))} AS name,
            owner.${Prisma.raw(quoteName('id'))} AS owner_id,
            owner.${Prisma.raw(quoteName('displayName'))} AS owner_display_name,
            responder.${Prisma.raw(quoteName('displayName'))} AS responder_display_name,
            r.${Prisma.raw(quoteName('updated_at'))} AS verification_started_at
          FROM ${Prisma.raw(quoteName(TABLES.report))} r
          JOIN ${Prisma.raw(quoteName(TABLES.account))} owner
            ON owner.${Prisma.raw(quoteName('id'))} = r.${Prisma.raw(quoteName('reporter_id'))}
          ${selectedJoin}
          ${where}
          ORDER BY r.${Prisma.raw(quoteName('updated_at'))} ASC, r.${Prisma.raw(quoteName('id'))} ASC
          LIMIT ${limit}
        `,
      ),
      this.count(TABLES.report, 'r', where),
    ]);

    return {
      rows: rows.map((row) => ({
        kind: 'Verification' as const,
        reportId: row.id,
        reportName: row.name,
        ownerDisplayName: row.owner_display_name,
        ownerUserId: row.owner_id,
        selectedResponderDisplayName: row.responder_display_name,
        verificationStartedAt: row.verification_started_at,
      })),
      count: total,
    };
  }

  /**
   * Count the rows a `WHERE` clause matches.
   *
   * **The same predicate the page is drawn from,** so the count is over
   * exactly the set the rows come from.
   */
  private async count(
    table: string,
    alias: string,
    where: Prisma.Sql,
    joins: readonly { table: string; alias: string; on: string }[] = [],
  ): Promise<number> {
    const joinSql = joins
      .map((join) => Prisma.sql`JOIN ${Prisma.raw(quoteName(join.table))} ${Prisma.raw(join.alias)} ON ${Prisma.raw(join.on)}`)
      .reduce((accumulated, join) => Prisma.sql`${accumulated} ${join}`, Prisma.empty);

    const rows = await this.client.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ${Prisma.raw(quoteName(table))} ${Prisma.raw(alias)}
        ${joinSql}
        ${where}
      `,
    );

    return Number(rows[0]?.total ?? 0);
  }
}

/**
 * The account table's physical columns.
 *
 * **The account table has camelCase physical columns** — `displayName`,
 * `selfDeclaredRole`, `createdAt` — and the `PHYSICAL.account` map in
 * `physical-columns.ts` names only the three the visibility readers need.
 * This map is the queue reader's own, complete for the columns it
 * selects.
 */
const PHYSICAL_ACCOUNT = {
  id: 'id',
  displayName: 'displayName',
  email: 'email',
  selfDeclaredRole: 'selfDeclaredRole',
  createdAt: 'createdAt',
} as const;
