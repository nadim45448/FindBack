---
unit: 002-reporting-and-listings
bolt: 007-reporting-core
stage: design
status: complete
updated: 2026-10-28T21:05:00Z
---

# Technical Design - Reporting and Listings (Report Core)

> **Conversation language: English.**
>
> This design takes the Stage 1 domain model as a constraint. Where it
> departs from the model's *stated default* for an open question, the departure
> is marked **OQ-n SETTLED** and the reason is given.

## Architecture Pattern

**Hexagonal (ports and adapters), inside the `listings` module of a modular
monolith.** This is not a new decision — `system-architecture.md` § Architecture
style fixes it ("Hexagonal inside each module"), and bolt `006` already built
the read half of this module to it. This bolt extends the same pattern to the
write half.

The pattern is chosen here over a simpler "Prisma service" because of one
specific requirement: **story 003's validator must be the same implementation
for creation and for reporter edit.** A rule that lives in the domain layer,
behind a port, is shareable by construction. A rule that lives in a route
handler or a service method is shareable by discipline, and discipline decays.

The three layers, and what each owns:

| Layer | Owns | Imports |
|-------|------|---------|
| `src/domain/listings/` | The value objects, the `Report` entity, the `ReportFieldValidator`, the `ReportType`/`ReportCategory` sets | **nothing** |
| `src/application/listings/` | `ReportCreationService`, the port interfaces, the use-case orchestration | `domain/listings` + its own ports |
| `src/infrastructure/listings/` | Prisma repositories, the blob store adapter, the campus-area reader | `domain/listings` + `application/listings` ports |
| `src/app/` | The route handler — parse, call the use case, map the result | `application/listings` |

The dependency rule is `domain → nothing`, `application → domain + ports`,
`infrastructure → domain + application ports`, `app → application`. This is
bolt `006`'s rule and this module's rule.

### The mechanism that makes the write side mirror the read side

Bolt `006` settled a load-bearing idea: **the reader port takes the resolved
column set, not the viewer**, so the query's `SELECT` list is derived from the
authorisation decision and "never loaded" is structural rather than filtered.

This bolt writes the **other half** of the same idea. The write side's
invariant is: **the set of fields a Report stores is decided in the domain,
not assembled by the route.** The route parses the request into a
`ReportDraft` — a fixed set of named slots — and the `ReportFieldValidator`
decides which of those slots may become a column. There is no code path by
which a request field becomes a stored column without passing through the
validator. The FR-8 field set is **closed by construction**: the draft type
has eight slots and no index signature.

This is the write-side analogue of "never loaded", and it is why the FR-8
"no field beyond this set is stored" note is an invariant rather than a
convention.

---

## Layer Structure

```text
┌──────────────────────────────────────────┐
│  Presentation — src/app/api/reports      │  POST route handler
│  parse → call use case → map result       │  no business rules
├──────────────────────────────────────────┤
│  Application — src/application/listings   │  ReportCreationService
│  ReportRepository, CampusAreaReader,      │  orchestration + ports
│  ImageStore, TransactionFactory           │
├──────────────────────────────────────────┤
│  Domain — src/domain/listings             │  Report, value objects,
│  ReportFieldValidator, ReportType,        │  ReportCategory, the
│  ReportCategory, ReportStatus             │  FR-8 field set
├──────────────────────────────────────────┤
│  Infrastructure — src/infrastructure/…    │  PrismaReportRepository,
│  PrismaCampusAreaReader, BlobImageStore   │  Vercel Blob adapter
└──────────────────────────────────────────┘
```

### Files this bolt adds

```text
src/domain/listings/
  report-type.ts               ReportType, REPORT_TYPES
  report-category.ts           ReportCategory, REPORT_CATEGORIES, parseReportCategory
  report-status.ts             ReportStatus, REPORT_STATUSES
  report-name.ts               ReportName
  report-description.ts        ReportDescription
  exact-place.ts               ExactPlace
  identifying-details.ts       IdentifyingDetails
  report-date.ts               ReportDate, DateLost, DateFound, DATE_BOUNDS
  image-ref.ts                 ImageRef
  campus-area-value.ts         CampusAreaValue
  report.ts                    Report entity, ReportDraft, ReportFieldSet
  report-field-validator.ts    ReportFieldValidator, FieldValidationError
  report-draft.ts              ReportDraft + ReportDraftParams
  index.ts                     the module's public surface

src/application/listings/
  ports/report-repository.ts           ReportRepository
  ports/campus-area-reader.ts          CampusAreaReader
  ports/image-store.ts                 ImageStore
  ports/transaction-factory.ts         TransactionFactory
  report-creation-service.ts           ReportCreationService
  index.ts

src/infrastructure/listings/
  prisma-report-repository.ts          PrismaReportRepository
  prisma-campus-area-reader.ts         PrismaCampusAreaReader
  blob-image-store.ts                  BlobImageStore
  index.ts

src/app/api/reports/route.ts            POST /api/reports
```

---

## API Design

The unit brief places the **web surface** in a later bolt (bolt `012`), and this
bolt is the **domain** bolt. But a create route is what makes the use case
reachable and testable end to end, and `coding-standards.md` requires the
route handler to be thin. This bolt ships **the API route for creation only**,
with no page and no form — the page is bolt `012`'s.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/reports` | `POST` | JSON body: `{ type, name, category, description, date, campusArea, exactPlace?, identifyingDetails?, image? }` | `201` with the created report's public id, type, status, and timestamps |
| `/api/reports` | `POST` | `type: 'Lost' \| 'Found'` distinguishes the two routes of the same endpoint | The same shape for both types — one endpoint, one use case, the type in the body |

**One endpoint, not two.** FR-6 and FR-7 are the same operation with a
different type and a different date bound. Two endpoints would mean two
handlers, two request parsers, and two chances for the two to drift — and the
only thing that differs between them is a value the domain already reads.

**The image is not in the JSON body.** It is uploaded as `multipart/form-data`
when present, because the blob store's upload path is a stream. The route
accepts `multipart/form-data` **only** when an image part is present; a
request with no image part is accepted as `application/json`. The rule is
stated rather than inferred: **the content type is decided by the presence of
an image part, not by the client.** A client that claims `multipart/form-data`
with no image part is a malformed request, not a report without an image.

**The response body carries no Sensitive Field.** The response returns the
report's `id`, `type`, `status`, `createdAt`, and `updatedAt` — and nothing
else. Not the name, not the description, not the exact place. The creator's
view of their own report is a **read** concern governed by FR-39, and bolt
`009` owns it; the create route is a write response, and returning the stored
fields from it would create a second, ungoverned read path. This is the same
discipline bolt `006` enforced: **one implementation point per decision.**

The response is `201` with a `Location` header pointing at the report's
canonical path — which bolt `009` will serve. The route does not need to
exist for the header to be correct; the id is the report's.

### The request shape and the closed field set

The route parses into a `ReportDraft`, whose shape is fixed:

```ts
interface ReportDraft {
  readonly type: ReportType;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly date: string;          // ISO calendar date, 'YYYY-MM-DD'
  readonly campusArea: string;
  readonly exactPlace?: string;
  readonly identifyingDetails?: string;
  readonly image?: ImageUpload;
}
```

**There is no index signature and no `extra` bag.** A request carrying
`{"type":"Lost", ..., "secretLocation":"..."}` — the JSON body is parsed into a
typed object by a hand-written parser, not by a blind spread — has the unknown
key **dropped at the parse boundary**. That is deliberate: the FR-8 field set
is closed, so an unknown key is not an error to report, it is simply not a
field of a Report. (A body that is *not* an object, or whose `type` is
missing, is a malformed request and gets a `400`.)

The parser is a **hand-written field reader**, not `JSON.parse` into a spread.
The distinction is the whole point: `JSON.parse(body)` followed by `{...body}`
would carry every unknown key into the draft, and the draft is the only thing
that decides what gets stored. So the parser names each field it reads.

---

## Data Persistence

### The `reports` table

`coding-standards.md` § Naming conventions: **tables snake_case plural**, **Prisma models PascalCase singular**. So the Prisma model is `Report` and the table is `reports`, reached through `@@map`.

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | `uuid` | no | PK, `gen_random_uuid()` |
| `type` | `text` | no | `Lost` \| `Found`, CHECK-constrained |
| `status` | `text` | no | `Open` on creation, CHECK-constrained to the six PRD statuses |
| `name` | `text` | no | 1–80 chars |
| `category` | `text` | no | the nine PRD values, CHECK-constrained |
| `description` | `text` | no | 10–2000 chars |
| `date` | `date` | no | **one column**, meaning date-lost or date-found by `type` |
| `campus_area` | `text` | no | the enum **value**, not the label |
| `exact_place` | `text` | **yes** | FR-37 Sensitive, ≤ 200 chars |
| `identifying_details` | `text` | **yes** | FR-37 Sensitive, ≤ 500 chars |
| `image_ref` | `text` | **yes** | FR-37 Sensitive, the blob path — never a URL |
| `reporter_id` | `uuid` | no | FK → `accounts.id`, `ON DELETE RESTRICT` |
| `created_at` | `timestamptz(6)` | no | |
| `updated_at` | `timestamptz(6)` | no | **OQ-5 SETTLED: created now, non-null** |

**`date` is `date`, not `timestamptz`.** The domain compares by **calendar
day**, and the PRD's dates are calendar dates. A timestamp column would make
"exactly 365 days ago" depend on the time of day, which is exactly the
ambiguity the edge case "Date entered with a time component → the date is
compared by calendar day" forbids.

**`campus_area` stores the value, not the label.** A deployment may rename
"Library" to "Main Library" without rewriting a single report, and the stored
value is what FR-14 filters on. The label is a display concern and lives with
the `CampusArea` row.

**`updated_at` is set on creation** and is **not** a `@updatedAt` column.
Prisma's `@updatedAt` is a client-side mechanism that sets the value on
update; a non-null `updated_at` on a row that has never been updated must
still be set at insert. Prisma's `@default(now())` plus an explicit set at
insert is the correct combination, and the domain's `Report` carries both
timestamps as ordinary fields. Bolt `008` (reporter edit) sets it on update.

### The `campus_areas` table

**OQ-1 SETTLED: the campus-area list is a table, seeded per deployment.**

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `value` | `text` | no | PK — the stored enum value |
| `label` | `text` | no | the display label |
| `active` | `boolean` | no | default `true`; a deactivated area affects new submissions only |
| `created_at` | `timestamptz(6)` | no | |

**Why a table and not a config file.** Three reasons, in order of weight:

1 - **The reports already refer to it.** A report row stores a campus-area
   value; the list of valid values should live in the same database that holds
   the references, so a foreign key can express the rule. A config file
   cannot be referenced by a foreign key, so the rule would be enforced only
   in application code — one layer weaker.
2 - **A mid-deployment change must not require a restart.** The unit brief's
   OQ-1 asks how the list is configured; a file read at startup makes
   changing it a deployment event.
3 - **`data-stack.md` § Schema outline already lists `CampusArea` as a
   table.** The standard's outline is the shape the model is authored against,
   and a table is what it names.

The table is **seeded per deployment**, not populated by the application. The
seed is a migration or a deployment script, and it is the deployment's choice
which areas exist — that is precisely what "per-deployment" means.

**A deactivated area does not rewrite existing reports.** The stored report
keeps its value; `active` affects only whether the value is *accepted* on a
new submission. This is story 003's edge case, and it is why `campus_area` is
a plain `text` column with no FK to `campus_areas` — a foreign key would
prevent deactivation semantics and would make a rename a migration. The
membership rule is enforced by the validator against the **active** set.

**No foreign key on `campus_area`.** This is the one place where the usual
"reference the lookup table" instinct is wrong, and the reason is worth
stating: the FK would make `active = false` semantically impossible (the row
still exists, so the FK is satisfied, but the rule "a deactivated area does
not rewrite existing reports" would need a trigger to express). The
membership rule is a **validation** rule, not a **referential** one, and it is
enforced in the one place that can see the whole active set: the validator.

### The `@@map` annotations bolt `006` left open

**OQ-3 SETTLED — and the `@@map`s are added.** The `AuditEvent` and `Account`
tables predate the naming convention and carry no `@@map`, so their physical
names are currently `"AuditEvent"` and `"Account"`. Bolt `006`'s readers issue
raw `SELECT`s against `audit_events` and `accounts` — the physical names the
standards name — so those two tables **must** be mapped before bolt `006`'s
readers can be integration-tested. This bolt adds:

```prisma
model AuditEvent { ... @@map("audit_events") }
model Account    { ... @@map("accounts") }
```

**`AuditEvent` is append-only and its indexes are already named.** The
`@@map` changes the table name only. The explicit `map:` on every index
already names the index, and Prisma's index names are global per schema, so
adding `@@map` renames the table without renaming any index. The trigger
that ADR-6 installs is `BEFORE UPDATE OR DELETE ON audit_events` — it is
written against the physical table name, so the `@@map` makes the trigger's
target agree with the code. **This must be checked in the migration**: if the
existing table is physically named `"AuditEvent"`, the migration renames it,
and the trigger must be recreated against the new name in the same migration.

`AuditReadLog`, `QuotaSnapshot`, `Session`, `PasswordResetToken`, and
`RateLimitCounter` also carry no `@@map`. They are mapped in the same
migration for the same reason — consistency, and because the next bolt that
writes raw SQL against them will need the physical names.

### The `claims`, `recovery_responses`, and `thread_messages` tables

**Not created by this bolt.** Bolt `006`'s readers query them, and they are
created by the bolts that own them (Units 003, 004, 005). This bolt creates
`reports` and `campus_areas` only, and the integration test for bolt `006`'s
readers is scoped to the `reports` path — the readers that join `claims` and
`recovery_responses` are tested once their tables exist.

### Indexes

**OQ-4 SETTLED: the indexes FR-14 needs, created with the table.** Bolt `009`
consumes them, but a table created without its indexes and a later bolt adding
them is a migration for no reason.

| Index | Columns | Serves |
|-------|---------|--------|
| `idx_reports_status_created` | `status, created_at DESC` | FR-14 status filter; the newest-first listing order |
| `idx_reports_type_status_created` | `type, status, created_at DESC` | FR-14 type filter, and the type-scoped browse |
| `idx_reports_category_created` | `category, created_at DESC` | FR-14 category filter |
| `idx_reports_campus_area_created` | `campus_area, created_at DESC` | FR-14 location filter |
| `idx_reports_date` | `date DESC` | FR-14 date filter and the date-bound ordering |
| `idx_reports_reporter_created` | `reporter_id, created_at DESC` | FR-49 "My Reports" |
| `idx_reports_search` | GIN on `to_tsvector('simple', name || ' ' || description)` | FR-14 keyword search |

The keyword index is a **GIN index over a generated `tsvector`**, using the
`'simple'` configuration rather than `'english'`. `'simple'` does not stem and
does not drop stop words, which is what a name-and-description search wants:
an item called "Keys" must be findable by searching "keys", and a description
mentioning "the" must not silently vanish from the index.

`name || ' ' || description` deliberately excludes the Sensitive Fields —
`exact_place` and `identifying_details` are **not** in the search index. A
search index over a Sensitive Field is a **disclosure surface**: it would let
an unauthorised member infer that a word appears in a field they may not read.
The keyword search therefore covers the non-sensitive summary text only, and
the full-text index is a **prefix match** so `wall` finds `Wallet`.

### CHECK constraints

**OQ-3 SETTLED: text columns with CHECK constraints, not database enums.**

```sql
CHECK (type IN ('Lost', 'Found'))
CHECK (status IN ('Open', 'Claim Requested', 'Claim Approved',
                  'Verification Pending', 'Returned', 'Closed'))
CHECK (category IN ('Wallet', 'Bag', 'Electronics', 'Keys', 'Clothing',
                    'Books/Notebooks', 'Identification', 'Water Bottle', 'Other'))
CHECK (char_length(name) BETWEEN 1 AND 80)
CHECK (char_length(description) BETWEEN 10 AND 2000)
CHECK (exact_place IS NULL OR char_length(exact_place) <= 200)
CHECK (identifying_details IS NULL OR char_length(identifying_details) <= 500)
CHECK (date <= CURRENT_DATE)
```

**Text, not a database enum.** The `Account.status` model already set the
precedent: *"a text column with a CHECK constraint rather than a database enum,
so adding a status is not a migration."* A PostgreSQL enum needs
`ALTER TYPE ... ADD VALUE` and, on older PostgreSQL versions, cannot be used
in the same transaction that adds it. A CHECK constraint is changed with an
ordinary `ALTER TABLE`, which is reversible.

**`CHECK (date <= CURRENT_DATE)` is a second line of defence.** The validator
is the enforcement point, but the database refuses a future-dated report even
if a path bypasses the validator. The check uses `CURRENT_DATE`, which is
evaluated per statement in PostgreSQL.

**`CURRENT_DATE` and the domain's "today" must agree.** The validator
compares against an injected clock's calendar day in **UTC**, and the
database's `CURRENT_DATE` is the **database session's** time zone. If the
database session runs in a time zone ahead of UTC, a report dated "today" in
UTC could be rejected as "tomorrow" by the constraint. The migration sets the
database's time zone to UTC explicitly (`SET TIME ZONE 'UTC'` on the
connection), and the application supplies UTC dates. A deployment whose
database region reports a non-UTC time zone must set it — this is a one-time
deploy step, and it is recorded here so it is not discovered as a bug.

**The length CHECKs are on the database as well as in the validator.** The
validator is the enforcement point and produces a *field-level* error naming
the offending field; the CHECK is the invariant that holds even if a path
bypasses it. `char_length` counts characters, not bytes, which matches the
domain's rule and differs from PostgreSQL's `length` for multi-byte text.

### The Prisma model

```prisma
model Report {
  id        String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type     String
  status   String @default("Open")
  name     String
  category String
  description String
  date     DateTime @db.Date
  campusArea String @map("campus_area")
  exactPlace String? @map("exact_place")
  identifyingDetails String? @map("identifying_details")
  imageRef  String? @map("image_ref")
  reporterId String @map("reporter_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)

  reporter Account @relation(fields: [reporterId], references: [id], onDelete: Restrict)

  @@index([status, createdAt(sort: Desc)], map: "idx_reports_status_created")
  @@index([type, status, createdAt(sort: Desc)], map: "idx_reports_type_status_created")
  @@index([category, createdAt(sort: Desc)], map: "idx_reports_category_created")
  @@index([campusArea, createdAt(sort: Desc)], map: "idx_reports_campus_area_created")
  @@index([date(sort: Desc)], map: "idx_reports_date")
  @@index([reporterId, createdAt(sort: Desc)], map: "idx_reports_reporter_created")
  @@map("reports")
}

model CampusArea {
  value   String @id
  label   String
  active  Boolean @default(true)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("campus_areas")
}
```

**`reporterId` uses `ON DELETE RESTRICT`.** Accounts are never deleted
(FR-5, PRD §10), so the constraint never fires — but stating it means the rule
is in the schema rather than in a comment, and a future path that tried to
delete an account would be refused by the database rather than orphaning
reports.

**The `reports` column set matches bolt `006`'s `physical-columns.ts`
exactly.** That file names twelve report columns: `id`, `type`, `status`,
`name`, `category`, `date`, `campus_area`, `description`, `image_ref`,
`reporter_id`, `exact_place`, `identifying_details`. The table has **twelve of
those plus `created_at` and `updated_at`**. The two extra columns are
**additive** and are **not** in bolt `006`'s `SELECT` list, so the readers'
queries are unaffected — and the `SELECT` lists stay honest, because a
timestamp column that nobody selects is not a disclosure.

This is the **contract check**: the migration's column list for `reports` is
asserted against `PHYSICAL.report` in the integration test. If the two drift,
the test fails, and the failure names the column.

### The migration

One migration, in this order:

1 - **Rename** the pre-existing tables to their `@@map` names:
   `"AuditEvent"` → `audit_events`, `"Account"` → `accounts`, and the four
   other unmapped tables. `ALTER TABLE ... RENAME TO ...`.
2 - **Recreate** the ADR-6 append-only trigger against `audit_events` — the
   trigger's target table is renamed by step 1, and PostgreSQL follows the
   rename, so the trigger **survives** a table rename. The check is therefore
   on the *trigger's recorded table name*, and the migration asserts it.
3 - **Create** `reports` and `campus_areas` with their CHECK constraints and
   indexes.
4 - **Create** the GIN search index.
5 - **Seed** `campus_areas` — **empty by default.** The seed's contents are
   the deployment's decision; the migration seeds no areas, because a
   deployment with areas the PRD does not name would be inventing content.
   The **example deployment** seeds a small set.

---

## Security Design

| Concern | Approach |
|---------|----------|
| **Authentication** | The route requires an authenticated session. The `ActorContext` is resolved by the existing accounts-module session resolution — this bolt consumes it and re-implements none of it. |
| **Authorization** | The **member capability** is checked at the application layer, once: `hasMemberCapability(actor)`. A `Pending`, `Rejected`, or `Deactivated` account is refused. This is the FR-2 restriction enforced **at the `ActorContext` boundary**, exactly as bolt `004` built it — this bolt does not write its own `status !== 'Active'` check. |
| **Role derivation** | The reporter is `actor.actorId` — **server-derived, never a request field**. The `ReportDraft` has no reporter field, so a client cannot file a report on someone else's behalf. This mirrors bolt `006`'s "the reporter role is derived from the id equality, never from a supplied flag". |
| **Sensitive Fields** | `exact_place`, `identifying_details`, and `image_ref` are stored as FR-37 Sensitive Fields. The **create response** carries none of them, and no log line carries any of them — the operational log records the *fact* of the creation and the report id, never the field values. |
| **Data at rest** | The image is stored with `access: 'private'` (ADR-2). The stored value is the **blob path**, never the URL — a bare URL is not a reference that can be authorised, and ADR-2's route handler resolves the path. |
| **Injection** | Every query is parameterised through Prisma. There is no string-concatenated SQL on the write path. |
| **CSRF** | A CSRF token is required on the state-changing `POST`, per `coding-standards.md` § Security coding rules. |
| **Input validation** | Every input is validated at the route boundary — types are not validation — and the domain re-validates. The route's parse is about *shape* (is this a string? is this an object?); the validator is about *rules* (is this string 1–80 characters?). The two are different jobs and the second is not optional. |
| **Audit** | The FR-31 event 1 write is **inside the same transaction** as the report row. The audit trail is append-only and the report's creation is recorded with the reporter as actor. |
| **Mass assignment** | The `ReportDraft` has a **fixed shape with no index signature**, and the parser names each field it reads. An unknown key in the request body cannot become a stored column. |

### The date is not taken from the client

The `date` field is submitted by the client — it is a fact about the item, not
about the request. The server **validates** it against the bound but does not
**supply** it. The "today" the bound is measured against comes from an
**injected clock**, never from `new Date()` inside the validator: an injected
clock is what makes "exactly 365 days ago is accepted" a testable assertion
rather than a test that only passes on the right day.

---

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| **Performance (write p95)** | The create path is one blob upload (if any) plus one transaction with two inserts. The transaction is short and holds no lock across the email or the blob — PRD §10's rule. `CURRENT_DATE` in the CHECK constraint is evaluated per statement, not per row, so it does not add a round trip. |
| **Performance (read)** | The indexes above are the read path's design. Bolt `009` owns the query; this bolt creates the indexes that make it index-backed rather than a sequential scan over 10,000 reports (FR-14's scale). |
| **Scalability** | Single-tenant, single-region, pooled connections. The write adds no new connection pattern: one transaction, one client. The blob upload happens **outside** the transaction, so a slow upload does not hold a pooled connection. |
| **Reliability** | The write is **compensating, not atomic**: upload the blob, then write the row; if the row write fails, delete the blob. A blob failure means no report is created (image-handling §5). A failed compensating delete is recorded for retry through the same mechanism image-handling §5 prescribes for the FR-10 direction — **one retry path in the system, not two**. |
| **Cost ($0 ceiling)** | No new service, no paid plan, no upgrade. The blob store is Vercel Blob private storage within the free tier (ADR-2, ADR-4). Over-quota is a **refusal**, never a silent acceptance. |
| **Observability** | One structured log line per creation, with `requestId`, `actorId`, `actorRole`, `action: 'report.created'`, `targetType: 'report'`, `targetId`, `outcome`. **No field values.** A refused creation logs `outcome: 'denied'` with the reason code and the offending field name — never the field's value. |
| **Accessibility** | No UI in this bolt (bolt `012`'s). The API is the deliverable. |

### The compensating write, precisely

```text
1.  parse → ReportDraft                        (route)
2.  validate → ValidatedReport | FieldErrors    (application → domain)
3.  upload the blob → ImageRef                 (infrastructure; outside any transaction)
        └─ fails → 400/500, NO report, NO orphan
4.  BEGIN
5.    INSERT reports …                          (same transaction)
6.    INSERT audit_events (event 1) …          (same transaction — ADR-3, ADR-9)
7.  COMMIT
        └─ fails → ROLLBACK, then delete the blob (compensating)
                     └─ delete fails → record the orphan for retry
8.  raise ReportCreated (after the commit)      (application)
9.  respond 201
```

**Step 3 is outside the transaction because a blob store cannot join a
PostgreSQL transaction.** Pretending otherwise would be a lie about
atomicity, and the PRD's requirement — "the report is not created" when the
image fails — is fully satisfied by the ordering. A report whose row write
failed is never observable, because the row is written last and the
compensating delete removes the blob.

**The compensating delete happens *after* the rollback, not inside it.** A
blob delete inside a transaction that is about to roll back would be undone
by the rollback's own compensation — and would leave the blob orphaned anyway.
The delete is issued once the database side is settled.

**The orphan is recorded, not leaked.** image-handling §5: *"Blob delete
fails on FR-10 hard delete → Record the orphan in a retry queue; do not
silently leak. Retries are idempotent by pathname."* This bolt reuses that
exact mechanism rather than inventing a second retry path. **OQ-2 SETTLED.**

**There is no email on this path.** No PRD requirement triggers an email on
report creation, and the `notifications` module owns the eight workflow emails
(FR-27..FR-30, FR-46). A report creation sends nothing.

---

## Error Handling

Errors are **typed** and expected. `coding-standards.md` § Error handling names
the domain error set; this bolt adds the two it needs and uses the existing
`NotFoundError` and `PermissionDeniedError`.

| Error Type | Code | Response |
|------------|------|----------|
| `FieldValidationError` | `400` | RFC 9457 problem details with a **per-field** list — the field name and the rule it broke. This is the story 003 requirement: *"a field-level validation error identifies the offending field"*. |
| `MalformedRequestError` | `400` | The body is not an object, or a required key is missing or of the wrong type. Distinct from `FieldValidationError`: a **shape** error versus a **rule** error. |
| `PermissionDeniedError` | `403` | The actor is not an `Active` member. The response body says nothing about the account's status. |
| `AuthenticationRequiredError` | `401` | No session. |
| `ImageRejectedError` | `400` | The image failed validation (size, MIME, magic bytes) — image-handling §1. Copy from `EXPERIENCE.md` §4.9. |
| `ImageStorageError` | `503` | The blob upload failed. **No report is created.** |
| `QuotaExceededError` | `429` | The blob store's byte quota is exhausted (ADR-4). Administrator-visible detail. |
| `NotFoundError` | `404` | The referenced entity does not exist. |
| `CampusAreaUnavailableError` | `503` | The campus-area list could not be read. **A validation cannot be skipped** — the validator's set is required input, so a failure to read it is a refusal, not a permissive default. |

**The campus-area read failure is a refusal, not a default.** This is the one
place where a fail-open would be dangerous: with an empty set, every campus
area would be rejected, and with a permissive fallback every campus area
would be accepted. The set is **required input**, so its absence is a `503`,
and the member is told to try again. Failing open would store a report with
an unvalidated campus area, which is exactly the closed-field-set discipline
the whole design is built on.

**The error response never carries a field's value.** The `FieldValidationError`
carries the field **name** and the rule, never the submitted value — the name
is not sensitive, the value might be (an over-long exact place is a Sensitive
Field).

**Every error is logged with `outcome: 'denied'` or `outcome: 'error'`**, and
the log line carries the same field *names* the response does.

---

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| **PostgreSQL** (Neon free tier) | The report, campus-area, and audit rows | Prisma with a driver adapter over the pooled connection |
| **Vercel Blob** (private) | The optional report image | `@vercel/blob` `put` / `del`, `access: 'private'`, `addRandomSuffix: true` |
| **Accounts module** | The `ActorContext` and the session | An in-process import — the **one** cross-module dependency, `listings → accounts`, one-way |
| **Audit module** | The FR-31 event 1 write | `AuditWriter.record(draft, transaction)` — a typed factory, per ADR-9 |

**The audit dependency is `listings → audit`, one-way.** The `audit` module
never evaluates the report's status machine, and this module never mints an
event number — the catalog owns that. The event is built through the audit
module's factory, so an event with a missing required field is a **compile or
construction error**, not a runtime surprise.

**The event 1 payload.** The catalog names seven fields for
`report.created`: `name`, `category`, `type`, `date`, `location`,
`optionalFields`, `imagePresence`.

```ts
{
  name: report.name,
  category: report.category,
  type: report.type,           // 'Lost' | 'Found' — the distinction rides here
  date: report.date,           // the ISO calendar date
  location: report.campusArea, // the enum VALUE — the non-sensitive location
  optionalFields: {
    exactPlace: report.exactPlace !== null,
    identifyingDetails: report.identifyingDetails !== null,
  },
  imagePresence: report.imageRef !== null,
}
```

**`optionalFields` carries presence flags, never values.** The catalog names
**no** Sensitive Field for event 1, so `exactPlace` and
`identifyingDetails` must not appear as values on the trail. The trail
records *that* the report has identifying details, not *what* they are. This
matches the trail's rule — a Sensitive Field may appear on a trail entry only
where the frozen PRD names it for that event — and it is right anyway: the
trail is administrator-only, but it should not accumulate Sensitive values it
does not need.

**`location` is the campus area, not the exact place.** The catalog names one
`location` field, and the FR-39 matrix splits `campusArea` (public) from
`exactPlace` (Sensitive). Putting the exact place in `location` would put a
Sensitive Field on the trail under a name the catalog did not sanction, and
would let the trail reconstruct a location the matrix protects. The exact
place is a Sensitive Field with **no** named event-1 field, so it goes
nowhere.

---

## Testing Strategy

**Methodology: test-after** (`coding-standards.md` § Testing strategy).
**Coverage floor: 80% lines**, enforced in CI. The existing suite must stay
green.

| Layer | Suite | What it covers |
|-------|-------|----------------|
| Domain | `report-field-validator.test.ts` | Every bound, inclusive at both ends; the two date bounds; the future-date rule; the calendar-day comparison; the two closed sets; the required-field check; whitespace-only names; the exact-place and identifying-details bounds. |
| Domain | `report-value-objects.test.ts` | Each value object refuses to construct from an invalid value. |
| Domain | `report-category.test.ts` | The nine values, and that an unknown value is a rejection. |
| Application | `report-creation-service.test.ts` | The orchestration order — validate, then upload, then write — against port fakes; the transaction handle is passed to the repository; the audit event is built through the factory; the event is raised **after** the write. |
| Application | `report-creation-compensation.test.ts` | The compensating write: a failed row write triggers a blob delete; a failed blob delete is recorded for retry; a failed upload creates no report. |
| Application | `report-closure.test.ts` | The campus-area read failure is a refusal, never a permissive default. |
| Infrastructure | `prisma-report-repository.test.ts` | Against a **live database** — the insert, the constraints, the CHECKs rejecting an out-of-range value, the `@@map` names, and the `reports` column set matching `PHYSICAL.report`. |
| Infrastructure | `blob-image-store.test.ts` | Against a fake blob client — `access: 'private'`, `addRandomSuffix`, the returned path, and the delete. |
| Route | `reports-route.test.ts` | The parse: an unknown key is dropped and never stored; a malformed body is a `400`; a `Pending` actor is a `403`; a non-object body is a `400`. |
| Integration | `visibility-readers-integration.test.ts` | **Bolt `006`'s obligation**: the five readers, against the live database, asserting the `reports` table's columns match `PHYSICAL.report` and that the readers' `SELECT` lists resolve against the real schema. |

**The "never stored beyond FR-8" test is the load-bearing one.** It asserts
that a request body carrying extra keys produces a stored row with exactly the
fourteen table columns and no more — asserted on the **database row**, not on
the response.

**The live-database tests are the ones bolt `006` left behind.** ADR-5 says
local verification runs against a Docker PostgreSQL container. The `reports`
readers and the `reports` insert are integration-tested against it; the
`claims`/`recovery_responses` readers are tested once those tables exist.

---

## Story coverage

| Story | How the design covers it |
|-------|-------------------------|
| **001-create-lost-item-report** | `POST /api/reports` with `type: 'Lost'`; the 365-day bound in the validator; the five required and three optional fields; the FR-8 closed field set; the FR-31 event 1 write in the same transaction; the member-capability refusal; the Sensitive Field treatment; the image-before-row ordering with the compensating delete. |
| **002-create-found-item-report** | The same endpoint with `type: 'Found'`; the 30-day bound; `date` meaning *date found*; `location` meaning *where found*; the shared field set and category enum. |
| **003-validate-report-field-set** | The `ReportFieldValidator` as a pure function over a `ReportDraft` and a `ReportType`, with the injected clock and the injected campus-area set; the inclusive bounds; the two closed sets; the required-field check; the field-level error type. |

---

## Design decisions this stage makes

Each settles a Stage 1 open question or makes a new call. The reasoning is
recorded so Stage 4 treats them as constraints.

### 1 - The campus-area list is a table, seeded per deployment (OQ-1 SETTLED — ADR-20)

Stated in § Data Persistence with three reasons. The load-bearing one: **the
reports already refer to it**, so the list belongs in the database that holds
the references.

**This decision was Architecture-owned (OQ-1) and was ratified by the owner
on 2026-10-28.** It is recorded in
`adr-20-campus-area-configuration-mechanism.md`, together with the companion
rule that `reports.campus_area` carries **no foreign key**.

### 2 - The image write is compensating, not atomic (Stage 1 decision 5, designed)

Stated in § NFR Implementation. The ordering is image → row, and the
compensating delete is issued **after** the rollback. The orphan-retry
mechanism is image-handling §5's, reused rather than duplicated.

### 3 - `type` and `status` are text columns with CHECK constraints (OQ-3 SETTLED)

Stated in § Data Persistence, following the `Account.status` precedent.

### 4 - The indexes are FR-14's, created with the table (OQ-4 SETTLED)

Stated in § Data Persistence. The keyword index is GIN over a `'simple'`
`tsvector` of `name || description` — and it **excludes the Sensitive
Fields**, because a search index over a Sensitive Field is a disclosure
surface.

### 5 - `updated_at` is created now, non-null (OQ-5 SETTLED)

Stated in § Data Persistence. It is set on insert, so it is not Prisma's
`@updatedAt`.

### 6 - One route, not two

Stated in § API Design. FR-6 and FR-7 differ by a value the domain already
reads; two handlers would be two chances to drift.

### 7 - The create response carries no stored field

Stated in § API Design. The creator's view of their own report is a **read**
concern governed by FR-39 and owned by bolt `009`. Returning the fields from
the create route would create a second, ungoverned read path — the same
"one implementation point per decision" discipline bolt `006` enforced.

### 8 - The `date` column is `date`, not `timestamptz`

Stated in § Data Persistence. The domain compares by calendar day, so a
timestamp would make "exactly 365 days ago" depend on the time of day.

### 9 - `campus_area` has no foreign key

Stated in § Data Persistence. The membership rule is a **validation** rule,
not a **referential** one — a deactivated area must not rewrite existing
reports — and an FK cannot express that.

### 10 - The database time zone is set to UTC explicitly

Stated in § Data Persistence, alongside the CHECK constraints. The validator's
"today" is UTC; `CURRENT_DATE` is the session's time zone. If they differ, a
report dated today can be rejected as tomorrow.

### 11 - The create route ships in this bolt, but no page

Stated in § API Design. The unit brief puts the web surface in bolt `012`.
This bolt ships the route so the use case is reachable and end-to-end
testable; the form and the page are bolt `012`'s.

---

## Open items carried to Stage 3 and Stage 4

1 - **`EXPERIENCE.md` §4.9 copy.** The error copy for each failure is frozen
   UX and must match exactly. The copy is read at implementation time; if a
   needed string is missing, it is an owner question, not an invention.

2 - **The example deployment's campus areas.** The migration seeds none. The
   seed for the local Docker deployment is a development convenience and is
   recorded here so it is not mistaken for a product decision.

3 - **The `@@map` rename and the ADR-6 trigger.** The trigger survives a
   table rename in PostgreSQL, but the migration asserts it rather than
   assuming it.

4 - **The `EXPERIENCE.md` route path.** The path `/api/reports` is this
   design's proposal; if `EXPERIENCE.md` names a different path, the frozen
   UX wins and the path changes. No other part of the design depends on it.

5 - **The `reports` column-set contract test.** The assertion against
   `PHYSICAL.report` is this bolt's mechanism for keeping the two bolts
   honest. It is a **Stage 4 obligation**, and it is the test that would have
   caught a schema drift before bolt `009` read from a mismatched table.
