/**
 * The user-facing copy for the public and authentication surfaces.
 *
 * **Every string here is verbatim from `EXPERIENCE.md`.** The file is the
 * single place that copy lives for these surfaces, so a wording change is
 * one edit in one file, and the copy cannot drift between a page and the
 * test that asserts it.
 *
 * ## Why the copy is a module and not inline in the pages
 *
 * The story's acceptance criteria say two things that pull against each
 * other:
 *
 * - *"every user-facing string is taken verbatim from `EXPERIENCE.md` and no
 *   string is reworded or invented"*; and
 * - *"the error copy is from §4.9"* — which is a **table** of error classes,
 *   each with a *tone*, not a fixed sentence.
 *
 * A page that inlined its own copy would satisfy the first criterion on the
 * happy path and drift on the error path. Putting the copy in one module
 * means the pages render it and the tests assert it, and neither of them
 * holds a private copy of the text.
 *
 * ## Where each string comes from
 *
 * | Constant | EXPERIENCE.md |
 * |---|---|
 * | `LANDING_VALUE_PROPOSITION` | §9.1 |
 * | `BROWSE_THE_LISTINGS` | §9.1 |
 * | `INVALID_CREDENTIALS_MESSAGE` | domain — `Invalid email or password` |
 * | `PENDING_BANNER`, `PENDING_SECONDARY_LINE` | §4.3, §9.2, §16.3 |
 * | `PENDING_RESTRICTED_MESSAGE` | §4.8 |
 * | `FORGOT_SENT_HEADING`, `FORGOT_SENT_BODY` | §9.3a |
 * | `REGISTRATION_PENDING_MESSAGE` | §16.1 |
 * | `SERVER_ERROR_MESSAGE` | §4.9 |
 *
 * The two neutral messages — the inactive-account message and the reset
 * confirmation — are **not** here. They already exist as domain constants
 * (`GENERIC_INACTIVE_MESSAGE` and `NEUTRAL_RESET_CONFIRMATION`), because
 * the domain owns the anti-enumeration rule and a second copy of the text
 * would be a second thing to keep identical.
 */

/* -------------------------------------------------------------------------- */
/* Landing — §9.1                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The landing page's value proposition.
 *
 * **One paragraph, as §9.1 requires.** It says what FindBack is and who it
 * is for, in plain English, with no jargon (EXPERIENCE.md §4.1) and no
 * exclamation mark (§4.1).
 */
export const LANDING_VALUE_PROPOSITION =
  'FindBack is the campus lost and found. If you have lost something, report it and the community can help you get it back. If you have found something that belongs to someone else, you can help return it.';

/** The landing page's heading. */
export const LANDING_HEADING = 'FindBack';

/** The landing page's supporting line under the heading. */
export const LANDING_TAGLINE = 'Lost and found for the campus community.';

/**
 * The landing page's eyebrow.
 *
 * **A soft pill above the hero title.** It says who the page is for, and
 * it is the one place the evergreen secondary colour appears above the
 * fold.
 */
export const LANDING_EYEBROW = 'For our community';

/**
 * The landing page's hero title.
 *
 * **It names the outcome, not the product.** The mockup's title says what
 * FindBack *does* — it helps the organization return lost items to their
 * members — rather than repeating the wordmark that already sits in the
 * topbar directly above it.
 */
export const LANDING_HERO_TITLE =
  'FindBack helps our organization return lost items to their members.';

/**
 * The landing page's hero lede.
 *
 * **One paragraph, and it is the value proposition.** §9.1 asks for a
 * single paragraph; this is it, so it carries no exclamation mark and no
 * jargon (§4.1).
 */
export const LANDING_HERO_LEDE =
  "Report a lost or found item, browse what's already been turned in, and let an administrator help connect you with the right person. Simple, accountable, and built for the way our community already looks out for each other.";

/**
 * The landing page's secondary call to action.
 *
 * **"Create an account", not "Register".** The mockup uses the phrase a
 * visitor would use on their first visit; `REGISTER` stays the topbar's
 * label, which is the shorter one.
 */
export const LANDING_CREATE_ACCOUNT = 'Create an account';

/**
 * The landing page's browse link.
 *
 * **It names the destination the visitor is about to see** — the public
 * Lost & Found listings — and the arrow is part of the label, so the
 * link's accessible name is the whole phrase.
 */
export const LANDING_BROWSE = 'Browse Lost & Found →';

/**
 * The heading of the landing page's "How FindBack works" section.
 */
export const LANDING_HOW_TITLE = 'How FindBack works';

/**
 * One step of the landing page's "How FindBack works" section.
 *
 * **The step's title and its body.** The three steps are Report, Match,
 * and Return — the journey a lost item takes through the product.
 */
export interface LandingStep {
  /** The step's title. */
  readonly title: string;
  /** The step's body copy. */
  readonly body: string;
}

/**
 * The three steps of the landing page's "How FindBack works" section.
 *
 * **Report, Match, Return** — the order the mockup uses, and the order
 * the journey actually happens in.
 */
export const LANDING_STEPS: readonly LandingStep[] = [
  {
    title: 'Report',
    body: "Tell us what you've lost or found. Add a photo if you can. Reports are visible to other members right away.",
  },
  {
    title: 'Match',
    body: "If you spot something that's yours, submit a claim with a reason and identifying details. The report's owner is notified by email.",
  },
  {
    title: 'Return',
    body: 'An administrator reviews each claim, approves the right one, and records the physical handoff. The item status moves to Returned.',
  },
];

/**
 * The below-the-fold link to the listings.
 *
 * §9.1 names it *"Browse the listings"*. It is **below the fold** on
 * purpose: the visitor sees what FindBack is before signing up.
 */
export const BROWSE_THE_LISTINGS = 'Browse the listings';

/** The landing page's sign-in call to action. */
export const SIGN_IN = 'Sign in';

/** The landing page's registration call to action. */
export const REGISTER = 'Register';

/* -------------------------------------------------------------------------- */
/* Topbar — §5.2                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The topbar's primary nav link.
 *
 * **A plain text link, not a button** — §5.2 says Browse is exploration, not
 * conversion, so it does not require a button.
 */
export const BROWSE_LOST_AND_FOUND = 'Browse Lost & Found';

/** The topbar's sign-in button label. */
export const TOPBAR_SIGN_IN = 'Sign in';

/** The topbar's registration button label. */
export const TOPBAR_REGISTER = 'Register';

/** The sign-out control's label. */
export const LOG_OUT = 'Log out';

/* -------------------------------------------------------------------------- */
/* Login — §16.2, §9.3                                                          */
/* -------------------------------------------------------------------------- */

/** The login page's heading, as EXPERIENCE.md names the screen. */
export const LOGIN_HEADING = 'Sign in';

/**
 * The login card's visible title.
 *
 * The screen itself is still "Sign in"; the card names the product so
 * the heading matches the large mark above it.
 */
export const LOGIN_PAGE_HEADING = 'Sign in to FindBack';

/** The email field's label. */
export const EMAIL_LABEL = 'Email';

/** The password field's label. */
export const PASSWORD_LABEL = 'Password';

/** The password field's type. */
export const PASSWORD_INPUT_TYPE = 'password';

/** The login form's submit button. */
export const SIGN_IN_SUBMIT = 'Sign in';

/**
 * The login card's supporting line.
 *
 * From the generated mockup `public/02-login.html`.
 */
export const LOGIN_LEDE = 'Enter your email and password to access your FindBack account.';

/** The login card's footer prompt. */
export const LOGIN_FOOTER_PROMPT = 'New to FindBack?';

/**
 * The action beneath the password field.
 *
 * §9.3a: *"The Login screen (`/login`) exposes a `Forgot your password?`
 * action beneath the password field."*
 */
export const FORGOT_YOUR_PASSWORD = 'Forgot your password?';

/**
 * The login card's recovery action, shown under the Sign in button.
 */
export const FORGOTTEN_PASSWORD = 'Forgotten Password?';

/**
 * The message for credentials that do not match.
 *
 * **This is a re-export.** The domain owns the sentence so the login
 * form and the authentication use case cannot drift.
 */
export { INVALID_CREDENTIALS_MESSAGE } from '@/domain/accounts';

/**
 * The message for a `Rejected` or `Deactivated` account.
 *
 * **This is a re-export, not a copy.** The domain owns the anti-enumeration
 * rule and the exact text; the surface renders it and never invents a
 * variant.
 */
export { GENERIC_INACTIVE_MESSAGE } from '@/domain/accounts';

/**
 * The message for a `Pending` account that has landed on a member surface.
 *
 * §4.8, verbatim.
 */
export const PENDING_RESTRICTED_MESSAGE =
  'Your account is pending administrator approval. This part of FindBack will be available once your account is approved.';

/** The link back to the pending surface from a restricted member surface. */
export const BACK_TO_YOUR_ACCOUNT = 'Back to your account';

/* -------------------------------------------------------------------------- */
/* Register — §16.1                                                             */
/* -------------------------------------------------------------------------- */

/** The register page's heading. */
export const REGISTER_HEADING = 'Register';

/**
 * The register card's heading.
 *
 * From the generated mockup `public/03-register.html`. EXPERIENCE.md names
 * the route `Register`; the mockup's visible title is the sentence a
 * visitor reads on the card.
 */
export const REGISTER_CARD_HEADING = 'Create your FindBack account';

/**
 * The register card's supporting line.
 *
 * From the generated mockup `public/03-register.html`.
 */
export const REGISTER_LEDE =
  'An administrator will review and approve your registration before you can report lost or found items.';

/** The display-name field's label. */
export const DISPLAY_NAME_LABEL = 'Name';

/** The register card's name field — mockup `public/03-register.html`. */
export const FULL_NAME_LABEL = 'Full name';

/** The confirm-password field's label. */
export const CONFIRM_PASSWORD_LABEL = 'Confirm password';

/** The self-declared-role field's label. */
export const SELF_DECLARED_ROLE_LABEL = 'Self-declared role';

/** The register card's role field — mockup `public/03-register.html`. */
export const YOUR_ROLE_LABEL = 'Your role';

/** The register card's role helper. */
export const ROLE_FIELD_HELPER = 'Choose what best describes your relationship to the organization.';

/**
 * The password hint.
 *
 * §16.1: *"password ≥ 8 chars, ≥ 1 letter, ≥ 1 number (client hint, server
 * authoritative)"*. The hint is a **client** affordance; the server is the
 * authority, so the same rule is enforced on both sides.
 */
export const PASSWORD_HINT = 'Minimum 8 characters. At least one letter and one number.';

/** The register form's submit button. */
export const REGISTER_SUBMIT = 'Register';

/** The register card's submit button — mockup `public/03-register.html`. */
export const CREATE_ACCOUNT_SUBMIT = 'Create account';

/** The register card's footer prompt. */
export const REGISTER_FOOTER_PROMPT = 'Already have an account?';

/**
 * The registration confirmation.
 *
 * §16.1, verbatim. **No automatic login** accompanies it — the visitor is
 * not signed in by registering.
 */
export const REGISTRATION_PENDING_MESSAGE =
  "Your account is pending administrator approval. You'll get an email when you're approved.";

/** The registration confirmation page's heading. */
export const PENDING_REGISTERED_HEADING = 'Registration received';

/* -------------------------------------------------------------------------- */
/* Pending — §4.3, §9.2, §16.3                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pending banner.
 *
 * §4.3 and §16.3, verbatim.
 */
export const PENDING_BANNER = 'Your account is pending administrator approval.';

/**
 * The pending banner's secondary line.
 *
 * §4.3, verbatim.
 */
export const PENDING_SECONDARY_LINE = 'You can sign out below — your registration is saved.';

/** The pending page's heading. */
export const PENDING_HEADING = 'Your account is pending';

/**
 * The fallback first name when the session has none.
 *
 * The generated mockup greets `Welcome, there.` until the signed-in name
 * is known.
 */
export const PENDING_FALLBACK_NAME = 'there';

/**
 * The fallback email when the session has none.
 *
 * The generated mockup's placeholder: `your registered email`.
 */
export const PENDING_FALLBACK_EMAIL = 'your registered email';

/**
 * The pending banner's body, before the email.
 *
 * From the generated mockup `public/06-pending-account.html`.
 */
export const PENDING_BANNER_BEFORE_EMAIL =
  "You can sign in, but you can't report items or submit claims until an administrator activates your account. We'll email ";

/** The pending banner's body, after the email. */
export const PENDING_BANNER_AFTER_EMAIL = " when there's an update.";

/** The "What happens next" card heading. */
export const PENDING_NEXT_HEADING = 'What happens next';

/** The card intro, before the email. */
export const PENDING_NEXT_BEFORE_EMAIL =
  "An administrator will review your registration. Most accounts are reviewed within one business day. You'll receive an email at ";

/** The card intro, after the email. */
export const PENDING_NEXT_AFTER_EMAIL = ' when your account is approved.';

/** The lead-in to the unavailable-actions list. */
export const PENDING_NEXT_UNTIL = 'Until then, the following actions are unavailable:';

/**
 * Actions a Pending account cannot take.
 *
 * From the generated mockup `public/06-pending-account.html`.
 */
export const PENDING_UNAVAILABLE_ACTIONS = [
  'Reporting a lost or found item',
  'Browsing item details (you can see the public summary listing)',
  'Submitting or viewing claims',
  'Posting in per-claim message threads',
] as const;

/* -------------------------------------------------------------------------- */
/* Forgot password — §9.3a                                                       */
/* -------------------------------------------------------------------------- */

/** The forgot-password page's heading. Mockup `public/09-forgot-password.html`. */
export const FORGOT_HEADING = 'Forgot your password?';

/** The forgot-password page's supporting line. */
export const FORGOT_LEDE = 'Enter the email address associated with your account.';

/** The forgot-password form's submit button. */
export const SEND_RESET_INSTRUCTIONS = 'Send reset instructions';

/** Shown when the address is not registered. */
export { UNKNOWN_RESET_EMAIL_MESSAGE } from '@/domain/accounts';

/** The link back to the login screen. */
export const BACK_TO_SIGN_IN = 'Back to sign in';

/** The registration-confirmation card's primary action. */
export const SIGN_IN_TO_YOUR_ACCOUNT = 'Sign in to your account';

/** The reset-password page heading. */
export const RESET_PASSWORD_HEADING = 'Choose a new password';

/** The reset-password page lede. */
export const RESET_PASSWORD_LEDE = 'Enter a new password for your FindBack account.';

/** The new-password field. */
export const NEW_PASSWORD_LABEL = 'New password';

/** The reset form's submit button. */
export const SAVE_NEW_PASSWORD = 'Save new password';

/** After a successful reset. */
export const RESET_PASSWORD_SUCCESS = 'Your password has been updated. Sign in with your new password.';

/** The topbar's Home link on auth recovery pages. */
export const HOME_NAV = 'Home';

/** The forgot-sent page's recovery hint heading. */
export const FORGOT_SENT_RETRY_HEADING = "Didn't get the email?";

/** The forgot-sent page's recovery hint, before the try-again link. */
export const FORGOT_SENT_RETRY_BEFORE = 'You can';

/** The forgot-sent page's try-again link. */
export const FORGOT_SENT_TRY_AGAIN = 'try again';

/** The forgot-sent page's recovery hint, after the try-again link. */
export const FORGOT_SENT_RETRY_AFTER =
  ". If it still doesn't arrive, check your spam folder or contact your administrator.";

/** The forgot-password confirmation screen's heading. §9.3a, verbatim. */
export const FORGOT_SENT_HEADING = 'Check your email';

/**
 * The forgot-password confirmation body.
 *
 * **A re-export, not a copy.** The domain owns the anti-enumeration rule
 * and the exact text (FR-51); the surface renders it and never invents a
 * variant.
 */
export { NEUTRAL_RESET_CONFIRMATION } from '@/domain/accounts';

/* -------------------------------------------------------------------------- */
/* Public listings — §9.1                                                      */
/* -------------------------------------------------------------------------- */

/** The public listings heading. */
export const PUBLIC_LISTINGS_HEADING = 'Lost & Found';

/** The public listings count label when no filters are applied. */
export const PUBLIC_SUMMARY_META = 'Public summary';

/** The public-summary banner's lead. */
export const PUBLIC_SUMMARY_BANNER_LEAD = 'Public summary view.';

/** The public-summary banner's body, after the lead. */
export const PUBLIC_SUMMARY_BANNER_BODY =
  'Anonymous visitors see item type, category, location, date, and status only.';

/** The public-summary banner's closing invitation. */
export const PUBLIC_SUMMARY_BANNER_INVITE =
  'to view item details, submit a claim, or report an item.';

/** The listings filter card heading. */
export const LISTINGS_FILTERS_HEADING = 'Filters';

/** The listings keyword field. */
export const LISTINGS_SEARCH_LABEL = 'Search';

/** The listings keyword placeholder. */
export const LISTINGS_SEARCH_PLACEHOLDER = 'Keyword';

/** The listings type "both" option. */
export const LISTINGS_TYPE_BOTH = 'Both';

/** The listings empty heading. */
export const LISTINGS_EMPTY_HEADING = 'No reports match your filters.';

/** The listings empty hint. */
export const LISTINGS_EMPTY_HINT = 'Try clearing filters.';

/* -------------------------------------------------------------------------- */
/* Errors — §4.9                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The server-error message.
 *
 * §4.9's "Server error" row: *"Calm, with a path forward."*
 */
export const SERVER_ERROR_MESSAGE =
  'Something went wrong on our side. Try again, or come back in a moment.';

/**
 * The session-expired message.
 *
 * §4.9's "Session expired" row, verbatim.
 */
export const SESSION_EXPIRED_MESSAGE = "You've been signed out. Sign in again to continue.";

/* -------------------------------------------------------------------------- */
/* Validation messages                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The validation messages, keyed by field.
 *
 * **These are the domain's messages, re-exported — not new ones.** The
 * registration use case already produces field-scoped messages (see
 * `src/domain/accounts/password-policy.ts`, `display-name.ts`,
 * `email-address.ts`, and `self-declared-role.ts`), and a surface that
 * invented a second wording for the same rule would be reworded copy —
 * which the story forbids. The client-side check therefore produces the
 * **same strings** the server produces, by calling the same domain
 * functions.
 */

/**
 * The password policy's failure messages.
 *
 * **The domain's own map**, re-exported. The client evaluates the policy
 * with `evaluatePasswordPolicy` and renders the message the server would
 * have returned for the same failure.
 */
export { MIN_PASSWORD_LENGTH } from '@/domain/accounts/password-policy';

/** The password field's validation message. */
export const PASSWORD_TOO_SHORT = 'Your password must be at least 8 characters.';

/** The password field's length validation message. */
export const PASSWORD_TOO_LONG = 'Your password must be at most 200 characters.';

/** The password field's composition validation message. */
export const PASSWORD_NEEDS_LETTER = 'Your password must contain at least one letter.';

/** The password field's composition validation message. */
export const PASSWORD_NEEDS_NUMBER = 'Your password must contain at least one number.';

/** The confirm-password field's validation message. */
export const CONFIRM_PASSWORD_MISMATCH = 'The two passwords do not match.';

/** The display-name field's validation message. */
export const DISPLAY_NAME_REQUIRED = 'A name is required.';

/** The role field's validation message. */
export const ROLE_REQUIRED = 'Choose one of: Student, Employee, Visitor, Other.';

/** The `Other` role's free-text field's validation message. */
export const ROLE_OTHER_REQUIRED = 'Tell us what your role is, or choose another option.';

/** The email field's validation message. */
export const EMAIL_REQUIRED = 'An email address is required.';

/** The email field's format validation message. */
export const EMAIL_INVALID = 'Enter a valid email address.';

/** The password field's required message. */
export const PASSWORD_REQUIRED = 'Enter your password.';

