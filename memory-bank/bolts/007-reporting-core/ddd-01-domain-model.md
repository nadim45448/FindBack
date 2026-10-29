---
unit: 002-reporting-and-listings
bolt: 007-reporting-core
stage: model
status: complete
updated: 2026-10-28T20:35:00Z
---

# Static Model - Reporting and Listings (Report Core)

## Bounded Context

**Reporting and Listings** (`src/domain/listings/`), the module the standards'
map assigns "Report CRUD, search, visibility projection" (FR-6..FR-14,
FR-37..FR-39, FR-49, FR-53). This bolt covers the **write** half of that
context: creating a Report with the authoritative FR-8 field set, and
validating that field set. Bolt `006` already built the **read** half — the
FR-39 visibility projection — and this bolt's schema must be exactly what
`006`'s readers expect.

**The context boundary.** A Report is the anchor other modules attach to:
Claims attach to Found reports, Recovery Responses to Lost reports, and the
audit trail records the report's own lifecycle. This module owns the Report
and its field set, and **nothing else**. It does not own Claim or Recovery
Response lifecycle, and it does not own the audit catalog (Unit 006 does).

**What this bolt is not.** It is not the listing or search read path (bolt
`009`), not the reporter's edit/withdraw lifecycle (bolt `008`), and not
image upload (bolt `010`). It creates a report and validates it. The image
field is part of the FR-8 field set, so the **field** is modelled here; the
**upload** is bolt `010`'s, and this bolt's contract on it is precisely that
its failure aborts the write.

**The load-bearing idea.** The FR-8 field set is **authoritative and closed**.
"No field beyond this set is stored on a Report" (story 001's technical note)
is not a convention here; it is an invariant of the aggregate, and it is
what makes FR-14 search, FR-37 sensitivity, and FR-39 projection
composable — each of them reasons over a known, closed set of fields.

### What bolt `006` left this bolt

Bolt `006` built the readers and, with them, an **explicit schema
contract** in `src/infrastructure/listings/physical-columns.ts`. That file
names the physical columns this bolt's migration must create. It is not a
suggestion — it is the interface between the two bolts, and the two were
designed together because the `006`/`007` split was owner-confirmed.

---

## Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **Report** | `id`, `type` (`Lost`\|`Found`), `status`, `name`, `category`, `description`, `date`, `campusArea`, `exactPlace?`, `identifyingDetails?`, `imageRef?`, `reporterId`, `createdAt`, `updatedAt` | The **FR-8 field set is closed**: exactly the eight fields above, and no more. A new report is `Open` and attributed to the acting member. `type` is set at creation and **never changes** (it anchors FR-10's interaction rule and FR-11's withdrawal rule). `status` starts `Open` and follows the FR-22 state machine, which bolt `008` and Units 003/005 own — this bolt only ever writes `Open`. `exactPlace`, `identifyingDetails`, and `imageRef` are optional; a report with none of them is valid. `exactPlace` and `identifyingDetails` are **FR-37 Sensitive Fields**. |
| **CampusArea** | `value`, `label`, `active` | A **fixed per-deployment enum** (FR-8, A4). Not a free-text field. A report stores the **enum value**, never the exact-place free text — the two are different facts, and conflating them is what FR-39's `campusArea` (public) and `exactPlace` (sensitive) split forbids. A deactivated area does **not** rewrite reports already filed: the stored report keeps its value, and the change affects new submissions only. |

### The two report types

`Lost` and `Found` **share one field set and one category enum** and differ
in exactly two things: the type label, and the **date bound** (Lost ≤ 365
days, Found ≤ 30 days). This is why they are one entity with a `type`
discriminator rather than two entities. Two entities would mean two
validators, two aggregate roots, two report-status state machines, and two
FR-39 matrix columns — for a difference of one date constant.

The type is nonetheless **load-bearing**, and it is load-bearing in three
places downstream, which is why it is set once and never edited:

1. **FR-10** — hard delete requires interaction-freedom, and a Found
   report's interaction is a Claim while a Lost report's is a Recovery
   Response.
2. **FR-11** — withdrawal rules differ by type.
3. **FR-39** — the owner column is split: a Found report has a
   Found-report owner, a Lost report has a Lost-report owner.

### The date field, and why its name differs by type

One column, `date`, on the table; two meanings in the domain, decided by
`type`. For a Lost report it is **date lost**; for a Found report it is
**date found** (story 002's criterion 4: "the date field records the date it
was found, not the date it was lost"). The domain names it accordingly —
`DateLost` and `DateFound` are the two value objects — while the storage
keeps one column. This is worth stating plainly because it is exactly the
kind of thing a later refactor would "tidy up" into two columns and break
FR-14's date filter.

---

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **ReportType** | `Lost` \| `Found` | A closed two-value set. Never renamed (coding-standards § Naming conventions: status literals are named after the PRD, verbatim). Never mutable after creation. |
| **ReportCategory** | `Wallet`, `Bag`, `Electronics`, `Keys`, `Clothing`, `Books/Notebooks`, `Identification`, `Water Bottle`, `Other` | A **closed nine-value enum**, the PRD's, verbatim. A value outside the set is a **validation rejection**, never a stored free-text value. `Other` is a legitimate choice and needs no qualifying text. |
| **ReportName** | `value` | 1–80 characters, **inclusive** at both ends. Whitespace-only is rejected — the minimum length is not met by whitespace. |
| **ReportDescription** | `value` | 10–2000 characters, inclusive at both ends. |
| **ExactPlace** | `value` | 0–200 characters, inclusive. Optional; a report may omit it. **FR-37 Sensitive.** |
| **IdentifyingDetails** | `value` | 0–500 characters, inclusive. Optional. **FR-37 Sensitive.** |
| **ReportDate** | `value` (a calendar date) | Compared **by calendar day**, so a time component does not change the verdict. Never in the future, for either type. Past bound is 365 days for `Lost` and 30 days for `Found`, inclusive at the boundary. |
| **ImageRef** | `value` (a blob path) | Optional. Points into the private blob store. **FR-37 Sensitive.** Never a public URL — a bare blob URL is not a reference that can be authorised. |
| **CampusAreaValue** | `value` | One of the deployment's configured areas. A value outside the configured set is a **validation rejection**. The stored value is the enum value, not the free text. |

### Why the lengths are value objects and not bare strings

The bounds are **inclusive at both ends** — the PRD's edge cases are explicit
("Description of exactly 10 or 2000 chars | Accepted; the bound is
inclusive"). A bare `string` with a length check somewhere else is how a
bound gets re-implemented slightly differently on the edit path, and story
003's technical note says the same validator serves creation **and** reporter
edit. Wrapping the bound in the type makes "the same validator" structural:
there is one constructor, and it cannot be called with an invalid value.

The category and campus-area sets are value objects for a sharper reason:
**a closed set is a compile-time concern.** `ReportCategory` can only ever
hold one of nine values, so no code path can construct one from unvalidated
input without going through the parser that rejects unknown values. A
`string` typed as "a category" would let one through by accident, and a
category outside the set is a *validation rejection*, not a stored value.

---

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **Report** | The Report entity; its `ReportType`, `ReportCategory`, `ReportName`, `ReportDescription`, `ReportDate`, `ExactPlace`, `IdentifyingDetails`, `ImageRef`, `CampusAreaValue`; its `status` | 1 - **The FR-8 field set is closed.** Exactly eight fields, no more, no fewer. 2 - **The five required fields are present**: name, category, description, date, campus area. The three optional ones may be absent. 3 - **A new report is `Open`.** 4 - **The reporter is the acting member**, and is attributed server-side. 5 - **`type` is immutable.** 6 - **The date satisfies the bound for the type**: Lost ≤ 365 days, Found ≤ 30 days, neither in the future, inclusive at the boundary. 7 - **The category is one of the nine.** 8 - **The campus area is one of the deployment's.** 9 - **The image, if present, was stored before the report was created** — the upload is part of the write, not a follow-up step (image-handling §5: "The owning record is not created"). 10 - **The report is created with its audit event, in one transaction.** |

### The aggregate's boundary, and why the image is inside it

Invariant 9 is the one that shapes the aggregate boundary. The image is
part of the FR-8 field set, so it is part of the Report — but the blob lives
in another system. The resolution is **ordering, not nesting**: the image is
stored first, and the report row is written only if the image was stored.
A blob failure means the report does not exist. There is no "report without
image" intermediate state to clean up, because the report is written last.

The consequence for the design: the image upload is **not** inside the
database transaction. A blob store cannot participate in a PostgreSQL
transaction, and pretending otherwise would be a lie about atomicity. So
the write is a **compensating** pair, not an atomic one: upload the blob,
then write the row, and if the row write fails, delete the blob. This is the
honest description, and it is what Stage 2 must design for. The rule that
matters to the member is the one the story states — *a failed image means
no report* — and that is achievable without cross-system atomicity.

### The audit event is inside the aggregate's transaction, but not inside the aggregate

Invariant 10 puts the FR-31 event 1 write in the **same transaction** as the
report row. That is `data-stack.md`'s rule ("audit rows are written inside
the same transaction as the state change") and ADR-3's.

The audit event is **not** a member of the Report aggregate. It is a
separate record written by the `audit` module through a typed factory
(ADR-9), inside this module's transaction. The dependency is one-way:
`listings → audit`. The `audit` module never evaluates the report's status
machine, and this module never mints an event number or invents a field
outside the catalog.

---

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **ReportCreated** | A Report passes validation and its row is written | `reportId`, `reportType`, `reporterId`, `name`, `category`, `date`, `campusArea`, `optionalFields` (present/absent flags for exact place, identifying details), `imagePresence` (present/absent) |

**One event, one shape, both types.** `report.created` is catalog event 1 and
is the same event for a Lost and a Found report — the catalog's required
fields are `name`, `category`, `type`, `date`, `location`, `optionalFields`,
and `imagePresence`, and `type` carries the distinction. The catalog entry
names **no** Sensitive Field for event 1, so the payload carries the
**presence** of the optional Sensitive Fields, never their values: the trail
records *that* a report has identifying details, not what they are. That is
the trail's rule (coding-standards § Logging: a Sensitive Field may appear in
a trail entry only where the frozen PRD names it for that event) and it
happens to be right anyway — the trail is administrator-only but still
should not accumulate Sensitive values it does not need.

The event is raised **after** the transaction commits, or read back from
the committed state. It is not raised from inside the transaction, because
an event for a report that may not exist is worse than a missing one — the
same reasoning ADR-7 gives for the audit-read record.

---

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **ReportFieldValidator** | `validate(draft, type) → ValidatedReport \| FieldValidationError` | The value objects; the category and campus-area sets; **nothing else**. Pure. |
| **ReportCreator** (application layer) | `create(draft, actor) → Report` | `ReportFieldValidator`; the `ReportRepository`; the `ImageStore`; the `AuditWriter`; the `TransactionFactory`; the `ActorContext` |

### The validator is a pure function of the draft and the type

This is the whole shape of story 003. It takes the submitted fields and the
report type, and returns either a validated report or a **field-level**
error naming the offending field. It has no dependencies, and it is the
**same validator** for creation (stories 001/002) and reporter edit (story
004) — so the bounds are enforced identically on both paths by construction,
not by two implementations that agree today.

The validator is where the type's date bound is applied. It is the **only**
place, because the bound is the one thing that differs between the two
report types, and one place is one implementation.

### Why the validator is not a method on Report

A `Report` that validates itself must already exist to be validated, so the
invariants would be checked after construction rather than enforced by it.
The validator is instead the **only** path to a `Report`, so a `Report` that
exists is a `Report` that passed. This is the same reasoning bolt `006`
used for the `Viewer`: the type is built by the thing that knows the rule,
and the rule is not re-checked by the consumer.

### Why the campus-area set is injected rather than hard-coded

The campus-area list is **per-deployment** (FR-8, A4, OQ-1) — it is external
data, seeded at deploy time, not a compile-time constant. So the validator
receives the configured set as an input. This is deliberate: the category
enum is fixed by the PRD and *is* a compile-time constant, but the campus
areas are not, and treating them the same way would hard-code one
deployment's areas into the domain.

**OQ-1 remains open** — how the list is configured is Architecture's call.
That does not block this bolt: the domain needs a *set of valid values*, and
where the set comes from is a Stage 2 concern (a seed, a config file, or a
table). What this bolt must not do is assume a mechanism OQ-1 has not
decided.

---

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **ReportRepository** | Report | `create(report, transaction) → Report` — inside a caller's transaction, like the audit repository. Later bolts add `findById`, `update`, `delete`, and the FR-14 search. |
| **CampusAreaReader** | CampusArea | `listActive() → readonly CampusArea[]` — the configured set, for the validator and for the route's dropdown. |
| **ImageStore** | (not an entity — a port to the blob store) | `store(bytes, prefix) → ImageRef`; `delete(ref)`. A **port**, not a repository, because the blob store is not a database and does not join the transaction. |

### The repository takes a transaction handle

`create` takes a `TransactionHandle` as a required parameter, exactly as
`AuditWriter.record` does. There is no overload that opens its own
transaction. A report written outside the transaction that also writes its
audit event would produce an audit record for a report that may not exist —
and the audit trail is append-only with no correction path (ADR-6), so that
error is permanent.

---

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Report** | A Lost or Found item report. The anchor for Claims, Recovery Responses, threads, and audit records. |
| **Lost report** | A report of an item its reporter has lost. Its `date` is the **date lost**. Its interaction is a **Claim**. Its owner column is `foundReportOwner`'s counterpart — `lostReportOwner`. |
| **Found report** | A report of an item its reporter has found. Its `date` is the **date found**. Its interaction is a **Recovery Response**. |
| **FR-8 field set** | The **authoritative, closed** set of fields a Report stores: name, category, description, date, campus area, exact place, identifying details, image. No field beyond it is stored. |
| **Required field** | One of the five: name, category, description, date, campus area. A submission missing any is rejected. |
| **Optional field** | One of the three: exact place, identifying details, image. A submission omitting any is accepted. |
| **Campus area** | A value from the deployment's **fixed** list. The coarse, **non-sensitive** location. Distinct from the exact place. |
| **Exact place** | Free text giving the precise location. A **Sensitive Field**. Optional. Never stored in the campus-area field. |
| **Identifying details** | Free text describing the item so its owner can recognise it. A **Sensitive Field**. Optional. |
| **Image** | The optional picture of the item. A **Sensitive Field**. Optional. A blob reference, never a URL. |
| **Interaction** | The thing that attaches to a report: a **Claim** for a Found report, a **Recovery Response** for a Lost report. A report with no interaction is *interaction-free*, and only an interaction-free `Open` report may be hard-deleted (FR-10). |
| **Interaction-free** | Carrying no Claim (Found) and no Recovery Response (Lost). The precondition for FR-10's hard delete. |
| **Open** | A report's initial status. Not terminal. `Returned` and `Closed` are terminal. |
| **Field validation error** | A rejection naming **the offending field**. A submission failing any rule is rejected with one of these, and no report is created. |
| **Date bound** | The per-type past limit on `date`: **365 days** for Lost, **30 days** for Found, inclusive at the boundary, never in the future. Not relaxable, not configurable. |

---

## Design decisions this model makes, and their reasons

These are the load-bearing choices. Each is recorded here so Stage 2 treats
them as constraints rather than re-deriving them.

### 1 - One Report entity with a `type` discriminator, not two entities

**Reason:** the two types share the field set, the category enum, the
validator, the status machine's shape, and the FR-39 projection. The only
differences are the type label and one date constant. Two entities would
duplicate all of that.

**Consequence:** the type-dependent rules (the date bound, the interaction
kind, the owner column) are read **from** the type rather than encoded in
the type. Every such read is a total function on `ReportType`, so an
exhaustive switch over it is the compiler's check that no branch is
missing — the same discipline `coding-standards.md` requires for
`ReportStatus`.

### 2 - The date bound lives in the validator, keyed on the type

**Reason:** 365 days is "the current product rule and is explicitly not
relaxable" (story 003), and 30 days is "the authoritative requirement for
Found reports and is not expanded or made configurable" (story 002). Neither
is configuration, so neither is a setting.

**Consequence:** the constants are named and carry their origin in a
comment, so that changing one later is a **deliberate, visible** edit rather
than an accidental one. A named constant with a stated origin is what makes
a future change deliberate.

### 3 - One storage column, two domain value objects

**Reason:** the PRD has one date field per report; its *meaning* differs by
type. Storing two columns would let a row carry both a date-lost and a
date-found, which is a state the domain has no meaning for.

**Consequence:** the domain exposes `DateLost` and `DateFound` so no call
site can confuse them, and the persistence maps both to one column.

### 4 - The category enum is a compile-time constant; the campus-area set is injected

**Reason:** the category set is fixed by the PRD and never changes. The
campus-area list is **per-deployment external data** whose configuration
mechanism is OQ-1, still open.

**Consequence:** a category outside the set cannot be constructed at all,
while a campus area outside the set is a runtime rejection against the
injected set. The asymmetry is deliberate and mirrors the requirement.

### 5 - The image is ordered before the report row, and the row is written last

**Reason:** image-handling §5 — "The owning record is not created. Upload is
part of the write, not a follow-up" — and a blob store cannot join a
PostgreSQL transaction.

**Consequence:** the write is compensating, not atomic: upload, then write
the row, and delete the blob if the row write fails. The member-visible
rule (a failed image means no report) holds; the mechanism is honest about
not being cross-system atomic.

### 6 - The audit event is in the transaction; the event is raised after commit

**Reason:** `data-stack.md` and ADR-3 put the audit row in the same
transaction as the state change. But the *domain event* is a separate
concern from the *audit record*: the event is what downstream listeners
consume, and an event for a report that may not exist is worse than a
missing one (ADR-7's reasoning).

**Consequence:** the audit write and the report write are one transaction;
the domain event is raised from the committed state.

### 7 - The validator is the only path to a Report

**Reason:** so that a `Report` that exists has passed the rules, and so that
creation and edit share one implementation of the bounds.

**Consequence:** there is no second constructor to drift, and no "trusted"
path that skips validation.

---

## Story coverage

| Story | How the model covers it |
|-------|--------------------------|
| **001-create-lost-item-report** | The Report aggregate with `type: 'Lost'`; the 365-day bound; the five required and three optional fields; the audit event 1 write; the Active-member precondition; the Sensitive Field treatment of exact place and identifying details; the image-before-row ordering. |
| **002-create-found-item-report** | The same aggregate with `type: 'Found'`; the 30-day bound; `date` meaning *date found*; the location meaning *where found*; the shared field set and category enum. |
| **003-validate-report-field-set** | The `ReportFieldValidator` as a pure function, with the inclusive bounds, the two enums, the required-field check, and a field-level error type naming the offending field. |

**All three stories are covered by the model.** No story needs a field, a
rule, or an entity that is not modelled here.

---

## Open questions for Stage 2

Each carries a stated default, so Stage 2 is never blocked.

1 - **Where does the campus-area list come from?**
OQ-1 is open. **Default:** a `campus_areas` table seeded at deploy time,
read through `CampusAreaReader`. This matches `data-stack.md`'s schema
outline, which lists `CampusArea` as a table, and keeps the domain
independent of the mechanism. **Alternative:** a configuration file read at
startup — simpler, but it makes a mid-deployment change to the list a
restart, and it puts the list outside the database that already holds the
reports referring to it.

2 - **How is the compensating image delete surfaced if the report write
fails?**
**Default:** delete the blob inline and log a failure; if the delete itself
fails, record the orphan for retry. image-handling §5 already prescribes
this for the FR-10 direction, so reusing the mechanism keeps one retry
path in the system rather than two.

3 - **Does the `Report` table carry a `type` CHECK constraint, and does
`status`?**
**Default:** yes to both, as `data-stack.md` requires ("Status is
constrained at the database level (CHECK / enum) — defence in depth for
FR-41's canonical statuses"). A text column with a CHECK, not a database
enum, so adding a status is not a migration — the precedent the `Account`
model set.

4 - **What are the `reports` indexes?**
**Default:** the ones FR-14 needs — status, type, category, campus area,
date, and the reporter — plus a full-text index for keyword search. This is
bolt `009`'s concern in detail, but the indexes are created with the table,
so the migration is this bolt's.

5 - **Does the report row's `updatedAt` exist now, or only when bolt
`008` adds editing?**
**Default:** create it now, non-null. A column that is added later needs a
backfill, and a `createdAt`-only table has to be migrated before the first
edit. `data-stack.md`'s schema outline lists `updatedAt` on the Report
entity, so the model has it.

---

## What this bolt does **not** model

Stated explicitly, because the boundaries are what keep the later bolts
honest:

- **The status machine.** `Open` is the only status this bolt writes. The
  full FR-22 machine (`Claim Requested`, `Claim Approved`, `Verification
  Pending`, `Returned`, `Closed`) belongs to bolt `008` and Units 003/005.
- **Edit, delete, withdraw.** Bolt `008`.
- **Listings, search, and the detail view.** Bolt `009`.
- **The FR-39 projection.** Bolt `006` — already built, and this bolt's
  schema is shaped to satisfy it.
- **Image validation, quota, and delivery.** Bolt `010`. This bolt models
  the **field** and the ordering rule, and nothing about decoding a file.
- **The audit catalog and event numbering.** Unit 006.
