/**
 * The account-rejected email's tests.
 */

import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_REJECTED_SUBJECT,
  buildAccountRejectedEmail,
} from './account-rejected-email';

describe('the account-rejected email', () => {
  const email = buildAccountRejectedEmail('jane@example.org', {
    displayName: 'Jane Doe',
    reason: 'Not a member of the organization',
  });

  it('goes to the account’s registered address', () => {
    expect(email.to).toBe('jane@example.org');
  });

  it('carries a subject line', () => {
    expect(email.subject).toBe(ACCOUNT_REJECTED_SUBJECT);
  });

  it('greets the member by name', () => {
    expect(email.textBody).toContain('Jane Doe');
  });

  it('carries the administrator’s reason', () => {
    expect(email.textBody).toContain('Reason: Not a member of the organization');
    expect(email.htmlBody).toContain('Reason: Not a member of the organization');
  });

  it('omits a reason line when none was recorded', () => {
    const blank = buildAccountRejectedEmail('jane@example.org', {
      displayName: 'Jane Doe',
      reason: null,
    });

    expect(blank.textBody).not.toContain('Reason:');
    expect(blank.htmlBody).not.toContain('Reason:');
  });

  it('escapes markup in the reason', () => {
    const hostile = buildAccountRejectedEmail('jane@example.org', {
      displayName: 'Jane Doe',
      reason: '<script>alert(1)</script>',
    });

    expect(hostile.htmlBody).not.toContain('<script>');
    expect(hostile.htmlBody).toContain('&lt;script&gt;');
  });

  it('escapes markup in the display name', () => {
    const hostile = buildAccountRejectedEmail('jane@example.org', {
      displayName: '<script>alert(1)</script>',
      reason: 'Not a member',
    });

    expect(hostile.htmlBody).not.toContain('<script>');
    expect(hostile.htmlBody).toContain('&lt;script&gt;');
  });

  it('carries a plain-text body', () => {
    expect(email.textBody).toContain('An administrator did not approve your FindBack account.');
    expect(email.textBody).not.toContain('<p>');
  });
});
