/**
 * The fields a report edit may change — and, more importantly, **the fields
 * it may not**.
 *
 * **Two different sets, and they are not the same.**
 *
 * - **The reporter's edit** (FR-9) may change the FR-8 **content** set:
 *   name, category, description, date, campus area, exact place, identifying
 *   details. It may **not** change the image — image attachment is bolt
 *   `010`'s (story 013), and this bolt does not build it.
 * - **The administrator's edit** (FR-53) may change the same content set
 *   **plus image replacement**, and may **not** change the reporter, the
 *   report type, or the lifecycle status.
 *
 * **The editable set is a whitelist, and it is enforced by the shape of the
 * request** — the same "closed by construction" mechanism bolt `007` used
 * for the FR-8 field set, and for the same reason. A request carrying
 * `reporterId` has nowhere to put it.
 *
 * **`imageReplacement` is a command, not a field.** It is not a column on
 * the report; it names an *operation* — upload a new blob and point the
 * report at it. That is why it is a separate entry in the administrator's
 * set and absent from the reporter's.
 *
 * Pure — no I/O, no framework imports.
 */

/** The report's content fields — the FR-8 set a report edit may change. */
export type EditableContentField =
  | 'name'
  | 'category'
  | 'description'
  | 'date'
  | 'campusArea'
  | 'exactPlace'
  | 'identifyingDetails';

/**
 * Everything an administrator's edit may change.
 *
 * FR-53's editable set is exactly: report name, category, description, date,
 * location (campus area enum value and exact-place free text), identifying
 * details, and image replacement.
 */
export type AdministratorEditableField = EditableContentField | 'imageReplacement';

/** The content fields a **reporter's** edit may change. */
export const REPORTER_EDITABLE_FIELDS: readonly EditableContentField[] = Object.freeze([
  'name',
  'category',
  'description',
  'date',
  'campusArea',
  'exactPlace',
  'identifyingDetails',
]);

/** The fields an **administrator's** edit may change. */
export const ADMINISTRATOR_EDITABLE_FIELDS: readonly AdministratorEditableField[] = Object.freeze([
  'name',
  'category',
  'description',
  'date',
  'campusArea',
  'exactPlace',
  'identifyingDetails',
  'imageReplacement',
]);

/**
 * The fields a report edit may **never** change.
 *
 * FR-53 names them explicitly: reporter identity, report type, report
 * lifecycle status, any Claim content, any Recovery Response content, any
 * audit-trail entry, any Returned-confirmation fields, any substitute-receiver
 * fields.
 *
 * **The first three are this module's to enforce**, and they are enforced
 * three different ways:
 *
 * - **`reporterId`** — an aggregate invariant. The reporter is server-derived
 *   and is never a request field, so it is not in either editable set.
 * - **`type`** — an aggregate invariant. A report is Found or Lost for its
 *   whole life. This is what makes FR-10's type-asymmetric interaction rule
 *   well-defined: the type cannot change under the gate.
 * - **`status`** — the edit path carries no status field at all, so there is
 *   no value to change it to. FR-9 and FR-53 both say the edit never changes
 *   the status; here that is a **structural** fact, not a rule enforced at
 *   the call site.
 *
 * The remaining blocked fields belong to other modules, and this bolt simply
 * never reaches them.
 */
export const NON_EDITABLE_REPORT_FIELDS: readonly string[] = Object.freeze([
  'reporterId',
  'type',
  'status',
]);

/**
 * True when `field` may be changed by a reporter's edit.
 *
 * **This is the single answer to that question.** The edit service calls it
 * rather than keeping its own copy of the list, so the whitelist has exactly
 * one implementation point.
 */
export function isReporterEditable(field: string): field is EditableContentField {
  return (REPORTER_EDITABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * True when `field` may be changed by an administrator's edit.
 *
 * **The administrator's set is one field larger than the reporter's** — it
 * includes `imageReplacement`.
 */
export function isAdministratorEditable(field: string): field is AdministratorEditableField {
  return (ADMINISTRATOR_EDITABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * True when `field` may appear as a **change key** in an edit request.
 *
 * **The change set is the content set, for both editors.** The image is
 * editable by an administrator (FR-53 names image replacement), but it is
 * not a *column* — it is an **operation**: upload a blob and point the
 * report at it. So it travels as its own request member, never as a key in
 * the change map, and a request that offers it as a change key is refused
 * rather than silently ignored.
 *
 * **This is why the two questions are separate.** `isAdministratorEditable`
 * answers "may an administrator change this thing at all?" — eight things.
 * `isChangeKey` answers "may this name be a key in the change map?" — seven
 * content fields. Collapsing them would either refuse the image outright or
 * accept a key that is then dropped on the floor.
 */
export function isChangeKey(field: string): field is EditableContentField {
  return (REPORTER_EDITABLE_FIELDS as readonly string[]).includes(field);
}
