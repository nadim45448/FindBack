/**
 * The client-side validation's tests.
 *
 * **The property this suite exists to protect: the client and the server
 * cannot disagree.** Story 002's technical note says the client validates
 * "for affordance" and the server "for authority" — and that means the
 * client check must be *the same check*, not a paraphrase of it.
 *
 * **So the suite calls the domain's own functions and compares.** If the
 * client re-implemented a rule, the two answers could differ, and a
 * member would be told their password was fine and then refused by the
 * server for the same password.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluatePasswordPolicy,
  isPlausibleEmailShape,
  normalizeEmail,
} from '@/domain/accounts';

import {
  CONFIRM_PASSWORD_MISMATCH,
  DISPLAY_NAME_REQUIRED,
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  PASSWORD_NEEDS_LETTER,
  PASSWORD_NEEDS_NUMBER,
  PASSWORD_REQUIRED,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  ROLE_OTHER_REQUIRED,
  ROLE_REQUIRED,
} from './copy';
import { validateForgot, validateLogin, validateRegister, validateResetPassword } from './form-validation';

/** A register form's values, all valid. */
const VALID_REGISTER = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct1',
  confirmPassword: 'correct1',
  selfDeclaredRole: 'Student',
  selfDeclaredRoleOther: '',
} as const;

/** A login form's values, all valid. */
const VALID_LOGIN = { email: 'ada@example.com', password: 'correct1' } as const;

describe('the register form’s validation', () => {
  it('accepts valid values', () => {
    expect(validateRegister(VALID_REGISTER)).toEqual({});
  });

  it('requires a name', () => {
    expect(validateRegister({ ...VALID_REGISTER, displayName: '   ' })['displayName']).toBe(
      DISPLAY_NAME_REQUIRED,
    );
  });

  it('requires an email address', () => {
    expect(validateRegister({ ...VALID_REGISTER, email: '' })['email']).toBe(EMAIL_REQUIRED);
  });

  it('rejects an implausible email address', () => {
    expect(validateRegister({ ...VALID_REGISTER, email: 'not-an-email' })['email']).toBe(
      EMAIL_INVALID,
    );
  });

  it('requires a password', () => {
    expect(validateRegister({ ...VALID_REGISTER, password: '', confirmPassword: '' })['password']).toBe(
      PASSWORD_REQUIRED,
    );
  });

  it('reports a password that is too short', () => {
    expect(validateRegister({ ...VALID_REGISTER, password: 'a1', confirmPassword: 'a1' })['password']).toBe(
      PASSWORD_TOO_SHORT,
    );
  });

  it('reports a password with no letter', () => {
    expect(
      validateRegister({ ...VALID_REGISTER, password: '12345678', confirmPassword: '12345678' })[
        'password'
      ],
    ).toBe(PASSWORD_NEEDS_LETTER);
  });

  it('reports a password with no number', () => {
    expect(
      validateRegister({ ...VALID_REGISTER, password: 'abcdefgh', confirmPassword: 'abcdefgh' })[
        'password'
      ],
    ).toBe(PASSWORD_NEEDS_NUMBER);
  });

  it('reports a password that is too long', () => {
    const long = `${'a'.repeat(200)}1`;

    expect(
      validateRegister({ ...VALID_REGISTER, password: long, confirmPassword: long })['password'],
    ).toBe(PASSWORD_TOO_LONG);
  });

  it('reports a confirmation that does not match', () => {
    expect(
      validateRegister({ ...VALID_REGISTER, confirmPassword: 'different1' })['confirmPassword'],
    ).toBe(CONFIRM_PASSWORD_MISMATCH);
  });

  it('requires a role', () => {
    expect(validateRegister({ ...VALID_REGISTER, selfDeclaredRole: '' })['selfDeclaredRole']).toBe(
      ROLE_REQUIRED,
    );
  });

  it('rejects a role that is not one of the four', () => {
    expect(
      validateRegister({ ...VALID_REGISTER, selfDeclaredRole: 'Administrator' })['selfDeclaredRole'],
    ).toBe(ROLE_REQUIRED);
  });

  it('requires the detail when Other is chosen', () => {
    expect(
      validateRegister({ ...VALID_REGISTER, selfDeclaredRole: 'Other' })['selfDeclaredRoleOther'],
    ).toBe(ROLE_OTHER_REQUIRED);
  });

  it('does not require the Other detail when another role is chosen', () => {
    // **A member who picked `Student` has no reason to fill in the
    // `Other` free text.** Requiring it would be a rule nobody asked for.
    expect(
      validateRegister({ ...VALID_REGISTER, selfDeclaredRole: 'Employee' })['selfDeclaredRoleOther'],
    ).toBeUndefined();
  });

  it('reports every invalid field at once', () => {
    // **A form reports all of them, not one at a time.** The error
    // summary lists them all, and the member fixes them in one pass.
    const errors = validateRegister({
      displayName: '',
      email: 'nope',
      password: 'x',
      confirmPassword: 'y',
      selfDeclaredRole: '',
      selfDeclaredRoleOther: '',
    });

    expect(Object.keys(errors).sort()).toEqual([
      'confirmPassword',
      'displayName',
      'email',
      'password',
      'selfDeclaredRole',
    ]);
  });
});

describe('the client and the server agreeing', () => {
  it('applies the domain’s own password policy', () => {
    // **The same function the server calls.** A password the domain
    // rejects must be rejected here, with the same reason.
    const passwords = ['short1', 'abcdefgh', '12345678', 'correct1', `${'a'.repeat(200)}1`];

    for (const password of passwords) {
      const policy = evaluatePasswordPolicy(password);
      const errors = validateRegister({
        ...VALID_REGISTER,
        password,
        confirmPassword: password,
      });

      if (policy.ok) {
        expect(errors['password']).toBeUndefined();
      } else {
        expect(errors['password']).toBeDefined();
      }
    }
  });

  it('applies the domain’s own email shape check', () => {
    const addresses = ['', 'ada@example.com', 'not-an-email', 'a@b', 'a b@example.com'];

    for (const email of addresses) {
      const errors = validateRegister({ ...VALID_REGISTER, email });
      const plausible = normalizeEmail(email).length > 0 && isPlausibleEmailShape(normalizeEmail(email));

      expect(errors['email'] === undefined).toBe(plausible);
    }
  });

  it('normalises the email the same way the server does', () => {
    // **The domain's own `normalizeEmail`** — so a member who typed
    // `Ada@Example.com` is not told the address is invalid.
    const errors = validateRegister({ ...VALID_REGISTER, email: '  Ada@Example.com  ' });

    expect(errors['email']).toBeUndefined();
  });
});

describe('the login form’s validation', () => {
  it('accepts valid values', () => {
    expect(validateLogin(VALID_LOGIN)).toEqual({});
  });

  it('requires an email address', () => {
    expect(validateLogin({ ...VALID_LOGIN, email: '' })['email']).toBe(EMAIL_REQUIRED);
  });

  it('rejects an implausible email address', () => {
    expect(validateLogin({ ...VALID_LOGIN, email: 'nope' })['email']).toBe(EMAIL_INVALID);
  });

  it('requires a password', () => {
    expect(validateLogin({ ...VALID_LOGIN, password: '' })['password']).toBe(PASSWORD_REQUIRED);
  });

  it('never says whether the password is wrong', () => {
    // **A wrong password is an authentication outcome, not a validation
    // failure.** The client must not tell the member their password is
    // wrong — that would leak whether the account exists, which is the
    // anti-enumeration rule the server enforces.
    const errors = validateLogin({ email: 'ada@example.com', password: 'wrong-password' });

    expect(errors).toEqual({});
  });
});

describe('the forgot-password form’s validation', () => {
  it('accepts a plausible address', () => {
    expect(validateForgot({ email: 'ada@example.com' })).toEqual({});
  });

  it('requires an email address', () => {
    expect(validateForgot({ email: '' })['email']).toBe(EMAIL_REQUIRED);
  });

  it('rejects an implausible email address', () => {
    expect(validateForgot({ email: 'nope' })['email']).toBe(EMAIL_INVALID);
  });

  it('never says whether the address is registered', () => {
    // **The form has no account lookup.** The neutral confirmation is
    // the server's, and the client has nothing to add.
    expect(validateForgot({ email: 'never-registered@example.com' })).toEqual({});
  });
});

describe('the reset-password form’s validation', () => {
  it('accepts a policy-compliant pair', () => {
    expect(validateResetPassword({ newPassword: 'correct1', confirmPassword: 'correct1' })).toEqual(
      {},
    );
  });

  it('requires both passwords', () => {
    const errors = validateResetPassword({ newPassword: '', confirmPassword: '' });

    expect(errors['newPassword']).toBe(PASSWORD_REQUIRED);
    expect(errors['confirmPassword']).toBe(PASSWORD_REQUIRED);
  });

  it('refuses a mismatch', () => {
    expect(
      validateResetPassword({ newPassword: 'correct1', confirmPassword: 'different1' })[
        'confirmPassword'
      ],
    ).toBe(CONFIRM_PASSWORD_MISMATCH);
  });
});
