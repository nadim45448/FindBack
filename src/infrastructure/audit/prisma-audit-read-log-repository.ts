/**
 * The Prisma implementation of the insert-only audit-read-log repository.
 *
 * A read of the trail is recorded in the database, not only on stdout,
 * because Vercel Hobby retains runtime logs for one hour and the PRD
 * requires the access pattern to be reviewable later (PRD §10).
 */

import type { PrismaClient } from '@prisma/client';
import type {
  AuditReadLog,
  AuditReadLogRecord,
  AuditReadLogRepository,
} from '@/application/ports/audit-read-log-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import { AuditWriteOutsideTransactionError } from '@/domain/audit';

/**
 * The read-log page size.
 *
 * Matches the trail's page size for consistency. The read log has no UX
 * surface, so this is an operational default rather than a product decision.
 */
export const READ_LOG_PAGE_SIZE = 25;

/** Extract the transaction client from a handle. */
function transactionClient(transaction: TransactionHandle): {
  auditReadLog: {
    create(args: {
      data: {
        id: string;
        administratorId: string;
        query: string | null;
        filters: unknown;
        resultCount: number;
        requestId: string | null;
        readAt: Date;
        createdAt: Date;
      };
    }): Promise<AuditReadLogRecord>;
  };
} {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('auditReadLog' in candidate)) {
    throw new AuditWriteOutsideTransactionError();
  }

  return candidate as unknown as {
    auditReadLog: {
      create(args: {
        data: {
          id: string;
          administratorId: string;
          query: string | null;
          filters: unknown;
          resultCount: number;
          requestId: string | null;
          readAt: Date;
          createdAt: Date;
        };
      }): Promise<AuditReadLogRecord>;
    };
  };
}

/** Prisma's audit-read-log repository. */
export class PrismaAuditReadLogRepository implements AuditReadLogRepository {
  constructor(private readonly client: PrismaClient) {}

  /** Append one read record inside the caller's transaction. */
  async append(read: AuditReadLogRecord, transaction: TransactionHandle): Promise<AuditReadLog> {
    const client = transactionClient(transaction);

    const created = await client.auditReadLog.create({
      data: {
        id: read.id,
        administratorId: read.administratorId,
        query: read.query,
        filters: read.filters,
        resultCount: read.resultCount,
        requestId: read.requestId,
        readAt: read.readAt,
        createdAt: read.createdAt,
      },
    });

    return created;
  }

  /** Read the most recent read records for an administrator. */
  async listByAdministrator(
    administratorId: string,
    limit: number = READ_LOG_PAGE_SIZE,
  ): Promise<readonly AuditReadLog[]> {
    return this.client.auditReadLog.findMany({
      where: { administratorId },
      orderBy: [{ readAt: 'desc' }],
      take: limit,
    });
  }
}
