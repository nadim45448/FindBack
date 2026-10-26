/**
 * The quota-limit provider.
 *
 * A read-only port over the configured free-tier limits. The implementation
 * lives in the infrastructure layer, where the Vercel account's actual
 * allowance can be read.
 */

import type { QuotaLimit, QuotaResource } from '@/domain/audit';

/** Reads the limit configured for a resource. */
export interface QuotaLimitProvider {
  /** The limit for a resource, or undefined when the resource is unknown. */
  limitFor(resource: QuotaResource): Promise<QuotaLimit | undefined>;

  /** Every known limit. */
  allLimits(): Promise<readonly QuotaLimit[]>;
}
