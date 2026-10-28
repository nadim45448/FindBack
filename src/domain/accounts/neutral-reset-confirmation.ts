/**
 * The `NeutralResetConfirmation` value object.
 *
 * **This is FR-51's anti-enumeration rule for the response body, as a type.**
 *
 * FR-51 requires that a password-reset request not disclose whether an email
 * is registered, whether the account exists, or the account's status — and
 * that this hold in the **body**, the **timing**, and the **subsequent
 * screen state**.
 *
 * This object closes the **body** half. The copy is a single frozen value,
 * built once, **after** the branch that decides whether an email is sent —
 * so the branch cannot shape any part of the response. A registered address,
 * an unregistered address, and a registered address in any of the four
 * lifecycle states all receive this same value, byte for byte.
 *
 * **The copy is UX-governed.** `coding-standards.md` requires user-facing
 * wording to match `EXPERIENCE.md`, so the text below is the frozen §9.3a
 * confirmation and any change to it is a visible edit in one place.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The one message every reset request returns.
 *
 * Byte-for-byte identical for a registered address, an unregistered address,
 * and a registered address in any of the four lifecycle states.
 *
 * **The copy is frozen by `EXPERIENCE.md` §9.3a**, verbatim.
 */
export const NEUTRAL_RESET_CONFIRMATION =
  'If an account exists for that email address, password reset instructions have been sent.';

/** The neutral reset confirmation. */
export interface NeutralResetConfirmation {
  readonly value: string;
}

/**
 * The single neutral confirmation.
 *
 * A factory rather than a constant, so a caller cannot construct a
 * "neutral" message with different copy — which would defeat the whole
 * point. There is exactly one way to make this value, and it always has the
 * same text.
 */
export function createNeutralResetConfirmation(): NeutralResetConfirmation {
  return { value: NEUTRAL_RESET_CONFIRMATION };
}
