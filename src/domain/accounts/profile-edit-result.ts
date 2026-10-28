/**
 * The `ProfileEditResult` value object.
 *
 * FR-52 requires the audit record for a profile edit to carry **the changed
 * fields, and the previous values**. The use case computes both, so the
 * record never has to reconstruct them from the request — and a request that
 * omitted a field cannot make the record ambiguous about what changed.
 *
 * **The previous values are captured before the change, and only for the
 * fields that actually changed.** A field that was not edited has no previous
 * value recorded, because there was nothing to change and nothing to compare.
 *
 * Pure — no I/O, no framework imports.
 */

/** The two editable profile fields, by name. */
export type ProfileField = 'displayName' | 'selfDeclaredRole';

/** The values the editable fields held before the edit. */
export type ProfileFieldValues = Readonly<Partial<Record<ProfileField, string>>>;

/** The outcome of a profile edit. */
export interface ProfileEditResult {
  /** The fields the edit changed. Empty when the edit was a no-op. */
  readonly changedFields: readonly ProfileField[];
  /** The values those fields held before the edit. */
  readonly previousValues: ProfileFieldValues;
}
