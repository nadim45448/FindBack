/**
 * The reset token's redaction.
 *
 * **The property under test is that the token is gone and the fact is
 * not.** A redaction that removed the parameter entirely would satisfy
 * "the token is not in the log" and still lose the information a log line
 * is for — that a reset was attempted.
 *
 * The token lives in the **fragment** by design, and the query string is
 * covered too: a URL assembled by hand or by a redirect could still carry
 * the token there, and the query string is the part that *is* logged.
 */

import { describe, expect, it } from 'vitest';

import {
  REDACTED_VALUE,
  redactResetToken,
  RESET_TOKEN_QUERY_PARAM,
} from './redact-reset-token';

const A_TOKEN = 'a-deterministic-reset-token-0001';

describe('redacting the reset token', () => {
  it('removes the token from a reset link', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password#token=${A_TOKEN}`,
    );

    expect(redacted).not.toContain(A_TOKEN);
    expect(redacted).toBe(
      `https://findback.example.org/reset-password#${RESET_TOKEN_QUERY_PARAM}=${REDACTED_VALUE}`,
    );
  });

  it('keeps the path, so the log line still shows the route', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password#token=${A_TOKEN}`,
    );

    expect(redacted).toContain('/reset-password');
  });

  it('redacts a token in the query string too, because that is the part that is logged', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password?token=${A_TOKEN}`,
    );

    expect(redacted).not.toContain(A_TOKEN);
    expect(redacted).toContain(REDACTED_VALUE);
  });

  it('redacts a token in the query string of a URL that also has a fragment', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password?token=${A_TOKEN}#form`,
    );

    expect(redacted).not.toContain(A_TOKEN);
    // The fragment is preserved.
    expect(redacted).toContain('#form');
  });

  it('redacts a token in the fragment of a URL that also has a query string', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password?source=email#token=${A_TOKEN}`,
    );

    expect(redacted).not.toContain(A_TOKEN);
    expect(redacted).toContain('source=email');
  });

  it('keeps the other parameters', () => {
    const redacted = redactResetToken(
      `https://findback.example.org/reset-password#source=email&token=${A_TOKEN}&utm=x`,
    );

    expect(redacted).toContain('source=email');
    expect(redacted).toContain('utm=x');
    expect(redacted).not.toContain(A_TOKEN);
  });

  it('redacts a token that is the only parameter', () => {
    const redacted = redactResetToken(`/reset-password#token=${A_TOKEN}`);

    expect(redacted).not.toContain(A_TOKEN);
    expect(redacted).toContain(REDACTED_VALUE);
  });

  it('leaves a URL with no query string and no fragment unchanged', () => {
    const url = 'https://findback.example.org/reset-password';

    expect(redactResetToken(url)).toBe(url);
  });

  it('leaves a URL with no token parameter unchanged', () => {
    const url = 'https://findback.example.org/reset-password?source=email';

    expect(redactResetToken(url)).toBe(url);
  });

  it('leaves an empty token parameter unchanged, because there is nothing to leak', () => {
    const url = 'https://findback.example.org/reset-password#token=';

    expect(redactResetToken(url)).toBe(url);
  });

  it('does not redact a parameter whose name merely resembles the token one', () => {
    const url = 'https://findback.example.org/reset-password#tokenizer=harmless';

    expect(redactResetToken(url)).toBe(url);
  });

  it('matches the parameter name case-sensitively', () => {
    const url = 'https://findback.example.org/reset-password#Token=not-the-reset-param';

    expect(redactResetToken(url)).toBe(url);
  });

  it('redacts a token carrying URL-unsafe characters', () => {
    const redacted = redactResetToken(
      'https://findback.example.org/reset-password#token=abc%20def%3Dghi',
    );

    expect(redacted).not.toContain('abc');
    expect(redacted).toContain(REDACTED_VALUE);
  });

  it('redacts every occurrence of the parameter', () => {
    const redacted = redactResetToken(`/reset-password#token=${A_TOKEN}&token=${A_TOKEN}`);

    expect(redacted).not.toContain(A_TOKEN);
  });

  it('never returns the token for any input carrying one', () => {
    // A property check across the shapes a link can take.
    const urls = [
      `https://findback.example.org/reset-password#token=${A_TOKEN}`,
      `/reset-password#token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?a=1&token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?token=${A_TOKEN}&a=1`,
      `https://findback.example.org/reset-password#token=${A_TOKEN}&token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?token=${A_TOKEN}#form`,
      `https://findback.example.org/reset-password#token=${A_TOKEN}#form`,
      `https://findback.example.org/reset-password?a=1#token=${A_TOKEN}`,
    ];

    for (const url of urls) {
      expect(redactResetToken(url)).not.toContain(A_TOKEN);
    }
  });
});
