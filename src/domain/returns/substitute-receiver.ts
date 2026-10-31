/**
 * The substitute receiver — FR-24's three required fields.
 *
 * **A substitute is somebody who is not the default receiver.** When the item
 * went to someone other than the person who had a right to it, the
 * administrator records three things: the substitute's name, the default
 * receiver's authorization for that person, and the relationship between the
 * two. FR-24 names all three as required, and FR-25 refuses the confirmation
 * when none of them is present.
 *
 * ## The relationship is a closed set
 *
 * **Five values, and no others.** FR-24: *"relationship (single-select from
 * the enum Friend, Family Member, Colleague, Classmate, Other)"*. The set is
 * a **whitelist**: a value outside it is refused rather than stored. A
 * relationship the PRD does not name is not a relationship this system
 * understands, and recording it would put an unattributable handover on the
 * trail.
 *
 * ## The name is the substitute's name, not an account
 *
 * **The substitute is recorded by name, and no account link is created.**
 * Story 002's edge case says it outright: *"Substitute is a deactivated
 * account — Recorded by name as an unnamed party; no account link is
 * created."* A substitute is frequently someone who has no account at all —
 * a passerby, a family member, a classmate — and a system that required an
 * account would refuse exactly the handovers it exists to record.
 *
 * **So the name is bounded text and nothing more.** It is 1–80 characters,
 * matching the PRD's own bound and the report name's bound. It is **not** a
 * UUID, and it is not resolved against the accounts table.
 *
 * ## The authorization is the default receiver's, not the substitute's
 *
 * **The affirmation records the default receiver's consent.** Story 002: *"the
 * default receiver's authorization of that substitute is confirmed and
 * recorded"* and *"Authorization is a record of the **default receiver's**
 * consent, not the substitute's — the person who had a right to the item
 * agrees to hand it to someone else."*
 *
 * **FindBack performs no identity verification.** FR-24 says so explicitly:
 * *"the administrator's recorded affirmation is the entire confirmation
 * mechanism."* So the affirmation is a boolean the administrator records, and
 * its truth is not checked against anything.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/**
 * The relationship between the default receiver and the substitute.
 *
 * **The PRD's five values, verbatim.** Never renamed, never extended.
 */
export type SubstituteRelationship =
  | 'Friend'
  | 'Family Member'
  | 'Colleague'
  | 'Classmate'
  | 'Other';

/**
 * Every relationship, in the PRD's order.
 *
 * **The list is the whitelist.** A value outside it is refused.
 */
export const SUBSTITUTE_RELATIONSHIPS: readonly SubstituteRelationship[] = Object.freeze([
  'Friend',
  'Family Member',
  'Colleague',
  'Classmate',
  'Other',
]);

/** True when `value` is one of the PRD's five relationships. */
export function isSubstituteRelationship(value: string): value is SubstituteRelationship {
  return (SUBSTITUTE_RELATIONSHIPS as readonly string[]).includes(value);
}

/**
 * The substitute receiver's name.
 *
 * **A validated value, not a raw string.** The name is bounded 1–80
 * characters, and the bound is enforced here so that every path that accepts
 * a substitute accepts the same bound.
 */
export interface SubstituteReceiverName {
  readonly value: string;
}

/**
 * The bound on a substitute receiver's name.
 *
 * **The PRD's own bound** — FR-24 says "substitute receiver's name (1-80
 * chars)" — and the same bound the report name uses.
 */
export const SUBSTITUTE_RECEIVER_NAME_MIN_LENGTH = 1;
export const SUBSTITUTE_RECEIVER_NAME_MAX_LENGTH = 80;

/**
 * Validate a substitute receiver's name.
 *
 * **Whitespace-only is no name.** The story's edge case is explicit: *"Receiver
 * field present but whitespace only — Treated as no receiver; refused."* A
 * name of three spaces is not a name, and the trimming happens before the
 * length check so that `"   "` fails the *minimum* rather than being stored
 * as three spaces.
 *
 * **The name is trimmed before it is stored.** A trailing space in a name is
 * not part of the name, and a trail that records `"Maya "` and one that
 * records `"Maya"` are the same handover written two ways.
 *
 * @throws {ValidationError} when the name is missing, whitespace-only, or
 * outside 1–80 characters.
 */
export function createSubstituteReceiverName(value: string): SubstituteReceiverName {
  const trimmed = value.trim();

  if (trimmed.length < SUBSTITUTE_RECEIVER_NAME_MIN_LENGTH) {
    throw new ValidationError(
      'substituteReceiverName',
      'The substitute receiver’s name is required.',
    );
  }

  if (trimmed.length > SUBSTITUTE_RECEIVER_NAME_MAX_LENGTH) {
    throw new ValidationError(
      'substituteReceiverName',
      `The substitute receiver’s name must be at most ${SUBSTITUTE_RECEIVER_NAME_MAX_LENGTH} characters.`,
    );
  }

  return { value: trimmed };
}

/**
 * The default receiver's authorization of the substitute.
 *
 * **A boolean, and nothing more.** It records that the administrator
 * affirmed the default receiver agreed. FindBack performs no identity
 * verification, so there is no second fact to carry.
 */
export interface AuthorizationAffirmation {
  readonly confirmed: true;
}

/**
 * Validate the authorization affirmation.
 *
 * **An unconfirmed affirmation is refused.** FR-24 names the field required
 * whenever the substitute is not the claimant, and a `false` affirmation is
 * not an affirmation at all — it is the absence of the fact the record
 * exists to preserve.
 *
 * @throws {ValidationError} when the affirmation is not `true`.
 */
export function createAuthorizationAffirmation(value: boolean): AuthorizationAffirmation {
  if (value !== true) {
    throw new ValidationError(
      'authorizationAffirmation',
      'The default receiver’s authorization of the substitute must be confirmed.',
    );
  }

  return { confirmed: true };
}

/**
 * A substitute receiver — the three fields, together.
 *
 * **The three fields are one value, not three.** A substitute without a name,
 * without an authorization, or without a relationship is not a substitute —
 * it is a partially-filled form. Bundling them means a caller cannot carry a
 * name forward while forgetting the authorization.
 */
export interface SubstituteReceiver {
  readonly name: SubstituteReceiverName;
  readonly authorization: AuthorizationAffirmation;
  readonly relationship: SubstituteRelationship;
}

/**
 * Validate a relationship from the closed set.
 *
 * @throws {ValidationError} when the value is not one of the PRD's five.
 */
export function createSubstituteRelationship(value: string): SubstituteRelationship {
  if (!isSubstituteRelationship(value)) {
    throw new ValidationError(
      'relationship',
      `The relationship must be one of: ${SUBSTITUTE_RELATIONSHIPS.join(', ')}.`,
    );
  }

  return value;
}

/**
 * Validate the three substitute fields together.
 *
 * **All three are required, and the set is all-or-nothing.** FR-24: *"All
 * three fields are required when the substitute is not the claimant."*
 *
 * @throws {ValidationError} when any of the three is missing or invalid.
 */
export function createSubstituteReceiver(input: {
  readonly name: string;
  readonly authorizationConfirmed: boolean;
  readonly relationship: string;
}): SubstituteReceiver {
  return {
    name: createSubstituteReceiverName(input.name),
    authorization: createAuthorizationAffirmation(input.authorizationConfirmed),
    relationship: createSubstituteRelationship(input.relationship),
  };
}
