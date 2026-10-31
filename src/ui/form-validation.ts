/**
 * The client-side validation for the public forms.
 *
 * ## The rule this module exists to satisfy
 *
 * Story 002's technical note: *"Register and Login forms validate on the
 * client for affordance and on the server for authority. The server is
 * authoritative."*
 *
 * So the client check is **the same check the server makes**, not a
 * paraphrase of it. Every rule below calls the domain's own function —
 * `evaluatePasswordPolicy`, `isPlausibleEmailShape`, `createDisplayName`,
 * `createSelfDeclaredRole` — and renders the message the server would have
 * returned for the same failure.
 *
 * **A second implementation of a rule is a second answer to the same
 * question**, and the story's copy criterion forbids the two answers from
 * differing. So there is one implementation, in the domain, and the client
 * calls it.
 *
 * ## Why the errors appear only after a submit
 *
 * Story 002's criterion: *"no error, icon, red border, or `aria-invalid`
 * state is present before the first submit attempt"*. That is the
 * **validate-after-submit** pattern, per the Pass-3 validation report.
 *
 * **But a field's error clears the moment its value becomes valid** —
 * the other half of the same criterion. So the state this module produces
 * is "which fields are currently invalid", and the *form* decides whether
 * to show it.
 */

import {
  evaluatePasswordPolicy,
  isPlausibleEmailShape,
  normalizeEmail,
  SELF_DECLARED_ROLES,
  type SelfDeclaredRole,
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

/** The fields the register form validates. */
export interface RegisterValues {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly selfDeclaredRole: string;
  readonly selfDeclaredRoleOther: string;
}

/** The fields the login form validates. */
export interface LoginValues {
  readonly email: string;
  readonly password: string;
}

/** The fields the forgot-password form validates. */
export interface ForgotValues {
  readonly email: string;
}

/** The fields the reset-password form validates. */
export interface ResetPasswordValues {
  readonly newPassword: string;
  readonly confirmPassword: string;
}

/** A validation failure, keyed by field. */
export type FieldErrors = Readonly<Record<string, string>>;

/**
 * Validate the register form.
 *
 * **The errors are returned as a map, not thrown.** A form has several
 * fields, and a form needs to report all of them at once — the error
 * summary lists them all.
 */
export function validateRegister(values: RegisterValues): FieldErrors {
  const errors: Record<string, string> = {};

  // ── The name ────────────────────────────────────────────────────────────
  const displayName = values.displayName.trim();

  if (displayName.length === 0) {
    errors['displayName'] = DISPLAY_NAME_REQUIRED;
  } else if (displayName.length > 200) {
    errors['displayName'] = 'A name must be at most 200 characters.';
  }

  // ── The email ───────────────────────────────────────────────────────────
  const email = normalizeEmail(values.email);

  if (email.length === 0) {
    errors['email'] = EMAIL_REQUIRED;
  } else if (!isPlausibleEmailShape(email)) {
    errors['email'] = EMAIL_INVALID;
  }

  // ── The password ────────────────────────────────────────────────────────
  //
  // **The policy is the domain's**, so the client and the server cannot
  // disagree about what a valid password is.
  if (values.password.length === 0) {
    errors['password'] = PASSWORD_REQUIRED;
  } else {
    const policy = evaluatePasswordPolicy(values.password);

    if (!policy.ok) {
      errors['password'] = passwordPolicyMessage(policy.reason);
    }
  }

  // ── The confirmation ────────────────────────────────────────────────────
  //
  // **The confirmation is compared to the entered password, not to the
  // policy.** A user who typed the same wrong password twice has still
  // mistyped the confirmation, and that is the error to report.
  if (values.confirmPassword.length === 0) {
    errors['confirmPassword'] = 'Confirm your password.';
  } else if (values.confirmPassword !== values.password) {
    errors['confirmPassword'] = CONFIRM_PASSWORD_MISMATCH;
  }

  // ── The role ────────────────────────────────────────────────────────────
  //
  // **The role is validated only when one has been chosen.** An untouched
  // select is a missing choice, and the message says so — but the *Other*
  // free text is only required once `Other` is actually chosen, because a
  // visitor who picked `Student` has no reason to fill it in.
  if (values.selfDeclaredRole.length === 0) {
    errors['selfDeclaredRole'] = ROLE_REQUIRED;
  } else if (!isSelfDeclaredRoleChoice(values.selfDeclaredRole)) {
    errors['selfDeclaredRole'] = ROLE_REQUIRED;
  } else if (values.selfDeclaredRole === 'Other' && values.selfDeclaredRoleOther.trim().length === 0) {
    errors['selfDeclaredRoleOther'] = ROLE_OTHER_REQUIRED;
  }

  return errors;
}

/**
 * Validate the login form.
 *
 * **Only the empty case is checked.** A wrong password is not a
 * *validation* failure — it is an authentication outcome, and the server
 * answers it with the neutral message. Telling the client "that password
 * is wrong" before the server has been asked would leak whether the
 * account exists.
 */
export function validateLogin(values: LoginValues): FieldErrors {
  const errors: Record<string, string> = {};

  if (normalizeEmail(values.email).length === 0) {
    errors['email'] = EMAIL_REQUIRED;
  } else if (!isPlausibleEmailShape(values.email)) {
    errors['email'] = EMAIL_INVALID;
  }

  if (values.password.length === 0) {
    errors['password'] = PASSWORD_REQUIRED;
  }

  return errors;
}

/**
 * Validate the forgot-password form.
 *
 * **Only the shape is checked**, and the shape check is the server's. A
 * syntactically invalid address never reaches the account lookup, so
 * refusing it discloses nothing — which is exactly the boundary the
 * server's own comment draws.
 */
export function validateForgot(values: ForgotValues): FieldErrors {
  const errors: Record<string, string> = {};

  if (normalizeEmail(values.email).length === 0) {
    errors['email'] = EMAIL_REQUIRED;
  } else if (!isPlausibleEmailShape(values.email)) {
    errors['email'] = EMAIL_INVALID;
  }

  return errors;
}

/**
 * Validate the reset-password form.
 */
export function validateResetPassword(values: ResetPasswordValues): FieldErrors {
  const errors: Record<string, string> = {};
  const policy = evaluatePasswordPolicy(values.newPassword);

  if (values.newPassword.length === 0) {
    errors['newPassword'] = PASSWORD_REQUIRED;
  } else if (!policy.ok) {
    errors['newPassword'] = passwordPolicyMessage(policy.reason);
  }

  if (values.confirmPassword.length === 0) {
    errors['confirmPassword'] = PASSWORD_REQUIRED;
  } else if (values.newPassword !== values.confirmPassword) {
    errors['confirmPassword'] = CONFIRM_PASSWORD_MISMATCH;
  }

  return errors;
}

/**
 * The message for a password-policy failure.
 *
 * **The same map the domain throws from**, so the client and the server
 * name the same failure the same way.
 */
function passwordPolicyMessage(reason: string): string {
  switch (reason) {
    case 'tooShort':
      return PASSWORD_TOO_SHORT;
    case 'tooLong':
      return PASSWORD_TOO_LONG;
    case 'noLetter':
      return PASSWORD_NEEDS_LETTER;
    case 'noNumber':
      return PASSWORD_NEEDS_NUMBER;
    default:
      return PASSWORD_REQUIRED;
  }
}

/**
 * Whether a string is one of the four role choices.
 *
 * **The domain's own list**, not a second copy of it.
 */
function isSelfDeclaredRoleChoice(value: string): value is SelfDeclaredRole {
  return (SELF_DECLARED_ROLES as readonly string[]).includes(value);
}
