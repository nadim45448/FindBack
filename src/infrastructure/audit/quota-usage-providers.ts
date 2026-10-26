/**
 * The quota-usage readers.
 *
 * Each reader reports the current usage of one monitored resource against its
 * verified free-tier limit. All of them are read-only: nothing here can
 * purchase, upgrade, or scale anything.
 *
 * Vercel Blob needs a real token, so its reader is only exercised in an
 * environment that has one — locally it is covered by automated test with an
 * injected client rather than by a live call (`construction-protocol.md`,
 * decision CP-4).
 */

import type { QuotaUsageReader, QuotaUsage } from '@/application/ports/quota-usage-reader';
import type { QuotaResource } from '@/domain/audit';
import { prisma } from '../db/prisma';

/** The minimal shape of the Blob client this reader needs. */
export interface BlobQuotaClient {
  list(options?: { limit?: number; cursor?: string }): Promise<{
    blobs: Array<{ pathname: string; size: number }>;
    cursor?: string;
    hasMore?: boolean;
  }>;
}

/**
 * Reads Vercel Blob storage usage.
 *
 * Blob storage is the **only** resource that refuses at its limit, because it
 * is the only one checked at the moment of use — the upload path checks it
 * before writing a blob.
 */
export class VercelBlobQuotaProvider implements QuotaUsageReader {
  constructor(private readonly client: BlobQuotaClient) {}

  /** The total bytes stored across the private store. */
  async usage(resource: QuotaResource): Promise<QuotaUsage> {
    if (resource !== 'blob_storage_bytes') {
      throw new Error(`The Blob client cannot report usage for "${resource}".`);
    }

    let total = 0n;
    let cursor: string | undefined;

    // The Blob list API is paged; the total needs every page.
    do {
      const page = await this.client.list({ limit: 1000, cursor });
      total += page.blobs.reduce((sum, blob) => sum + BigInt(blob.size), 0n);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return { resource, usedAmount: total };
  }
}

/**
 * The platform metrics reader.
 *
 * Function invocations, data transfer, and fast-origin transfer come from the
 * Vercel REST API. This reader takes an injected fetcher so it is testable
 * without network access and without a Vercel token.
 */
export class VercelPlatformQuotaProvider implements QuotaUsageReader {
  constructor(private readonly fetchUsage: (resource: QuotaResource) => Promise<bigint>) {}

  /** The usage the injected fetcher reports. */
  async usage(resource: QuotaResource): Promise<QuotaUsage> {
    return { resource, usedAmount: await this.fetchUsage(resource) };
  }
}

/**
 * The database-size reader.
 *
 * The database's own storage size, read from PostgreSQL. This is the one
 * reader that can be exercised locally against the Docker container.
 */
export class DatabaseQuotaProvider implements QuotaUsageReader {
  async usage(resource: QuotaResource): Promise<QuotaUsage> {
    if (resource !== 'database_storage_bytes') {
      throw new Error(`The database cannot report usage for "${resource}".`);
    }

    const rows = await prisma.$queryRaw<Array<{ size: bigint }>>`
      SELECT pg_database_size(current_database()) AS size
    `;

    const size = rows[0]?.size ?? 0n;

    return { resource, usedAmount: size };
  }
}
