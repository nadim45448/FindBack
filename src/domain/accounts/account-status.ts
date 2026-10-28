/**
 * The account lifecycle's status vocabulary and the self-declared role.
 *
 * The statuses are the PRD's four states, **verbatim** (coding-standards §
 * Naming conventions: "Status literals are named after the PRD, verbatim").
 * They are never renamed and never re-derived by a downstream unit.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The four account states.
 *
 * `Active` is the only status with member capability. `Pending` may
 * authenticate but gains no capability (FR-2). `Rejected` and `Deactivated`
 * do not authenticate at all.
 */
export const ACCOUNT_STATUSES = ['Pending', 'Active', 'Rejected', 'Deactivated'] as const;

/** The account status. */
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** True when the value is one of the four PRD states. */
export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * The four self-declared roles.
 *
 * A self-declared role is a member's own description of their relationship
 * to the organization. It is **stored as entered and grants no capability** —
 * it is not an authorization input (story 001's edge case).
 */
export const SELF_DECLARED_ROLES = ['Student', 'Employee', 'Visitor', 'Other'] as const;

/** The self-declared role. */
export type SelfDeclaredRole = (typeof SELF_DECLARED_ROLES)[number];

/** True when the value is one of the four PRD roles. */
export function isSelfDeclaredRole(value: string): value is SelfDeclaredRole {
  return (SELF_DECLARED_ROLES as readonly string[]).includes(value);
}

/**
 * The capability an account holds, derived from its status.
 *
 * This is the **single source of truth** for "may this account act?". A
 * downstream unit asks the `ActorContext`; it never re-derives the status
 * from a database read (story 006 criterion 5).
 */
export type AccountCapability = 'member' | 'none';

/**
 * The capability a status confers.
 *
 * `Active` is the only status that confers member capability. Everything
 * else — including `Pending` — confers none.
 */
export function capabilityFor(status: AccountStatus): AccountCapability {
  return status === 'Active' ? 'member' : 'none';
}
