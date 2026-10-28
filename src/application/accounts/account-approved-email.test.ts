/**
 * The FR-27 account-approved email's tests.
 *
 * FR-27 requires three things of the message, and all three are asserted
 * here: it goes to the account's registered address, it carries a link to
 * the login page, and it carries **no auto-login token**.
 */

import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_APPROVED_SUBJECT,
  buildAccountApprovedEmail,
  LOGIN_PATH,
} from './account-approved-email';

describe('the account-approved email', () => {
  const email = buildAccountApprovedEmail('jane@example.org', {
    displayName: 'Jane Doe',
    loginUrl: 'https://findback.example.org/login',
  });

  it('goes to the account’s registered address', () => {
    expect(email.to).toBe('jane@example.org');
  });

  it('carries a subject line', () => {
    expect(email.subject).toBe(ACCOUNT_APPROVED_SUBJECT);
  });

  it('links to the login page', () => {
    // FR-27: the message contains a link to the application login page.
    expect(email.textBody).toContain('https://findback.example.org/login');
    expect(email.htmlBody).toContain('https://findback.example.org/login');
  });

  it('names the login path', () => {
    expect(LOGIN_PATH).toBe('/login');
  });

  it('carries no auto-login token', () => {
    // FR-27's third requirement, and a security property rather than a copy
    // preference: a link carrying a credential would let anyone who saw the
    // email become the account holder.
    expect(email.textBody).not.toMatch(/token=/i);
    expect(email.htmlBody).not.toMatch(/token=/i);
    expect(email.textBody).not.toMatch(/session/i);
    expect(email.htmlBody).not.toMatch(/session/i);
  });

  it('greets the member by name', () => {
    expect(email.textBody).toContain('Jane Doe');
  });

  it('falls back to a neutral greeting when the name is blank', () => {
    const blank = buildAccountApprovedEmail('jane@example.org', {
      displayName: '   ',
      loginUrl: 'https://findback.example.org/login',
    });

    expect(blank.textBody).toContain('Hi there,');
  });

  it('escapes markup in the display name', () => {
    // The name is user input, and the HTML body is rendered by the
    // recipient's mail client.
    const hostile = buildAccountApprovedEmail('jane@example.org', {
      displayName: '<script>alert(1)</script>',
      loginUrl: 'https://findback.example.org/login',
    });

    expect(hostile.htmlBody).not.toContain('<script>');
    expect(hostile.htmlBody).toContain('&lt;script&gt;');
  });

  it('escapes markup in the login URL', () => {
    const hostile = buildAccountApprovedEmail('jane@example.org', {
      displayName: 'Jane Doe',
      loginUrl: 'https://findback.example.org/login" onmouseover="alert(1)',
    });

    expect(hostile.htmlBody).not.toContain('onmouseover="alert');
  });

  it('carries a plain-text body', () => {
    // A plain-text alternative is what a client falls back to, and it is
    // the body that must not contain markup.
    expect(email.textBody).toContain('Your FindBack account has been approved');
    expect(email.textBody).not.toContain('<p>');
  });
});
