/**
 * The password-reset email's tests.
 *
 * **The email's two safety properties are asserted**: the lifetime it states
 * is the **configured** one (ADR-17), and every interpolated value is
 * **escaped** — a display name is user input, and the body is rendered by the
 * recipient's mail client.
 */

import { describe, expect, it } from 'vitest';

import {
  buildPasswordResetEmail,
  PASSWORD_RESET_SUBJECT,
  renderLifetime,
  RESET_PASSWORD_PATH,
} from './password-reset-email';

const PARTS = {
  displayName: 'Jane Doe',
  resetUrl: 'https://findback.example.org/reset-password?token=the-token',
  lifetimeSeconds: 3600,
};

describe('rendering a lifetime', () => {
  it('renders one hour', () => {
    expect(renderLifetime(3600)).toBe('1 hour');
  });

  it('renders several hours', () => {
    expect(renderLifetime(7200)).toBe('2 hours');
  });

  it('renders one minute', () => {
    expect(renderLifetime(60)).toBe('1 minute');
  });

  it('renders several minutes', () => {
    expect(renderLifetime(1800)).toBe('30 minutes');
  });

  it('renders seconds when the value is not a whole minute', () => {
    expect(renderLifetime(45)).toBe('45 seconds');
  });

  it('renders a safe phrase for a value of zero', () => {
    expect(renderLifetime(0)).toBe('a short time');
  });

  it('renders a safe phrase for a negative or non-finite value', () => {
    expect(renderLifetime(-1)).toBe('a short time');
    expect(renderLifetime(Number.NaN)).toBe('a short time');
  });
});

describe('building the password-reset email', () => {
  it('addresses the recipient', () => {
    const email = buildPasswordResetEmail('jane@example.org', PARTS);

    expect(email.to).toBe('jane@example.org');
    expect(email.subject).toBe(PASSWORD_RESET_SUBJECT);
  });

  it('carries the reset link', () => {
    const email = buildPasswordResetEmail('jane@example.org', PARTS);

    expect(email.textBody).toContain(PARTS.resetUrl);
    expect(email.htmlBody).toContain(PARTS.resetUrl);
  });

  it('carries the configured lifetime, not a constant', () => {
    const email = buildPasswordResetEmail('jane@example.org', {
      ...PARTS,
      lifetimeSeconds: 1800,
    });

    expect(email.textBody).toContain('30 minutes');
    expect(email.textBody).not.toContain('1 hour');
  });

  it('states that the link may be used once', () => {
    const email = buildPasswordResetEmail('jane@example.org', PARTS);

    expect(email.textBody).toContain('used once');
  });

  it('tells the member that ignoring the email changes nothing', () => {
    const email = buildPasswordResetEmail('jane@example.org', PARTS);

    expect(email.textBody).toContain('ignore this email');
    expect(email.textBody).toContain('your password will not change');
  });

  it('carries no session and no auto-login token', () => {
    const email = buildPasswordResetEmail('jane@example.org', PARTS);

    // The link authorises exactly one password change and nothing else.
    expect(email.textBody).not.toMatch(/session/i);
    expect(email.htmlBody).not.toMatch(/auto-?login/i);
  });

  it('greet a nameless member without a blank', () => {
    const email = buildPasswordResetEmail('jane@example.org', {
      ...PARTS,
      displayName: '   ',
    });

    expect(email.textBody).toContain('Hi there,');
  });

  it('escapes a display name carrying markup', () => {
    const email = buildPasswordResetEmail('jane@example.org', {
      ...PARTS,
      displayName: '<script>alert("x")</script>',
    });

    // The name is escaped, so it cannot become markup.
    expect(email.htmlBody).not.toContain('<script>');
    expect(email.htmlBody).toContain('&lt;script&gt;');
  });

  it('escapes a reset URL carrying markup', () => {
    const email = buildPasswordResetEmail('jane@example.org', {
      ...PARTS,
      resetUrl: 'https://example.org/"><script>alert(1)</script>',
    });

    expect(email.htmlBody).not.toContain('<script>');
    expect(email.htmlBody).not.toContain('"><');
  });

  it('names the reset path', () => {
    expect(RESET_PASSWORD_PATH).toBe('/reset-password');
  });
});
