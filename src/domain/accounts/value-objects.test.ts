/**
 * The value objects' tests.
 *
 * The two properties that matter most here are **email normalization** (a
 * duplicate differing only in case is a duplicate) and the **generic
 * inactive message** (one message, byte for byte).
 */

import { describe, expect, it } from 'vitest';

import { createDisplayName, MAX_DISPLAY_NAME_LENGTH } from './display-name';
import { createEmailAddress, isPlausibleEmailShape, normalizeEmail } from './email-address';
import { createGenericInactiveMessage, GENERIC_INACTIVE_MESSAGE } from './generic-inactive-message';
import {
  assertPasswordPolicy,
  evaluatePasswordPolicy,
  MIN_PASSWORD_LENGTH,
} from './password-policy';
import { createRejectionReason, MIN_REJECTION_REASON_LENGTH } from './rejection-reason';
import { createSelfDeclaredRole } from './self-declared-role';
import { ValidationError } from '@/lib/errors';

describe('the email address', () => {
  it('trims and lower-cases', () => {
    // Story 001's edge case: "Email with leading/trailing whitespace →
    // Trimmed before uniqueness check".
    expect(createEmailAddress('  Jane@Example.ORG  ').value).toBe('jane@example.org');
  });

  it('normalizes the same way every time', () => {
    expect(normalizeEmail(' Jane@Example.ORG ')).toBe(normalizeEmail('jane@example.org'));
  });

  it('rejects an empty address', () => {
    expect(() => createEmailAddress('   ')).toThrow(ValidationError);
  });

  it('rejects an over-long address', () => {
    expect(() => createEmailAddress(`${'a'.repeat(250)}@example.org`)).toThrow(ValidationError);
  });

  it('accepts a plausible address', () => {
    expect(isPlausibleEmailShape('jane@example.org')).toBe(true);
    expect(isPlausibleEmailShape('jane.doe+tag@sub.example.co.uk')).toBe(true);
  });

  it('refuses an implausible address', () => {
    expect(isPlausibleEmailShape('not-an-email')).toBe(false);
    expect(isPlausibleEmailShape('two@at@example.org')).toBe(false);
    expect(isPlausibleEmailShape('jane@example')).toBe(false);
    expect(isPlausibleEmailShape('@example.org')).toBe(false);
    expect(isPlausibleEmailShape('jane@example..org')).toBe(false);
    expect(isPlausibleEmailShape('jane doe@example.org')).toBe(false);
  });
});

describe('the display name', () => {
  it('accepts a Unicode name as entered', () => {
    // Story 001's edge case: "Unicode or very long display name →
    // Accepted, length-bounded".
    expect(createDisplayName('  José  García  ').value).toBe('José García');
  });

  it('rejects an empty name', () => {
    expect(() => createDisplayName('   ')).toThrow(ValidationError);
  });

  it('rejects an over-long name', () => {
    expect(() => createDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toThrow(
      ValidationError,
    );
  });
});

describe('the generic inactive message', () => {
  it('is the same message every time — byte for byte', () => {
    // FR-4, story 003 criterion 5, and story 007 criterion 3 all require
    // that a refused login be indistinguishable. The property is structural:
    // there is one message, and no way to build a different one.
    const first = createGenericInactiveMessage();
    const second = createGenericInactiveMessage();

    expect(first.value).toBe(second.value);
    expect(first.value).toBe(GENERIC_INACTIVE_MESSAGE);
  });

  it('says the account is not active', () => {
    expect(createGenericInactiveMessage().value).toContain('not active');
  });
});

describe('the password policy', () => {
  it('accepts a password with a letter and a number', () => {
    expect(evaluatePasswordPolicy('correct horse 1')).toEqual({ ok: true });
  });

  it('refuses a short password', () => {
    expect(evaluatePasswordPolicy('a1')).toEqual({ ok: false, reason: 'tooShort' });
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('refuses a password with no letter', () => {
    expect(evaluatePasswordPolicy('12345678')).toEqual({ ok: false, reason: 'noLetter' });
  });

  it('refuses a password with no number', () => {
    expect(evaluatePasswordPolicy('abcdefgh')).toEqual({ ok: false, reason: 'noNumber' });
  });

  it('throws with a message that names the failure', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(ValidationError);
    expect(() => assertPasswordPolicy('short')).toThrow(/at least 8 characters/);
  });
});

describe('the rejection reason', () => {
  it('is null when it is absent', () => {
    expect(createRejectionReason(null)).toBeNull();
    expect(createRejectionReason(undefined)).toBeNull();
    expect(createRejectionReason('   ')).toBeNull();
  });

  it('refuses a reason below the PRD minimum', () => {
    // FR-3: "minimum 5 characters".
    expect(() => createRejectionReason('no')).toThrow(ValidationError);
    expect(MIN_REJECTION_REASON_LENGTH).toBe(5);
  });

  it('accepts a reason at the minimum', () => {
    expect(createRejectionReason('12345')?.value).toBe('12345');
  });

  it('trims the reason', () => {
    expect(createRejectionReason('  Not a member  ')?.value).toBe('Not a member');
  });

  it('keeps the reason verbatim, including markup', () => {
    // Story 007's edge case: "Rejection reason containing HTML or script →
    // Stored verbatim for audit; never rendered as HTML".
    const reason = '<script>alert(1)</script>';

    expect(createRejectionReason(reason)?.value).toBe(reason);
  });
});

describe('the self-declared role', () => {
  it('accepts each of the four PRD roles', () => {
    for (const role of ['Student', 'Employee', 'Visitor']) {
      expect(createSelfDeclaredRole(role)).toEqual({ role, otherText: null });
    }
  });

  it('carries free text for the Other role', () => {
    expect(createSelfDeclaredRole('Other', '  Volunteer  ')).toEqual({
      role: 'Other',
      otherText: 'Volunteer',
    });
  });

  it('refuses the Other role without free text', () => {
    expect(() => createSelfDeclaredRole('Other')).toThrow(ValidationError);
  });

  it('refuses an unknown role', () => {
    expect(() => createSelfDeclaredRole('Administrator')).toThrow(ValidationError);
  });

  it('refuses free text on a non-Other role', () => {
    // The text belongs to the Other option alone; it is kept in a separate
    // column so one column never has to encode "which of four, and what".
    expect(createSelfDeclaredRole('Student', 'ignored')).toEqual({
      role: 'Student',
      otherText: null,
    });
  });
});
