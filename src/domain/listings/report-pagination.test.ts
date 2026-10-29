/**
 * The pagination suite.
 *
 * **The page size's bound is part of the performance contract.** A listing
 * that may be asked for the whole table cannot be index-backed, so the
 * bound belongs to the domain rather than to the route.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  defaultPage,
  offsetFor,
  parsePageNumber,
  parsePageSize,
} from './report-pagination';

describe('the default page', () => {
  it('is the first page', () => {
    expect(defaultPage().number).toBe(1);
  });

  it('carries the default size', () => {
    expect(defaultPage().size).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('the page number', () => {
  it('is one when none is given', () => {
    expect(parsePageNumber(null)).toBe(1);
    expect(parsePageNumber('')).toBe(1);
    expect(parsePageNumber('  ')).toBe(1);
  });

  it('is the submitted number', () => {
    expect(parsePageNumber('3')).toBe(3);
  });

  it('refuses a zero or negative page', () => {
    expect(() => parsePageNumber('0')).toThrow(ValidationError);
    expect(() => parsePageNumber('-1')).toThrow(ValidationError);
  });

  it('refuses a non-integer page', () => {
    expect(() => parsePageNumber('1.5')).toThrow(ValidationError);
    expect(() => parsePageNumber('two')).toThrow(ValidationError);
  });
});

describe('the page size', () => {
  it('is the default when none is given', () => {
    expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('is the submitted size', () => {
    expect(parsePageSize('10')).toBe(10);
  });

  it('refuses a size above the maximum', () => {
    // **The bound is what keeps the query index-backed.**
    expect(() => parsePageSize(String(MAX_PAGE_SIZE + 1))).toThrow(ValidationError);
  });

  it('accepts a size exactly at the maximum', () => {
    expect(parsePageSize(String(MAX_PAGE_SIZE))).toBe(MAX_PAGE_SIZE);
  });

  it('refuses a zero or negative size', () => {
    expect(() => parsePageSize('0')).toThrow(ValidationError);
    expect(() => parsePageSize('-5')).toThrow(ValidationError);
  });
});

describe('the offset', () => {
  it('is zero for the first page', () => {
    expect(offsetFor(buildPage(1, 25))).toBe(0);
  });

  it('skips one page for the second page', () => {
    expect(offsetFor(buildPage(2, 25))).toBe(25);
  });

  it('is computed from the page’s own size', () => {
    expect(offsetFor(buildPage(3, 10))).toBe(20);
    expect(offsetFor(buildPage(3, 25))).toBe(50);
  });
});
