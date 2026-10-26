/**
 * The quota-usage reader port.
 *
 * Reads the current usage of a monitored resource from the outside world —
 * Vercel Blob, the Vercel platform metrics API, or the database's own size.
 */

import type { QuotaResource } from '@/domain/audit';

/** A usage reading from the outside world. */
export interface QuotaUsage {
  readonly resource: QuotaResource;
  readonly usedAmount: bigint;
}

/** Reads current usage for a resource. */
export interface QuotaUsageReader {
  usage(resource: QuotaResource): Promise<QuotaUsage>;
}
