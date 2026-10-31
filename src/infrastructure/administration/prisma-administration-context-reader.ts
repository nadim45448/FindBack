/**
 * The Prisma reader for the administrator surfaces' context.
 *
 * ## What it resolves
 *
 * The audit trail's rows carry an **actor id**, not an actor name. §17.2's
 * table says the row shows the *"Actor. Display name + role tag"* — so
 * the name has to come from somewhere, and the trail's own table does not
 * carry it.
 *
 * The report's **name** is the same: the trail's parent is a report id,
 * and the page's heading names the report.
 *
 * ## The lookup is one query, not one per row
 *
 * A trail page carries 25 rows and a report has a handful of actors across
 * its history, so the names are read in **one query** and indexed by id.
 * A per-row lookup would be 25 queries for a page the administrator reads
 * in a second.
 *
 * ## Raw SQL, for the same reason as every other reader
 *
 * The emitted SQL must be assertable in a test.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import { TABLES, quoteName } from '@/infrastructure/listings/physical-columns';

/** The row the actor lookup returns. */
interface ActorRow {
  id: string;
  display_name: string;
}

/** The row the report lookup returns. */
interface ReportRow {
  id: string;
  name: string;
  type: string;
}

/**
 * The administrator surfaces' context reader.
 */
export class PrismaAdministrationContextReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the display names of a set of actors.
   *
   * **An actor that no longer resolves to an account is not an error.**
   * Accounts are never deleted (FR-5), so this does not happen — but a
   * missing name must not fail the page, because the trail is the
   * administrator's window onto the work and a missing name is better
   * shown as a placeholder than as a 500.
   */
  async readActorNames(actorIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(actorIds)];

    if (unique.length === 0) {
      return new Map();
    }

    const rows = await this.client.$queryRaw<ActorRow[]>(
      Prisma.sql`
        SELECT
          a.${Prisma.raw(quoteName('id'))} AS id,
          a.${Prisma.raw(quoteName('displayName'))} AS display_name
        FROM ${Prisma.raw(quoteName(TABLES.account))} a
        WHERE a.${Prisma.raw(quoteName('id'))} = ANY(${unique}::uuid[])
      `,
    );

    return new Map(rows.map((row) => [row.id, row.display_name]));
  }

  /**
   * Read a report's name and type.
   *
   * **The type matters.** The two contextual audit routes are
   * `/admin/items/:id/audit` (Found) and `/admin/lost/:id/audit` (Lost),
   * and a route must not serve the other side's report — so the reader
   * returns the type and the caller checks it.
   */
  async readReport(reportId: string): Promise<{ id: string; name: string; type: string } | null> {
    const rows = await this.client.$queryRaw<ReportRow[]>(
      Prisma.sql`
        SELECT
          r.${Prisma.raw(quoteName('id'))} AS id,
          r.${Prisma.raw(quoteName('name'))} AS name,
          r.${Prisma.raw(quoteName('type'))} AS type
        FROM ${Prisma.raw(quoteName(TABLES.report))} r
        WHERE r.${Prisma.raw(quoteName('id'))} = ${reportId}::uuid
        LIMIT 1
      `,
    );

    const row = rows[0];

    return row ? { id: row.id, name: row.name, type: row.type } : null;
  }
}
