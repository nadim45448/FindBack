---
unit: 006-audit-and-observability
bolt: 002-audit-reads
stage: design
status: complete
updated: 2026-10-26T11:30:58Z
---

# Technical Design - Audit and Observability (read side)

Bolt `002-audit-reads`, story `005-audit-visibility-and-read-logging`.

## Architecture Pattern

**Hexagonal (ports and adapters) inside the layered modular monolith**, inherited
from bolt `001-audit-core` and from `system-architecture.md` § Architecture
style. This bolt adds **no new architectural pattern** — it extends the
existing one. That is deliberate: the read side and the write side of the trail
are one module with one dependency direction, and a second pattern inside one
module would be a boundary the team has to learn twice.

The one structural choice this bolt *does* make is where the read-recording
call sits. It is settled here rather than left to implementation, because it is
the difference between a read that is always accounted for and a read that is
usually accounted for.

### The read is a two-step operation, and the steps are ordered deliberately

```text
1. authorize  ──▶ 2. query the trail  ──▶ 3. record the read
                     (read-only)              (its own transaction)
```

**Authorization is first, and it is not a query filter.** A non-administrator
is refused *before* the repository is called. This is FR-32's mechanism: a
refused read must not be able to distinguish "the trail is empty" from "the
trail exists but you may not see it", and a query whose filter includes
`WHERE actor_id = $viewer` would leak that distinction through the result
count.

**The read record is written after the query, in its own transaction.** Not
before — a read record for a read that then failed would be a record of an
access that did not happen. Not in the same transaction as the query — the
query is a read, and a read has no transaction to join. The read record is a
write, so it gets its own transaction, which is the same discipline every
other write in the system follows.

**A failure to write the read record does not fail the read.** The
administrator asked to see the trail, and they can see it. Losing the
bookkeeping is an observability gap, not a correctness failure for the
request. The failure is logged as an operational error. This is the same
shape as PRD §10's email rule: "Email send failures are logged; the triggering
action is not blocked."

### Why the read record is not part of the trail

PRD §10 requires audit-trail reads to be logged "separate from the audit trail
itself, so the access pattern is reviewable." Writing a read into
`audit_events` would make the trail contain entries about being read, and an
investigator would have to filter them out to see what actually happened. The
separation is the requirement, and it is preserved structurally: two tables,
two repository interfaces, and no code path from the read side to
`audit_events.append`.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────┐
│      Presentation                                           │
│  app/(admin)/items/[id]/audit/page.tsx   ← Unit 007      │
│  app/(admin)/lost/[id]/audit/page.tsx    ← Unit 007      │
│  Route handlers stay thin: resolve actor → call the       │
│  use case → map the result. No business rules in app/.     │
├──────────────────────────────────────────────────────────┤
│      Application                                            │
│  application/audit-trail-reader.ts      (exists)          │
│  application/audit-read-recorder.ts     (exists)          │
│  application/audit-trail-service.ts     (NEW)             │
│  application/ports/audit-event-repository.ts    (exists)  │
│  application/ports/audit-read-log-repository.ts (exists)  │
├──────────────────────────────────────────────────────────┤
│      Domain                                                │
│  domain/audit/trail-filter.ts            (NEW)             │
│  domain/audit/audit-trail-reader.ts      (exists)         │
│  domain/audit/audit-read-recorder.ts     (exists)         │
├──────────────────────────────────────────────────────────┤
│      Infrastructure                                        │
│  infrastructure/audit/prisma-audit-event-repository.ts    │
│    (exists — add the filtered query)                      │
│  infrastructure/audit/prisma-audit-read-log-repository.ts │
│    (exists)                                               │
│  infrastructure/db/prisma.ts             (exists)          │
└──────────────────────────────────────────────────────────┘
```

**The new application service is `AuditTrailService`, and it exists because
one use case now spans three collaborators.** `AuditTrailReader` reads and
checks authorization. `AuditReadRecorder` writes the read record. Neither
knows about the other, and that separation is good — it is what makes each
one testable alone. But something must sequence them, and that something is
the use case. `AuditTrailService` is that use case:

```text
AuditTrailService.listTrail(actor, query)
  1. assertAdministrator(actor)        ← refuses a non-administrator
  2. page = AuditTrailReader.list(...) ← the trail query
  3. AuditReadRecorder.record(...)     ← the read record, in its own tx
  4. return { events, nextCursor }
```

**`AuditTrailService` is where the read-record failure is swallowed and
logged.** Steps 1 and 2 propagate their errors — a refusal is a refusal, and a
failed query is a failure. Step 3's error is caught, logged as an operational
error, and the read still returns. The use case is the only place that knows
the difference.

**Why not put this sequencing in the route handler?** `coding-standards.md`
says "Route handlers stay thin: parse input, call an application use case,
map the result to a response. No business rules in `app/`." Deciding that a
read-record failure does not fail a read is a business rule. It belongs in
the application layer.

**Why not put it in `AuditTrailReader`?** Because the reader is a *read*
component and must stay one. If it also wrote read records, every test of the
reader would need a write path, and the "reading never writes to the trail"
invariant would be enforced by convention rather than by structure. The
separation is what makes the invariant checkable.

## API Design

This bolt is **backend-only**. It delivers the read use cases and the data
layer behind them. The two audit page routes are Unit 007's (bolt
`021-web-admin`) to render — this bolt provides what they call.

| Endpoint | Method | Request | Response |
|---|---|---|---|
| *(internal)* `AuditTrailService.listTrail(actor, query)` | — | `TrailActor` + `TrailQuery` | `TrailResult` — events + next cursor |
| *(internal)* `AuditTrailService.listAll(actor, query)` | — | `TrailActor` + `TrailQuery` | `TrailResult` |
| *(internal)* `AuditTrailReader.listByParent(viewer, parentType, parentId, cursor, limit)` | — | existing | existing |
| *(internal)* `AuditTrailReader.listAll(viewer, cursor, limit)` | — | existing | existing |
| *(internal)* `AuditReadRecorder.record(draft, tx)` | — | existing | existing |
| *(internal)* `AuditReadLogRepository.listByAdministrator(administratorId, limit)` | — | existing | existing |
| `/admin/items/:id/audit` | GET | query params `eventType` (multi), `from`, `to`, `actor`, `cursor` | **Unit 007** — reverse-chronological table, 25 per page, `Load older` |
| `/admin/lost/:id/audit` | GET | same | **Unit 007** — same, Lost-side parent |
| `/admin/accounts` → account disclosure | GET | `accountId` | **Unit 001** — FR-31 events 11/12/13 + FR-52 records for that account |

### The `TrailQuery` contract

```text
TrailQuery
├── parentType?   'report' | 'claim' | 'recovery_response' | 'account'
│                 | 'claim_thread_message' | 'recovery_response_thread_message'
├── parentId?     uuid — required when parentType is present
├── eventTypes?   string[] — multi-select action-type filter (UX §17.3)
├── from?         date — inclusive lower bound on occurredAt
├── to?           date — inclusive upper bound on occurredAt
├── actorId?      uuid — actor filter (UX §17.3)
├── cursor?       TrailCursor — opaque position from the previous page
└── limit         number — clamped to 25
```

**`limit` is clamped, never rejected.** A caller asking for 1000 gets 25. The
page size is a property of the trail view, not a negotiation with the client,
and refusing the request would make the page size a failure mode instead of a
default. `AuditTrailReader` already does this clamping.

**`cursor` is opaque.** It is base64url-encoded JSON carrying
`{occurredAt, id}`. It is not a client-authored filter, and the server does
not trust any part of it beyond extracting those two fields — the values are
bound parameters in the query, never interpolated. A malformed cursor is a
`400`, not a `500`.

**The filters are part of the *read record*, not part of the trail.** The
filters narrow what the administrator sees; the read record captures what they
asked for. UX §17.3 specifies exactly three filters — action type (multi),
date range, and actor — and this design implements exactly those three. No
free-text filter, no combination operator, no sort control. The trail's order
is fixed: reverse-chronological.

### Response shape

```text
TrailResult
├── events[]     AuditEvent[] — the page, newest first
└── nextCursor   TrailCursor | null — null when the trail is exhausted
```

`nextCursor` is null when there is no further page. The caller renders
`Load older` when it is non-null. The 25-row limit plus one extra row is the
mechanism for knowing whether a further page exists, with no second count
query — the pattern `001-audit-core` already uses.

### Route ownership and what this bolt does NOT deliver

The two `/admin/**/audit` **page routes** belong to Unit 007, bolt
`021-web-admin`. This bolt delivers:

- the filtered, cursor-paginated trail query,
- the read recording, in the right order and with the right failure semantics,
- the `listByAdministrator` read for an administrator reviewing who has read
  the trail.

It does **not** deliver the page, the table markup, the `Show details`
disclosure, the `Load older` button, the event icons, or the `aria-expanded`
button behaviour. Those are Unit 007's, per story `010-contextual-audit-views`.

**There is no global `/admin/audit` route, and this bolt does not create
one.** Story `010` requires that no such route exists. Audit is contextual
only. The `listAll` capability exists on the reader for the **administrator's
own whole-trail review** — it is not a route, and it is not reachable from a
dashboard tile or a topbar link.

## Data Persistence

### Tables

No new tables. This bolt **reads** `audit_events` and **writes**
`audit_read_logs` — both created by bolt `001-audit-core`.

| Table | This bolt's operation | Columns used | Notes |
|---|---|---|---|
| `audit_events` | SELECT | `id`, `event_number`, `event_type`, `parent_type`, `parent_id`, `actor_id`, `actor_role`, `acting_administrator_id`, `determined_by_user_id`, `recorded_by_administrator_id`, `reason`, `previous_values`, `changed_fields`, `metadata`, `occurred_at`, `created_at` | Read-only here. The append-only trigger permits no UPDATE or DELETE, so a read path physically cannot mutate it. |
| `audit_read_logs` | INSERT | all columns | Append-only. Its trigger permits no UPDATE or DELETE at all — not even through the FR-10 flag. |

### The filtered trail query

The contextual trail query from `001-audit-core` already reads
`(parent_type, parent_id)` and orders by `(occurred_at DESC, id DESC)`. This
bolt adds the three UX filters. The shape:

```sql
SELECT <columns>
FROM "AuditEvent"
WHERE "parentType" = $parentType
  AND "parentId" = $parentId::uuid
  AND ("eventType" = ANY($eventTypes))     -- when the filter is present
  AND "occurredAt" >= $from                -- when the filter is present
  AND "occurredAt" <= $to                  -- when the filter is present
  AND "actorId" = $actorId::uuid           -- when the filter is present
  AND ( <cursor tuple comparison> )        -- when a cursor is present
ORDER BY "occurredAt" DESC, "id" DESC
LIMIT $limit + 1
```

**Every filter is optional and its clause is omitted when absent.** A filter
that is always present with a sentinel value (`AND "eventType" = ANY(ARRAY[])`)
would return nothing, which is the wrong default.

**Every value is a bound parameter.** No filter value is ever concatenated
into SQL. `data-stack.md` requires parameterized queries, and the security
suite already tests that a hostile filter value is stored as data rather than
executed.

**The cursor comparison is the strict tuple comparison** from `001-audit-core`:
`("occurredAt" < $cursorOccurredAt OR ("occurredAt" = $cursorOccurredAt AND
"id" < $cursorId::uuid))`. The `id` tiebreaker is what stops two events
sharing a timestamp from causing a skipped or repeated row.

### Indexes

**The contextual trail query needs no new index.** `idx_audit_events_trail` on
`(parent_type, parent_id, occurred_at DESC, id DESC)` already serves the
parent filter and the ordering, and `001-audit-core`'s Stage 5 test proved
the plan is an index-only scan with no sort at the PRD's scale.

**But the three filters change the shape of the question.** The index's
leading columns are constrained by the query; the filters are not. When an
administrator filters by actor, the query becomes "this report's events, by
this actor" — which `idx_audit_events_actor_occurred` on
`(actor_id, occurred_at DESC)` serves, but only if the planner chooses it.

**Decision: no new index in this bolt.** The reason is the scale. The PRD's
NFR is measured at **10,000 reports × 50 events = 500,000 rows**, and a
single report's trail is 50 rows. Filtering 50 rows is not a performance
problem — it is a sort of 50 rows. The index that matters is the one that
finds the 50 rows, and that index exists.

**This is a decision to be measured, not assumed.** Stage 5 must run the
filtered query at the PRD scale and assert the plan and the p95, exactly as
`001-audit-core`'s Stage 5 did for the unfiltered query. If the filtered
query's plan degrades, Stage 5 raises the index question rather than
assuming it away.

**The whole-trail read (`listAll`) is a different question.** It filters on
nothing, so it cannot use `idx_audit_events_trail` — that index's leading
column is `parent_type`, which is unconstrained in a whole-trail read. The
index that serves it is `idx_audit_events_occurred` on `(occurred_at DESC)`,
which `001-audit-core` already created. **Open item 2 below** asks Stage 5 to
confirm it.

### `audit_read_logs` writes

One insert per read, with the same `TransactionHandle` discipline as every
other write in the system — a write that is not inside a transaction is
refused (`AuditWriteOutsideTransactionError`). The read record's own
transaction is short: one insert, committed immediately.

**The read record carries no trail content.** It names the administrator, the
query, the filters, the result count, and the time. It does not carry event
types, actor names, or reasons. A read log is a record of *access*, and
copying trail content into it would duplicate sensitive data into a table
whose purpose is to answer "who looked, when, and at what".

## Security Design

| Concern | Approach |
|---|---|
| **Authorization** | The administrator check runs in the application layer **before** the query, in `AuditTrailService` and again in `AuditTrailReader`. FR-32 is enforced server-side. A member crafting a direct URL to `/admin/items/:id/audit` is refused with no partial content and no indication of whether the trail exists. |
| **Anonymous access** | Refused identically to a non-administrator member. An anonymous viewer has no session, so no `ActorContext` resolves, and the use case refuses. |
| **Participation is not authorization** | FR-32 is explicit: a reporter, claimant, responder, or Lost-report owner does not gain trail access by participating in a report. The check is on the administrator flag alone — never on relationship. |
| **Input validation** | Every filter is validated at the route boundary against a schema before the use case is called. A malformed uuid, an unparseable date, or an unknown `parentType` is a `400`. |
| **SQL injection** | All values are bound parameters. The filter values are arrays and scalars passed to Prisma's tagged template; none is concatenated. |
| **Cursor tampering** | The cursor is decoded, its two fields extracted, and both bound as parameters. A cursor naming an id that does not exist simply returns an empty page. Nothing is interpolated, so a tampered cursor cannot escape the query. |
| **Filter values as data** | `eventType`, `from`, `to`, and `actorId` are stored in the read record as **data** — a hostile filter value is recorded verbatim, never executed. |
| **Sensitive values** | The read path returns the trail's own fields. FR-32 makes the trail administrator-only, so a catalog-named Sensitive Field on the trail is visible here — to an administrator, which is the PRD's intent. The **read record** carries no trail data, so no Sensitive Field reaches `audit_read_logs`. The operational log carries no Sensitive Field at all. |
| **Data at rest** | No encryption beyond the database's own disk encryption is added. The trail contains sensitive fields by the PRD's own design, and the trail's protection is access control, not encryption. Adding application-level encryption would put key management in scope for a system whose threat model is "members must not see each other's data". |
| **Rate limiting** | Not applied to trail reads in this bolt. A read is a cheap, bounded, indexed query. PRD §10's rate-limit list is registration, login, Claim submission, Recovery Response submission, and thread posting — a read is not on it. |

## NFR Implementation

| Requirement | Design Approach |
|---|---|
| **Audit trail queries ≤ 1 s p95 at 10,000 reports × 50 events** (FR-32 NFR, PRD §10) | `idx_audit_events_trail` on `(parent_type, parent_id, occurred_at DESC, id DESC)` — every column constrained by the query, so the plan is an index-only scan with no sort. Proven at p95 0.9 ms in `001-audit-core` Stage 5. The **filtered** query is measured separately in this bolt's Stage 5, against the same 500,000-row seed. |
| **25 per page, no infinite scroll** (UX-OQ-C) | `limit` is clamped to 25 in the application layer. The query fetches `limit + 1` rows so the existence of a further page is known without a second count query. |
| **Cursor pagination, not OFFSET** | `OFFSET` degrades linearly with depth — page 100 of a 500,000-row trail would scan and discard 2,475 rows. The cursor is a tuple comparison on `(occurred_at, id)`, which is an index range scan from the cursor position. |
| **Reverse-chronological order** | `ORDER BY "occurredAt" DESC, "id" DESC`. The `id` tiebreaker makes the order total, so pagination cannot skip or repeat a row when two events share a timestamp. |
| **The read record survives longer than a runtime log** | Written to `audit_read_logs`, not only to stdout. Vercel Hobby retains runtime logs for **1 hour**; PRD §10 requires the access pattern to be *reviewable*, which a 1-hour log cannot satisfy. |
| **A read record is written on every read** | The read record is written by the use case, not by the route handler, so it cannot be forgotten by a caller that skips a step. Includes a read of an empty trail, and includes every `Load older` page request. |
| **A read-record failure does not fail the read** | The use case catches the write failure, logs it as an operational error, and returns the trail. Same shape as PRD §10's email rule. |
| **Reads are never deduplicated** | One record per read. Two reads of the same trail produce two records — the story says so explicitly. |
| **Scalability** | Read-only traffic on an indexed table. The pool is pooled per ADR-3. No new write load on the audit path: one insert per read, in its own short transaction. |

## Error Handling

| Error Type | Code | Response |
|---|---|---|
| Non-administrator requests the trail | `403` | "You don't have access to this. If you think you should, contact your administrator." — `EXPERIENCE.md` §4.9, permission-denied copy |
| Anonymous requests the trail | `403` | Same copy. No indication whether the entity exists. |
| Malformed filter, uuid, or date | `400` | Problem details with a field-level message. No stack trace. |
| Malformed cursor | `400` | "The page link is not valid. Start again from the first page." |
| Trail is empty | `200` | An empty list — **not** an error. The read is still recorded. Unit 007 renders the empty state. |
| Trail query fails | `500` | "Something went wrong on our side. Try again, or come back in a moment." — `EXPERIENCE.md` §4.9, server-error copy. The failure is logged with its request id. |
| Read-record write fails | `200` | The trail is returned. The failure is logged as an operational error with the request id. **The administrator sees the trail; the observability gap is visible in the logs.** |

**Every error response is RFC 9457 problem details**, per
`system-architecture.md` § API design, with user-facing copy from
`EXPERIENCE.md` §4.9.

**A refused read is logged to the operational log only** — never to
`audit_read_logs`. The read log records administrator reads of the trail;
a member's failed attempt is not that, and writing it to the table would make
the read log a place where non-administrator activity accumulates. The refusal
goes to stdout with `outcome: "denied"`, which is what PRD §10's operational
logging is for.

## External Dependencies

| Service | Purpose | Integration |
|---|---|---|
| **PostgreSQL** | The trail rows read; the read record written | Prisma, via the driver adapter. Raw SQL for the trail query, per `data-stack.md`. |
| **Vercel runtime logs** | Diagnostics for a refused read and a failed read-record write | stdout JSON, one line per event. Diagnostic only — never the compliance artifact. |
| **No email** | — | The audit module sends no email. FR-30 forbids notification channels beyond the specified ones, and no audit event is an email event. |
| **No Blob** | — | The audit trail carries no images. |
| **No new dependency** | — | This bolt adds no package. The trail query, the read record, and the cursor encoding are all built from what is already installed. |

## Decisions settled in this design

| # | Decision | Rationale |
|---|---|---|
| 1 | The read record is written **after** the query, in **its own transaction**, by a **new `AuditTrailService`** use case | A read record must describe a read that happened; a failed query must not leave a record of an access that did not occur. A separate use case is the only place that can sequence authorize → query → record, and it is where the failure rule lives. |
| 2 | A **failed read-record write does not fail the read** | The administrator asked to see the trail and can see it. Losing the bookkeeping is an observability gap, not a correctness failure for the request. Mirrors PRD §10's email rule. |
| 3 | **A refused read is not recorded** in `audit_read_logs` — only in the operational log | The read log records administrator reads. A member's failed attempt would make the table a place where non-administrator activity accumulates. |
| 4 | The **filters are exactly UX §17.3's three** — action type (multi), date range, actor. No free-text filter, no sort control. | The trail's order is fixed by FR-32's reverse-chronological requirement, and the filter set is frozen UX. Adding a filter would widen scope against a frozen design. |
| 5 | **`limit` is clamped to 25, never rejected** | The page size is a property of the view, not a negotiation. Rejecting an over-large limit would turn a default into a failure mode. |
| 6 | **The cursor is base64url JSON**, carrying `{occurredAt, id}`, with both values bound as parameters | Opaque to the client, tamper-proof in practice because nothing is interpolated, and it survives a round trip through a `Load older` link. |
| 7 | **No new index in this bolt** | The contextual trail's index exists and is proven. A single report's trail is 50 rows; filtering 50 rows is not a performance problem. Stage 5 **measures** the filtered plan at the PRD scale rather than assuming. |
| 8 | The read record carries **no trail content** | A read log is a record of *access*. Copying trail content into it would duplicate sensitive data into a table whose only purpose is to answer "who looked, when, and at what". |
| 9 | The **whole-trail read** (`listAll`) uses `idx_audit_events_occurred` | `idx_audit_events_trail` leads with `parent_type`, which is unconstrained in a whole-trail read. The `occurred_at` index already exists. To be confirmed by measurement — Open item 2. |
| 10 | The trail read is **not rate-limited** | It is a cheap, bounded, indexed query, and PRD §10's rate-limit list does not include reads. |

## Open items carried to Stage 3 (ADR) and Stage 4 (Implement)

1. **The read record's failure handling.** Decision 2 says a failed write does
   not fail the read. The open question is whether a failure is **only logged**
   or **queued for retry**. `image-handling.md` §5 uses a "retry queue" for
   blob-delete orphans, so there may be a shared pattern worth extracting. This
   is a genuine design question with two defensible answers — **it is the
   candidate for the Stage 3 ADR**, and it is raised rather than decided here.
2. **The whole-trail read's plan.** Decision 9 names `idx_audit_events_occurred`
   as the index to use. Stage 5 must measure it at the PRD scale and assert
   the plan, because a whole-trail read over 500,000 rows is a different
   question from a 50-row contextual read.
3. **The filtered trail query's plan.** Decision 7 commits to no new index.
   Stage 5 must measure the filtered query at the PRD scale and assert both the
   plan and the p95. If the plan degrades beyond the 1 s budget, Stage 5
   raises the index question rather than assuming it away.
4. **The account-audit disclosure** (`EXPERIENCE.md` §17.7) reads
   `audit_events` filtered to `parent_type = 'account'` and the account's id.
   It is Unit 001's surface, but the **query** is this bolt's. The same
   `idx_audit_events_trail` serves it, because it filters on
   `(parent_type, parent_id)` exactly as the contextual trail does.
5. **Whether the read record's `filters` column should be typed.** It is
   `jsonb` today. A typed column set would make the filter shape queryable,
   but it would also mean a migration whenever UX adds a filter. `jsonb` is
   the flexible choice and matches `audit_events.metadata`. Kept as `jsonb`.
6. **The `listByAdministrator` page size.** Stage 1 flagged it as unsettled. The
   repository takes a `limit`; the **caller** has not chosen a default.
   Decision: the default is 25, matching the trail page size, for consistency;
   and because there is no UX surface for the read log (UX §17.6 explicitly
   does not surface it), the number is an operational convenience rather than
   a product decision. Stage 4 implements it with 25 as the default.

## Story coverage

| Story criterion | Discharged by |
|---|---|
| A non-administrator is refused and no trail content is returned | `AuditTrailService` step 1 + `AuditTrailReader.assertAdministrator`, before the repository call; `403` with §4.9 copy |
| The trail is returned in reverse-chronological order | `ORDER BY "occurredAt" DESC, "id" DESC` in the trail query; `AuditTrailReader` already orders |
| A record captures administrator, query, filters, result count, timestamp | `AuditTrailService` step 3 → `AuditReadRecorder.record` → `audit_read_logs` insert |
| The read record is a distinct record type, not an event on the audited entity | Two tables, two repository interfaces; no code path from the read side to `audit_events.append` |
| The read is stored in the database, not only in runtime logs | `audit_read_logs` table, append-only, with its own no-deletion trigger |
| The query completes within 1 s p95 at 10,000 reports × 50 events | `idx_audit_events_trail` proven at p95 0.9 ms in `001-audit-core`; the **filtered** query is measured in this bolt's Stage 5 — Open item 3 |
| A trail listing shows 25 entries per page with no infinite scroll | `limit` clamped to 25; `limit + 1` fetch detects a further page; no scroll listener, no unbounded query |

## Completion criteria

- [x] Architectural pattern selected and documented
- [x] Layer structure defined
- [x] API contracts designed
- [x] Data persistence planned (no new tables; the filtered query and its indexes specified)
- [x] Security approach documented
- [x] NFR approach planned
- [x] Integration points documented
- [x] Story criteria mapped to the design
- [x] Open items carried forward, with the ADR candidate named
