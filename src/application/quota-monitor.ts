/**
 * Observes free-tier quota usage and refuses only what must be refused.
 *
 * **Only Blob storage refuses.** Every other resource warns. Refusing an
 * upload at the Blob storage limit is the single automated action in the
 * system — everything else surfaces the condition and stops, because the
 * budget is a hard $0 ceiling and every escalation path from here is a
 * purchase (ADR-4, `tech-stack.md`).
 *
 * There is no upgrade path in this class's interface, and no way to call one.
 *
 * A threshold crossing is surfaced **once per crossing**, not on every
 * request — that is tracked by comparing against the last snapshot for the
 * resource.
 */

import {
  classifyQuota,
  shouldSurface,
  type QuotaReading,
  type QuotaResource,
} from '@/domain/audit';
import { QuotaExceededError } from '@/lib/errors';
import type { QuotaLimitProvider } from './ports/quota-limit-provider';
import type { QuotaSnapshotRepository } from './ports/quota-snapshot-repository';
import type { QuotaUsageReader } from './ports/quota-usage-reader';

/** The outcome of a quota check. */
export type QuotaDecision = 'allowed' | 'refused';

/** A checked quota. */
export interface QuotaCheckResult {
  readonly decision: QuotaDecision;
  readonly reading: QuotaReading;
  /** True when this reading crosses a threshold that was not crossed before. */
  readonly isNewCrossing: boolean;
}

/** Monitors quota and refuses only what the budget requires refusing. */
export class QuotaMonitor {
  constructor(
    private readonly limits: QuotaLimitProvider,
    private readonly usage: QuotaUsageReader,
    private readonly snapshots: QuotaSnapshotRepository,
  ) {}

  /**
   * Check a resource against its limit and record the reading.
   *
   * @throws {QuotaExceededError} when the resource is at its limit and is one
   * that refuses.
   */
  async check(resource: QuotaResource, attemptedAmount = 0n): Promise<QuotaCheckResult> {
    const limit = await this.limits.limitFor(resource);

    if (!limit) {
      // An unknown resource cannot be judged against a limit. Surfacing the
      // condition is the whole response; guessing a limit would be worse.
      throw new QuotaObservationError(`No configured limit for resource "${resource}".`);
    }

    const current = await this.usage.usage(resource);
    const usedAmount = current.usedAmount + attemptedAmount;
    const reading = classifyQuota(resource, usedAmount, limit.limitAmount);

    const previous = await this.snapshots.findLatest(resource);
    const isNewCrossing = this.detectCrossing(previous, reading);

    await this.snapshots.append({
      resource,
      usedAmount,
      limitAmount: limit.limitAmount,
      observedAt: new Date(),
    });

    if (reading.refuses) {
      throw new QuotaExceededError(
        `${resource} has reached its free-tier limit of ${limit.limitAmount}. The action was refused.`,
      );
    }

    return { decision: 'allowed', reading, isNewCrossing };
  }

  /**
   * Observe a resource without attempting an action.
   *
   * Used by the daily cron. It never refuses — there is no action to refuse.
   */
  async observe(resource: QuotaResource): Promise<QuotaCheckResult> {
    const limit = await this.limits.limitFor(resource);

    if (!limit) {
      throw new QuotaObservationError(`No configured limit for resource "${resource}".`);
    }

    const current = await this.usage.usage(resource);
    const reading = classifyQuota(resource, current.usedAmount, limit.limitAmount);

    const previous = await this.snapshots.findLatest(resource);
    const isNewCrossing = this.detectCrossing(previous, reading);

    await this.snapshots.append({
      resource,
      usedAmount: current.usedAmount,
      limitAmount: limit.limitAmount,
      observedAt: new Date(),
    });

    return { decision: 'allowed', reading, isNewCrossing };
  }

  /**
   * True when this reading crosses a threshold the previous reading had not
   * crossed.
   *
   * A reading that stays above a threshold is not a new crossing — it is the
   * same condition, already surfaced.
   */
  private detectCrossing(
    previous: { readonly usedAmount: bigint; readonly limitAmount: bigint } | null,
    reading: QuotaReading,
  ): boolean {
    if (!shouldSurface(reading.severity)) {
      return false;
    }

    if (!previous) {
      return true;
    }

    const previousSeverity = classifyQuota(
      reading.resource,
      previous.usedAmount,
      previous.limitAmount,
    ).severity;

    return previousSeverity !== reading.severity;
  }
}

/**
 * A quota reading could not be obtained.
 *
 * Surfaced, never guessed — the limit is not assumed to be satisfied.
 */
export class QuotaObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
