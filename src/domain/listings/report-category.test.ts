/**
 * The report category's suite.
 *
 * **The nine values are the PRD's, verbatim.** The list is closed, so the
 * category is a **union** rather than a string — an unknown value cannot be
 * a category at all, and the compiler knows the set.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  isReportCategory,
  parseReportCategory,
  REPORT_CATEGORIES,
} from '@/domain/listings';

describe('the report category', () => {
  it('names exactly the nine PRD categories', () => {
    expect([...REPORT_CATEGORIES]).toEqual([
      'Wallet',
      'Bag',
      'Electronics',
      'Keys',
      'Clothing',
      'Books/Notebooks',
      'Identification',
      'Water Bottle',
      'Other',
    ]);
  });

  it('accepts every one of the nine', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(parseReportCategory(category)).toBe(category);
      expect(isReportCategory(category)).toBe(true);
    }
  });

  it('refuses an unknown value', () => {
    expect(() => parseReportCategory('Vehicle')).toThrow(ValidationError);
    expect(isReportCategory('Vehicle')).toBe(false);
  });

  it('refuses a value that differs only in case', () => {
    // The set is closed and case-sensitive: the PRD names the values, and a
    // stored category that differs in case would not match the PRD's list.
    expect(() => parseReportCategory('wallet')).toThrow(ValidationError);
  });

  it('refuses an empty value', () => {
    expect(() => parseReportCategory('')).toThrow(ValidationError);
  });

  it('refuses a value with surrounding whitespace, without trimming it', () => {
    expect(() => parseReportCategory(' Wallet ')).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      parseReportCategory('Vehicle');
      expect.unreachable('The parser should have thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('category');
    }
  });
});
