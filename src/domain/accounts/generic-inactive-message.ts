/**
 * The `GenericInactiveMessage` value object.
 *
 * **This is the anti-enumeration rule, as a type.**
 *
 * FR-4, story 003 criterion 5, and story 007 criterion 3 all require that a
 * refused login be indistinguishable from a wrong password and from an
 * unknown email. Three requirements, one property.
 *
 * The property is enforced structurally: there is exactly one message, in
 * exactly one place, and the authentication service has exactly two
 * outcomes — an `AuthenticatedActor` or *this*. There is no third shape for
 * "wrong password" versus "unknown email" versus "rejected" versus
 * "deactivated", so there is nothing to accidentally make differ.
 *
 * The copy is taken verbatim from `EXPERIENCE.md` §9.3. It is a constant
 * here so that a change to the frozen copy is a visible edit in one place
 * rather than a drift across four branches.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The one message every refused login returns.
 *
 * Byte-for-byte identical for a wrong password, an unknown email, a
 * `Rejected` account, and a `Deactivated` account. A test asserts the
 * equality; the type makes it hard to violate in the first place.
 */
export const GENERIC_INACTIVE_MESSAGE =
  "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator.";

/** The generic inactive message. */
export interface GenericInactiveMessage {
  readonly value: string;
}

/**
 * The single generic inactive message.
 *
 * A factory rather than a constant, so a caller cannot construct a
 * "generic" message with different copy — which would defeat the whole
 * point.
 */
export function createGenericInactiveMessage(): GenericInactiveMessage {
  return { value: GENERIC_INACTIVE_MESSAGE };
}
