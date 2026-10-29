/**
 * The bounded-text value objects' shared constructor.
 *
 * **Why the lengths are value objects and not bare strings.** The bounds are
 * **inclusive at both ends** — the PRD's edge cases are explicit ("Description
 * of exactly 10 or 2000 chars | Accepted; the bound is inclusive"). A bare
 * `string` with a length check somewhere else is how a bound gets
 * re-implemented slightly differently on the edit path, and story 003's
 * technical note says the same validator serves creation **and** reporter
 * edit. Wrapping the bound in the type makes "the same validator" structural:
 * there is one constructor, and it cannot be called with an invalid value.
 *
 * **Whitespace-only is rejected** for a field with a minimum length, because
 * the minimum length is not met by whitespace. This is story 003's edge case:
 * "Whitespace-only name | Rejected; minimum length is not met by whitespace".
 *
 * The length is measured in **code points**, not UTF-16 code units, so an
 * emoji or an accented character counts as one character — which is what a
 * member means by "characters", and what the database's `char_length` counts.
 *
 * **The brand is what makes the types distinct.** `ReportName` and
 * `ReportDescription` are both bounded text, but they are **not**
 * interchangeable: passing a description where a name is expected is a bug,
 * and the type must refuse it. A generic brand parameter does that with one
 * constructor and no runtime cost — `BoundedText<'name'>` and
 * `BoundedText<'description'>` are different types to the compiler, and
 * neither can be forged from the other.
 *
 * A brand is not a security boundary — a caller with `any` can forge one —
 * but it makes the mistake a **compile error**, which is the point.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/**
 * A text value with an inclusive length bound.
 *
 * @typeParam Brand - the field's identity. Two bounded texts with different
 * brands are different types.
 */
export interface BoundedText<Brand extends string = string> {
  /** The text, with surrounding whitespace removed. */
  readonly value: string;
  /**
   * The brand.
   *
   * **Never read, never compared, never serialized.** It exists so the
   * compiler knows which bounded text this is. The `readonly` brand literal
   * is what makes `BoundedText<'name'>` and `BoundedText<'description'>`
   * mutually unassignable.
   */
  readonly brand: Brand;
}

/**
 * Build a bounded text value.
 *
 * @param field - the field name, used in the error.
 * @param min - the inclusive minimum length.
 * @param max - the inclusive maximum length.
 * @param message - the member-facing copy for a length failure.
 * @param brand - the field's identity.
 */
export function buildBoundedText<Brand extends string>(
  field: string,
  value: string,
  min: number,
  max: number,
  message: string,
  brand: Brand,
): BoundedText<Brand> {
  const trimmed = value.trim();

  // `Array.from` splits by code point, so an astral character is one
  // character rather than two UTF-16 code units.
  const length = Array.from(trimmed).length;

  if (length < min || length > max) {
    throw new ValidationError(field, message);
  }

  return { value: trimmed, brand };
}

/**
 * Build an **optional** bounded text value.
 *
 * An absent field is `null` — an **explicit** absence, not an empty string.
 * The distinction matters: an omitted optional field and a field that was
 * submitted as empty are different facts, and the database distinguishes them
 * too (`NULL` versus `''`).
 */
export function buildOptionalBoundedText<Brand extends string>(
  field: string,
  value: string | null | undefined,
  max: number,
  message: string,
  brand: Brand,
): BoundedText<Brand> | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  // An empty string on an optional field is **absent**, not a violation. The
  // PRD's bound for an optional field is "0–N chars", and 0 chars is what an
  // empty string holds.
  if (trimmed.length === 0) {
    return null;
  }

  const length = Array.from(trimmed).length;

  if (length > max) {
    throw new ValidationError(field, message);
  }

  return { value: trimmed, brand };
}
