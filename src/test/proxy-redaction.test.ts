/**
 * The reset-token proxy.
 *
 * **The proxy is the second line of defence.** The token travels in the
 * URL's **fragment** by design, and a fragment is never sent to the server,
 * so the token is not in the request line and not in an access log. The
 * proxy handles the case the fragment does not cover: **a token in the
 * query string**, from an older link or a hand-built URL.
 *
 * The property under test is that the token never reaches the request
 * line — the platform's access log records the request URL, and the
 * proxy's rewriting of it *is* the redaction for this case.
 *
 * The second property is that the token is **moved, not destroyed**: the
 * page still needs it, so it travels in a header.
 */

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';
import { REDACTED_VALUE, RESET_TOKEN_HEADER } from '@/domain/accounts';

const A_TOKEN = 'a-deterministic-reset-token-0001';

function aRequest(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

describe('the reset-token proxy', () => {
  it('redacts a token in the query string from the request URL', () => {
    const response = proxy(
      aRequest(`https://findback.example.org/reset-password?token=${A_TOKEN}`),
    );

    expect(response.headers.get('x-middleware-rewrite')).toBeTruthy();

    const rewritten = response.headers.get('x-middleware-rewrite') ?? '';

    expect(rewritten).not.toContain(A_TOKEN);
    expect(rewritten).toContain(REDACTED_VALUE);
  });

  it('moves the token into a header, so the page can still read it', () => {
    const response = proxy(
      aRequest(`https://findback.example.org/reset-password?token=${A_TOKEN}`),
    );

    // Next.js carries an overridden request header under this prefix.
    const carried = response.headers.get(`x-middleware-request-${RESET_TOKEN_HEADER}`);

    expect(carried).toBe(A_TOKEN);
  });

  it('leaves the path intact, so the route still matches', () => {
    const response = proxy(
      aRequest(`https://findback.example.org/reset-password?token=${A_TOKEN}`),
    );

    expect(response.headers.get('x-middleware-rewrite') ?? '').toContain('/reset-password');
  });

  it('keeps the other query parameters', () => {
    const response = proxy(
      aRequest(`https://findback.example.org/reset-password?source=email&token=${A_TOKEN}`),
    );

    const rewritten = response.headers.get('x-middleware-rewrite') ?? '';

    expect(rewritten).toContain('source=email');
    expect(rewritten).not.toContain(A_TOKEN);
  });

  it('passes a request with no token through untouched — the normal case', () => {
    // The link's token is in the fragment, which the server never sees, so
    // this is what almost every request looks like.
    const response = proxy(aRequest('https://findback.example.org/reset-password'));

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get(`x-middleware-request-${RESET_TOKEN_HEADER}`)).toBeNull();
  });

  it('passes a request with an empty token through untouched', () => {
    const response = proxy(
      aRequest('https://findback.example.org/reset-password?token='),
    );

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('passes a request for another path through untouched', () => {
    const response = proxy(
      aRequest(`https://findback.example.org/somewhere-else?token=${A_TOKEN}`),
    );

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get(`x-middleware-request-${RESET_TOKEN_HEADER}`)).toBeNull();
  });

  it('never lets the token reach the rewritten URL', () => {
    // A property check over the shapes a query-string link can take.
    const urls = [
      `https://findback.example.org/reset-password?token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?source=email&token=${A_TOKEN}`,
      `https://findback.example.org/reset-password?token=${A_TOKEN}&source=email`,
      `https://findback.example.org/reset-password?token=${A_TOKEN}&token=${A_TOKEN}`,
    ];

    for (const url of urls) {
      const response = proxy(aRequest(url));
      const rewritten = response.headers.get('x-middleware-rewrite') ?? '';

      expect(rewritten).not.toContain(A_TOKEN);
    }
  });
});
