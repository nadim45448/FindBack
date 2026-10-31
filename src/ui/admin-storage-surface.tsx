'use client';

/**
 * The administrator's storage-usage surface — image-handling §4.
 *
 * ## Why this is a page and not a fifth dashboard tile
 *
 * §15.1 freezes the dashboard at **four tiles**, and the story's criteria
 * enumerate the absences as load-bearing — "no `Reports to edit` tile" and
 * "no audit tile" are criteria, not accidents. A storage tile would be a
 * fifth tile on a surface whose whole job is routing into the four
 * operational queues, and it would break a frozen contract.
 *
 * So the budget has **its own page** — `/admin/storage` — and the dashboard
 * is untouched.
 *
 * ## What the administrator sees
 *
 * **The situation, the numbers, and where the lines are.** image-handling §4
 * says to surface *"current bytes … and remaining headroom"* and to warn at
 * 70% and 90%. So the page shows:
 *
 * - the **headline** — what the situation *is*, in a sentence;
 * - the **numbers** — bytes used, bytes remaining, and the budget;
 * - the **lines** — the 70% and 90% thresholds, so an administrator who
 *   sees "92% used" knows where 90% was.
 *
 * ## The numbers come from the domain, not from this component
 *
 * `buildStorageUsageView` and `storageUsageHeadline` are the domain's. This
 * component renders what they say and adds nothing of its own — so the
 * warning an administrator reads and the refusal an uploader meets come from
 * the same arithmetic, and cannot drift.
 *
 * ## A failed read shows no number
 *
 * When the read failed there is no usage to show, so the page shows its
 * error state. **It never shows "0 bytes used"** — zero is a fact about the
 * budget, and a failed read is not a fact.
 */

import {
  formatBytes,
  STORAGE_CRITICAL_PERCENT,
  STORAGE_WARNING_PERCENT,
  storageUsageHeadline,
  type StorageUsageView,
} from '@/domain/administration';

import { GO_BACK, TRY_AGAIN } from './admin-copy';

/** The surface's props. */
export interface AdminStorageSurfaceProps {
  /** The budget, when it could be read. */
  readonly usage: StorageUsageView | null;
  /** The error, when the read failed. */
  readonly error?: string | undefined;
  /** Where the error state's "Go back" link goes. */
  readonly backHref?: string | undefined;
}

/**
 * The administrator's storage-usage surface.
 */
export function AdminStorageSurface({
  usage,
  error,
  backHref = '/admin',
}: AdminStorageSurfaceProps): React.JSX.Element {
  if (error) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Image storage</h1>

        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>

        <p className="button-row">
          <button type="button" className="button button--primary">
            {TRY_AGAIN}
          </button>

          <a href={backHref} className="button button--secondary">
            {GO_BACK}
          </a>
        </p>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Image storage</h1>

        {/*
          **A skeleton, not a zero.** A budget of zero bytes used is a fact
          about the budget, and a skeleton that rendered "0 bytes" would be
          indistinguishable from one — so the loading state renders a bar,
          not a number.
        */}
        <div className="admin-tiles" role="status" aria-label="Loading the storage usage">
          <div className="admin-tile admin-tile--skeleton">
            <span className="admin-tile__label admin-tile__skeleton-bar" />
            <span className="admin-tile__count admin-tile__skeleton-bar" />
          </div>
        </div>
      </div>
    );
  }

  const percent = Math.round(usage.usedFraction * 100);

  return (
    <div className="form-column">
      <h1 className="hero__title">Image storage</h1>

      {/*
        **The headline is `role="status"`.** The administrator's page may be
        open when the budget crosses a threshold, and the headline is what
        says so.
      */}
      <div role="status">
        <p className="hero__subtitle">{storageUsageHeadline(usage)}</p>
      </div>

      <dl className="admin-detail-list">
        <dt>Used</dt>
        <dd className="admin-detail-list__value admin-tile__count--tabular">
          {formatBytes(usage.usedBytes)}
        </dd>

        <dt>Remaining</dt>
        <dd className="admin-detail-list__value admin-tile__count--tabular">
          {formatBytes(usage.remainingBytes)}
        </dd>

        <dt>Budget</dt>
        <dd className="admin-detail-list__value admin-tile__count--tabular">
          {formatBytes(usage.quotaBytes)}
        </dd>

        <dt>In use</dt>
        <dd className="admin-detail-list__value admin-tile__count--tabular">{percent}%</dd>
      </dl>

      {/*
        **The lines are named.** An administrator who sees "92% used" and is
        not told that 90% is a line has to guess where it is — and the
        refusal at 100% is the one that matters.
      */}
      <p className="admin-note">
        {`You are warned at ${STORAGE_WARNING_PERCENT}% and ${STORAGE_CRITICAL_PERCENT}% of the budget. Uploads are refused at 100%.`}
      </p>

      {usage.needsAttention ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{storageUsageHeadline(usage)}</p>
        </div>
      ) : null}
    </div>
  );
}
