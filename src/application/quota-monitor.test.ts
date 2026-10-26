import { describe, expect, it } from 'vitest';

import { QuotaMonitor, QuotaObservationError } from './quota-monitor';
import type { QuotaLimitProvider } from './ports/quota-limit-provider';
import type { QuotaSnapshot, QuotaSnapshotRepository } from './ports/quota-snapshot-repository';
import type { QuotaUsageReader } from './ports/quota-usage-reader';
import { VERCEL_HOBBY_LIMITS } from '@/domain/audit';
import { QuotaExceededError } from '@/lib/errors';

/** The static limits. */
const limits: QuotaLimitProvider = {
  async limitFor(resource) {
    return VERCEL_HOBBY_LIMITS.find((limit) => limit.resource === resource);
  },
  async allLimits() {
    return VERCEL_HOBBY_LIMITS;
  },
};

/** A usage reader that reports a fixed amount. */
function usageReader(usedAmount: bigint): QuotaUsageReader {
  return {
    async usage(resource) {
      return { resource, usedAmount };
    },
  };
}

/** A snapshot repository that remembers what was appended. */
class SpySnapshotRepository implements QuotaSnapshotRepository {
  readonly appended: Array<{
    resource: string;
    usedAmount: bigint;
    limitAmount: bigint;
    observedAt: Date;
  }> = [];

  constructor(private readonly latest: QuotaSnapshot | null = null) {}

  async append(snapshot: {
    resource: string;
    usedAmount: bigint;
    limitAmount: bigint;
    observedAt: Date;
  }): Promise<QuotaSnapshot> {
    this.appended.push(snapshot);

    return {
      id: `snapshot-${this.appended.length}`,
      ...snapshot,
    };
  }

  async findLatest(): Promise<QuotaSnapshot | null> {
    return this.latest;
  }
}

describe('QuotaMonitor', () => {
  it('refuses an upload at the Blob storage limit', async () => {
    const monitor = new QuotaMonitor(
      limits,
      usageReader(1_000_000_000n),
      new SpySnapshotRepository(),
    );

    await expect(monitor.check('blob_storage_bytes')).rejects.toThrow(QuotaExceededError);
  });

  it('refuses an upload that would cross the Blob storage limit', async () => {
    const monitor = new QuotaMonitor(
      limits,
      usageReader(999_999_999n),
      new SpySnapshotRepository(),
    );

    await expect(monitor.check('blob_storage_bytes', 1n)).rejects.toThrow(QuotaExceededError);
  });

  it('allows an upload below the limit', async () => {
    const monitor = new QuotaMonitor(
      limits,
      usageReader(500_000_000n),
      new SpySnapshotRepository(),
    );

    const result = await monitor.check('blob_storage_bytes');

    expect(result.decision).toBe('allowed');
    expect(result.reading.severity).toBe('ok');
  });

  it('warns but never refuses for a resource that does not refuse', async () => {
    const monitor = new QuotaMonitor(limits, usageReader(1_000_000n), new SpySnapshotRepository());

    const result = await monitor.check('function_invocations');

    expect(result.decision).toBe('allowed');
    expect(result.reading.severity).toBe('refused');
    expect(result.reading.refuses).toBe(false);
  });

  it('records a snapshot for every reading', async () => {
    const snapshots = new SpySnapshotRepository();
    const monitor = new QuotaMonitor(limits, usageReader(500n), snapshots);

    await monitor.observe('blob_storage_bytes');

    expect(snapshots.appended).toHaveLength(1);
    expect(snapshots.appended[0]?.resource).toBe('blob_storage_bytes');
    expect(snapshots.appended[0]?.usedAmount).toBe(500n);
    expect(snapshots.appended[0]?.limitAmount).toBe(1_000_000_000n);
  });

  it('surfaces a threshold crossing once, not on every reading', async () => {
    // The Blob storage limit is 1 GB, so the warning thresholds sit at
    // 700 MB and 900 MB.
    const previous: QuotaSnapshot = {
      id: 'snapshot-1',
      resource: 'blob_storage_bytes',
      usedAmount: 700_000_000n,
      limitAmount: 1_000_000_000n,
      observedAt: new Date('2026-10-26T09:00:00Z'),
    };

    // Still above 70% — the same condition, already surfaced.
    const first = await new QuotaMonitor(
      limits,
      usageReader(710_000_000n),
      new SpySnapshotRepository(previous),
    ).observe('blob_storage_bytes');

    expect(first.isNewCrossing).toBe(false);

    // Now above 90% — a new threshold crossed.
    const second = await new QuotaMonitor(
      limits,
      usageReader(900_000_000n),
      new SpySnapshotRepository(previous),
    ).observe('blob_storage_bytes');

    expect(second.isNewCrossing).toBe(true);
  });

  it('surfaces the first reading of a resource as a crossing', async () => {
    const monitor = new QuotaMonitor(
      limits,
      usageReader(800_000_000n),
      new SpySnapshotRepository(null),
    );

    const result = await monitor.observe('blob_storage_bytes');

    expect(result.isNewCrossing).toBe(true);
  });

  it('does not surface a reading below the first threshold', async () => {
    const monitor = new QuotaMonitor(
      limits,
      usageReader(100_000_000n),
      new SpySnapshotRepository(null),
    );

    const result = await monitor.observe('blob_storage_bytes');

    expect(result.isNewCrossing).toBe(false);
  });

  it('surfaces an unknown resource rather than guessing a limit', async () => {
    const unknownLimits: QuotaLimitProvider = {
      async limitFor() {
        return undefined;
      },
      async allLimits() {
        return [];
      },
    };

    const monitor = new QuotaMonitor(unknownLimits, usageReader(0n), new SpySnapshotRepository());

    await expect(monitor.check('blob_storage_bytes')).rejects.toThrow(QuotaObservationError);
  });
});
