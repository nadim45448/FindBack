/**
 * The physical column names — **one artefact, five readers**.
 *
 * **The Prisma field names are not always the physical column names.**
 * Prisma's model fields are camelCase; a raw `SELECT` does not go through
 * Prisma's mapping layer, so the mapping has to be stated explicitly — and
 * stated **once**, here.
 *
 * **The names here are the database's actual names, not a convention.**
 * This matters because the tables have two histories:
 *
 * - **`reports`** is this bolt's table, created with snake_case physical
 *   columns (`campus_area`, `exact_place`, `created_at`).
 * - **`accounts` and `audit_events`** are the identity and audit bolts'
 *   tables, created with **camelCase** physical columns (`displayName`,
 *   `eventType`, `occurredAt`). Bolt `007` renamed those two *tables* to
 *   snake_case plural, but a table rename does not rename its columns.
 *
 * So the mapping is not uniform, and a reader that assumed it was would
 * emit `a.display_name` against a column called `displayName` — a query
 * error that only appears when the query reaches a real database. Bolt
 * `006` wrote this file against a schema that did not exist yet; this
 * bolt's integration test is what proved the names wrong.
 *
 * **`accounts` has no `phone` column.** FR-37 names the reporter's phone a
 * Sensitive Field "if collected", and it is not collected — no story
 * collects a phone number, and the identity bolt's table has never had
 * the column. So there is no physical name to map, and the domain's
 * `reporterPhone` projection field stays `null`.
 *
 * **Why it matters here, and not merely for tidiness.** A reader that used a
 * Prisma field name directly would emit `a.actorId` where the column is
 * `actorId`. That is a query error, not a style error — it fails loudly.
 * The subtle failure is the opposite one: a reader that selected a column it
 * *should not have* would not fail at all, and the Sensitive Field would be
 * read from the database and then dropped. FR-39 says that is not sufficient.
 * Putting every physical name in one file makes the `SELECT` list
 * reviewable in a single place, and it makes the "never loaded" test
 * assertable against names that are actually the database's names.
 *
 * **The table names are the plural snake_case form**: `reports`, `claims`,
 * `recovery_responses`, `thread_messages`, `audit_events`, `accounts`. The
 * Prisma models are the PascalCase singulars (`Report`, `Claim`,
 * `RecoveryResponse`, `ThreadMessage`, `AuditEvent`, `Account`) and reach
 * these tables through `@@map` — which is bolt `007`'s schema work, and
 * which this file's names are the contract for.
 */

/** The physical column names, by table. */
export const PHYSICAL = {
  report: {
    id: 'id',
    type: 'type',
    status: 'status',
    name: 'name',
    category: 'category',
    date: 'date',
    campusArea: 'campus_area',
    description: 'description',
    imageRef: 'image_ref',
    reporterId: 'reporter_id',
    exactPlace: 'exact_place',
    identifyingDetails: 'identifying_details',
  },
  account: {
    id: 'id',
    displayName: 'displayName',
    email: 'email',
  },
  claim: {
    id: 'id',
    reportId: 'report_id',
    claimantId: 'claimant_id',
    status: 'status',
    submittedAt: 'submitted_at',
    reason: 'reason',
    identifyingDetails: 'identifying_details',
    dateLost: 'date_lost',
  },
  response: {
    id: 'id',
    reportId: 'report_id',
    responderId: 'responder_id',
    status: 'status',
    submittedAt: 'submitted_at',
    campusArea: 'campus_area',
    whereFoundExactPlace: 'where_found_exact_place',
    observedIdentifyingDetails: 'observed_identifying_details',
    dateFound: 'date_found',
    candidateImageRef: 'candidate_image_ref',
  },
  thread: {
    id: 'id',
    parentType: 'parent_type',
    parentId: 'parent_id',
    authorDisplayName: 'author_display_name',
    body: 'body',
    postedAt: 'posted_at',
  },
  audit: {
    id: 'id',
    eventNumber: 'eventNumber',
    eventType: 'eventType',
    parentType: 'parentType',
    parentId: 'parentId',
    actorId: 'actorId',
    actorRole: 'actorRole',
    reason: 'reason',
    previousValues: 'previousValues',
    changedFields: 'changedFields',
    metadata: 'metadata',
    occurredAt: 'occurredAt',
    createdAt: 'createdAt',
  },
} as const;

/**
 * The physical table names.
 *
 * snake_case, plural — `coding-standards.md` § Naming conventions.
 */
export const TABLES = {
  report: 'reports',
  account: 'accounts',
  claim: 'claims',
  response: 'recovery_responses',
  thread: 'thread_messages',
  audit: 'audit_events',
} as const;

/**
 * Map a Prisma field name to its **quoted** physical column.
 *
 * The field names come from the constant lists in `select-builder.ts`, so
 * this map is total over them. An unknown name is a **defect**, not a
 * silently-dropped column — a silent drop would produce a query that
 * selects fewer fields than intended, which is the safer direction, but it
 * would still be a bug worth failing loudly on.
 *
 * **The name is quoted, and that is not optional.** PostgreSQL lower-cases
 * an unquoted identifier: `a.displayName` is folded to `a.displayname`,
 * which is not the column — the column is `"displayName"`. The tables this
 * bolt did not create (`accounts`, `audit_events`) have camelCase columns,
 * so their names must be quoted. The snake_case names would work either
 * way, but quoting them too keeps **one rule** rather than two, and the
 * rule is the safe one.
 *
 * The name comes from the constant maps above, never from user input, so
 * the quoting cannot be an injection point — and a value that is not a
 * plain identifier is **refused** rather than escaped.
 */
export function physical(column: string, table: Readonly<Record<string, string>>): string {
  const mapped = table[column];

  if (mapped === undefined) {
    throw new Error(`The column "${column}" has no physical mapping. This is a defect.`);
  }

  return quoteName(mapped);
}

/**
 * A physical column name, quoted — for a name that is already known.
 *
 * The `PHYSICAL` maps' values, quoted. The name is checked to be a plain
 * identifier first, so a value that could break out of the quotes is
 * refused rather than escaped.
 */
export function quoteName(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`The column name "${name}" is not a plain identifier. This is a defect.`);
  }

  return `"${name}"`;
}

/**
 * The **row alias** for a selected column — a stable snake_case name.
 *
 * **Why the alias exists at all.** A raw query returns each column under the
 * name the database gives it: `a."displayName"` comes back as `displayName`,
 * `a."eventNumber"` as `eventNumber`. The row mappers, on the other hand,
 * read snake_case names (`reporter_display_name`, `event_number`). Those two
 * sets only coincide for the tables whose columns are snake_case —
 * `reports`. For `accounts` and `audit_events` they do not, and the
 * mismatch is **silent**: the query succeeds, and the field is simply
 * `undefined`.
 *
 * That silence is what this bolt's integration test exposed. Bolt `006`
 * wrote the readers and asserted on the *generated SQL*, which is exactly
 * why the SQL could be right while the *result* was wrong — the SQL said
 * `a."displayName"` and the mapper said `row.reporter_display_name`, and no
 * test ever read a real row.
 *
 * **So every selected column carries an explicit alias**, and the alias is
 * the name the mapper reads. The mapper's contract is now stated in the
 * query rather than implied by the table's naming convention, and the two
 * tables with two naming histories no longer need two mappers.
 *
 * The alias is derived from the Prisma field name, not from the physical
 * name: `displayName` → `display_name`. The field names are camelCase by
 * Prisma's convention, and the aliases are snake_case by this project's
 * convention, so the conversion is mechanical and total.
 */
export function rowAlias(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}
