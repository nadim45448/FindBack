/**
 * The `ProfileChange` value object — the member profile's **closed edit
 * surface**.
 *
 * FR-52 says the member profile is edited by **exactly two fields**: the
 * display name and the self-declared role. The email is read-only, and the
 * status, the administrator flag, and every other lifecycle field are
 * read-only too.
 *
 * **The enforcement is the shape of the type, not a validation rule.** This
 * interface has two optional fields and no others, so there is **no code path**
 * by which an email, a status, or an administrator flag could reach the
 * aggregate. Four `if` statements refusing four forbidden edits would be a
 * convention a future edit could forget; a closed type is a fact.
 *
 * A client that sends `email` in the request body sends a field the server
 * ignores — the read-only property is structural.
 *
 * Pure — no I/O, no framework imports.
 */

import { createDisplayName, type DisplayName } from './display-name';
import {
  createSelfDeclaredRole,
  type SelfDeclaredRoleValue,
} from './self-declared-role';

/** The fields a member may change. There are exactly two. */
export interface ProfileChange {
  /** The new display name. Absent means "leave it as it is". */
  readonly displayName?: DisplayName | undefined;
  /** The new self-declared role. Absent means "leave it as it is". */
  readonly selfDeclaredRole?: SelfDeclaredRoleValue | undefined;
}

/**
 * Build a profile change from raw request values.
 *
 * The value objects do the validating, and each failure names its own field,
 * so the route boundary can attribute it without repeating the rules.
 *
 * `undefined` and `null` both mean "leave it as it is" — a client that omits
 * a field and a client that sends it as null mean the same thing.
 */
export function createProfileChange(params: {
  readonly displayName?: string | null;
  readonly selfDeclaredRole?: string | null;
  readonly selfDeclaredRoleOther?: string | null;
}): ProfileChange {
  const change: {
    displayName?: DisplayName;
    selfDeclaredRole?: SelfDeclaredRoleValue;
  } = {};

  if (params.displayName !== undefined && params.displayName !== null) {
    change.displayName = createDisplayName(params.displayName);
  }

  if (params.selfDeclaredRole !== undefined && params.selfDeclaredRole !== null) {
    change.selfDeclaredRole = createSelfDeclaredRole(
      params.selfDeclaredRole,
      params.selfDeclaredRoleOther ?? null,
    );
  }

  return change;
}

/**
 * True when the change would alter nothing.
 *
 * A member who opens the editor and saves without changing anything has
 * changed nothing — and the use case writes no audit record for it.
 */
export function isEmptyProfileChange(change: ProfileChange): boolean {
  return change.displayName === undefined && change.selfDeclaredRole === undefined;
}
