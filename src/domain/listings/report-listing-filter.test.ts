/**
 * The listing filter suite — FR-14's search and narrowing model.
 *
 * **The two properties worth testing are the keyword's surface and the
 * type/status combination.** The keyword must not be able to reach the
 * Sensitive Fields, and a status that cannot occur on the selected type
 * must be a named refusal rather than an empty result.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  MAX_KEYWORD_LENGTH,
  assertTypeStatusCombination,
  emptyFilter,
  parseDateRange,
  parseFilterCategory,
  parseFilterStatus,
  parseFilterType,
  parseKeyword,
} from './report-listing-filter';

describe('the empty filter', () => {
  it('narrows nothing', () => {
    expect(emptyFilter()).toEqual({
      keyword: null,
      category: null,
      campusArea: null,
      dateRange: null,
      type: null,
      statuses: null,
    });
  });
});

describe('the keyword', () => {
  it('keeps a submitted keyword', () => {
    expect(parseKeyword('blue wallet')).toBe('blue wallet');
  });

  it('trims the surrounding whitespace', () => {
    expect(parseKeyword('  wallet  ')).toBe('wallet');
  });

  it('reduces an empty keyword to an empty string', () => {
    expect(parseKeyword('   ')).toBe('');
  });

  it('refuses a keyword longer than the maximum', () => {
    expect(() => parseKeyword('x'.repeat(MAX_KEYWORD_LENGTH + 1))).toThrow(ValidationError);
  });

  it('accepts a keyword exactly at the maximum', () => {
    expect(() => parseKeyword('x'.repeat(MAX_KEYWORD_LENGTH))).not.toThrow();
  });

  it('never echoes the keyword in the refusal', () => {
    // **The keyword could carry a Sensitive Field’s contents** — a member
    // searching for their own passport number. An error response must not
    // put it back on the wire.
    const secret = 'passport 123456789';

    try {
      parseKeyword(secret.repeat(20));
      expect.unreachable('The keyword should have been refused.');
    } catch (error) {
      expect((error as ValidationError).message).not.toContain('passport');
    }
  });
});

describe('the category filter', () => {
  it('accepts a category from the closed set', () => {
    expect(parseFilterCategory('Wallet')).toBe('Wallet');
    expect(parseFilterCategory('Books/Notebooks')).toBe('Books/Notebooks');
  });

  it('refuses a category outside the closed set', () => {
    expect(() => parseFilterCategory('Shoes')).toThrow(ValidationError);
  });

  it('names the field in the refusal', () => {
    try {
      parseFilterCategory('Shoes');
      expect.unreachable('The category should have been refused.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('category');
    }
  });
});

describe('the type filter', () => {
  it('accepts Lost and Found', () => {
    expect(parseFilterType('Lost')).toBe('Lost');
    expect(parseFilterType('Found')).toBe('Found');
  });

  it('refuses anything else', () => {
    expect(() => parseFilterType('lost')).toThrow(ValidationError);
    expect(() => parseFilterType('Both')).toThrow(ValidationError);
  });
});

describe('the status filter', () => {
  it('accepts each of the six statuses', () => {
    expect(parseFilterStatus('Open')).toBe('Open');
    expect(parseFilterStatus('Claim Requested')).toBe('Claim Requested');
    expect(parseFilterStatus('Verification Pending')).toBe('Verification Pending');
    expect(parseFilterStatus('Closed')).toBe('Closed');
  });

  it('refuses a status outside the set', () => {
    expect(() => parseFilterStatus('Standby')).toThrow(ValidationError);
  });
});

describe('the type and status combination', () => {
  it('accepts Found with Claim Requested', () => {
    expect(() => assertTypeStatusCombination('Found', ['Claim Requested'])).not.toThrow();
  });

  it('accepts Lost with Verification Pending', () => {
    expect(() => assertTypeStatusCombination('Lost', ['Verification Pending'])).not.toThrow();
  });

  it('accepts both types with Open', () => {
    expect(() => assertTypeStatusCombination('Found', ['Open'])).not.toThrow();
    expect(() => assertTypeStatusCombination('Lost', ['Open'])).not.toThrow();
  });

  it('refuses Found with Verification Pending', () => {
    // **Story 009 names this exact combination as invalid.** It must be a
    // refusal, not an empty result — an empty result would hide the
    // caller’s mistake.
    expect(() => assertTypeStatusCombination('Found', ['Verification Pending'])).toThrow(
      ValidationError,
    );
  });

  it('refuses Lost with the Claim statuses', () => {
    expect(() => assertTypeStatusCombination('Lost', ['Claim Requested'])).toThrow(
      ValidationError,
    );
    expect(() => assertTypeStatusCombination('Lost', ['Claim Approved'])).toThrow(
      ValidationError,
    );
  });

  it('accepts anything when no type is given', () => {
    expect(() => assertTypeStatusCombination(null, ['Verification Pending'])).not.toThrow();
  });

  it('accepts anything when no status is given', () => {
    expect(() => assertTypeStatusCombination('Found', null)).not.toThrow();
  });

  it('names the offending status in the refusal', () => {
    try {
      assertTypeStatusCombination('Found', ['Verification Pending']);
      expect.unreachable('The combination should have been refused.');
    } catch (error) {
      expect((error as ValidationError).message).toContain('Verification Pending');
      expect((error as ValidationError).field).toBe('status');
    }
  });
});

describe('the date range', () => {
  it('is null when neither bound is given', () => {
    expect(parseDateRange(null, null)).toBeNull();
  });

  it('accepts a single bound', () => {
    expect(parseDateRange('2026-01-01', null)).toEqual({ from: '2026-01-01', to: null });
    expect(parseDateRange(null, '2026-12-31')).toEqual({ from: null, to: '2026-12-31' });
  });

  it('accepts a full range', () => {
    expect(parseDateRange('2026-01-01', '2026-12-31')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('accepts a range whose bounds are equal', () => {
    expect(parseDateRange('2026-01-01', '2026-01-01')).toEqual({
      from: '2026-01-01',
      to: '2026-01-01',
    });
  });

  it('refuses a bound that is not a calendar day', () => {
    expect(() => parseDateRange('01/01/2026', null)).toThrow(ValidationError);
    expect(() => parseDateRange(null, '2026-13-01')).toThrow(ValidationError);
  });

  it('refuses an inverted range', () => {
    expect(() => parseDateRange('2026-12-31', '2026-01-01')).toThrow(ValidationError);
  });
});
