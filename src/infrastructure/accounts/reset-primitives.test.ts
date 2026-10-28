/**
 * The reset flow's infrastructure primitives.
 *
 * **The two keyed digests and the two required secrets are ADR-19's
 * substance**, so they are asserted one by one: the digests are keyed (a
 * different secret gives a different digest), the bucket key is not
 * reversible without its secret, and a missing secret is a **startup
 * failure** rather than a silent downgrade.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createResetTokenPlaintext, RESET_TOKEN_LENGTH } from '@/domain/accounts';

import { HmacRateLimitBucketKey } from './rate-limit-bucket-key';
import {
  DEFAULT_RESET_CONFIG,
  readResetBucketHashSecret,
  readResetConfig,
  readResetTokenHashSecret,
} from './reset-config';
import { buildResetLink, generateResetToken, readAppBaseUrl } from './reset-token-generator';
import { HmacResetTokenHasher } from './reset-token-hasher';

const SECRET = 'a-test-secret-that-is-long-enough';
const OTHER_SECRET = 'a-different-test-secret-entirely';

describe('the reset-token hasher', () => {
  it('produces a digest of the token', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const token = createResetTokenPlaintext('A'.repeat(RESET_TOKEN_LENGTH));

    expect(hasher.hash(token).value).toHaveLength(64);
  });

  it('never produces the plaintext', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const plaintext = 'B'.repeat(RESET_TOKEN_LENGTH);

    const digest = hasher.hash(createResetTokenPlaintext(plaintext)).value;

    expect(digest).not.toContain(plaintext);
  });

  it('is deterministic for the same token and secret', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const token = createResetTokenPlaintext('C'.repeat(RESET_TOKEN_LENGTH));

    expect(hasher.hash(token).value).toBe(hasher.hash(token).value);
  });

  it('produces a different digest under a different secret', () => {
    const token = createResetTokenPlaintext('D'.repeat(RESET_TOKEN_LENGTH));

    const underFirst = new HmacResetTokenHasher(SECRET).hash(token).value;
    const underSecond = new HmacResetTokenHasher(OTHER_SECRET).hash(token).value;

    // Keyed, not a bare digest: without the secret, the digest cannot be
    // recomputed.
    expect(underFirst).not.toBe(underSecond);
  });

  it('verifies a matching token', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const token = createResetTokenPlaintext('E'.repeat(RESET_TOKEN_LENGTH));

    expect(hasher.verify(token, hasher.hash(token))).toBe(true);
  });

  it('refuses a non-matching token', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const token = createResetTokenPlaintext('F'.repeat(RESET_TOKEN_LENGTH));
    const other = createResetTokenPlaintext('G'.repeat(RESET_TOKEN_LENGTH));

    expect(hasher.verify(other, hasher.hash(token))).toBe(false);
  });

  it('refuses a digest of a different length, without throwing', () => {
    const hasher = new HmacResetTokenHasher(SECRET);
    const token = createResetTokenPlaintext('H'.repeat(RESET_TOKEN_LENGTH));

    // `timingSafeEqual` requires equal lengths, so the mismatch is caught
    // first — and the mismatch discloses nothing, a digest being a fixed
    // length.
    expect(hasher.verify(token, { value: 'short' })).toBe(false);
  });

  it('refuses a digest produced under a different secret', () => {
    const token = createResetTokenPlaintext('I'.repeat(RESET_TOKEN_LENGTH));
    const digest = new HmacResetTokenHasher(OTHER_SECRET).hash(token);

    expect(new HmacResetTokenHasher(SECRET).verify(token, digest)).toBe(false);
  });
});

describe('the rate-limit bucket key', () => {
  it('produces a hexadecimal digest', () => {
    const key = new HmacRateLimitBucketKey(SECRET).keyFor('jane@example.org');

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never contains the address', () => {
    const key = new HmacRateLimitBucketKey(SECRET).keyFor('jane@example.org');

    // The counter table must not become a list of addresses.
    expect(key).not.toContain('jane');
    expect(key).not.toContain('@');
  });

  it('is deterministic for the same address and secret', () => {
    const keys = new HmacRateLimitBucketKey(SECRET);

    expect(keys.keyFor('jane@example.org')).toBe(keys.keyFor('jane@example.org'));
  });

  it('produces a different key under a different secret', () => {
    const address = 'jane@example.org';

    const underFirst = new HmacRateLimitBucketKey(SECRET).keyFor(address);
    const underSecond = new HmacRateLimitBucketKey(OTHER_SECRET).keyFor(address);

    expect(underFirst).not.toBe(underSecond);
  });

  it('produces a different key for a different address', () => {
    const keys = new HmacRateLimitBucketKey(SECRET);

    expect(keys.keyFor('jane@example.org')).not.toBe(keys.keyFor('jack@example.org'));
  });

  it('is not a bare SHA-256 of the address', () => {
    // The digest is keyed, so it must not match the unkeyed hash that a
    // dictionary attack would compute.
    const key = new HmacRateLimitBucketKey(SECRET).keyFor('jane@example.org');
    const unkeyed = createHash('sha256').update('jane@example.org', 'utf8').digest('hex');

    expect(key).not.toBe(unkeyed);
  });
});

describe('the reset configuration', () => {
  it('uses the defaults when the environment says nothing', () => {
    expect(readResetConfig({})).toEqual(DEFAULT_RESET_CONFIG);
  });

  it('reads the token lifetime', () => {
    expect(readResetConfig({ AUTH_RESET_TOKEN_TTL_SECONDS: '1800' }).tokenLifetimeSeconds).toBe(
      1800,
    );
  });

  it('reads the anti-enumeration floor', () => {
    expect(readResetConfig({ AUTH_RESET_MIN_RESPONSE_MS: '400' }).minResponseMs).toBe(400);
  });

  it('reads the timing tolerance', () => {
    expect(
      readResetConfig({ AUTH_RESET_TIMING_TOLERANCE_MS: '250' }).timingToleranceMs,
    ).toBe(250);
  });

  it('reads the four rate-limit values', () => {
    const config = readResetConfig({
      AUTH_RATE_RESET_IP_LIMIT: '9',
      AUTH_RATE_RESET_IP_WINDOW_SECONDS: '120',
      AUTH_RATE_RESET_EMAIL_LIMIT: '2',
      AUTH_RATE_RESET_EMAIL_WINDOW_SECONDS: '300',
    });

    expect(config.ipLimit).toBe(9);
    expect(config.ipWindowSeconds).toBe(120);
    expect(config.emailLimit).toBe(2);
    expect(config.emailWindowSeconds).toBe(300);
  });

  it('falls back to the default for a malformed value', () => {
    // A malformed value must not fail the request, and must not be honoured.
    expect(readResetConfig({ AUTH_RESET_MIN_RESPONSE_MS: 'soon' }).minResponseMs).toBe(
      DEFAULT_RESET_CONFIG.minResponseMs,
    );
  });

  it('falls back to the default for a zero or negative value', () => {
    expect(readResetConfig({ AUTH_RESET_TOKEN_TTL_SECONDS: '0' }).tokenLifetimeSeconds).toBe(
      DEFAULT_RESET_CONFIG.tokenLifetimeSeconds,
    );
    expect(readResetConfig({ AUTH_RESET_TOKEN_TTL_SECONDS: '-1' }).tokenLifetimeSeconds).toBe(
      DEFAULT_RESET_CONFIG.tokenLifetimeSeconds,
    );
  });

  it('falls back to the default for a blank value', () => {
    expect(readResetConfig({ AUTH_RESET_MIN_RESPONSE_MS: '   ' }).minResponseMs).toBe(
      DEFAULT_RESET_CONFIG.minResponseMs,
    );
  });
});

describe('the reset secrets', () => {
  it('reads the token-hashing secret', () => {
    expect(readResetTokenHashSecret({ AUTH_RESET_TOKEN_HASH_SECRET: SECRET })).toBe(SECRET);
  });

  it('refuses to start without the token-hashing secret', () => {
    // A missing secret is a startup failure, not a fallback to an unkeyed
    // digest.
    expect(() => readResetTokenHashSecret({})).toThrow();
    expect(() => readResetTokenHashSecret({ AUTH_RESET_TOKEN_HASH_SECRET: '' })).toThrow();
    expect(() => readResetTokenHashSecret({ AUTH_RESET_TOKEN_HASH_SECRET: '  ' })).toThrow();
  });

  it('reads the bucket-key secret', () => {
    expect(readResetBucketHashSecret({ AUTH_RESET_BUCKET_HASH_SECRET: SECRET })).toBe(SECRET);
  });

  it('refuses to start without the bucket-key secret', () => {
    // The fallback would be a plaintext address in the counter table.
    expect(() => readResetBucketHashSecret({})).toThrow();
    expect(() => readResetBucketHashSecret({ AUTH_RESET_BUCKET_HASH_SECRET: '' })).toThrow();
  });

  it('does not derive one secret from the other', () => {
    // The two protect different things, so their rotation schedules are
    // independent.
    const env = {
      AUTH_RESET_TOKEN_HASH_SECRET: SECRET,
      AUTH_RESET_BUCKET_HASH_SECRET: OTHER_SECRET,
    };

    expect(readResetTokenHashSecret(env)).not.toBe(readResetBucketHashSecret(env));
  });
});

describe('the reset token generator', () => {
  it('produces a 43-character base64url token', () => {
    const token = generateResetToken();

    expect(token).toHaveLength(RESET_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different token each time', () => {
    const tokens = new Set(Array.from({ length: 32 }, () => generateResetToken()));

    expect(tokens.size).toBe(32);
  });

  it('builds a reset link carrying the token in the fragment, never the query string', () => {
    const link = buildResetLink('https://findback.example.org', 'the-token');

    // The query string is part of the request line, and the request line is
    // what the platform's access log records. The fragment is not sent to
    // the server at all, so it is never logged.
    expect(link).toBe('https://findback.example.org/reset-password#token=the-token');
    expect(link).not.toContain('?');
  });
});

describe('the application base URL', () => {
  it('reads the configured value', () => {
    expect(readAppBaseUrl({ APP_BASE_URL: 'https://findback.example.org' })).toBe(
      'https://findback.example.org',
    );
  });

  it('falls back to the local default', () => {
    expect(readAppBaseUrl({})).toBe('http://localhost:3000');
  });

  it('falls back to the local default for a blank value', () => {
    expect(readAppBaseUrl({ APP_BASE_URL: '   ' })).toBe('http://localhost:3000');
  });
});
