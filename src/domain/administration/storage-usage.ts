/**
 * The administrator's view of the blob storage budget — image-handling §4.
 *
 * ## Why this exists
 *
 * The budget is **enforced continuously** — every upload is checked against
 * it before the bytes are written — but a budget nobody can see is a budget
 * nobody can act on. image-handling §4 names three things the administrator
 * must be able to see:
 *
 * > *Surface current bytes, this month's Simple/Advanced operation counts, and
 * > remaining headroom to administrators*
 *
 * and two thresholds at which to be told:
 *
 * > *Warn at 70% and 90% of quota. Refuse at 100%.*
 *
 * The **refusal** at 100% is implemented where the upload happens. The
 * **warning** at 70% and 90% has to live somewhere an administrator looks —
 * and this module is that somewhere's domain.
 *
 * ## What this module decides
 *
 * **The status, the headroom, and the percentages.** The numbers come from
 * the store; the *meaning* of a number is this module's business, and it is
 * pure arithmetic over a closed set of thresholds.
 *
 * **The warning bands are the framework's, the quota is configuration.** The
 * quota itself is a deployment's budget (ADR-4 notes the byte quota is an
 * Operations config value), and a deployment may set it lower — but the
 * bands at which the administrator is warned are the same everywhere. So the
 * bands are constants here, and the quota is a number the caller supplies.
 *
 * ## What this module does not do
 *
 * **It does not decide whether an upload fits.** That is
 * `image-quota.ts`'s job, and that module is on the write path — where a
 * refusal has to happen *before* the bytes are written. This module is on the
 * read path, where the question is "what should the administrator be told?".
 *
 * **Two answers to the same question would drift.** The bands live in
 * `image-quota.ts` as `QUOTA_WARNING_THRESHOLD` and
 * `QUOTA_CRITICAL_THRESHOLD`, and this module imports them rather than
 * writing its own copies — so the warning an administrator sees and the
 * refusal an uploader meets cannot disagree about where 70% is.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  classifyQuota,
  remainingQuotaBytes,
  QUOTA_CRITICAL_THRESHOLD,
  QUOTA_WARNING_THRESHOLD,
  type QuotaStatus,
  type StorageQuotaState,
} from '@/domain/listings';

/**
 * The administrator's view of the storage budget.
 */
export interface StorageUsageView {
  /** The bytes currently stored. */
  readonly usedBytes: number;
  /** The bytes the deployment may store. */
  readonly quotaBytes: number;
  /** The bytes still available. Never negative. */
  readonly remainingBytes: number;
  /**
   * How full the budget is, as a fraction between 0 and 1.
   *
   * **Never above 1.** A deployment that is already over its budget is *at*
   * its budget, and a percentage above 100% would be a number the interface
   * has no way to render.
   */
  readonly usedFraction: number;
  /** The budget's status: `ok`, `warning`, `critical`, or `refused`. */
  readonly status: QuotaStatus;
  /** Whether the administrator should be told about the budget at all. */
  readonly needsAttention: boolean;
}

/**
 * Build the administrator's view of the storage budget.
 *
 * **The status comes from the same classifier the write path uses.** A
 * warning band that meant one thing to the uploader and another to the
 * administrator would be worse than no band at all — the administrator would
 * be told everything is fine while the uploader is being refused.
 */
export function buildStorageUsageView(state: StorageQuotaState): StorageUsageView {
  const status = classifyQuota(state);

  const usedFraction =
    state.quotaBytes <= 0
      ? 1
      : Math.min(1, Math.max(0, state.usedBytes / state.quotaBytes));

  return {
    usedBytes: state.usedBytes,
    quotaBytes: state.quotaBytes,
    remainingBytes: remainingQuotaBytes(state),
    usedFraction,
    status,
    // **Attention is asked for from 70%.** Below that the budget is not
    // interesting, and a panel that always shouted would be shouted past.
    needsAttention:
      status === 'warning' || status === 'critical' || status === 'refused',
  };
}

/**
 * The headline the administrator sees.
 *
 * **The headline names the situation, not the arithmetic.** An administrator
 * needs to know *whether to act*, and "at 92% of the storage budget" says
 * that where "1,073,741,824 bytes" does not.
 */
export function storageUsageHeadline(view: StorageUsageView): string {
  const percent = Math.round(view.usedFraction * 100);

  if (view.status === 'refused') {
    return `Storage is full. Uploads are being refused (${percent}% of the budget used).`;
  }

  if (view.status === 'critical') {
    return `Storage is nearly full (${percent}% of the budget used). Uploads will be refused soon.`;
  }

  if (view.status === 'warning') {
    return `Storage is filling up (${percent}% of the budget used).`;
  }

  return `Storage is within its budget (${percent}% used).`;
}

/**
 * The two thresholds, as percentages.
 *
 * **Named here so the interface can show the administrator where the lines
 * are.** An administrator who sees "92% used" and is not told that 90% is a
 * line has to guess where it is.
 */
export const STORAGE_WARNING_PERCENT = Math.round(QUOTA_WARNING_THRESHOLD * 100);
export const STORAGE_CRITICAL_PERCENT = Math.round(QUOTA_CRITICAL_THRESHOLD * 100);

/**
 * Format a byte count for the administrator.
 *
 * **Binary units, one decimal, and a trailing unit.** "1.0 GB" is readable;
 * "1073741824 bytes" is not, and "1 GB" hides the difference between 1.0 GB
 * and 1.04 GB — which is the difference between "fine" and "over the line".
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];

  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;

  return `${rounded} ${units[unit]}`;
}
