/**
 * The insert-only quota-snapshot repository.
 *
 * A snapshot is a reading, not a decision. It records what a resource was
 * using at a moment in time; it never triggers a purchase, a plan upgrade,
 * or an automatic scale-out.
 */

/**
 * An insert-only repository for quota snapshots.
 *
 * A snapshot is a standalone observation, not part of a caller's state-change
 * transaction, so `append` takes no transaction handle. It is still
 * insert-only: there is no update or delete method, and the database trigger
 * refuses both.
 */

/** A recorded usage reading. */
export interface QuotaSnapshot {
  readonly id: string;
  readonly resource: string;
  readonly usedAmount: bigint;
  readonly limitAmount: bigint;
  readonly observedAt: Date;
}

/** An insert-only repository for quota snapshots. */
export interface QuotaSnapshotRepository {
  /** Append one snapshot. */
  append(snapshot: {
    readonly resource: string;
    readonly usedAmount: bigint;
    readonly limitAmount: bigint;
    readonly observedAt: Date;
  }): Promise<QuotaSnapshot>;

  /** The most recent snapshot for a resource, for threshold-crossing detection. */
  findLatest(resource: string): Promise<QuotaSnapshot | null>;
}
