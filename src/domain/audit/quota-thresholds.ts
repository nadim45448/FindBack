/**
 * Quota thresholds against the verified free-tier limits.
 *
 * A resource has exactly two warning thresholds (70%, 90%) and one refusal
 * threshold (100%). **Only Blob storage refuses** — every other resource
 * warns, because a $0 budget makes every escalation path a purchase.
 *
 * A quota condition may never cause a purchase, a plan upgrade, or an
 * automatic scale-out. Surfacing the condition is the entire response
 * (ADR-4).
 *
 * Pure — no I/O, no framework imports.
 */

/** The resources monitored against a verified free-tier limit. */
export type QuotaResource =
  | 'blob_storage_bytes'
  | 'blob_simple_operations'
  | 'blob_advanced_operations'
  | 'blob_data_transfer_bytes'
  | 'blob_fast_origin_transfer_bytes'
  | 'function_invocations'
  | 'database_storage_bytes';

/** The only resource that refuses rather than warns. */
export const REFUSING_RESOURCES: readonly QuotaResource[] = ['blob_storage_bytes'];

/** The warning thresholds. */
export const WARN_THRESHOLD = 0.7;
export const CRITICAL_THRESHOLD = 0.9;
export const REFUSE_THRESHOLD = 1.0;

/** A verified free-tier limit. */
export interface QuotaLimit {
  readonly resource: QuotaResource;
  readonly limitAmount: bigint;
  /** Whether reaching the limit refuses the action or only warns. */
  readonly refuses: boolean;
}

/**
 * The verified Vercel Hobby limits (`tech-stack.md`).
 *
 * The Blob storage limit is the binding one: 1 GB, and the PRD's 5 MB per
 * image allowance cannot be met within it without active management.
 */
export const VERCEL_HOBBY_LIMITS: readonly QuotaLimit[] = [
  { resource: 'blob_storage_bytes', limitAmount: 1_000_000_000n, refuses: true },
  { resource: 'blob_simple_operations', limitAmount: 10_000n, refuses: false },
  { resource: 'blob_advanced_operations', limitAmount: 2_000n, refuses: false },
  { resource: 'blob_data_transfer_bytes', limitAmount: 10_000_000_000n, refuses: false },
  { resource: 'blob_fast_origin_transfer_bytes', limitAmount: 10_000_000_000n, refuses: false },
  { resource: 'function_invocations', limitAmount: 1_000_000n, refuses: false },
  { resource: 'database_storage_bytes', limitAmount: 1_000_000_000n, refuses: false },
];

/** The limit configured for a resource, if any. */
export function findLimit(
  resource: QuotaResource,
  limits: readonly QuotaLimit[],
): QuotaLimit | undefined {
  return limits.find((limit) => limit.resource === resource);
}

/** Where a reading sits against its thresholds. */
export type QuotaSeverity = 'ok' | 'warn' | 'critical' | 'refused';

/** A reading against a limit. */
export interface QuotaReading {
  readonly resource: QuotaResource;
  readonly usedAmount: bigint;
  readonly limitAmount: bigint;
  /** The used-to-limit ratio, as a fraction. */
  readonly ratio: number;
  readonly severity: QuotaSeverity;
  /** True when the reading refuses the action rather than warning. */
  readonly refuses: boolean;
}

/**
 * Classify a reading against its thresholds.
 *
 * A limit of zero would make the ratio undefined; it is treated as fully
 * used, which refuses.
 */
export function classifyQuota(
  resource: QuotaResource,
  usedAmount: bigint,
  limitAmount: bigint,
): QuotaReading {
  const ratio = limitAmount === 0n ? 1 : Number(usedAmount) / Number(limitAmount);
  const limit = findLimit(resource, VERCEL_HOBBY_LIMITS);
  const refuses = limit?.refuses ?? false;

  let severity: QuotaSeverity;
  if (ratio >= REFUSE_THRESHOLD) {
    severity = 'refused';
  } else if (ratio >= CRITICAL_THRESHOLD) {
    severity = 'critical';
  } else if (ratio >= WARN_THRESHOLD) {
    severity = 'warn';
  } else {
    severity = 'ok';
  }

  return {
    resource,
    usedAmount,
    limitAmount,
    ratio,
    severity,
    // Only a resource that refuses at its limit refuses the action, and only
    // once it is actually at the limit.
    refuses: refuses && severity === 'refused',
  };
}

/**
 * True when a severity is one that should be surfaced to the owner.
 */
export function shouldSurface(severity: QuotaSeverity): boolean {
  return severity !== 'ok';
}
