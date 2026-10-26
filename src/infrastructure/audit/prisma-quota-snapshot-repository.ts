/**
 * The Prisma implementation of the insert-only quota-snapshot repository.
 *
 * A snapshot is a standalone observation — it is not part of a caller's
 * state-change transaction, so `append` takes no transaction handle.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  QuotaSnapshot,
  QuotaSnapshotRepository,
} from '@/application/ports/quota-snapshot-repository';
import { prisma } from '../db/prisma';

/** Prisma's quota-snapshot repository. */
export class PrismaQuotaSnapshotRepository implements QuotaSnapshotRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  /** Append one snapshot. */
  async append(snapshot: {
    readonly resource: string;
    readonly usedAmount: bigint;
    readonly limitAmount: bigint;
    readonly observedAt: Date;
  }): Promise<QuotaSnapshot> {
    return this.client.quotaSnapshot.create({
      data: {
        resource: snapshot.resource,
        usedAmount: snapshot.usedAmount,
        limitAmount: snapshot.limitAmount,
        observedAt: snapshot.observedAt,
      },
    });
  }

  /** The most recent snapshot for a resource. */
  async findLatest(resource: string): Promise<QuotaSnapshot | null> {
    return this.client.quotaSnapshot.findFirst({
      where: { resource },
      orderBy: [{ observedAt: 'desc' }],
    });
  }
}
