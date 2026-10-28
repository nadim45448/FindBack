/**
 * The rate-limit configuration's tests.
 *
 * ADR-15 says the limits are **configured, not hardcoded, with the chosen
 * values as defaults**. This suite proves both halves of that claim: the
 * defaults are ADR-15's values, and an environment variable overrides them.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_RATE_LIMIT_CONFIG, readRateLimitConfig } from './rate-limit-config';

describe('the rate-limit configuration', () => {
  it('defaults to the values ADR-15 chose', () => {
    const config = readRateLimitConfig({});

    // Registration: 5 an hour, IP-scoped.
    expect(config.registerLimit).toBe(5);
    expect(config.registerWindowSeconds).toBe(3600);

    // Login IP: 20 in 15 minutes, loose for a shared campus address.
    expect(config.loginIpLimit).toBe(20);
    expect(config.loginIpWindowSeconds).toBe(900);

    // Login email: 10 in 15 minutes, tight for one account.
    expect(config.loginEmailLimit).toBe(10);
    expect(config.loginEmailWindowSeconds).toBe(900);
  });

  it('exposes the same values as the exported defaults', () => {
    expect(readRateLimitConfig({})).toEqual(DEFAULT_RATE_LIMIT_CONFIG);
  });

  it('lets the environment override every limit', () => {
    const config = readRateLimitConfig({
      AUTH_RATE_REGISTER_LIMIT: '9',
      AUTH_RATE_REGISTER_WINDOW_SECONDS: '120',
      AUTH_RATE_LOGIN_IP_LIMIT: '40',
      AUTH_RATE_LOGIN_IP_WINDOW_SECONDS: '60',
      AUTH_RATE_LOGIN_EMAIL_LIMIT: '3',
      AUTH_RATE_LOGIN_EMAIL_WINDOW_SECONDS: '30',
    });

    expect(config.registerLimit).toBe(9);
    expect(config.registerWindowSeconds).toBe(120);
    expect(config.loginIpLimit).toBe(40);
    expect(config.loginIpWindowSeconds).toBe(60);
    expect(config.loginEmailLimit).toBe(3);
    expect(config.loginEmailWindowSeconds).toBe(30);
  });

  it('overrides one limit without disturbing the others', () => {
    const config = readRateLimitConfig({ AUTH_RATE_LOGIN_EMAIL_LIMIT: '2' });

    expect(config.loginEmailLimit).toBe(2);
    expect(config.loginIpLimit).toBe(DEFAULT_RATE_LIMIT_CONFIG.loginIpLimit);
    expect(config.registerLimit).toBe(DEFAULT_RATE_LIMIT_CONFIG.registerLimit);
  });

  it('falls back to the default for a value that is not a positive integer', () => {
    // A malformed environment variable must not take the identity endpoints
    // down — the fallback is the ADR's own value.
    for (const raw of ['', '   ', 'abc', '0', '-1', '1.5', 'NaN']) {
      const config = readRateLimitConfig({ AUTH_RATE_LOGIN_IP_LIMIT: raw });

      expect(config.loginIpLimit).toBe(DEFAULT_RATE_LIMIT_CONFIG.loginIpLimit);
    }
  });
});
