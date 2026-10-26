/**
 * The Prisma implementation of the insert-only audit-event repository.
 *
 * Writes go through Prisma inside the caller's transaction. Reads use raw
 * SQL, as `data-stack.md` requires for audit queries — the cursor pagination
 * over `(occurred_at, id)` is an index range scan, and `OFFSET` would
 * degrade linearly with depth.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  AuditEventRecord,
  AuditEventRepository,
  TrailCursor,
  TrailPage,
} from '@/application/ports/audit-event-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { AuditEvent, TrailFilters } from '@/domain/audit';
import { AuditWriteOutsideTransactionError } from '@/domain/audit';

/** The row shape a trail read returns. */
interface AuditEventRow {
  id: string;
  eventNumber: number | null;
  eventType: string;
  parentType: string;
  parentId: string;
  actorId: string;
  actorRole: string;
  actingAdministratorId: string | null;
  determinedByUserId: string | null;
  recordedByAdministratorId: string | null;
  reason: string | null;
  previousValues: Prisma.JsonValue | null;
  changedFields: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  occurredAt: Date;
  createdAt: Date;
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is refused, rather than
 * silently falling back to the root client — an audit write that commits
 * outside the caller's transaction is the defect story `001` forbids.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('auditEvent' in candidate) ||
    !('auditReadLog' in candidate)
  ) {
    throw new AuditWriteOutsideTransactionError();
  }

  return candidate as Prisma.TransactionClient;
}

/** Map a database row onto the domain shape. */
function toDomainEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    eventNumber: row.eventNumber,
    eventType: row.eventType,
    parent: {
      parentType: row.parentType as AuditEvent['parent']['parentType'],
      parentId: row.parentId,
    },
    actor: {
      actorId: row.actorId,
      actorRole: row.actorRole as AuditEvent['actor']['actorRole'],
      actingAdministratorId: row.actingAdministratorId,
      determinedByUserId: row.determinedByUserId,
      recordedByAdministratorId: row.recordedByAdministratorId,
    },
    payload: (row.metadata ?? {}) as Record<string, unknown>,
    reason: row.reason,
    previousValues: (row.previousValues ?? null) as Record<string, unknown> | null,
    changedFields: (row.changedFields ?? null) as Record<string, unknown> | null,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

/** The columns a trail read selects. */
const TRAIL_COLUMNS = Prisma.sql`
  "id", "eventNumber", "eventType", "parentType", "parentId",
  "actorId", "actorRole", "actingAdministratorId", "determinedByUserId",
  "recordedByAdministratorId", "reason", "previousValues", "changedFields",
  "metadata", "occurredAt", "createdAt"
`;

/** Prisma's audit-event repository. */
export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Append one event inside the caller's transaction.
   *
   * There is no update or delete method on this class, and none on the port
   * it implements — the append-only guarantee is structural.
   */
  async append(event: AuditEventRecord, transaction: TransactionHandle): Promise<AuditEvent> {
    const client = transactionClient(transaction);

    const created = await client.auditEvent.create({
      data: {
        id: event.id,
        eventNumber: event.eventNumber,
        eventType: event.eventType,
        parentType: event.parentType,
        parentId: event.parentId,
        actorId: event.actorId,
        actorRole: event.actorRole,
        actingAdministratorId: event.actingAdministratorId,
        determinedByUserId: event.determinedByUserId,
        recordedByAdministratorId: event.recordedByAdministratorId,
        reason: event.reason,
        previousValues: event.previousValues as Prisma.InputJsonValue | undefined,
        changedFields: event.changedFields as Prisma.InputJsonValue | undefined,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
        occurredAt: event.occurredAt,
        createdAt: event.createdAt,
      },
    });

    return toDomainEvent(created);
  }

  /** Read a page of one parent's trail, newest first. */
  async listByParent(
    parentType: string,
    parentId: string,
    cursor: TrailCursor | null,
    limit: number,
    filters?: TrailFilters,
  ): Promise<TrailPage> {
    return this.listPage(
      Prisma.sql`"parentType" = ${parentType} AND "parentId" = ${parentId}::uuid`,
      cursor,
      limit,
      filters,
    );
  }

  /** Read a page of the whole trail, newest first. */
  async listAll(
    cursor: TrailCursor | null,
    limit: number,
    filters?: TrailFilters,
  ): Promise<TrailPage> {
    return this.listPage(Prisma.sql`TRUE`, cursor, limit, filters);
  }

  /**
   * The filter clause.
   *
   * Every filter is optional and its clause is **omitted when absent** — a
   * filter that is always present with a sentinel value would return nothing,
   * which is the wrong default.
   *
   * Every value is a bound parameter. No filter value is ever concatenated
   * into SQL, so a hostile filter value is stored as data, never executed.
   */
  private filterClause(filters?: TrailFilters): Prisma.Sql {
    if (!filters) {
      return Prisma.empty;
    }

    const clauses: Prisma.Sql[] = [];

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      clauses.push(Prisma.sql`"eventType" = ANY(${filters.eventTypes}::text[])`);
    }

    if (filters.from) {
      clauses.push(Prisma.sql`"occurredAt" >= ${filters.from}`);
    }

    if (filters.to) {
      clauses.push(Prisma.sql`"occurredAt" <= ${filters.to}`);
    }

    if (filters.actorId) {
      clauses.push(Prisma.sql`"actorId" = ${filters.actorId}::uuid`);
    }

    if (clauses.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}`;
  }

  /**
   * The shared page query.
   *
   * The cursor is a strict tuple comparison on `(occurredAt, id)` — the `id`
   * tiebreaker is what stops two events sharing a timestamp from causing a
   * skipped or repeated row.
   */
  private async listPage(
    where: Prisma.Sql,
    cursor: TrailCursor | null,
    limit: number,
    filters?: TrailFilters,
  ): Promise<TrailPage> {
    const cursorClause = cursor
      ? Prisma.sql`AND ("occurredAt" < ${cursor.occurredAt} OR ("occurredAt" = ${cursor.occurredAt} AND "id" < ${cursor.id}::uuid))`
      : Prisma.empty;

    const filterClause = this.filterClause(filters);

    // One extra row tells us whether another page exists without a second count.
    const rows = await this.client.$queryRaw<AuditEventRow[]>(Prisma.sql`
      SELECT ${TRAIL_COLUMNS}
      FROM "AuditEvent"
      WHERE ${where} ${filterClause} ${cursorClause}
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);

    return {
      events: pageRows.map(toDomainEvent),
      nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null,
    };
  }
}
