import { describe, expect, it } from 'vitest';

import { AuditPayloadRejectedError } from './errors';
import { isAlwaysBarredField, looksLikeSecret, sanitizeForTrail } from './payload-sanitizer';

/**
 * The sanitizer is the FR-37 guard. It denies by default: a field is written
 * only when the event's catalog entry names it.
 */
describe('payload sanitizer', () => {
  it('accepts a field the catalog names for the event', () => {
    const result = sanitizeForTrail('report.created', {
      name: 'Blue backpack',
      category: 'electronics',
      type: 'found',
    });

    expect(result.fields).toEqual({
      name: 'Blue backpack',
      category: 'electronics',
      type: 'found',
    });
  });

  it('refuses a field the catalog does not name', () => {
    expect(() => sanitizeForTrail('claim.approved', { reason: 'because' })).toThrow(
      AuditPayloadRejectedError,
    );
  });

  it('refuses a credential field even when the event names other fields', () => {
    expect(() => sanitizeForTrail('report.created', { name: 'x', password: 'hunter2' })).toThrow(
      AuditPayloadRejectedError,
    );
  });

  it('refuses a token field', () => {
    expect(() => sanitizeForTrail('report.created', { token: 'abc' })).toThrow(
      AuditPayloadRejectedError,
    );
  });

  it('carries a catalog-named sensitive value on the trail', () => {
    const result = sanitizeForTrail('claim.submitted', {
      reason: 'It has my initials on the tag',
      identifyingDetails: 'Leather tag, brown',
    });

    expect(result.fields.reason).toBe('It has my initials on the tag');
    expect(result.sensitiveFieldsCarried).toEqual(['reason', 'identifyingDetails']);
  });

  it('refuses a secret-looking value in a field the catalog does not mark sensitive', () => {
    expect(() =>
      sanitizeForTrail('report.created', { name: '$2b$12$abcdefghijklmnopqrstuv' }),
    ).toThrow(AuditPayloadRejectedError);
  });

  it('refuses a secret-looking value in a sensitive field too', () => {
    // A credential must not slip in through a field that is normally allowed
    // to carry sensitive values.
    expect(() => sanitizeForTrail('claim.submitted', { reason: 'ghp_abcdefghijklmnop' })).toThrow(
      AuditPayloadRejectedError,
    );
  });

  it('refuses an empty payload for an event with no additional fields', () => {
    expect(sanitizeForTrail('claim.approved', {}).fields).toEqual({});
  });

  it('reports the offending field on the error', () => {
    try {
      sanitizeForTrail('claim.approved', { reason: 'because' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuditPayloadRejectedError);
      expect((error as AuditPayloadRejectedError).field).toBe('reason');
      expect((error as AuditPayloadRejectedError).eventType).toBe('claim.approved');
    }
  });
});

describe('credential detection', () => {
  it('always bars the credential field names', () => {
    expect(isAlwaysBarredField('password')).toBe(true);
    expect(isAlwaysBarredField('passwordHash')).toBe(true);
    expect(isAlwaysBarredField('sessionToken')).toBe(true);
    expect(isAlwaysBarredField('reason')).toBe(false);
  });

  it('recognises a bcrypt hash', () => {
    expect(looksLikeSecret('$2b$12$abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true);
  });

  it('recognises a long hex blob', () => {
    expect(looksLikeSecret('a'.repeat(64))).toBe(true);
  });

  it('recognises a JWT', () => {
    expect(looksLikeSecret('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123')).toBe(true);
  });

  it('recognises a prefixed secret', () => {
    expect(looksLikeSecret('sk_live_abcdefghijklmnop')).toBe(true);
  });

  it('does not mistake ordinary text for a secret', () => {
    expect(looksLikeSecret('It has my initials on the tag')).toBe(false);
    expect(looksLikeSecret('Blue backpack, near the library')).toBe(false);
  });

  it('ignores a non-string value', () => {
    expect(looksLikeSecret(42)).toBe(false);
    expect(looksLikeSecret(null)).toBe(false);
  });
});
