/**
 * The storage-usage view's suite.
 *
 * ## What this suite asserts
 *
 * **That the administrator is told the situation, not the arithmetic.** The
 * view's job is to answer "should I act?" — and the headline is what does
 * that. A view that reported only byte counts would leave the administrator
 * to compute the percentage themselves, which is the one thing a dashboard
 * exists to avoid.
 *
 * **That the warning bands are the write path's bands.** The uploader meets
 * a refusal at 100%; the administrator must be warned at 70% and 90%. If
 * these two sets of numbers were written down twice, they would drift — and
 * the drift would be invisible until an upload was refused with no warning
 * having been given. So this suite asserts the view's thresholds against
 * the domain's constants, not against literals.
 *
 * **That a full budget is "full", not "over".** A deployment already past
 * its quota has zero headroom and a fraction of exactly 1 — a percentage
 * above 100% would be a number the interface has no way to render.
 */

import { describe, expect, it } from 'vitest';

import {
  QUOTA_CRITICAL_THRESHOLD,
  QUOTA_WARNING_THRESHOLD,
} from '@/domain/listings';

import {
  buildStorageUsageView,
  formatBytes,
  storageUsageHeadline,
  STORAGE_CRITICAL_PERCENT,
  STORAGE_WARNING_PERCENT,
} from './storage-usage';

/** The quota the views are built against. */
const QUOTA = 1024 * 1024 * 1024;

describe('the storage usage view', () => {
  it('reports the bytes used, the bytes remaining, and the budget', () => {
    const view = buildStorageUsageView({ usedBytes: 400 * 1024 * 1024, quotaBytes: QUOTA });

    expect(view.usedBytes).toBe(400 * 1024 * 1024);
    expect(view.quotaBytes).toBe(QUOTA);
    expect(view.remainingBytes).toBe(QUOTA - 400 * 1024 * 1024);
  });

  it('reports the budget as within its limit when it is', () => {
    const view = buildStorageUsageView({ usedBytes: 400 * 1024 * 1024, quotaBytes: QUOTA });

    expect(view.status).toBe('ok');
    expect(view.needsAttention).toBe(false);
  });

  it('asks for attention at the warning band', () => {
    const view = buildStorageUsageView({
      usedBytes: Math.ceil(QUOTA * QUOTA_WARNING_THRESHOLD),
      quotaBytes: QUOTA,
    });

    expect(view.status).toBe('warning');
    expect(view.needsAttention).toBe(true);
  });

  it('asks for attention at the critical band', () => {
    const view = buildStorageUsageView({
      usedBytes: Math.ceil(QUOTA * QUOTA_CRITICAL_THRESHOLD),
      quotaBytes: QUOTA,
    });

    expect(view.status).toBe('critical');
    expect(view.needsAttention).toBe(true);
  });

  it('asks for attention when the budget is spent', () => {
    const view = buildStorageUsageView({ usedBytes: QUOTA, quotaBytes: QUOTA });

    expect(view.status).toBe('refused');
    expect(view.needsAttention).toBe(true);
  });

  it('never reports a fraction above one', () => {
    // **A deployment already past its quota is *at* its quota.** A
    // percentage above 100% would be a number the interface cannot render,
    // and it would say the budget was exceeded when what is true is that it
    // is exhausted.
    const view = buildStorageUsageView({ usedBytes: QUOTA * 2, quotaBytes: QUOTA });

    expect(view.usedFraction).toBe(1);
  });

  it('never reports negative headroom', () => {
    const view = buildStorageUsageView({ usedBytes: QUOTA * 2, quotaBytes: QUOTA });

    expect(view.remainingBytes).toBe(0);
  });

  it('treats a budget of zero as full, not as unlimited', () => {
    // **A zero quota refuses everything** — the write path's rule. A view
    // that read it as "no limit" would tell the administrator all is well
    // while every upload was being refused.
    const view = buildStorageUsageView({ usedBytes: 0, quotaBytes: 0 });

    expect(view.status).toBe('refused');
    expect(view.usedFraction).toBe(1);
  });
});

describe('the storage usage headline', () => {
  it('says the budget is within its limit', () => {
    const view = buildStorageUsageView({ usedBytes: 100 * 1024 * 1024, quotaBytes: QUOTA });

    expect(storageUsageHeadline(view)).toContain('within its budget');
  });

  it('says the budget is filling up at the warning band', () => {
    const view = buildStorageUsageView({
      usedBytes: Math.ceil(QUOTA * QUOTA_WARNING_THRESHOLD),
      quotaBytes: QUOTA,
    });

    expect(storageUsageHeadline(view)).toContain('filling up');
  });

  it('says the budget is nearly full at the critical band', () => {
    const view = buildStorageUsageView({
      usedBytes: Math.ceil(QUOTA * QUOTA_CRITICAL_THRESHOLD),
      quotaBytes: QUOTA,
    });

    expect(storageUsageHeadline(view)).toContain('nearly full');
  });

  it('says uploads are being refused when the budget is spent', () => {
    const view = buildStorageUsageView({ usedBytes: QUOTA, quotaBytes: QUOTA });

    // **The headline names the consequence.** The administrator needs to
    // know that uploads are failing, not merely that a number went up.
    expect(storageUsageHeadline(view)).toContain('Uploads are being refused');
  });

  it('carries the percentage', () => {
    const view = buildStorageUsageView({ usedBytes: QUOTA / 2, quotaBytes: QUOTA });

    expect(storageUsageHeadline(view)).toContain('50%');
  });
});

describe('the storage thresholds', () => {
  it('names the warning threshold as the write path names it', () => {
    expect(STORAGE_WARNING_PERCENT).toBe(Math.round(QUOTA_WARNING_THRESHOLD * 100));
  });

  it('names the critical threshold as the write path names it', () => {
    expect(STORAGE_CRITICAL_PERCENT).toBe(Math.round(QUOTA_CRITICAL_THRESHOLD * 100));
  });

  it('names seventy and ninety percent', () => {
    expect(STORAGE_WARNING_PERCENT).toBe(70);
    expect(STORAGE_CRITICAL_PERCENT).toBe(90);
  });
});

describe('the byte formatting', () => {
  it('formats bytes as bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('shows the difference between one gigabyte and just over it', () => {
    // **One decimal is the point.** "1 GB" and "1.1 GB" are different
    // situations — the second is over a warning line the first is not — and
    // rounding both to "1 GB" would hide it.
    expect(formatBytes(1024 * 1024 * 1024)).not.toBe(formatBytes(1.1 * 1024 * 1024 * 1024));
  });
});
