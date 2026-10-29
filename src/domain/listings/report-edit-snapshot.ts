/**
 * The `FieldSnapshot` and the `ReportEdit` — what an edit **changed**.
 *
 * **A snapshot names one field's previous and new value.** The field name is
 * drawn from the editable set, so a snapshot **cannot name a field that is
 * not editable**. The whitelist is enforced by the type, not by a check
 * someone can forget.
 *
 * **`PreviousValue` distinguishes "was not set" from "was empty."**
 *
 * A report with no exact place has an exact place of `null`. An edit that
 * sets one must record that the previous value was **absent** — which is
 * different from an empty string. Collapsing the two would make the audit
 * trail unable to answer "did this field have a value before?", and that is
 * exactly the question FR-19's previous-values rule exists to answer.
 *
 * This is the same `undefined`-versus-`null` distinction bolt `006`'s
 * row-mapping suite settled for the visibility projection: **a field that
 * was not selected is absent; a field that was selected but empty carries
 * its `null` through.**
 *
 * Pure — no I/O, no framework imports.
 */

import type { EditableContentField } from './report-editable-fields';

/**
 * A field's value before an edit.
 *
 * `undefined` means the field **was not set**. A string means it was set —
 * and the empty string is a set, empty value, which is different from not
 * set.
 */
export type PreviousValue = string | undefined;

/** One field's change. */
export interface FieldSnapshot {
  /** The field that changed. Drawn from the editable set. */
  readonly field: EditableContentField;
  /** The value it held before the edit. `undefined` means "was not set". */
  readonly previousValue: PreviousValue;
  /** The value it holds after the edit. */
  readonly newValue: string;
}

/**
 * An edit's changes.
 *
 * **An edit with no changed fields is not an edit.** The aggregate is empty
 * and produces no audit record — FR-53's edge cases name this explicitly
 * ("Edit made with no field changed → No-op; no change snapshot is
 * recorded"), and the reporter's edit follows the same rule even though FR-9
 * does not spell it out.
 *
 * The `EditOutcome` distinction exists because a service that returned
 * `void` would have to signal "nothing changed" by returning a falsy value
 * or by throwing, and both are wrong: one conflates "no change" with
 * failure, the other makes a legitimate request an error.
 */
export type EditOutcome =
  | { readonly kind: 'Changed'; readonly snapshots: readonly FieldSnapshot[] }
  | { readonly kind: 'Unchanged' };

/**
 * Build the outcome of an edit from the snapshots it produced.
 *
 * An empty snapshot list is an **unchanged** edit, and it is the only thing
 * that produces one.
 */
export function buildEditOutcome(snapshots: readonly FieldSnapshot[]): EditOutcome {
  if (snapshots.length === 0) {
    return { kind: 'Unchanged' };
  }

  return { kind: 'Changed', snapshots };
}

/**
 * Compare two values and build a snapshot when they differ.
 *
 * **The comparison is on the rendered value**, not on object identity: a
 * report's exact place is an `ExactPlace` value object, and two instances
 * holding the same text are the same value. Comparing the objects would
 * report a change on every edit.
 *
 * @returns the snapshot, or `null` when the value did not change.
 */
export function snapshotIfChanged(
  field: EditableContentField,
  previousValue: PreviousValue,
  newValue: string,
): FieldSnapshot | null {
  if (previousValue === newValue) {
    return null;
  }

  return { field, previousValue, newValue };
}

/**
 * The snapshots for a set of changes, in a **stable order**.
 *
 * The order is the editable set's order, not the request's — two requests
 * that change the same fields produce the same snapshot list, so the audit
 * trail is comparable across edits rather than depending on the order the
 * client happened to send its keys in.
 */
export function orderSnapshots(
  snapshots: readonly FieldSnapshot[],
  order: readonly EditableContentField[],
): FieldSnapshot[] {
  return [...snapshots].sort((left, right) => order.indexOf(left.field) - order.indexOf(right.field));
}
