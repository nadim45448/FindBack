import { describe, expect, it } from 'vitest';

import { VERCEL_HOBBY_LIMITS, classifyQuota, findLimit, shouldSurface } from './quota-thresholds';

/**
 * Quota warn at 70% and 90%. **Only Blob storage refuses** at 100% — every
 * other resource warns, because a $0 budget makes every escalation path a
 * purchase (ADR-4).
 */
describe('quota thresholds', () => {
  it('reports a reading below 70% as ok', () => {
    const reading = classifyQuota('blob_storage_bytes', 600n, 1000n);

    expect(reading.severity).toBe('ok');
    expect(reading.refuses).toBe(false);
  });

  it('warns at 70%', () => {
    expect(classifyQuota('blob_storage_bytes', 700n, 1000n).severity).toBe('warn');
  });

  it('raises to critical at 90%', () => {
    expect(classifyQuota('blob_storage_bytes', 900n, 1000n).severity).toBe('critical');
  });

  it('refuses Blob storage at its limit', () => {
    const reading = classifyQuota('blob_storage_bytes', 1000n, 1000n);

    expect(reading.severity).toBe('refused');
    expect(reading.refuses).toBe(true);
  });

  it('refuses Blob storage beyond its limit', () => {
    expect(classifyQuota('blob_storage_bytes', 1200n, 1000n).refuses).toBe(true);
  });

  it('warns but never refuses for a non-refusing resource', () => {
    const reading = classifyQuota('function_invocations', 1_000_000n, 1_000_000n);

    expect(reading.severity).toBe('refused');
    expect(reading.refuses).toBe(false);
  });

  it('treats a zero limit as fully used', () => {
    expect(classifyQuota('blob_storage_bytes', 0n, 0n).severity).toBe('refused');
  });

  it('surfaces every severity except ok', () => {
    expect(shouldSurface('ok')).toBe(false);
    expect(shouldSurface('warn')).toBe(true);
    expect(shouldSurface('critical')).toBe(true);
    expect(shouldSurface('refused')).toBe(true);
  });
});

describe('verified free-tier limits', () => {
  it('marks only Blob storage as refusing', () => {
    const refusing = VERCEL_HOBBY_LIMITS.filter((limit) => limit.refuses);

    expect(refusing).toHaveLength(1);
    expect(refusing[0]?.resource).toBe('blob_storage_bytes');
  });

  it('carries the verified Blob storage limit of 1 GB', () => {
    expect(findLimit('blob_storage_bytes', VERCEL_HOBBY_LIMITS)?.limitAmount).toBe(1_000_000_000n);
  });

  it('covers every monitored resource', () => {
    const resources = VERCEL_HOBBY_LIMITS.map((limit) => limit.resource);

    expect(resources).toEqual([
      'blob_storage_bytes',
      'blob_simple_operations',
      'blob_advanced_operations',
      'blob_data_transfer_bytes',
      'blob_fast_origin_transfer_bytes',
      'function_invocations',
      'database_storage_bytes',
    ]);
  });
});
