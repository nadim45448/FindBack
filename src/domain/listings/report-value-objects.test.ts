/**
 * The report value objects' suite.
 *
 * **Each value object refuses to construct from an invalid value.** That is
 * the property that makes the bounds structural: there is one constructor,
 * and it cannot be called with a value the PRD rejects.
 *
 * The bounds are **inclusive at both ends**, and that is asserted here at
 * each end — the PRD's edge cases are explicit about it ("Description of
 * exactly 10 or 2000 chars | Accepted").
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  createExactPlace,
  createIdentifyingDetails,
  createImageRef,
  createReportDescription,
  createReportName,
} from '@/domain/listings';

describe('the report name', () => {
  it('accepts a name of exactly 1 character', () => {
    expect(createReportName('a').value).toBe('a');
  });

  it('accepts a name of exactly 80 characters', () => {
    const name = 'x'.repeat(80);

    expect(createReportName(name).value).toBe(name);
  });

  it('refuses a name of 81 characters', () => {
    expect(() => createReportName('x'.repeat(81))).toThrow(ValidationError);
  });

  it('refuses an empty name', () => {
    expect(() => createReportName('')).toThrow(ValidationError);
  });

  it('refuses a whitespace-only name, because the minimum length is not met by whitespace', () => {
    expect(() => createReportName('   ')).toThrow(ValidationError);
  });

  it('trims the surrounding whitespace', () => {
    expect(createReportName('  Wallet  ').value).toBe('Wallet');
  });

  it('counts code points, not UTF-16 code units', () => {
    // An emoji is one character to a member, even though it is two UTF-16
    // code units. The database's `char_length` agrees.
    const name = '🔑'.repeat(80);

    expect(createReportName(name).value).toBe(name);
    expect(() => createReportName(`${name}x`)).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      createReportName('');
      expect.unreachable('The constructor should have thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('name');
    }
  });
});

describe('the report description', () => {
  it('accepts a description of exactly 10 characters', () => {
    const description = 'x'.repeat(10);

    expect(createReportDescription(description).value).toBe(description);
  });

  it('accepts a description of exactly 2000 characters', () => {
    const description = 'x'.repeat(2000);

    expect(createReportDescription(description).value).toBe(description);
  });

  it('refuses a description of 9 characters', () => {
    expect(() => createReportDescription('x'.repeat(9))).toThrow(ValidationError);
  });

  it('refuses a description of 2001 characters', () => {
    expect(() => createReportDescription('x'.repeat(2001))).toThrow(ValidationError);
  });

  it('refuses a whitespace-only description', () => {
    expect(() => createReportDescription('            ')).toThrow(ValidationError);
  });

  it('names the offending field in the error', () => {
    try {
      createReportDescription('short');
      expect.unreachable('The constructor should have thrown.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('description');
    }
  });
});

describe('the exact place — a Sensitive Field', () => {
  it('accepts a value of exactly 200 characters', () => {
    const place = 'x'.repeat(200);

    expect(createExactPlace(place)?.value).toBe(place);
  });

  it('refuses a value of 201 characters', () => {
    expect(() => createExactPlace('x'.repeat(201))).toThrow(ValidationError);
  });

  it('treats an absent value as an explicit absence, not an empty string', () => {
    expect(createExactPlace(null)).toBeNull();
    expect(createExactPlace(undefined)).toBeNull();
  });

  it('treats an empty string as an absence', () => {
    // The PRD's bound for an optional field is "0–N chars", and 0 chars is
    // what an empty string holds.
    expect(createExactPlace('')).toBeNull();
    expect(createExactPlace('   ')).toBeNull();
  });
});

describe('the identifying details — a Sensitive Field', () => {
  it('accepts a value of exactly 500 characters', () => {
    const details = 'x'.repeat(500);

    expect(createIdentifyingDetails(details)?.value).toBe(details);
  });

  it('refuses a value of 501 characters', () => {
    expect(() => createIdentifyingDetails('x'.repeat(501))).toThrow(ValidationError);
  });

  it('treats an absent value as an explicit absence', () => {
    expect(createIdentifyingDetails(null)).toBeNull();
    expect(createIdentifyingDetails(undefined)).toBeNull();
  });
});

describe('the image reference', () => {
  it('accepts a blob path', () => {
    expect(createImageRef('reports/abc-123.jpg').path).toBe('reports/abc-123.jpg');
  });

  it('refuses an empty path', () => {
    expect(() => createImageRef('')).toThrow(ValidationError);
  });

  it('refuses a URL, because the reference is a path and never a URL', () => {
    expect(() => createImageRef('https://example.org/reports/abc.jpg')).toThrow(ValidationError);
  });

  it('refuses a protocol-relative URL', () => {
    expect(() => createImageRef('//example.org/reports/abc.jpg')).toThrow(ValidationError);
  });

  it('refuses a root-relative path, because the blob store owns the prefix', () => {
    expect(() => createImageRef('/reports/abc.jpg')).toThrow(ValidationError);
  });
});
