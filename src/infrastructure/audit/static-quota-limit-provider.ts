/**
 * The quota-limit provider.
 *
 * The limits are the verified Vercel Hobby free-tier allowances
 * (`tech-stack.md`). They are configuration, not a runtime API call: the
 * limits are fixed by the plan, so reading them from the platform on every
 * check would add a network round trip to every upload for no benefit.
 */

import type { QuotaLimitProvider } from '@/application/ports/quota-limit-provider';
import { VERCEL_HOBBY_LIMITS, type QuotaLimit, type QuotaResource } from '@/domain/audit';

/** The static, plan-derived limits. */
export class StaticQuotaLimitProvider implements QuotaLimitProvider {
  constructor(private readonly limits: readonly QuotaLimit[] = VERCEL_HOBBY_LIMITS) {}

  /** The limit for a resource. */
  async limitFor(resource: QuotaResource): Promise<QuotaLimit | undefined> {
    return this.limits.find((limit) => limit.resource === resource);
  }

  /** Every known limit. */
  async allLimits(): Promise<readonly QuotaLimit[]> {
    return this.limits;
  }
}
