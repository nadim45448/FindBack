/**
 * The reset token's and the profile change's value objects.
 *
 * The invariants FR-51 and FR-52 fix, asserted one by one.
 */

import { describe, expect, it } from 'vitest';

import {
  createNeutralResetConfirmation,
  NEUTRAL_RESET_CONFIRMATION,
} from './neutral-reset-confirmation';
import {
  isExpired,
  isUsableResetToken,
  isUsed,
  issuePasswordResetToken,
} from './password-reset-token';
import { createProfileChange, isEmptyProfileChange } from './profile-change';
import {
  buildResetUrl,
  createResetTokenHash,
  createResetTokenPlaintext,
  RESET_TOKEN_LENGTH,
} from './reset-token';

const NOW = new Date('2026-10-28T12:00:00Z');

/** A token, for the tests to act on. */
function aToken(overrides: Partial<ReturnType<typeof issuePasswordResetToken>> = {}) {
  return {
    ...issuePasswordResetToken({
      id: '00000000-0000-4000-8000-000000000002',
      accountId: '00000000-0000-4000-8000-000000000001',
      tokenHash: 'a-digest',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    }),
    ...overrides,
  };
}

describe('issuing a reset token', () => {
  it('starts unused', () => {
    expect(aToken().usedAt).toBeNull();
  });

  it('carries the digest, never a plaintext', () => {
    expect(aToken().tokenHash).toBe('a-digest');
  });

  it('is usable before it expires', () => {
    expect(isUsableResetToken(aToken(), NOW)).toBe(true);
  });

  it('is not usable once used', () => {
    const used = aToken({ usedAt: NOW });

    expect(isUsed(used)).toBe(true);
    expect(isUsableResetToken(used, NOW)).toBe(false);
  });

  it('is not usable once expired', () => {
    const expired = aToken({ expiresAt: new Date(NOW.getTime() - 1) });

    expect(isExpired(expired, NOW)).toBe(true);
    expect(isUsableResetToken(expired, NOW)).toBe(false);
  });

  it('is expired at the exact instant its window elapses', () => {
    const token = aToken({ expiresAt: NOW });

    // The window is closed, not open, at the boundary.
    expect(isExpired(token, NOW)).toBe(true);
  });

  it('is not usable when both used and expired', () => {
    const token = aToken({ usedAt: NOW, expiresAt: new Date(NOW.getTime() - 1) });

    expect(isUsableResetToken(token, NOW)).toBe(false);
  });
});

describe('the reset token plaintext', () => {
  it('is 43 base64url characters', () => {
    const token = 'A'.repeat(RESET_TOKEN_LENGTH);

    expect(createResetTokenPlaintext(token).value).toBe(token);
    expect(RESET_TOKEN_LENGTH).toBe(43);
  });

  it('refuses a value of the wrong length', () => {
    expect(() => createResetTokenPlaintext('too-short')).toThrow();
  });

  it('refuses a value with characters outside base64url', () => {
    expect(() => createResetTokenPlaintext('+'.repeat(RESET_TOKEN_LENGTH))).toThrow();
    expect(() => createResetTokenPlaintext('/'.repeat(RESET_TOKEN_LENGTH))).toThrow();
  });
});

describe('the reset token hash', () => {
  it('requires a value', () => {
    expect(() => createResetTokenHash('')).toThrow();
  });

  it('keeps the value it is given', () => {
    expect(createResetTokenHash('a-digest').value).toBe('a-digest');
  });
});

describe('the reset URL', () => {
  it('carries the token in the fragment, never in the query string', () => {
    const url = buildResetUrl('https://findback.example.org', {
      value: 'A'.repeat(RESET_TOKEN_LENGTH),
    });

    // The fragment is not part of the request line, so the token never
    // reaches an access log. The query string **is** part of the request
    // line, so a token there is logged before any application code runs.
    expect(url).toContain('#token=');
    expect(url).not.toContain('?');
  });

  it('strips a trailing slash from the base URL', () => {
    const url = buildResetUrl('https://findback.example.org/', { value: 'token-value' });

    expect(url).toBe('https://findback.example.org/reset-password#token=token-value');
  });
});

describe('the neutral reset confirmation', () => {
  it('is the same value every time it is created', () => {
    expect(createNeutralResetConfirmation().value).toBe(
      createNeutralResetConfirmation().value,
    );
  });

  it('is byte-for-byte identical — one value, one place', () => {
    expect(createNeutralResetConfirmation().value).toBe(NEUTRAL_RESET_CONFIRMATION);
  });

  it('does not disclose whether an account exists', () => {
    // The copy names the condition rather than asserting it.
    expect(NEUTRAL_RESET_CONFIRMATION).toContain('If an account exists');
  });
});

describe('the profile change', () => {
  it('carries a display name', () => {
    const change = createProfileChange({ displayName: 'Jane Smith' });

    expect(change.displayName?.value).toBe('Jane Smith');
  });

  it('carries a self-declared role', () => {
    const change = createProfileChange({ selfDeclaredRole: 'Employee' });

    expect(change.selfDeclaredRole?.role).toBe('Employee');
  });

  it('carries the Other role with its free text', () => {
    const change = createProfileChange({
      selfDeclaredRole: 'Other',
      selfDeclaredRoleOther: 'Contractor',
    });

    expect(change.selfDeclaredRole?.otherText).toBe('Contractor');
  });

  it('treats an absent field as "leave it as it is"', () => {
    const change = createProfileChange({ displayName: undefined, selfDeclaredRole: null });

    expect(change.displayName).toBeUndefined();
    expect(change.selfDeclaredRole).toBeUndefined();
  });

  it('is empty when nothing was supplied', () => {
    expect(isEmptyProfileChange(createProfileChange({}))).toBe(true);
  });

  it('is not empty when a field was supplied', () => {
    expect(isEmptyProfileChange(createProfileChange({ displayName: 'Jane' }))).toBe(false);
  });

  it('refuses an empty display name', () => {
    expect(() => createProfileChange({ displayName: '   ' })).toThrow();
  });

  it('refuses a role that is not one of the four options', () => {
    expect(() => createProfileChange({ selfDeclaredRole: 'Wizard' })).toThrow();
  });
});
