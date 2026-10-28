---
stage: design
bolt: 006-reporting-visibility
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
created: 2026-10-28T18:10:00Z
updated: 2026-10-28T18:10:00Z
---

# Technical Design — Reporting and Listings (the FR-39 Visibility Projection)

> **Scope.** Bolt `006-reporting-visibility`, story `010-visibility-matrix-by-actor`.
> This design covers the projection's **mechanism**: how a viewer's granted
> columns become a query's `SELECT` list, so that a Sensitive Field is never
> loaded for a viewer who may not see it.
>
> It does **not** cover report creation, edit, delete, withdrawal, search,
> pagination, FR-49's partitions, or image delivery — those are bolts `007`,
> `008`, `009`, and `010`.

---

## Architecture Pattern

### The pattern: a **pure resolver in the domain, a column-shaped query in the infrastructure**, joined by a port whose signature carries the authorisation decision.

This is the same hexagonal shape the rest of FindBack uses (`domain/` → nothing,
`application/` → domain + ports, `infrastructure/` → domain + application
ports). What is new here is **where the authorisation decision sits relative
to the query**.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  app/  —  route handler (thin)                                      │
│    parse request → resolve ActorContext → call the use case         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  application/  —  ReportVisibilityService                          │
│    1. resolve the Viewer (from the ActorContext)                     │
│    2. load the ReportRelationship                                    │
│    3. resolve the granted columns          ← pure, in domain/        │
│    4. call the readers, passing the COLUMNS                          │
│    5. assemble the VisibilityProjection                             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  ports take `columns`, never `viewer`
┌───────────────────────────────▼──────────────────────────────────────┐
│  infrastructure/  —  Prisma readers                                 │
│    build the SELECT list FROM the columns → the query never          │
│    selects a Sensitive Field the viewer may not see                  │
└──────────────────────────────────────────────────────────────────────┘
```

### The one thing this bolt gets right that a naive implementation gets wrong

A naïve visibility implementation loads the whole report and filters it:

```ts
// ✗ NOT COMPLIANT — the Sensitive Field was loaded.
const report = await db.report.findUnique({ where: { id } });
if (!isOwner) delete report.identifyingDetails;
```

The PRD forbids exactly this — FR-39 criterion 1 says the field "is never
loaded at all, because filtering an already-loaded value after the fact is not
sufficient" — and `system-architecture.md` § Authorization repeats it: "the
sensitive set is never loaded for an actor who may not see it — not filtered
after the fact, not hidden by CSS."

So the **decision must come before the query**. This design puts it there by
making the port's signature carry the decision:

```ts
// ✓ COMPLIANT — the column set IS the authorisation, and it shapes the query.
loadReportForViewer(reportId: string, columns: ProjectionColumn[]): Promise<Report | null>
```

The infrastructure layer then builds the `SELECT` list from the columns. A
Sensitive Field that the viewer's columns do not authorise is **absent from
the SQL**, so it is never read from disk, never materialised in the process,
and never present to be filtered. The guarantee is not a discipline; it is a
consequence of the signature.

### Why not a different pattern

1 - **Repository returns a full entity; a separate "projector" filters it.**
Rejected. This is the defect the PRD names, and it cannot be fixed downstream:
once the value is loaded, no amount of care afterwards undoes the load. The
"never loaded" property is only achievable if the load is shaped by the
decision.

2 - **Row-level security in PostgreSQL.**
Rejected for this bolt, and worth explaining. PostgreSQL RLS is a genuinely
strong mechanism and would be the right tool for a multi-tenant system. But
FindBack is **single-tenant** (`tech-stack.md`), the projection's decision
depends on a *relationship* the database would have to join against anyway,
and RLS policies are notoriously hard to prove complete — a policy that fails
to match a row silently **omits** it, which for a visibility rule is the
dangerous direction. The matrix has seven columns with several conditional
grants; encoding it as seven RLS policies with `USING` clauses that must
handle owner-vs-participant-vs-unrelated correctly is a larger surface to get
wrong than a resolver with exhaustive unit tests. RLS would also need the
session's viewer identity set on every connection, which conflicts with
pooled connections (`data-stack.md` § Connection handling) unless it is
threaded through `SET LOCAL` on every transaction.

**Noted as a possible future hardening**, not chosen now. The design's
practical guarantee — the `SELECT` list is derived from the columns — is
enforceable by unit tests and reviewable in one place.

3 - **Viewing the matrix as a data table in the database.**
Rejected. The matrix is a **closed set of seven columns with conditional
grants**; expressing it as rows would need a join to the relationship facts
on every read, and the rules would live in data rather than in code where an
exhaustive switch can check them. The matrix is also frozen product
behaviour — it belongs in the domain layer where it is reviewable.

4 - **Column-level encryption for Sensitive Fields.**
Rejected. It would make the *database* the enforcement point, which is the
wrong boundary for a rule that is about *relationships*, not about secrecy at
rest. It also costs a decrypt per read and a key-management burden, for a
single-tenant free-tier deployment where the threat is a logic error rather
than a stolen disk. The audit trail already holds some Sensitive Fields by
catalog name (ADR-6), so encryption would be an inconsistent half-measure.

---

## Layer Structure

```text
src/
├── domain/
│   └── listings/                     ← NEW module
│       ├── projection-column.ts      the seven FR-39 columns
│       ├── viewer.ts                 the actor, as the projection sees it
│       ├── report-relationship.ts    the facts that place a viewer in a column
│       ├── visibility-resolver.ts    viewer + relationship → columns
│       ├── report-field-set.ts       the closed set of visible field names
│       ├── report-projection.ts      the report projector
│       ├── claim-projection.ts       the Claim projector
│       ├── recovery-response-projection.ts
│       ├── thread-projection.ts
│       ├── audit-trail-projection.ts
│       ├── visibility-projection.ts  the aggregate root
│       └── index.ts
│
├── application/
│   ├── listings/
│   │   ├── report-visibility-service.ts   the use case
│   │   └── ports/
│   │       ├── report-visibility-reader.ts
│   │       ├── claim-visibility-reader.ts
│   │       ├── recovery-response-visibility-reader.ts
│   │       ├── thread-visibility-reader.ts
│   │       └── audit-trail-visibility-reader.ts
│   └── ports/                        ← shared ports live here
│       └── (none new — the listing ports live in application/listings/ports)
│
├── infrastructure/
│   └── listings/
│       ├── prisma-report-visibility-reader.ts
│       ├── prisma-claim-visibility-reader.ts
│       ├── prisma-recovery-response-visibility-reader.ts
│       ├── prisma-thread-visibility-reader.ts
│       └── select-builder.ts         ← the SELECT-list builder (the mechanism)
│
└── app/
    └── api/reports/[id]/route.ts     ← the read path (bolt 009 consumes it)
```

### The module name

`listings/`, per `system-architecture.md` § Module map, which assigns
"Report CRUD, search, visibility projection" to `listings/`. ADR-13 settled
the same question for the identity module: the map is authoritative for
directory names, and a divergence is a standards change, not a bolt decision.
`src/domain/listings/`, `src/application/listings/`, `src/infrastructure/listings/`.

### What is new and what is reused

| Concern | New or reused | Note |
|---|---|---|
| `ActorContext` | **Reused** | `src/domain/accounts/actor-context.ts` — bolts 004/005 |
| `DomainError` family | **Reused** | `src/lib/errors.ts` — `NotFoundError`, `PermissionDeniedError`, `ValidationError` |
| `RequestContext` (log line) | **Reused** | `src/domain/audit/request-context.ts` |
| `AuditEvent` | **Reused** | `src/domain/audit/audit-event.ts` — Unit 006's shape, read-only here |
| Prisma client | **Reused** | `src/infrastructure/db/` |
| The projection itself | **New** | `src/domain/listings/` |
| The reader ports | **New** | `src/application/listings/ports/` |
| The Prisma readers | **New** | `src/infrastructure/listings/` |

### The dependency rule, and where it is enforced

`coding-standards.md` states the rule and says it is "enforced by an ESLint
boundary rule". **It is not.** `eslint.config.mjs` has no `no-restricted-imports`
zone configuration — the existing rules are `no-floating-promises`,
`no-misused-promises`, `no-explicit-any`, `no-unused-vars`, and `no-fallthrough`.
The boundary has been upheld so far by convention and by review, not by tooling.

**This design does not add the rule.** Adding it is a project-wide change that
would need to accommodate the whole existing tree, and it belongs to a
standards change rather than to this bolt. What this bolt **does** do is keep
the dependency direction correct, so that adding the rule later is a
verification rather than a refactor:

```text
domain/listings     → nothing (no Prisma, no Next, no React)
application/listings → domain/listings + domain/accounts
infrastructure/listings → domain/listings + application/listings/ports
app/ → application/listings
```

**One dependency needs naming.** `application/listings` will import
`ActorContext` from `domain/accounts`. That is a **domain → domain** import
between two bounded contexts. It is acceptable and one-directional — the
listings module reads the accounts module's projection type and never its
internals — but it should be recorded as an explicit, narrow import rather
than a broad `domain/accounts` barrel import, so the coupling stays visible.
**Flagged for Stage 3**: this is a genuine ADR candidate, because it is the
first cross-module domain import in the codebase and later bolts will copy
the precedent.

---

## API Design

### This bolt exposes no new route.

The projection is a **capability**, and the routes that consume it belong to
bolt `009-reporting-search` (`007-public-summary-listing`,
`008-authenticated-detail-view`) and Unit 007 (the surfaces).

This is deliberate, and it is the reason the bolt comes first. The 11-wave
plan places `006-reporting-visibility` **before** `007-reporting-core`, which
means the projection is built and verified against fixtures before a single
report row exists. A capability with no surface is testable in isolation; a
projection discovered later, in the middle of building a listing endpoint, is
not.

**The contract bolt 009 and Unit 007 consume** is this application-layer call:

```ts
const projection = await visibilityService.projectReport(actorContext, reportId);
// → VisibilityProjection
```

### The projection's shape on the wire

The serialiser is **driven by the projection**, not by the entity. A field
absent from `reportFields` has no key in the response — not a null, not an
empty string, not a redacted placeholder.

```ts
interface ProjectedReport {
  id: string;
  type: 'Lost' | 'Found';
  status: string;
  // FR-38 summary — always present
  name?: string;
  category?: string;
  date?: string;
  campusArea?: string;
  // FR-39 authenticated-visible
  description?: string;
  imageRef?: string;
  reporterDisplayName?: string;
  statusHistory?: { status: string; lastActionAt: string };
  // FR-37 sensitive — owner columns and administrator only
  exactPlace?: string;
  identifyingDetails?: string;
  reporterEmail?: string;
  reporterPhone?: string;

  // Related records, each present only when the viewer's columns grant them
  claims?: ProjectedClaim[];
  recoveryResponses?: ProjectedRecoveryResponse[];
  threads?: ProjectedThread[];
  auditTrail?: AuditEvent[];
}
```

**Why optional keys rather than a `null`:** a `null` value and an absent key
are different facts to a client, and a client that sees `exactPlace: null`
may render "Exact place: unknown" — telling the member that a field exists
and is empty. That is a (small) disclosure: it confirms the report *has* an
exact-place field, which for an unrelated member is information about the
report's schema they were not granted. The PRD's own rule — "a viewer sees
exactly the fields my relationship permits" — is satisfied by absence.

**Why `auditTrail` is optional and not `null`:** the projection's
`auditTrail` property is `null` (an explicit absence, per ADR-8's rule that
"forbidden" must not look like "empty"), and the serialiser **omits the key
entirely** when the projection says `null`. The two levels are deliberately
different: the domain says "explicitly absent", the wire says "not there".

### The `403` / `404` / redirect question (Stage 1 Open Question 1)

**Settled here: the projection refuses an anonymous detail request with a
`NotFoundError`, which the route maps to 404.**

The reasoning:

1 - FR-38 says "There is NO anonymous report-detail page in FindBack" and the
   flow is `public listing → Login → authenticated detail page`. The
   projection therefore has **no anonymous detail shape to return** — there is
   nothing to serve.

2 - 404 rather than 403, because a 403 on a report id **confirms the report
   exists**. A non-member asking for a report's detail and receiving 403 has
   learned something about a report they were never granted sight of. 404
   leaks nothing. This is the same reasoning ADR-8 records for the audit
   trail: "a filter returns an empty result and would make 'forbidden'
   indistinguishable from 'empty' while leaking existence through the result
   count."

3 - The **redirect to login** is a UX surface decision, not a projection
   decision, and it belongs to Unit 007. The route layer may catch the
   `NotFoundError` for an anonymous viewer and redirect; the projection's
   contract is "there is no anonymous detail projection", and the route
   decides how to express that to a human. **This is recorded as an open item
   for Unit 007**, not settled here.

### The four Stage 1 open questions — all settled

| # | Question | Decision | Where |
|---|---|---|---|
| 1 | Anonymous detail: refuse or serve the summary? | **Refuse** — `NotFoundError`, 404. The redirect-to-login is Unit 007's. | § API Design above |
| 2 | Does the projection decide existence, or only fields? | **Fields only.** Existence is a listing concern (FR-49, bolt 009). The projection answers "what may this viewer see of a report they have reached". | § Data Persistence |
| 3 | Administrator: one column or a union? | **One column.** It grants everything; the union is redundant and would enlarge the column set for no gain. | § The resolver |
| 4 | Relationship: separate query or folded in? | **Separate, indexed query.** Two existence facts plus two ids over indexed FKs. | § Data Persistence |

---

## Data Persistence

### No schema change is required for this bolt.

The projection reads `reports`, `claims`, `recovery_responses`, and
`audit_events`. **`reports`, `claims`, and `recovery_responses` do not exist
yet** — bolt `007-reporting-core` creates them. This bolt ships **against the
schema bolt `007` will create**, and must not create it.

This is the bolt's most important structural constraint, and it needs stating
plainly:

> **Bolt `006` builds the projection and its readers. Bolt `007` builds the
> tables.** If `006` creates the tables, the two bolts overlap and the
> plan's separation is lost. If `007` creates them, `006`'s readers cannot be
> integration-tested against the real schema until `007` lands.

**Resolution: `006` ships the domain and the application layers complete, and
its infrastructure readers are written against the Prisma schema `007` will
define — with the reader's `SELECT` list tested at the unit level against a
query-plan assertion, not against a live table.** The Stage 4 obligation list
says exactly this. Concretely, `006` provides:

1 - the **complete** domain layer, fully unit-tested;
2 - the **complete** application layer, fully unit-tested against port fakes;
3 - the infrastructure readers, **written but not integration-tested**, with
   their `SELECT`-list construction unit-tested in isolation.

Then bolt `007` creates the schema and **integration-tests the readers it
leaves behind**. This is a deliberate, recorded split, and it is why `006`'s
prerequisites are `001-audit-core` (the audit tables exist) and `004-identity-core`
(the `Account` table exists) — but **not** `007-reporting-core`.

**Risk, stated plainly:** if bolt `007` deviates from the column names this
bolt's readers assume, the readers break. The mitigation is that this design
**names every column it depends on**, in one place, so `007` has an explicit
contract to satisfy rather than having to infer it. That contract is § The
report schema this bolt assumes, below.

### The report schema this bolt assumes

Bolt `007` must provide these columns on `reports`:

```text
reports
├── id                 uuid  primary key
├── type               text  'Lost' | 'Found'
├── name               text
├── category           text
├── description        text
├── date               date
├── campus_area        text
├── exact_place        text        ← FR-37 SENSITIVE
├── identifying_details text       ← FR-37 SENSITIVE
├── image_ref          text        ← FR-37 SENSITIVE
├── status             text
├── reporter_id        uuid        → accounts.id
├── created_at         timestamptz
└── updated_at         timestamptz
```

Plus the **reporter's** email and phone, which are **not** on `reports` — they
are on `accounts`. So a report read for an owner column **joins** `accounts`
for the reporter's contact details. This matters for the "never loaded"
property: `reporter_email` is selected only for the owner and administrator
columns, and the join to `accounts` is only issued at all for those columns.

**The last-action timestamp.** FR-39's "member-facing status history (current
status + last-action timestamp)" needs a `last_action_at`. It is **not** a
column on `reports` in the schema above, and it should not be: the last
action on a report is an **audit event** (`audit_events.occurred_at` for the
report's most recent event). The projection therefore reads it from the
existing `audit_events` table with the index `idx_audit_events_parent_occurred`
that bolt `001` already created.

**This is a genuinely better answer than a denormalised column**, for three
reasons: it needs no schema change and no write-side maintenance; it cannot
drift from the trail (a `last_action_at` column would need every write path
to update it, and one that forgot would be silently wrong); and it is already
indexed for the query. The cost is one additional indexed read per detail
projection — a single-row index seek on `(parent_id, occurred_at DESC)`, which
is the same access pattern the trail itself uses.

**But the member-facing history is not the trail.** FR-32 forbids a
non-administrator from receiving trail content. The projection therefore reads
**only the timestamp and the current status**, never the event's type, reason,
actor, or metadata. That is why the query selects `occurred_at` alone and
**not** the full event row — a full event row for the last action would carry
the actor and the event type, which is trail content.

This is a subtle point worth stating as its own rule, because it is easy to
implement wrongly:

> **The member-facing status history is the report's `status` plus the
> timestamp of its most recent audit event — and nothing else. The event row
> itself is never selected for a non-administrator.**

### The relationship query

The relationship is four facts, resolved in **one** query over indexed foreign
keys:

```sql
-- The relationship, for one viewer and one report.
SELECT
  r.id                AS report_id,
  r.type              AS report_type,
  r.reporter_id       AS reporter_id,
  (r.reporter_id = $viewer_id)          AS is_reporter,
  c.id                AS claim_id,
  rr.id               AS recovery_response_id
FROM reports r
LEFT JOIN claims c
  ON c.report_id = r.id AND c.claimant_id = $viewer_id
LEFT JOIN recovery_responses rr
  ON rr.report_id = r.id AND rr.responder_id = $viewer_id
WHERE r.id = $report_id;
```

**Why `LEFT JOIN` and not `INNER JOIN`:** an unrelated member has no Claim and
no Recovery Response, and an inner join would return **zero rows** for them —
which is indistinguishable from "the report does not exist". The report's
existence must not depend on the viewer's relationships. This is the same
class of bug ADR-8 names, and it is the reason the relationship query is a
separate step rather than folded into the report read.

**Why the relationship query is separate from the report read (Stage 1
Open Question 4):**

1 - It touches `claims` and `recovery_responses`, which the report read does
   not need. Folding them together would make the report's `SELECT` list
   depend on join shape rather than on the field set — and the whole point of
   the field set is that it alone decides what is selected.

2 - It is a **different query shape** (a two-table join with filters) than the
   report read (a single-row primary-key lookup). Keeping them apart lets
   each be indexed and explained on its own.

3 - It runs **before** the column resolution, so it cannot itself leak: it
   returns only ids and two booleans, never report content.

### The `SELECT`-list builder — the mechanism

This is the heart of the bolt. It is **not** in the domain layer (it knows
about SQL) and **not** in the application layer (it knows about neither SQL
nor the domain's rules). It lives in `infrastructure/listings/` and is a
**pure function from a column set to a list of column names**:

```ts
// infrastructure/listings/select-builder.ts
export function reportSelectColumns(columns: readonly ProjectionColumn[]): readonly string[];
export function claimSelectColumns(columns: readonly ProjectionColumn[]): readonly string[];
export function responseSelectColumns(columns: readonly ProjectionColumn[]): readonly string[];
```

The mapping is derived **from the same domain value objects** the projectors
use, so the query and the projection cannot drift. This is the key structural
property: **the field set is one artefact, read by two consumers** — the
projector (which decides what to include) and the select builder (which
decides what to select). If they were two separate lists, a field could be
selected but not projected, or projected but not selected.

The builder's output for the columns:

| Columns | `reports` SELECT list |
|---|---|
| `anonymous` | `id, type, name, category, date, campus_area, status` |
| `unrelatedMember` | + `description, image_ref, reporter_id` (and the `accounts` join for `display_name`) |
| `foundReportOwner` / `lostReportOwner` | + `exact_place, identifying_details` (and the `accounts` join for `email`, `phone`) |
| `administrator` | everything |

**A missing Sensitive column is absent from the SQL.** This is what makes the
guarantee structural. A test asserts the generated SQL text for the
`unrelatedMember` column set contains neither `exact_place` nor
`identifying_details` — a **string assertion on the query**, not a behavioural
assertion on the response. That is a stronger test, because a response-level
test would still pass if the value were loaded and dropped, which is exactly
what FR-39 forbids.

### The `accounts` join

`reporter_email` and `reporter_phone` live on `accounts`. The join is
**conditional on the column set**:

- An unrelated member's query selects `accounts.display_name` only.
- An owner or administrator's query selects `accounts.display_name, accounts.email, accounts.phone`.

When the columns grant neither the name nor the contact details, the join is
**not issued at all**. The select builder returns both the `reports` columns
and a flag saying whether an `accounts` join is needed — so the decision
about the join is made by the same function that decides the columns.

**Why the reporter's email is a Sensitive Field at all** — it is on
`accounts`, shared with every other report the member authored, and FR-37
names it. It is therefore selected **per report, per viewer**, not fetched as
part of a member profile and filtered afterwards.

### Indexes

The relationship query's two joins are the ones that need support:

```prisma
// on claims
@@index([reportId, claimantId], map: "idx_claims_report_claimant")

// on recovery_responses
@@index([reportId, responderId], map: "idx_recovery_responses_report_responder")
```

Both are **bolt `007`'s** to create, since `007` creates the tables. They are
listed here as part of the contract `007` must satisfy. Without them, the
relationship query degrades to a scan of every Claim on the report — which at
10,000 reports is still fast in practice but is not index-backed, and
`coding-standards.md` § Constraints for this unit says "Search and listing
queries must be index-backed; no full scans over reports."

The **existing** `idx_audit_events_parent_occurred` (bolt `001`) already serves
the last-action-timestamp lookup. No new index is needed for it.

### Transaction boundaries

**This bolt opens no transaction and writes nothing.** A projection read is a
read.

Two consequences worth stating:

1 - The relationship read and the report read are **two separate queries**, not
   one transaction. They are consistent enough for a read: the relationship
   facts (did this viewer submit a Claim) and the report content are
   independent, and a Claim submitted between the two reads would appear in
   the *next* request. This is acceptable for a visibility projection and is
   the normal read-consistency trade-off.

2 - **A Claim submitted between the relationship read and the response is not
   reflected until the next request.** This is not a leak — it is the
   *conservative* direction. The viewer sees what they were entitled to when
   the request began. The reverse (a Claim deleted between the reads, granting
   visibility that no longer applies) cannot happen, because Claims are never
   deleted (FR-10 hard delete removes an interaction-free report, which has
   no Claims).

### The "never loaded" property, and where it is tested

| Property | Test | Level |
|---|---|---|
| The `SELECT` list for `unrelatedMember` contains no Sensitive column | assert on the **generated SQL string** | unit, against `select-builder.ts` |
| The `SELECT` list for an owner column contains all of them | assert on the generated SQL string | unit |
| The `accounts` join is not issued without a name/contact column | assert on the generated query shape | unit |
| The response omits an unauthorised key entirely (not `null`) | assert `key not in response` | integration, once `007` lands |
| A non-administrator receives no audit content | assert no `audit_events` query, or no event fields selected | unit + integration |

---

## Security Design

### Where the enforcement lives

**In the application layer, on every read path, including image delivery**
(`coding-standards.md` § Security coding rules). Not in the UI. Not in a
route handler's convenience. The route handler parses and delegates; the
application layer decides.

### The three layers of defence, and which is load-bearing

1 - **The port signature** — `loadReportForViewer(reportId, columns)`. The
   authorisation decision is a parameter, so it cannot be skipped. *Load-bearing.*

2 - **The select builder** — the columns determine the `SELECT` list, so an
   unauthorised Sensitive Field is never read from the database. *Load-bearing.*

3 - **The projection** — the response is assembled from the projection, so a
   field that was not loaded cannot be returned. *Load-bearing.*

4 - **The UI** — hides what it should not show. *Not load-bearing, and never
   sufficient.* It is a courtesy, not a control.

Layers 1–3 are all in the **application and infrastructure** layers, so
"the UI hides it" can never be the only thing standing between a member and
another member's identifying details.

### The two rules that are easiest to get wrong

**Rule 1 — Sensitive data is never loaded for an actor who may not see it.**
Mechanised by the port signature and the select builder. Tested by asserting
on the **SQL**, not on the response.

**Rule 2 — Visibility never unlocks as a side effect of submitting a Claim or
Recovery Response** (`EXPERIENCE.md` §11.4; story 010 criteria 17 and 18).

This one deserves a structural answer rather than a careful one, because a
"careful" implementation is one refactor away from regressing. The mechanism
is that **the resolver's input is the `ReportRelationship`, and the
relationship records participation — never permission.**

```ts
// The relationship carries participation facts.
interface ReportRelationship {
  isReporter: boolean;          // → an owner column
  hasClaim: boolean;            // → the Claimant column
  hasRecoveryResponse: boolean; // → the Recovery-responder column
}
```

The resolver reads `hasClaim` to decide **which column** the viewer holds —
never **what the column contains**. The Claimant column's grant is a fixed
property of the matrix, so a viewer's having submitted a Claim cannot change
what the Claimant column grants. The grant is a constant; only the *column
selection* depends on the relationship.

**The test that proves it:** submit a Claim, then re-evaluate the projection
for the same member on the same report. The field set must be **exactly** the
unrelated-member field set plus the Claimant's own Claim. If a future change
made participation grant a report-level Sensitive Field, that test fails.

### No logging of projections

The operational log line's shape is `RequestContext`, a **closed** type with no
field capable of holding a sensitive value — the same discipline the audit
module uses. A projection read logs the **fact** (`report.viewed`, with the
actor, the target id, and the outcome) and never a field, a value, or a field
set.

**Why the granted columns are not logged either:** the column set is a
statement about a relationship, and logging it would write "member X is the
owner of report Y" into a 1-hour-retained operational log, where the trail's
own rules would not apply. The log records that a read happened; the
projection's contents are not operational data.

### The audit trail

**This bolt reads the trail but never writes it.** The trail's write path is
Unit 006's, and ADR-9's rule — a module cannot invent an event number — means
this bolt invents nothing.

**Reading the trail is itself logged**, by Unit 006's `AuditReadLog`, because
Vercel Hobby retains runtime logs for one hour (ADR-7). When a projection
includes the trail, the **route or the application service** must ask Unit
006's recorder to record the read — in its own transaction, after the query
succeeds, with the same failure rule (a failed read record does not fail the
read).

**This is a cross-module call and it is deliberately not made from the
domain.** The projection's `auditTrail` is `null` or the events; *recording
the read* is a concern of the service that orchestrates the read, and it
belongs to the audit module's capability. **This bolt does not implement it**
— Unit 006 already has `AuditReadRecorder`, and bolt `009` (which owns the
routes) is where a trail-reading route first exists. This bolt provides the
`AuditTrailVisibilityReader` port and its administrator gate; the recording is
wiring that lands where a trail-reading route exists.

**Flagged as an open item for bolt `009`**, not a gap in this bolt.

### Image authorisation

The projection grants the **image reference**, not the bytes. Byte delivery is
bolt `010-reporting-images`' scope, and ADR-2 governs it: private storage,
authorisation **immediately before** the blob read, and never an `s-maxage`
cache header on a private response.

**The projection's image grant is therefore a precondition of the image
route's authorisation, not a substitute for it.** Bolt `010` must re-apply the
matrix at the image read — a projection computed for a detail page is not an
authorisation token for a later blob fetch. This is stated here so `010` does
not mistake this bolt's grant for a blanket authorisation.

### What this bolt does not defend against

- **A compromised application layer.** If the select builder is given the
  wrong columns, the wrong fields are loaded. This is why the select builder
  is a **pure function** with no caller-supplied column list — the caller
  supplies a `ProjectionColumn[]`, which is closed and exhaustive, and never
  a field name.
- **A timing oracle on the report's existence.** The projection is
  authenticated-only in practice (anonymous gets no detail), so there is no
  anonymous existence probe to defend against. If an anonymous detail route
  is ever added, it must inherit FR-51's anti-enumeration discipline.
- **Cross-tenant access.** FindBack is single-tenant (`tech-stack.md`), so
  there is no tenant dimension to filter on.

---

## NFR Implementation

### FR-14 search, ≤ 500 ms p95 at 10,000 active reports

**This bolt does not implement search.** It implements the **projection** that
search results flow through.

The concern this bolt must not create is a **per-row projection cost**. If
bolt `009`'s search resolves a projection per row, and each projection costs
two extra queries (the relationship and the last-action timestamp), then a
50-row page costs 100 extra queries — and the p95 target dies.

**The design decision: the projection is resolved for the *page*, not for the
row.**

Concretely, the search path in bolt `009` will:

1 - run **one** relationship query for the whole page — a single query
   resolving the viewer's relationship to *all* N reports on the page, not N
   queries;
2 - resolve the columns **per report** (a pure function — free), because each
   report may be owned by a different member or have a different type;
3 - build the `SELECT` list **once per distinct column set**, not once per
   row — the number of distinct column sets on a page is bounded by the
   number of columns (7), and in practice by 1–2.

**This is a design obligation on bolt `009`, and this bolt provides the
mechanism that makes it possible**: the column set is a small closed value, so
the select list can be memoised by it. The `select-builder.ts` functions are
pure and therefore trivially cacheable.

**The number this bolt must not blow:** the detail projection is one report,
one relationship query, one report query, one last-action query, plus Claims
and Responses and threads as granted. That is **at most 6 queries** for a
detail page, and **zero** for a listing row that carries only summary fields.

### The ≤ 2 s p95 initial-HTML NFR

Not this bolt's concern — it renders nothing. But the projection's query count
is the input to that budget, and it is bounded as above.

### Testability, and the reason this bolt is first in the plan

The projection is **pure**. It has no database, no network, and no React
(`coding-standards.md` § File and folder organization). So the entire matrix
can be asserted against fixtures:

```ts
// One test per column, asserting the exact field set.
expect(fieldSetFor(['unrelatedMember'])).toEqual([
  'summary', 'description', 'image', 'reporterName', 'statusHistory',
]);
```

The matrix has seven columns and roughly nineteen rows; a fixture-driven
table test asserts **every cell** of the FR-39 matrix in one place, and it is
the test that would fail if any cell were wrong. **This is the artefact that
justifies the bolt's position in the plan.**

### Logging and observability

The projection read logs one line: the request id, the actor id, the actor
role, `report.viewed`, the target id, and the outcome. It logs **no** field,
**no** value, and **no** column set (see § Security Design).

A **denied** read — an anonymous detail request, a non-administrator
attempting a trail read — logs `outcome: 'denied'`. PRD §10's
`success | denied | error` vocabulary already has the slot.

---

## Error Handling

| Situation | Error | HTTP | Notes |
|---|---|---|---|
| The report does not exist | `NotFoundError` | 404 | Identical for an anonymous viewer, so existence is not disclosed |
| The viewer is anonymous and asked for a detail | `NotFoundError` | 404 | Stage 1 Open Question 1; the route may instead redirect to login |
| The viewer is not an administrator and asked for the trail | `PermissionDeniedError` | 403 | But the **projection** returns `null` for the trail rather than throwing — see below |
| The report id is malformed | `ValidationError` | 400 | At the route boundary |
| A claimed query shape is unknown | `ValidationError` | 400 | At the route boundary |

### The trail refusal is a `null`, not a throw — and this is a deliberate split

The **projection** treats a non-administrator's trail request as "the trail
is not part of your projection" and returns `null` for it. It does **not**
throw, because a projection is a description of what a viewer sees, and a
viewer with no trail access is a normal state, not an error.

The **route** that serves the trail *as a route of its own* — if one is ever
built — refuses with `PermissionDeniedError`, because a request for
something you may not have is a refusal. ADR-8's rule applies there: the
refusal happens **before** the query, so no count leaks.

**Why the split:** the projection is also used by listing and detail
compositions, where "this viewer has no trail" is expected for every
non-administrator. Throwing would make every non-administrator detail read
an error. The distinction is: **the projection describes; a route refuses.**

### The errors are typed and expected

`NotFoundError`, `PermissionDeniedError`, and `ValidationError` all extend
`DomainError` (`src/lib/errors.ts`) and are business outcomes, not failures.
They never surface raw text to a member — the route maps them to the
`EXPERIENCE.md` §4.9 copy. Anything else thrown is a genuine defect and is
logged as one.

---

## External Dependencies

| System | Purpose | Risk |
|---|---|---|
| PostgreSQL | The relationship query, the report query, the last-action timestamp | Low — three indexed reads |
| `accounts` table | The reporter's display name and contact details | Low — one conditional join |
| Unit 006's audit module | The trail read, for administrators only | Low — read-only here; the read *record* is wired in bolt `009` |

**No new external dependency. No new configuration. No email. No blob.**

---

## Configuration

**None.** This bolt adds no environment variable, no secret, and no
threshold.

The `select-builder.ts` is a static mapping. The column set is derived from
the relationship and the viewer. There is nothing to configure, and therefore
nothing that can be misconfigured into a leak.

---

## Traceability

### Story `010-visibility-matrix-by-actor` → design elements

| Criterion | Design element |
|---|---|
| 1 — Sensitive Field never loaded | § The `SELECT`-list builder; the port signature; the SQL-string test |
| 2 — anonymous gets FR-38 only, no detail page | § The `403`/`404`/redirect question; `select-builder`'s anonymous list |
| 3 — unrelated member's exact field set | `select-builder`: unrelatedMember list; `ReportProjector` rule 5 (Stage 1) |
| 4 — Found-report owner's fields | `select-builder`: owner list; the `accounts` join |
| 5 — Lost-report owner's fields **and** responses and threads | `select-builder`: owner list; `RecoveryResponseProjector` rule 2; `ThreadProjector` rule 3 |
| 6 — Lost-report owner column governs all owner visibility | The resolver's owner-column selection by report type |
| 7 — claimant's own Claim in full | `select-builder`: claim list for the claimant column |
| 8 — claimant gets no report Sensitive Fields | `select-builder`: the claimant column set contains no Sensitive column |
| 9 — owner sees Claim existence, not reason/details | `select-builder`: the owner's claim list omits `reason` and `identifying_details` |
| 10 — claimant sees no other claimants' details | `select-builder`: the claimant's claim query is filtered to their own id |
| 11 — responder's own response only | `select-builder`: the responder's response query is filtered to their own id |
| 12 — responder sees no other responses | as above |
| 13 — administrator gets everything | `select-builder`: the administrator list; the resolver's single-column rule |
| 14 — administrator sees per-Response threads on others' reports | `ThreadProjector` rule 3 (Stage 1) |
| 15 — member-facing status and last-action timestamp | § The report schema this bolt assumes — the `audit_events` timestamp read |
| 16 — participation confers no trail access | § The trail: `null` for a non-administrator; the SQL never selects event rows for one |
| 17 — a Claim unlocks nothing beyond the Claimant column | § Rule 2 — the relationship carries participation, never permission |
| 18 — a Recovery Response unlocks nothing beyond its column | as above |
| 19 — thread participation grants no private evidence | `ThreadProjector` rule 4 (Stage 1); `select-builder`: the thread query is keyed on the already-scoped parents |
| 20 — owner column chosen by report type | The resolver's owner-column selection |
| 21 — no member is both owner columns | The resolver's mutually-exclusive selection |
| 22 — enforced at the API layer | § Where the enforcement lives — three load-bearing layers, none of them the UI |

### Requirement traceability

| FR | Design elements |
|---|---|
| FR-37 | The Sensitive columns in `select-builder`; the `accounts` join's conditional contact columns |
| FR-38 | The anonymous `SELECT` list; the `404` refusal for an anonymous detail |
| FR-39 | All seven columns in `select-builder`; the resolver; the four projectors |
| FR-32 | § The trail — administrator-only, and the `null` refusal |
| FR-2 | The `Viewer` is built from the `ActorContext`; a non-member actor is anonymous |
| FR-49 | The projection is the field-level half; the partition half is bolt `009`'s |
| FR-14 | § FR-14 search — the per-page, not per-row, resolution obligation |
| FR-10 | § Transaction boundaries — Claims are never deleted, so the conservative direction is safe |

---

## What Stage 4 must build, explicitly

1 - **`src/domain/listings/`** — the seven columns, the viewer, the relationship,
   the resolver, the field set, the five projectors, the projection aggregate,
   and the barrel export. **Complete and fully unit-tested.**

2 - **`src/application/listings/`** — the visibility service, sequencing
   resolve → relate → resolve columns → read → assemble. **Complete and
   unit-tested against port fakes.**

3 - **`src/application/listings/ports/`** — the five reader ports, each taking
   the **column set**, never the viewer.

4 - **`src/infrastructure/listings/`** — the select builder (pure, unit-tested
   against the SQL string) and the five Prisma readers, **written against the
   schema bolt `007` will create**.

5 - **The matrix test** — one fixture-driven table test asserting **every cell**
   of the FR-39 matrix, for all seven columns. This is the artefact the bolt
   exists to produce.

6 - **The "never loaded" test** — asserting on the **generated SQL**, not the
   response. A response-level test would pass even if the value were loaded
   and dropped, which is what FR-39 forbids.

7 - **The "participation grants nothing" test** — submit a Claim, re-evaluate
   the projection, assert the field set is unchanged apart from the Claimant's
   own Claim.

8 - **NOT integration-tested against a live database** — bolt `007` creates the
   tables and owns that integration test. Recorded as an explicit split, with
   the risk stated in § Data Persistence.

---

## Open questions for the owner

1 - **The `006` / `007` schema split.** Bolt `006` needs `reports`,
   `claims`, and `recovery_responses` to exist before its readers can be
   integration-tested, but bolt `007` is the bolt that creates them, and the
   plan's ordering deliberately puts `006` first. **Proposed:** `006` ships
   the domain and application layers complete and fully tested, plus the
   readers written and unit-tested against the SQL string; `007` creates the
   tables and integration-tests the readers `006` left behind. **The
   alternative** — reordering so `007` runs first — would put report creation
   before the visibility rules, and every report created in between would be
   created without a projection to read it through. **A third option** —
   `006` creates the schema and `007` fills it — makes the two bolts overlap
   and loses the plan's separation. **Recommendation: the proposed split.**
   Owner confirmation is requested, because it changes what "complete" means
   for this bolt.

   > ✅ **Owner confirmed 2026-10-28.** The proposed split is adopted. Bolt
   > `006` ships the domain and application layers complete and fully tested,
   > plus the readers written and unit-tested against the generated SQL
   > string. Bolt `007` creates the tables and integration-tests the readers
   > `006` left behind. **This item is settled, not open.**

2 - **The first cross-module domain import.** `application/listings` will
   import `ActorContext` from `domain/accounts`. This is the first such import
   in the codebase, and later bolts will copy the precedent. **Proposed:** a
   narrow, named import of the type only — not a barrel import — and an ADR
   recording that a listings module may read the accounts module's projection
   type. **Flagged for Stage 3.**

3 - **The audit-trail read record.** This bolt provides the administrator-gated
   trail reader but does not wire the read *record*, because no trail-reading
   route exists yet. **Proposed:** bolt `009` wires it, using Unit 006's
   existing `AuditReadRecorder`. **Not a gap in this bolt** — recorded so it is
   not forgotten.

4 - **`coding-standards.md` claims an ESLint boundary rule that does not
   exist.** The dependency rule is currently upheld by convention. **Proposed:**
   add the rule as a separate, project-wide change with its own review — not
   inside this bolt, where it would have to accommodate the whole existing
   tree. **Recorded for the owner**, since it is a standards-vs-codebase
   discrepancy.

---

## Stage 3 candidates

1 - **The `006` / `007` schema split** — a boundary decision between two
   bolts, with a stated risk and a rejected alternative. Worth an ADR.

2 - **The first cross-module domain import** — a new dependency edge between
   two bounded contexts that later bolts will copy.

3 - **The columns-not-viewer port contract** — the mechanism that makes
   FR-39's "never loaded" structural. This is the bolt's central design
   decision, and it is the one a future maintainer is most likely to
   "simplify" by passing the viewer instead. **Worth an ADR specifically to
   make that refactor a conscious, argued decision rather than an accident.**
