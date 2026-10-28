/**
 * The physical column names — **one artefact, five readers**.
 *
 * **The Prisma field names are not the physical column names.** Prisma's
 * model fields are camelCase; the physical columns are snake_case, per
 * `coding-standards.md` § Naming conventions ("Database tables | snake_case,
 * plural"). A raw `SELECT` does not go through Prisma's mapping layer, so
 * the mapping has to be stated explicitly — and stated **once**, here.
 *
 * **Why it matters here, and not merely for tidiness.** A reader that used a
 * Prisma field name directly would emit `a.actorId` where the column is
 * `actor_id`. That is a query error, not a style error — it fails loudly.
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
    displayName: 'display_name',
    email: 'email',
    phone: 'phone',
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
    eventNumber: 'event_number',
    eventType: 'event_type',
    parentType: 'parent_type',
    parentId: 'parent_id',
    actorId: 'actor_id',
    actorRole: 'actor_role',
    reason: 'reason',
    previousValues: 'previous_values',
    changedFields: 'changed_fields',
    metadata: 'metadata',
    occurredAt: 'occurred_at',
    createdAt: 'created_at',
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
 * Map a Prisma field name to its physical column.
 *
 * The field names come from the constant lists in `select-builder.ts`, so
 * this map is total over them. An unknown name is a **defect**, not a
 * silently-dropped column — a silent drop would produce a query that
 * selects fewer fields than intended, which is the safer direction, but it
 * would still be a bug worth failing loudly on.
 */
export function physical(column: string, table: Readonly<Record<string, string>>): string {
  const mapped = table[column];

  if (mapped === undefined) {
    throw new Error(`The column "${column}" has no physical mapping. This is a defect.`);
  }

  return mapped;
}
