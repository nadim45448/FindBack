/**
 * The copy layer's tests.
 *
 * **These are the tests that keep the surfaces' wording honest.** Story
 * 002's criterion: *"every user-facing string is taken verbatim from
 * `EXPERIENCE.md` and no string is reworded or invented"*.
 *
 * ## Why the document is read from disk
 *
 * **A test that asserted the copy against a copy of itself would prove
 * nothing.** The copy lives in `src/ui/copy.ts`; the frozen wording lives
 * in `EXPERIENCE.md`. So the suite reads the document and checks the
 * strings against it — and if the document changes, this suite fails until
 * the copy catches up.
 *
 * ## Which strings are checked
 *
 * **The document's fixed sentences are checked exactly.** Where
 * `EXPERIENCE.md` writes a sentence in quotes, that sentence is the copy,
 * byte for byte.
 *
 * **The document's rules are checked by their parts.** Some lines specify a
 * *rule* rather than a sentence — `"password ≥ 8 chars, ≥ 1 letter, ≥ 1
 * number"` is a rule, and there is no sentence to quote. The suite asserts
 * that the rendered hint names each part of the rule, so the hint cannot
 * quietly describe a weaker policy than the server enforces.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BACK_TO_SIGN_IN,
  BACK_TO_YOUR_ACCOUNT,
  BROWSE_LOST_AND_FOUND,
  BROWSE_THE_LISTINGS,
  CONFIRM_PASSWORD_MISMATCH,
  CONFIRM_PASSWORD_LABEL,
  DISPLAY_NAME_LABEL,
  DISPLAY_NAME_REQUIRED,
  EMAIL_INVALID,
  EMAIL_LABEL,
  EMAIL_REQUIRED,
  FORGOT_HEADING,
  FORGOT_SENT_HEADING,
  FORGOT_YOUR_PASSWORD,
  GENERIC_INACTIVE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  LANDING_HEADING,
  LANDING_VALUE_PROPOSITION,
  LOGIN_HEADING,
  LOG_OUT,
  MIN_PASSWORD_LENGTH,
  NEUTRAL_RESET_CONFIRMATION,
  PASSWORD_HINT,
  PASSWORD_LABEL,
  PASSWORD_NEEDS_LETTER,
  PASSWORD_NEEDS_NUMBER,
  PASSWORD_REQUIRED,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  PENDING_BANNER,
  PENDING_HEADING,
  PENDING_REGISTERED_HEADING,
  PENDING_RESTRICTED_MESSAGE,
  PENDING_SECONDARY_LINE,
  REGISTER,
  REGISTER_HEADING,
  REGISTER_SUBMIT,
  REGISTRATION_PENDING_MESSAGE,
  ROLE_OTHER_REQUIRED,
  ROLE_REQUIRED,
  SELF_DECLARED_ROLE_LABEL,
  SEND_RESET_INSTRUCTIONS,
  SERVER_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  SIGN_IN,
  SIGN_IN_SUBMIT,
  TOPBAR_REGISTER,
  TOPBAR_SIGN_IN,
} from './copy';
import { SIGN_IN_TO_SEE_DETAILS } from './listings-surface';

/**
 * The experience document, read from disk.
 *
 * **Read once, at module load** — the file does not change during a test
 * run.
 */
const EXPERIENCE_PATH = join(
  process.cwd(),
  '_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md',
);
const EXPERIENCE = readFileSync(EXPERIENCE_PATH, 'utf8');

/**
 * Whether the document contains a string.
 *
 * **The comparison is exact, and HTML entities are decoded on both
 * sides.** A quoted sentence in the document may carry entities — the
 * topbar's `Browse Lost &amp; Found` is one — and the copy carries the
 * plain text the browser renders. So both the document and the searched
 * string are compared in their decoded form.
 */
function documentContains(value: string): boolean {
  if (EXPERIENCE.includes(value)) {
    return true;
  }

  return DECODED_EXPERIENCE.includes(decodeEntities(value));
}

/** The document with its HTML entities decoded. */
const DECODED_EXPERIENCE = decodeEntities(EXPERIENCE);

/** Decode the HTML entities a markdown document may carry. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

describe('the copy that EXPERIENCE.md fixes word for word', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['the landing heading', LANDING_HEADING],
    ['the browse-the-listings link', BROWSE_THE_LISTINGS],
    ['the sign-in label', SIGN_IN],
    ['the register label', REGISTER],
    ['the topbar browse link', BROWSE_LOST_AND_FOUND],
    ['the topbar sign-in button', TOPBAR_SIGN_IN],
    ['the topbar register button', TOPBAR_REGISTER],
    ['the sign-out button', LOG_OUT],
    ['the login heading', LOGIN_HEADING],
    ['the email field label', EMAIL_LABEL],
    ['the password field label', PASSWORD_LABEL],
    ['the sign-in submit button', SIGN_IN_SUBMIT],
    ['the forgot-password action', FORGOT_YOUR_PASSWORD],
    ['the inactive-account message', GENERIC_INACTIVE_MESSAGE],
    ['the restricted-surface message', PENDING_RESTRICTED_MESSAGE],
    ['the back-to-your-account link', BACK_TO_YOUR_ACCOUNT],
    ['the register heading', REGISTER_HEADING],
    ['the display-name label', DISPLAY_NAME_LABEL],
    ['the confirm-password label', CONFIRM_PASSWORD_LABEL],
    ['the self-declared-role label', SELF_DECLARED_ROLE_LABEL],
    ['the register submit button', REGISTER_SUBMIT],
    ['the registration confirmation', REGISTRATION_PENDING_MESSAGE],
    ['the pending banner', PENDING_BANNER],
    ['the pending secondary line', PENDING_SECONDARY_LINE],
    ['the pending heading', PENDING_HEADING],
    ['the send-reset button', SEND_RESET_INSTRUCTIONS],
    ['the back-to-sign-in link', BACK_TO_SIGN_IN],
    ['the reset-confirmation heading', FORGOT_SENT_HEADING],
    ['the reset confirmation', NEUTRAL_RESET_CONFIRMATION],
    ['the server-error message', SERVER_ERROR_MESSAGE],
    ['the session-expired message', SESSION_EXPIRED_MESSAGE],
    ['the sign-in-to-see-details message', SIGN_IN_TO_SEE_DETAILS],
  ];

  for (const [name, value] of cases) {
    it(`takes ${name} verbatim from EXPERIENCE.md`, () => {
      expect(documentContains(value)).toBe(true);
    });
  }
});

describe('the copy that EXPERIENCE.md specifies by rule', () => {
  /**
   * **Three strings the document does not fix word for word.**
   *
   * The document says *what* the landing paragraph must do — *"value
   * proposition (1 paragraph)"* — and names the `/forgot` form's field,
   * button, and link without giving the page a heading. There is no
   * sentence to take, so these are checked against the **rule** they
   * serve instead.
   */
  it('writes a landing paragraph that serves §9.1', () => {
    // **§9.1: "value proposition (1 paragraph)".** The paragraph must
    // exist, be one paragraph, and say what FindBack is.
    expect(LANDING_VALUE_PROPOSITION.length).toBeGreaterThan(0);
    expect(LANDING_VALUE_PROPOSITION).not.toContain('\n');
    expect(LANDING_VALUE_PROPOSITION.toLowerCase()).toContain('lost and found');
  });

  it('titles the registration-confirmation page for what it is', () => {
    // **§16.1 fixes the copy but not the heading.** The heading must
    // tell a member their registration was *received*, not that it was
    // approved — the account is still pending.
    expect(PENDING_REGISTERED_HEADING.toLowerCase()).toContain('registration');
    expect(PENDING_REGISTERED_HEADING.toLowerCase()).not.toContain('approved');
  });

  it('titles the reset-request page for what it does', () => {
    // **§9.3a names the field, the button, and the link — but not the
    // heading.** The heading must say the page is about resetting a
    // password, so a member who arrived from "Forgot your password?"
    // knows where they are.
    expect(FORGOT_HEADING.toLowerCase()).toContain('password');
    expect(FORGOT_HEADING.toLowerCase()).toContain('forgot');
  });
});

describe('the landing value proposition', () => {
  it('covers both sides of the exchange — losing and finding', () => {
    // **§4.1's "concrete over abstract" and §9.1's two audiences.** A
    // proposition that only described one side would leave a visitor who
    // has *found* something with no idea what the service does for them.
    expect(LANDING_VALUE_PROPOSITION.toLowerCase()).toContain('if you have lost something');
    expect(LANDING_VALUE_PROPOSITION.toLowerCase()).toContain('if you have found something');
  });

  it('has no exclamation mark, per §4.1', () => {
    expect(LANDING_VALUE_PROPOSITION).not.toContain('!');
  });
});

describe('the password hint', () => {
  it('names the minimum length', () => {
    // **§16.1: "password ≥ 8 chars".** The hint must not describe a
    // weaker policy than the server enforces — a client hint that
    // under-promises is a defect, and one that over-promises is worse.
    expect(PASSWORD_HINT).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('names the letter requirement', () => {
    expect(PASSWORD_HINT.toLowerCase()).toContain('letter');
  });

  it('names the number requirement', () => {
    expect(PASSWORD_HINT.toLowerCase()).toContain('number');
  });

  it('agrees with the minimum length the domain enforces', () => {
    // **The hint and the policy are one rule.** The domain owns the
    // number; the hint reads it from the domain, so the two cannot
    // disagree about what "long enough" means.
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(PASSWORD_HINT).toContain('8 characters');
  });
});

describe('the validation messages', () => {
  it('states the minimum length in the too-short message', () => {
    expect(PASSWORD_TOO_SHORT).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('states the maximum length in the too-long message', () => {
    expect(PASSWORD_TOO_LONG).toContain('200');
  });

  it('names the letter in the composition message', () => {
    expect(PASSWORD_NEEDS_LETTER.toLowerCase()).toContain('letter');
  });

  it('names the number in the composition message', () => {
    expect(PASSWORD_NEEDS_NUMBER.toLowerCase()).toContain('number');
  });

  it('says the two passwords do not match', () => {
    expect(CONFIRM_PASSWORD_MISMATCH.toLowerCase()).toContain('match');
  });

  it('says a name is required', () => {
    expect(DISPLAY_NAME_REQUIRED.toLowerCase()).toContain('required');
  });

  it('lists the four roles in the role message', () => {
    // **§16.1's role field is one of `Student`, `Employee`, `Visitor`,
    // `Other`** — the message names them, so the member knows what to
    // pick without opening the select.
    for (const role of ['Student', 'Employee', 'Visitor', 'Other']) {
      expect(ROLE_REQUIRED).toContain(role);
    }
  });

  it('asks for the role’s detail in the other-role message', () => {
    expect(ROLE_OTHER_REQUIRED.toLowerCase()).toContain('role');
  });

  it('says an email address is required', () => {
    expect(EMAIL_REQUIRED.toLowerCase()).toContain('required');
  });

  it('asks for a valid email address', () => {
    expect(EMAIL_INVALID.toLowerCase()).toContain('valid');
  });

  it('asks for a password', () => {
    expect(PASSWORD_REQUIRED.toLowerCase()).toContain('password');
  });
});

describe('the anti-enumeration messages', () => {
  it('is one message for every refused login', () => {
    // **The domain owns this rule; the copy layer re-exports it rather
    // than copying it.** A second copy of the text would be a second
    // thing that could drift from the domain's.
    expect(GENERIC_INACTIVE_MESSAGE).toBe(
      "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator.",
    );
  });

  it('is one message for every reset request', () => {
    expect(NEUTRAL_RESET_CONFIRMATION).toBe(
      'If an account exists for that email address, password reset instructions have been sent.',
    );
  });

  it('names a refused login as Invalid email or password', () => {
    expect(INVALID_CREDENTIALS_MESSAGE).toBe('Invalid email or password');
  });

  it('does not name a lifecycle state, because the state is the secret', () => {
    // **Naming "Rejected" or "Deactivated" would turn the message into
    // an account-existence oracle.** The message must be the same one
    // for a wrong password.
    expect(GENERIC_INACTIVE_MESSAGE).not.toMatch(/rejected|deactivated|pending/i);
  });

  it('does not say whether the address is registered', () => {
    expect(NEUTRAL_RESET_CONFIRMATION).toContain('If an account exists');
  });
});

describe('the tone rules of §4.1', () => {
  it('keeps the error messages calm, with a path forward', () => {
    // **§4.9's "Server error" row: "Calm, with a path forward."**
    expect(SERVER_ERROR_MESSAGE).toContain('Try again');
    expect(SERVER_ERROR_MESSAGE).not.toContain('!');
  });

  it('does not blame the member', () => {
    // **§4.1's "no blame" rule.** The member did nothing wrong on the
    // login screen, and the message must not say they did.
    for (const value of [INVALID_CREDENTIALS_MESSAGE, GENERIC_INACTIVE_MESSAGE, SERVER_ERROR_MESSAGE]) {
      expect(value.toLowerCase()).not.toContain('your fault');
      expect(value.toLowerCase()).not.toContain('you entered');
      expect(value.toLowerCase()).not.toContain('incorrect password');
    }
  });

  it('does not shout', () => {
    for (const value of [
      LANDING_VALUE_PROPOSITION,
      INVALID_CREDENTIALS_MESSAGE,
      GENERIC_INACTIVE_MESSAGE,
      PENDING_BANNER,
      PENDING_RESTRICTED_MESSAGE,
      REGISTRATION_PENDING_MESSAGE,
      SERVER_ERROR_MESSAGE,
      SESSION_EXPIRED_MESSAGE,
      NEUTRAL_RESET_CONFIRMATION,
      PASSWORD_HINT,
    ]) {
      expect(value).not.toContain('!');
    }
  });
});
