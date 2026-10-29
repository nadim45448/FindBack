/**
 * The blob storage quota — the 1 GB ceiling, and the refusal it produces.
 *
 * **The budget is enforced continuously, not at month end** (image-handling
 * §4). Blob metering averages 15-minute snapshots across the month, so a
 * check that ran only at the end of the month would discover the breach
 * after the breach — and ADR-4 is explicit that exceeding a verified
 * free-tier limit must fail loudly rather than degrade silently.
 *
 * **The refusal is a business outcome, not a crash.** An upload that would
 * exceed the quota is rejected with a clear administrator-visible error.
 * Nothing is silently accepted, nothing is auto-upgraded, and **no existing
 * image is deleted** — deleting a member's image to make room for another's
 * would be a silent loss of data, and image-handling §4 forbids it
 * explicitly.
 *
 * **The thresholds are 70% and 90% for warning, 100% for refusal.** They
 * live here as constants because they are a property of the budget, not of
 * any one deployment's configuration — the *quota itself* is configuration
 * (ADR-4 notes the byte quota is an Operations config value), and a
 * deployment may set it lower, but the warning bands are the framework's.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The default quota: Vercel Blob's 1 GB free-tier storage limit. */
export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

/** The warning band: 70% of the quota. */
export const QUOTA_WARNING_THRESHOLD = 0.7;

/** The second warning band: 90% of the quota. */
export const QUOTA_CRITICAL_THRESHOLD = 0.9;

/** The outcome of a quota check. */
export type QuotaStatus = 'ok' | 'warning' | 'critical' | 'refused';

/** The state of the storage budget, as the quota check sees it. */
export interface StorageQuotaState {
  /** The bytes currently stored. */
  readonly usedBytes: number;
  /** The bytes the deployment may store. */
  readonly quotaBytes: number;
}

/**
 * Classify the storage budget.
 *
 * **The status is a pure function of the two numbers.** The decision of
 * whether an upload fits is arithmetic, and arithmetic in one place cannot
 * drift between the route that refuses and the monitor that warns.
 */
export function classifyQuota(state: StorageQuotaState): QuotaStatus {
  if (state.quotaBytes <= 0) {
    // **A zero or negative quota refuses everything.** A deployment with no
    // quota configured must not be read as "unlimited" — an unbounded
    // budget is how a free-tier limit gets hit without anyone noticing.
    return 'refused';
  }

  const ratio = state.usedBytes / state.quotaBytes;

  if (ratio >= 1) {
    return 'refused';
  }

  if (ratio >= QUOTA_CRITICAL_THRESHOLD) {
    return 'critical';
  }

  if (ratio >= QUOTA_WARNING_THRESHOLD) {
    return 'warning';
  }

  return 'ok';
}

/**
 * The bytes still available.
 *
 * **Never negative.** A deployment that is already over its quota has zero
 * headroom, not negative headroom — and a negative number would let a
 * comparison like `uploadBytes <= headroom` behave confusingly.
 */
export function remainingQuotaBytes(state: StorageQuotaState): number {
  return Math.max(0, state.quotaBytes - state.usedBytes);
}

/**
 * True when storing `incomingBytes` more would exceed the quota.
 *
 * **Checked before writing** (image-handling §4). The check is on the
 * *would-be* total, so an upload that exactly fills the remaining space is
 * allowed and one byte more is refused.
 */
export function exceedsQuota(state: StorageQuotaState, incomingBytes: number): boolean {
  return state.usedBytes + incomingBytes > state.quotaBytes;
}

/**
 * The refusal an over-quota upload gets.
 *
 * **A `ValidationError` on the `image` field**, so the route maps it to a
 * 400 naming the offending field — the same shape as every other image
 * rejection, so the member sees one consistent answer.
 *
 * @throws {ValidationError} when the upload would exceed the quota.
 */
export function assertWithinQuota(
  state: StorageQuotaState,
  incomingBytes: number,
): void {
  if (exceedsQuota(state, incomingBytes)) {
    throw new ValidationError(
      'image',
      'Image storage is at its limit for this deployment. Please try again later.',
    );
  }
}

/**
 * The quota, read from the environment.
 *
 * **An unparseable or absent value is the default, not zero.** A
 * misconfigured quota must not silently disable the check, and it must not
 * silently refuse every upload either — the default is the verified
 * free-tier limit, which is the budget the deployment is actually on.
 *
 * The parameter is a plain record rather than `NodeJS.ProcessEnv`, because
 * the function reads exactly one key and a test should be able to supply
 * that key without satisfying the whole environment's type.
 */
export function quotaBytesFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.BLOB_STORAGE_QUOTA_BYTES;

  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_STORAGE_QUOTA_BYTES;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STORAGE_QUOTA_BYTES;
  }

  return parsed;
}
