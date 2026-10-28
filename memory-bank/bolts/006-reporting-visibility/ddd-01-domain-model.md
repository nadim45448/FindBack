---
stage: model
bolt: 006-reporting-visibility
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
created: 2026-10-28T18:10:00Z
updated: 2026-10-28T18:10:00Z
---

# Static Model: Reporting and Listings — the FR-39 Visibility Projection

> **Scope of this artifact.** Bolt `006-reporting-visibility` covers **one**
> story: `010-visibility-matrix-by-actor`. It models the **projection** — the
> decision of who may see which fields of which report — and the contracts
> that carry that decision to every read path. It does **not** model the
> `Report` aggregate itself (that is bolt `007-reporting-core`), the Claim
> lifecycle (Unit 003), the Recovery Response lifecycle (Unit 004), or the
> audit trail (Unit 006).
>
> The `Report`, `Claim`, and `RecoveryResponse` entities appear below **as
> they are consumed by the projection** — the fields the projection reads and
> the relations it resolves — not as aggregates with their own invariants.

## The one sentence this bolt exists to encode

> A viewer sees a report through **exactly one** of seven relationship
> columns, and the union of what those columns grant is the **only** thing
> they see.

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Report` (consumed) | A Lost or Found report, as the projection reads it | id, type (`Lost`/`Found`), name, category, description, date, campusArea, exactPlace, identifyingDetails, imageRef, status, reporterId, createdAt, updatedAt |
| `ReportRelationship` (consumed) | The facts that place a viewer in a matrix column | reportId, reportType, reporterId, viewerId, isReporter, hasClaim, hasRecoveryResponse, claimId, recoveryResponseId |
| `VisibilityProjection` | The result: what a specific viewer may see of a specific report | reportId, viewerId, columns, reportFields, claims, recoveryResponses, threads, auditTrail |
| `ProjectionColumn` | One of the seven FR-39 relationship columns | `anonymous` / `unrelatedMember` / `foundReportOwner` / `claimant` / `recoveryResponder` / `lostReportOwner` / `administrator` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `resolveColumns` | Decide which FR-39 columns a viewer holds on a report | viewer, report, relationships | the set of granted columns |
| `projectReport` | Build the viewer-scoped report projection | viewer, report, relationships | the report field set the viewer may see |
| `projectClaims` | Build the viewer-scoped Claim projections | viewer, report, claims | the Claim set the viewer may see |
| `projectRecoveryResponses` | Build the viewer-scoped Recovery Response projections | viewer, report, responses | the Response set the viewer may see |
| `projectThreads` | Build the viewer-scoped thread sets | viewer, claims, responses | per-Claim and per-Response thread sets |
| `projectAuditTrail` | Build the viewer-scoped audit trail | viewer, report, events | the trail, or nothing |

---

## Entities

### `Report` — consumed, not owned

The projection **never** decides a report's contents. It receives one and
projects it. Only the fields below are read by the projection; the FR-8
authoritative field set and its validation belong to bolt `007-reporting-core`.

```text
Report (as the projection reads it)
├── id                    — identity
├── type                  — 'Lost' | 'Found'   ← decides the owner column
├── name                  — FR-38 public summary field
├── category              — FR-38 public summary field
├── description           — FR-39: visible to every authenticated viewer
├── date                  — FR-38 public summary field
├── campusArea            — FR-38 public summary field (enum value, not exact place)
├── exactPlace            — FR-37 SENSITIVE
├── identifyingDetails    — FR-37 SENSITIVE
├── imageRef              — FR-37 SENSITIVE (until authorized)
├── status                — FR-38 public summary field
├── reporterId            — resolves the owner column
├── reporterDisplayName   — FR-39: visible to every authenticated viewer
├── reporterEmail         — FR-37 SENSITIVE
├── reporterPhone         — FR-37 SENSITIVE (optional; FindBack does not require it)
└── lastActionAt          — FR-39 member-facing status history
```

**Business rules the projection observes:**

1 - The `type` field **decides which owner column applies**. A `Found` report
has a Found-report owner and may have Claims; a `Lost` report has a Lost-report
owner and may have Recovery Responses. No member is ever simultaneously the
Found-report owner and the Lost-report owner of the same report (FR-39 notes).

2 - The **reporter is the owner**. `reporterId` is the single fact that places
a viewer in an owner column; there is no separate "owner" concept.

3 - `exactPlace`, `identifyingDetails`, `reporterEmail`, `reporterPhone`, and
`imageRef` are FR-37 Sensitive Fields. The projection marks them as such, and
the **query that loads a report must not select them** for a viewer who may not
see them.

### `ReportRelationship` — the facts that place a viewer in a column

The projection is a **pure function of viewer and report**. It needs the facts
that connect the two, and nothing else. This is the value object the
infrastructure layer resolves, and it is deliberately *not* the report itself.

```text
ReportRelationship
├── reportId
├── reportType            — 'Lost' | 'Found'
├── reporterId
├── viewerId              — null for an anonymous viewer
├── isReporter            — viewerId === reporterId
├── hasClaim              — viewer submitted a Claim on this report
├── hasRecoveryResponse   — viewer submitted a Recovery Response on this report
├── claimId               — the viewer's own Claim id, if any
└── recoveryResponseId    — the viewer's own Recovery Response id, if any
```

**Business rules:**

1 - `isReporter` is the **only** route to an owner column. It is computed by
equality, never by a client-supplied flag.

2 - `hasClaim` and `hasRecoveryResponse` are **relationship facts, not
permissions**. They place the viewer in the Claimant or Recovery-responder
column and in **no other**. Submitting a Claim never grants the viewer any
report-level Sensitive Field (FR-39 notes; story 010 criterion 20).

3 - `hasClaim` is only ever true on a **Found** report, and `hasRecoveryResponse`
only ever true on a **Lost** report. The two are mutually exclusive by report
type, so the projection's column resolution never has to choose between them.

### `VisibilityProjection` — the result

```text
VisibilityProjection
├── reportId
├── viewerId              — null for anonymous
├── columns               — the granted FR-39 columns (see below)
├── reportFields          — the report fields the viewer may see
├── claims                — the Claim projections the viewer may see
├── recoveryResponses     — the Recovery Response projections the viewer may see
├── threads               — per-Claim and per-Response thread sets
└── auditTrail            — the trail, or an explicit absence
```

**Business rules:**

1 - The projection is the **only** representation that leaves the application
layer. A read path that assembles its own report shape is a defect, not a
variant.

2 - A field that is absent from `reportFields` was **never loaded**. The
projection's shape is what the query is built from, so "absent" and "not
selected" are the same fact (FR-39 criterion 1; story 010 criterion 1).

3 - `auditTrail` is either the full trail or an explicit absence. There is no
"partial trail" and no "audit-light history" shape on the `auditTrail`
property — audit-light history is a **Claim** field (see `ClaimProjection`),
and it is not the trail.

---

## Value Objects

### `ProjectionColumn` — the seven FR-39 columns

The FR-39 matrix's columns, verbatim. This is the spine of the bolt.

```text
anonymous            — unauthenticated visitor
unrelatedMember      — authenticated member with no role on this report
foundReportOwner     — authenticated member who authored the Found report
claimant             — authenticated member who submitted a Claim (own Claim)
recoveryResponder    — authenticated member who submitted a Recovery Response (own response)
lostReportOwner      — authenticated member who authored the Lost report
administrator        — administrator role
```

**Constraints:**

1 - The seven names are **the PRD's**, never renamed (coding-standards §
Naming conventions: status literals and role literals are named after the
PRD, verbatim).

2 - A viewer may hold **several** columns at once. The projection takes the
**union of what those columns grant**, and the union is bounded by the matrix
— a union is never wider than the matrix grants (story 010 edge case).

3 - The column set is **closed**. The matrix has seven columns and there is no
eighth. An exhaustive switch over `ProjectionColumn` is the compiler's check
that no column was forgotten.

### `ReportFieldSet` — what the viewer may see of the report

A **closed set of field names**, not a projection of values. The names are
the contract the query builder and the response serialiser both read, so a
field cannot be selected but not serialised, or serialised but not selected.

```text
ReportFieldSet — the visible field names
├── summary      — name, category, date, campusArea, status, type  (FR-38)
├── description  — full description text
├── image        — the image reference
├── reporterName — the reporter's display name
├── statusHistory— current status + last-action timestamp
├── exactPlace   — SENSITIVE
├── identifyingDetails — SENSITIVE
├── reporterEmail — SENSITIVE
└── reporterPhone — SENSITIVE
```

**Constraints:**

1 - `summary` is present in **every** projection, including the anonymous one.
It is the FR-38 set and the base of every other column.

2 - The five Sensitive members are present **only** in the owner columns and
the administrator column. This is the FR-37 set, and its presence in a
`ReportFieldSet` is the authorisation decision — the value is never consulted
to decide whether to include it.

3 - `image` is present when the viewer is authorised, and the **reference** is
not the bytes. Byte delivery and its own authorisation are bolt
`010-reporting-images`' scope; this bolt decides whether the reference is in
scope at all.

### `ClaimProjection` — a Claim as the viewer may see it

```text
ClaimProjection
├── claimId
├── status
├── submittedAt
├── reason               — SENSITIVE (claimant + administrator only)
├── identifyingDetails   — SENSITIVE (claimant + administrator only)
├── dateLost
├── auditLightHistory    — the claimant's own "audit-light history"
├── isOwn                — whether this is the viewer's own Claim
└── thread               — the per-Claim thread, scoped
```

**Constraints:**

1 - `reason` and `identifyingDetails` are present **only** on the viewer's
**own** Claim or on the administrator's view of any Claim. The Found-report
owner sees that a Claim exists, the Found-report's status, and the per-Claim
thread — **never** the claimant's reason or identifying details (FR-39 notes;
story 010 criteria 10 and 11).

2 - `auditLightHistory` is the Claimant's own status history. It is **not**
the audit trail, and it never grants trail access (FR-32).

3 - A claimant viewing another claimant's Claim sees none of it. The Claim
list is scoped to the viewer's own Claim (plus, for an administrator,
all Claims).

### `RecoveryResponseProjection` — a Recovery Response as the viewer may see it

```text
RecoveryResponseProjection
├── responseId
├── status
├── submittedAt
├── whereFoundExactPlace — SENSITIVE (own response + owner + administrator)
├── observedIdentifyingDetails — SENSITIVE (own response + owner + administrator)
├── dateFound
├── candidateImageRef    — SENSITIVE (own response + owner + administrator)
├── isOwn                — whether this is the viewer's own response
└── thread               — the per-Response thread, scoped
```

**Constraints:**

1 - A responder sees **only their own** response. Other responders' responses,
fields, and threads are absent (FR-39 notes; story 010 criteria 13 and 14).

2 - The **Lost-report owner** sees every response and every per-Response thread
on their own Lost report, and **only** on their own Lost report. They are the
only non-administrator with cross-response visibility, and they need it to
evaluate and select among candidates (FR-39 notes).

3 - `candidateImageRef` is absent for an unrelated member and for a competing
responder (FR-39 consequences; the acceptance matrix's last row).

### `ThreadProjection` — a thread as the viewer may see it

```text
ThreadProjection
├── threadParentType — 'claim' | 'recovery_response'
├── threadParentId
├── messages         — the visible messages
└── participants     — the visible participant identities
```

**Constraints:**

1 - **One thread per Recovery Response, never per Lost report** (data-stack §
Schema outline). A thread is addressed by its parent, and the parent is what
determines visibility.

2 - A thread's visibility is exactly its parent's visibility. There is no
independent rule for threads — the thread set is derived from the Claim or
Response sets the viewer already has.

3 - **Thread participation grants no private evidence.** A Found-report owner
who participates in a per-Claim thread still sees neither the claimant's reason
nor the claimant's identifying details (FR-39 notes; story 010 criterion 21).

### `Viewer` — the actor, as the projection sees it

```text
Viewer
├── kind          — 'anonymous' | 'member'
├── accountId     — null for anonymous
├── isAdministrator
└── displayName   — the viewer's own display name (for authorship display)
```

**Constraints:**

1 - A `Viewer` is built **from the `ActorContext`**, never from request data.
The projection never re-reads an account and never re-derives a status.

2 - **A non-member actor is `kind: 'anonymous'`.** This is the decision bolt
004's Open item 1 forces on us. A `Pending`, `Rejected`, or `Deactivated`
account resolves to `capability: 'none'`, and the projection treats it exactly
as an unauthenticated visitor: the FR-38 summary set, no detail page. This is
not a weakening of the matrix — FR-2 says a `Pending` member may not
participate at all, so there is nothing for them to have a column in.

3 - `isAdministrator` is honoured **only** on an `Active` account. The
`ActorContext` already folds that rule in (`createActorContext` sets the flag
to `false` on a non-Active account), so the projection reads it as given and
does not re-check the status.

---

## Aggregates

### `VisibilityProjection` — the aggregate root of this bolt

**Members:**

- the granted `ProjectionColumn` set
- the `ReportFieldSet`
- the `ClaimProjection` set
- the `RecoveryResponseProjection` set
- the `ThreadProjection` sets
- the audit-trail presence

**Invariants:**

1 - **The column set is the single source of authority.** Every field,
Claim, Response, thread, and trail inclusion in the projection is derivable
from the column set alone. If a field cannot be derived from a column, it is
not in the projection.

2 - **The grant is monotone under column union, and bounded by the matrix.**
Adding a column can only add what that column grants; it can never add
anything the matrix denies to that column.

3 - **No member is both owner columns.** The Found-report owner column and the
Lost-report owner column are mutually exclusive for any one report, because
the report's `type` decides which owner column exists (story 010 criterion 23).

4 - **Administrator absorbs every other column.** An administrator holds the
full set, so the projection for an administrator is the union of every
column's grants — but the implementation may still resolve it as the single
administrator column, which grants everything.

5 - **The projection is immutable once built.** It is a read model; nothing
mutates it after construction, and a read path cannot amend it.

**Aggregate boundary:**

The projection owns **visibility decisions** and nothing else. It does not own
the report, the Claims, the Responses, the threads, or the trail — it owns the
**decision about which of those the viewer may see**. Those aggregates are
owned by their own modules and are reached through ports.

This boundary is what makes the bolt testable in isolation: the projection can
be built and asserted against fixtures, with no database, before a single
report exists.

---

## Domain Events

**This bolt fires no domain events.**

The projection is a **read**. It changes no state, writes no audit row, and
sends no email. (The audit trail is read here, never written; audit *writes*
for the report lifecycle belong to bolts `007` and `008` and to Unit 006.)

The one event-adjacent rule that belongs here:

1 - **A projection read is not an audited event.** FR-31's numbered catalog
(1–30) contains no "report viewed" event, and this bolt does not invent one
(ADR-9: a module cannot invent an event number). A read is logged
operationally, per PRD §10, and — for an audit-trail read specifically — by
Unit 006's `AuditReadLog`, never as a trail event.

2 - **Reading the trail is itself logged to the database**, because Vercel
Hobby retains runtime logs for only one hour (ADR-7). When an administrator
views a report *with* its trail, that trail read is recorded by Unit 006's
recorder. This bolt's projection requests the trail; the recording belongs to
the audit module.

---

## Domain Services

### `VisibilityResolver` — resolves the column set

**Operations:**

- `resolveColumns(viewer, relationship) → ProjectionColumn[]`

**Dependencies:** none. Pure.

**Rules:**

1 - An `anonymous` viewer holds `['anonymous']`.

2 - An `administrator` viewer holds `['administrator']` and nothing else. The
administrator column grants everything the other columns grant, so resolving
it alone is sufficient and avoids a combinatorial union.

3 - A member viewer holds `['unrelatedMember']` by default, then:
   - `foundReportOwner` if `relationship.isReporter` **and** the report is
     `Found`;
   - `lostReportOwner` if `relationship.isReporter` **and** the report is
     `Lost`;
   - `claimant` if `relationship.hasClaim`;
   - `recoveryResponder` if `relationship.hasRecoveryResponse`.

4 - A member with **no** relationship holds `['unrelatedMember']` alone.

5 - The owner column and the participation column **can both be held**, in
   principle. The matrix does not forbid a Found-report owner from also being
   a claimant — but the PRD's FR-15 forbids a member from claiming on their own
   report, so in practice a Found-report owner is never a claimant on that
   report. The resolver does not encode the FR-15 prohibition; it encodes the
   matrix. If both were somehow held, the union applies — which is exactly the
   matrix's rule, and never wider than the matrix grants.

### `ReportProjector` — builds the report field set

**Operations:**

- `projectReportFields(columns, report) → ReportFieldSet`

**Dependencies:** none. Pure.

**Rules:**

1 - `summary` is always present.

2 - `description`, `image`, and `reporterName` are present whenever the
columns include any authenticated column (every column except `anonymous`).

3 - `statusHistory` is present whenever the columns include any authenticated
column.

4 - `exactPlace`, `identifyingDetails`, `reporterEmail`, `reporterPhone` are
present **only** when the columns include `foundReportOwner`, `lostReportOwner`,
or `administrator`.

5 - The **unrelated member** column grants `description`, `image`,
`reporterName`, and `statusHistory` — and **no** Sensitive Field, **no** Claim
content, **no** Recovery Response content, and **no** thread content (FR-39
notes).

### `ClaimProjector` — builds the Claim projections

**Operations:**

- `projectClaims(columns, claims, relationship) → ClaimProjection[]`

**Dependencies:** none. Pure.

**Rules:**

1 - For the `claimant` column: only the viewer's own Claim, with `reason` and
`identifyingDetails` present.

2 - For the `foundReportOwner` column: every Claim on the report **as an
existence**, with `status`, `submittedAt`, and the per-Claim thread — and
**without** `reason`, `identifyingDetails`, or `auditLightHistory`.

3 - For the `administrator` column: every Claim in full.

4 - For `unrelatedMember`, `anonymous`, `recoveryResponder`, and
`lostReportOwner`: **no Claims at all**.

5 - A Claim list never contains another claimant's Claim for a claimant.

### `RecoveryResponseProjector` — builds the Recovery Response projections

**Operations:**

- `projectRecoveryResponses(columns, responses, relationship) → RecoveryResponseProjection[]`

**Dependencies:** none. Pure.

**Rules:**

1 - For the `recoveryResponder` column: only the viewer's own response, in
full (where-found exact place, observed identifying details, date found,
candidate image, current status, and its own thread).

2 - For the `lostReportOwner` column: **every** response on their own Lost
report, in full, each with its own thread. This is the one non-administrator
cross-response grant in the matrix.

3 - For the `administrator` column: every response in full.

4 - For `unrelatedMember`, `anonymous`, `foundReportOwner`, and `claimant`:
**no responses at all**.

### `ThreadProjector` — builds the thread sets

**Operations:**

- `projectThreads(columns, claims, responses) → ThreadProjection[]`

**Dependencies:** none. Pure.

**Rules:**

1 - A thread's inclusion is exactly its parent's inclusion. No thread is ever
granted on its own.

2 - A per-Claim thread is included for the `claimant` (own Claim),
`foundReportOwner` (Claims on their own Found report), and `administrator`
columns.

3 - A per-Response thread is included for the `recoveryResponder` (own
response), `lostReportOwner` (responses on their own Lost report), and
`administrator` columns.

4 - **Participation does not grant evidence.** The thread's *messages* are
granted; the claimant's reason and identifying details are not.

### `AuditTrailProjector` — builds the audit trail

**Operations:**

- `projectAuditTrail(columns, events) → AuditEvent[] | null`

**Dependencies:** none. Pure.

**Rules:**

1 - The trail is present **only** for the `administrator` column.

2 - No other column — not the reporter, not the claimant, not the responder,
not the Lost-report owner — ever receives any part of the trail (FR-32; story
010 criterion 18).

3 - The absence is **explicit** (a `null` or an empty marker), not an empty
array that a caller might mistake for "an empty trail".

---

## Repository Interfaces

These are **ports** — contracts the infrastructure layer implements. They live
in `src/application/ports/` per `coding-standards` § File and folder
organization. The domain declares what it needs; it never knows Prisma.

### `ReportVisibilityReader` — loads a report for a viewer

```text
ReportVisibilityReader
├── loadReportForViewer(reportId, columns) → Report | NotFound
└── loadRelationship(reportId, viewerId) → ReportRelationship | null
```

**The critical contract:** `loadReportForViewer` takes the **column set**, not
the viewer. The query is built from the field set, so a Sensitive column is
**not selected** for a viewer who may not see it. The projection is therefore
not a filter over a fully-loaded report — it is the *input* to the query.

This is the mechanism behind FR-39 criterion 1 ("the Sensitive Field is never
loaded at all") and behind `system-architecture.md` § Authorization: "the
sensitive set is never loaded for an actor who may not see it — not filtered
after the fact, not hidden by CSS."

**Why the columns and not the viewer:** a reader that took the viewer would
have to load the report to decide what to load, which is the defect. Passing
the resolved columns makes the authorisation decision **upstream of the
query**, and the query's `SELECT` list is derived from the field set.

### `ClaimVisibilityReader` — loads Claims for a viewer

```text
ClaimVisibilityReader
├── loadClaimsForViewer(reportId, columns) → Claim[]
└── loadClaimById(claimId) → Claim | NotFound
```

Same contract: the columns decide the `SELECT` list, so `reason` and
`identifyingDetails` are not selected for a Found-report owner.

### `RecoveryResponseVisibilityReader` — loads Recovery Responses for a viewer

```text
RecoveryResponseVisibilityReader
├── loadResponsesForViewer(reportId, columns) → RecoveryResponse[]
└── loadResponseById(responseId) → RecoveryResponse[]
```

Same contract. A responder's query selects only their own response's columns.

### `ThreadVisibilityReader` — loads thread messages for a viewer

```text
ThreadVisibilityReader
└── loadThreadsForViewer(parents, columns) → ThreadMessage[]
```

The `parents` argument is the already-scoped set of Claims and Responses the
viewer may see. The reader **cannot** widen it: it loads threads only for
parents it is handed.

### `AuditTrailVisibilityReader` — loads the trail for a viewer

```text
AuditTrailVisibilityReader
└── loadTrailForViewer(reportId, columns) → AuditEvent[] | null
```

Returns `null` when the columns do not include `administrator`. The refusal is
**not** an empty array — ADR-8's rule: a filter that returns an empty result
makes "forbidden" indistinguishable from "empty" and leaks existence through
the result count.

### The two reads this bolt does **not** own

1 - **Image bytes.** The reference is projected; the bytes are delivered by
bolt `010-reporting-images`, which applies ADR-2's rule — private storage,
authorisation immediately before the blob read, never an `s-maxage` cache
header on a private response.

2 - **The audit trail's own storage.** Unit 006 owns the trail, the catalog,
and the read log. This bolt's reader is a **port against that module's
capability**, not a second implementation of the trail.

---

## Ubiquitous Language

- **Actor** — the identity a request carries, resolved server-side into an
`ActorContext`. Never client-asserted.
- **Viewer** — the actor as *this* projection sees it: anonymous or member.
A `Pending`, `Rejected`, or `Deactivated` account is a **viewer of kind
`anonymous`**, because it holds no member capability.
- **Projection** — the viewer-scoped representation of a report and its
related records. Not a filter; a decision.
- **Column** — one of the seven FR-39 relationship columns.
- **Granted column** — a column the viewer holds on this specific report.
- **Sensitive Field** — an FR-37 field: hidden from viewers the matrix does
not authorise. Enforced at the API layer.
- **Public summary field** — an FR-38 field: the anonymous set, and the base
of every other column.
- **Owner column** — the Found-report owner column or the Lost-report owner
column, chosen by the report's type.
- **Participation column** — the Claimant column or the Recovery-responder
column. Establishes a relationship; grants no report-level Sensitive Field.
- **Cross-response visibility** — the Lost-report owner's unique ability to
see every Recovery Response on their own Lost report. Administrators have it
too; no other non-administrator does.
- **Audit-light history** — a Claimant's own status history. Not the trail,
and never trail access.
- **The trail** — the full audit trail, administrator-only (FR-32).
- **Report type** — `Lost` or `Found`. The value that decides the owner column
and which participation column can apply.
- **Never loaded** — the guarantee that a field absent from a projection was
not selected by the query, rather than selected and dropped.
- **Union** — the combination of what a viewer's granted columns allow. Bounded
by the matrix: never wider than the matrix grants.

---

## Traceability

### Story `010-visibility-matrix-by-actor` → model elements

| Criterion | Model element |
|---|---|
| 1 — Sensitive Field never loaded | `ReportFieldSet`, `ReportVisibilityReader` (columns → SELECT list) |
| 2 — anonymous gets FR-38 only, no detail page | `Viewer.kind = 'anonymous'`, `ReportProjector` rule 1, `ProjectionColumn.anonymous` |
| 3 — unrelated member gets summary + description, image, reporter name | `ReportProjector` rules 2, 5 |
| 4 — Found-report owner gets exact place, identifying details, reporter contact | `ProjectionColumn.foundReportOwner`, `ReportProjector` rule 4 |
| 5 — Lost-report owner gets owner fields **and** every response and thread | `ProjectionColumn.lostReportOwner`, `RecoveryResponseProjector` rule 2, `ThreadProjector` rule 3 |
| 6 — Lost-report owner column governs all owner visibility | `VisibilityResolver` rule 3 |
| 7 — claimant gets own Claim in full | `ClaimProjector` rule 1 |
| 8 — claimant gets no report Sensitive Fields | `ReportProjector` rule 4 (claimant is not an owner column) |
| 9 — Found-report owner sees Claim existence, status, thread; not reason/details | `ClaimProjector` rule 2 |
| 10 — claimant sees no other claimants' details or threads | `ClaimProjector` rules 1, 5 |
| 11 — responder gets own response only | `RecoveryResponseProjector` rule 1 |
| 12 — responder sees no other responses or threads | `RecoveryResponseProjector` rules 1, 4 |
| 13 — administrator gets everything | `VisibilityResolver` rule 2, every projector's administrator rule |
| 14 — administrator sees per-Response threads on reports they don't own | `ThreadProjector` rule 3 |
| 15 — member-facing status and last-action timestamp returned | `ReportFieldSet.statusHistory`, `Report.lastActionAt` |
| 16 — participation does not confer trail access | `AuditTrailProjector` rules 1, 2 |
| 17 — submitting a Claim unlocks nothing beyond the Claimant column | `VisibilityResolver` rule 3, `ReportProjector` rule 4 |
| 18 — submitting a Recovery Response unlocks nothing beyond its column | `VisibilityResolver` rule 3, `RecoveryResponseProjector` rule 1 |
| 19 — thread participation grants no private evidence | `ThreadProjector` rule 4 |
| 20 — owner column chosen by report type | `VisibilityResolver` rule 3, `ReportRelationship.reportType` |
| 21 — no member is both owner columns | `VisibilityResolver` rule 3 (mutually exclusive by type) |
| 22 — authorisation enforced at the API layer | `ReportVisibilityReader` and siblings (columns → query), `system-architecture.md` § Authorization |

### Requirements → model elements

| FR | Model elements |
|---|---|
| FR-37 | `ReportFieldSet` (the five Sensitive members), `ClaimProjection`, `RecoveryResponseProjection` |
| FR-38 | `ReportFieldSet.summary`, `Viewer.kind = 'anonymous'` |
| FR-39 | All seven `ProjectionColumn`s, `VisibilityResolver`, and the four projectors |
| FR-32 | `AuditTrailProjector` (trail is administrator-only) |
| FR-2 | `Viewer` constraint 2 — a non-member actor is anonymous |
| FR-49 | The projection is the **field-level** half of FR-49; the **partition** half (`mine` / `browse` / `claims` / `recovery_responses`) belongs to bolt `009-reporting-search` and consumes this projection |

### Out of scope of this model

- The `Report` aggregate and the FR-8 field set — bolt `007-reporting-core`.
- Report creation, edit, delete, withdraw, administrator edit — bolts `007`
  and `008`.
- Search, filtering, pagination, and the four FR-49 partitions — bolt
  `009-reporting-search`.
- Image upload and byte delivery — bolt `010-reporting-images`.
- The Claim and Recovery Response lifecycles — Units 003 and 004.
- The audit trail's storage, catalog, and read log — Unit 006.
- Rendering any surface — Unit 007.

---

## Open Questions for the Owner

These are raised at this checkpoint and are answered in Stage 2. They do not
block the model's shape; each has a stated default.

1 - **Should an anonymous viewer be refused a detail request outright, or
served the FR-38 summary fields with no detail-specific fields?**

*Default:* **refused** (a `NotFoundError`, or a redirect to login with a
return-after-login affordance). FR-38 says "there is NO anonymous report-detail
page" and FR-12 says the anonymous flow is `public listing → Login →
authenticated detail page`. Serving a summary to an anonymous detail request
would create a second anonymous surface the PRD does not name. The Stage 2
design must confirm whether this is a `403`, a `404`, or a redirect — and the
answer is a UX surface question, so it belongs to Unit 007.

2 - **Does the projection decide *existence*, or only *fields*?**

*Default:* **fields only.** A viewer who may not see a report at all (because
it is `Closed` and not theirs, or because it was hard-deleted) is a
**listing** concern — FR-49's partitions and bolt `009`'s filters decide what
a viewer can enumerate. The projection governs what a viewer sees **of a
report they have reached**. Mixing the two would make the projection's
contract ambiguous and would put FR-49's partition logic inside the field
projection.

3 - **Should the `administrator` column be resolved as a single column, or as
the union of every column it subsumes?**

*Default:* **a single column.** The administrator column grants everything, so
the union is redundant, and resolving it alone keeps the column set small and
the projectors' administrator rules simple. The matrix's own construction
agrees — every administrator cell is `Y`.

4 - **Should the `ReportRelationship` be resolved by the report reader, or by a
separate relationship query?**

*Default:* **a separate, indexed relationship query.** The relationship is
two existence facts plus two ids, over indexed foreign keys; resolving it
separately keeps the report query's `SELECT` list under the projection's
control and lets the relationship query be the only place that touches
`claims` and `recovery_responses`. Stage 2 must confirm the shape and the
indexes, and must confirm the ≤ 500 ms p95 search NFR is not affected.

---

## Stage 1 Completion Criteria

- [x] All domain entities identified and documented — `Report` (consumed),
      `ReportRelationship`, `VisibilityProjection`, `ProjectionColumn`,
      `Viewer`
- [x] Business rules captured for each entity — every entity carries an
      explicit rules list, and every FR-39 cell maps to one
- [x] Aggregate boundaries defined — `VisibilityProjection` owns visibility
      decisions and nothing else; the boundary is stated with the reason
- [x] Domain events specified — **none**, and the reason is stated (a read
      fires no event; the catalog admits no invented number, ADR-9)
- [x] Repository interfaces defined — five reader ports, each with the
      columns-in / SELECT-list-out contract that makes "never loaded" true
- [x] All stories covered by domain model — all 22 of story `010`'s criteria
      traced in the traceability table
- [x] Ubiquitous language documented — 16 terms, each defined against the
      PRD's usage
- [x] Four open questions raised with stated defaults, for Stage 2
