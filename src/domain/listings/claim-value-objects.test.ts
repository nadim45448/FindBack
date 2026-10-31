/**
 * The Claim value objects' suite.
 *
 * **Each value object refuses to construct from an invalid value.** That is
 * the property that makes the bounds structural: there is one constructor,
 * and it cannot be called with a value the PRD rejects.
 *
 * **The bounds are inclusive at both ends**, and that is asserted here at
 * each end — the story's edge cases are explicit ("Reason exactly 20 chars,
 * identifying details exactly 10 chars | Accepted at the boundary").
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  createClaimIdentifyingDetails,
  createClaimReason,
  createIdentifyingDetails,
  validateClaimDateLost,
} from '@/domain/listings';

describe('the claim reason', () => {
  it('accepts a reason of exactly 20 characters', () => {
    const reason = 'x'.repeat(20);

    expect(createClaimReason(reason).value).toBe(reason);
  });

  it('accepts a reason of exactly 1000 characters', () => {
    const reason = 'x'.repeat(1000);

    expect(createClaimReason(reason).value).toBe(reason);
  });

  it('refuses a reason of 19 characters', () => {
    expect(() => createClaimReason('x'.repeat(19))).toThrow(ValidationError);
  });

  it('refuses a reason of 1001 characters', () => {
    expect(() => createClaimReason('x'.repeat(1001))).toThrow(ValidationError);
  });

  it('refuses an empty reason', () => {
    expect(() => createClaimReason('')).toThrow(ValidationError);
  });

  it('refuses a whitespace-only reason, because the minimum length is not met by whitespace', () => {
    expect(() => createClaimReason('   ')).toThrow(ValidationError);
  });

  it('trims the surrounding whitespace', () => {
    expect(createClaimReason('  It is my brown wallet.  ').value).toBe('It is my brown wallet.');
  });

  it('counts code points, not UTF-16 code units', () => {
    // An emoji is one character to a member, even though it is two UTF-16
    // code units. The database's `char_length` agrees.
    const reason = '🔑'.repeat(1000);

    expect(createClaimReason(reason).value).toBe(reason);
    expect(() => createClaimReason(`${reason}x`)).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      createClaimReason('');
      expect.unreachable('The constructor should have thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('reason');
    }
  });
});

describe('the claim identifying details', () => {
  it('accepts identifying details of exactly 10 characters', () => {
    const details = 'x'.repeat(10);

    expect(createClaimIdentifyingDetails(details).value).toBe(details);
  });

  it('accepts identifying details of exactly 500 characters', () => {
    const details = 'x'.repeat(500);

    expect(createClaimIdentifyingDetails(details).value).toBe(details);
  });

  it('refuses identifying details of 9 characters', () => {
    expect(() => createClaimIdentifyingDetails('x'.repeat(9))).toThrow(ValidationError);
  });

  it('refuses identifying details of 501 characters', () => {
    expect(() => createClaimIdentifyingDetails('x'.repeat(501))).toThrow(ValidationError);
  });

  it('refuses empty identifying details, because the field is required', () => {
    expect(() => createClaimIdentifyingDetails('')).toThrow(ValidationError);
  });

  it('refuses whitespace-only identifying details', () => {
    expect(() => createClaimIdentifyingDetails('   ')).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      createClaimIdentifyingDetails('');
      expect.unreachable('The constructor should have thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('identifyingDetails');
    }
  });

  it('is a different value object from the report\'s identifying details', () => {
    // The report's identifying details are **optional** and capped at 500
    // with no minimum; the Claim's are **required** and floored at 10. Two
    // value objects, because FR-37 keeps the two fields apart.
    expect(createIdentifyingDetails(null)).toBeNull();
    expect(createIdentifyingDetails('short')?.value).toBe('short');
    expect(() => createIdentifyingDetails('x'.repeat(501))).toThrow(ValidationError);

    expect(() => createClaimIdentifyingDetails('short')).toThrow(ValidationError);
  });
});

describe('the claim date lost', () => {
  const TODAY = new Date('2026-10-29T12:00:00.000Z');

  it('accepts today', () => {
    expect(validateClaimDateLost('2026-10-29', TODAY).isoDay).toBe('2026-10-29');
  });

  it('accepts a date exactly 365 days ago, because the bound is inclusive', () => {
    expect(validateClaimDateLost('2025-10-29', TODAY).isoDay).toBe('2025-10-29');
  });

  it('refuses a date 366 days ago', () => {
    expect(() => validateClaimDateLost('2025-10-28', TODAY)).toThrow(ValidationError);
  });

  it('refuses a date in the future', () => {
    expect(() => validateClaimDateLost('2026-10-30', TODAY)).toThrow(ValidationError);
  });

  it('accepts a date with a time component, truncating it to its calendar day', () => {
    // The comparison is by calendar day, so a time component does not change
    // the verdict.
    expect(validateClaimDateLost('2026-10-28T23:59:59.000Z', TODAY).isoDay).toBe(
      '2026-10-28',
    );
  });

  it('refuses a value that is not a date', () => {
    expect(() => validateClaimDateLost('not a date', TODAY)).toThrow(ValidationError);
  });

  it('refuses an empty value', () => {
    expect(() => validateClaimDateLost('', TODAY)).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      validateClaimDateLost('2026-10-30', TODAY);
      expect.unreachable('The validator should have thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('dateLost');
    }
  });
});
