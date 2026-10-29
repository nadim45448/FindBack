/**
 * The storage quota — the 1 GB ceiling and the refusal it produces.
 *
 * **The load-bearing assertion is that the quota is checked before
 * writing**, on the *would-be* total rather than the current one. An upload
 * that exactly fills the remaining space is allowed; one byte more is
 * refused.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  DEFAULT_STORAGE_QUOTA_BYTES,
  QUOTA_CRITICAL_THRESHOLD,
  QUOTA_WARNING_THRESHOLD,
  assertWithinQuota,
  classifyQuota,
  exceedsQuota,
  quotaBytesFromEnv,
  remainingQuotaBytes,
  type StorageQuotaState,
} from './image-quota';

const GIGABYTE = 1024 * 1024 * 1024;

/** A state of `used` bytes against a 1 GB quota. */
function stateAt(used: number, quota = GIGABYTE): StorageQuotaState {
  return { usedBytes: used, quotaBytes: quota };
}

describe('the storage quota', () => {
  it('defaults to the one gigabyte free-tier limit', () => {
    expect(DEFAULT_STORAGE_QUOTA_BYTES).toBe(GIGABYTE);
  });

  it('is ok below the warning threshold', () => {
    expect(classifyQuota(stateAt(QUOTA_WARNING_THRESHOLD * GIGABYTE - 1))).toBe('ok');
  });

  it('warns at seventy percent', () => {
    expect(classifyQuota(stateAt(QUOTA_WARNING_THRESHOLD * GIGABYTE))).toBe('warning');
  });

  it('warns critically at ninety percent', () => {
    expect(classifyQuota(stateAt(QUOTA_CRITICAL_THRESHOLD * GIGABYTE))).toBe('critical');
  });

  it('refuses at one hundred percent', () => {
    expect(classifyQuota(stateAt(GIGABYTE))).toBe('refused');
  });

  it('refuses when the quota is exceeded', () => {
    expect(classifyQuota(stateAt(GIGABYTE + 1))).toBe('refused');
  });

  it('refuses everything when the quota is not positive', () => {
    // **An unconfigured quota is not an unlimited quota.** A zero quota
    // refusing every upload is the safe reading of "there is no budget".
    expect(classifyQuota(stateAt(0, 0))).toBe('refused');
    expect(classifyQuota(stateAt(0, -1))).toBe('refused');
  });

  it('reports the remaining headroom, never a negative number', () => {
    expect(remainingQuotaBytes(stateAt(100, 1000))).toBe(900);
    expect(remainingQuotaBytes(stateAt(1500, 1000))).toBe(0);
  });
});

describe('the quota check before writing', () => {
  it('allows an upload that exactly fills the remaining space', () => {
    const state = stateAt(900, 1000);

    expect(exceedsQuota(state, 100)).toBe(false);
    expect(() => assertWithinQuota(state, 100)).not.toThrow();
  });

  it('refuses an upload one byte over the remaining space', () => {
    const state = stateAt(900, 1000);

    expect(exceedsQuota(state, 101)).toBe(true);
  });

  it('refuses with the image field named', () => {
    // **The refusal is a validation failure on the image field**, so the
    // route answers 400 naming the field — the same shape as every other
    // image rejection.
    expect(() => assertWithinQuota(stateAt(1000, 1000), 1)).toThrow(ValidationError);

    try {
      assertWithinQuota(stateAt(1000, 1000), 1);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('image');
    }
  });

  it('never deletes an existing image to make room', () => {
    // **The quota refusal touches nothing.** No existing image is deleted,
    // and no upgrade is performed — ADR-4 requires the failure to be loud
    // rather than silent, and image-handling §4 forbids the auto-delete
    // explicitly. The refusal is a throw; it has no side effect that could
    // remove an image.
    const state = stateAt(1000, 1000);

    expect(() => assertWithinQuota(state, 1)).toThrow();

    // The state is unchanged — the refusal did not "make room".
    expect(state.usedBytes).toBe(1000);
    expect(state.quotaBytes).toBe(1000);
  });
});

describe('the quota from the environment', () => {
  it('reads a configured quota', () => {
    expect(quotaBytesFromEnv({ BLOB_STORAGE_QUOTA_BYTES: '2048' })).toBe(2048);
  });

  it('falls back to the default when the value is absent', () => {
    expect(quotaBytesFromEnv({})).toBe(DEFAULT_STORAGE_QUOTA_BYTES);
  });

  it('falls back to the default when the value is blank', () => {
    expect(quotaBytesFromEnv({ BLOB_STORAGE_QUOTA_BYTES: '   ' })).toBe(
      DEFAULT_STORAGE_QUOTA_BYTES,
    );
  });

  it('falls back to the default when the value is not a number', () => {
    // **A misconfigured quota must not silently disable the check**, and it
    // must not silently refuse every upload either.
    expect(quotaBytesFromEnv({ BLOB_STORAGE_QUOTA_BYTES: 'lots' })).toBe(
      DEFAULT_STORAGE_QUOTA_BYTES,
    );
  });

  it('falls back to the default when the value is not positive', () => {
    expect(quotaBytesFromEnv({ BLOB_STORAGE_QUOTA_BYTES: '0' })).toBe(
      DEFAULT_STORAGE_QUOTA_BYTES,
    );
    expect(quotaBytesFromEnv({ BLOB_STORAGE_QUOTA_BYTES: '-5' })).toBe(
      DEFAULT_STORAGE_QUOTA_BYTES,
    );
  });
});
