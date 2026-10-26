---
unit: 006-audit-and-observability
bolt: 001-audit-core
stage: design
status: complete
created: 2026-10-26T09:13:30Z
updated: 2026-10-26T09:13:30Z
intent: 001-findback-lost-and-found
stories:
  - 001-append-only-audit-writes
  - 003-non-numbered-audit-records
  - 004-append-only-enforcement
  - 006-operational-logging-and-quota
---

# Technical Design - Audit and Observability

> **Stage 2 output.** Documentation only — no source code was read, written, or
> modified to produce this artifact, per the DDD bolt type's Stage 2 constraint.
> Transforms `ddd-01-domain-model.md` into a technical design. Product behaviour
> remains as the frozen PRD defines it.

## Architecture Pattern

**Hexagonal (ports and adapters) with an append-only write-through port, inside
the layered modular monolith already fixed by `system-architecture.md`.**

| Element | Choice | Rationale |
|---|---|---|
| Module | `src/domain/audit/` + `src/application/audit/` + `src/infrastructure/audit/` | Matches the module map in `system-architecture.md`; `audit` owns FR-31, FR-32, FR-48. |
| Port shape | `AuditEventRepository.append(event, tx)` — insert-only, no `update`/`delete`/`upsert` in the interface | The append-only guarantee is structural: a method that does not exist cannot be misused. A permission check could later be widened; a missing method cannot. |
| Transaction model | The audit write **requires a caller-supplied transaction handle** and refuses to run without one | FR-31's "an audit entry for a transition that did not happen is a defect" (ADR-3, decision 3). The transaction is a required constructor argument, not an optional parameter. |
| Cross-context writes | Other contexts call `AuditWriter.record(...)` **inside their own transaction**; the audit module never opens one | The trail completes the caller's transaction. It must not be able to commit independently. |
| Read model | Separate, read-only projection for the trail view, built by a SQL query (not by an ORM entity graph) | `data-stack.md` § "Where raw SQL is required" already mandates raw SQL for audit queries (reverse-chronological pagination, 25/page). |
| Logging | Structured JSON to stdout via a dedicated logger; audit **reads** additionally written to the database | PRD §10: runtime logs live 1 hour on Hobby, so anything reviewable must be in PostgreSQL. |

**Why not event sourcing.** The trail is *append-only*, which is not the same as
*the source of truth*. The PRD's state lives in Reports, Claims, and Recovery
Responses; the trail records what happened to them. Event sourcing would invert
that, require rebuilding every read model from the trail, and add a projection
subsystem the $0 budget and the 2 s p95 NFR do not need. The requirement is
"the trail cannot be rewritten", which the insert-only port satisfies directly.

**Why not CQRS for writes.** Only the *read* side is separated. Writes go
through the caller's transaction on the same primary database, because FR-17 and
FR-45 require the state change and its audit row to commit or roll back
together. Two stores would break exactly the guarantee the PRD demands.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────┐
│      Presentation                                          │
│  src/app/(admin)/items/[id]/audit/page.tsx               │
│  src/app/(admin)/lost/[id]/audit/page.tsx                │
│  src/app/(admin)/accounts/  (contextual FR-52 disclosure)│
├──────────────────────────────────────────────────────────┤
│      Application                                           │
│  application/audit/                                       │
│    audit-writer.ts          (use case: append to caller's tx)│
│    audit-read-recorder.ts   (use case: log a trail read)  │
│    audit-trail-reader.ts    (use case: paginated trail)   │
│    quota-monitor.ts         (use case: observe / refuse)  │
│    ports/audit-event-repository.ts   (insert-only)        │
│    ports/audit-read-log-repository.ts(insert-only)        │
│    ports/quota-snapshot-repository.ts(insert-only)        │
│    ports/quota-limit-provider.ts      (read-only config)  │
│    ports/operational-logger.ts        (stdout)            │
├──────────────────────────────────────────────────────────┤
│      Domain                                                │
│  domain/audit/                                            │
│    event-catalog.ts       (30 frozen numbers + field sets)│
│    audit-event.ts         (entity + construction rules)   │
│    append-only-guard.ts   (invariants)                    │
│    retention-policy.ts    (FR-10 / FR-31 retention)       │
│    payload-sanitizer.ts   (FR-37 guard, catalog-aware)    │
│    quota-thresholds.ts    (limits, 70/90/100)              │
│    request-context.ts     (operational log value object)  │
│    errors.ts              (audit-specific domain errors)  │
├──────────────────────────────────────────────────────────┤
│      Infrastructure                                       │
│  infrastructure/audit/                                    │
│    prisma-audit-event-repository.ts                      │
│    prisma-audit-read-log-repository.ts                   │
│    prisma-quota-snapshot-repository.ts                   │
│    vercel-blob-quota-provider.ts   (Blob bytes / ops)     │
│    stdout-operational-logger.ts                          │
│    quota-usage-reader.ts          (DB size, invocations)  │
└──────────────────────────────────────────────────────────┘
```

Dependency direction, per `coding-standards.md`: `domain → nothing`,
`application → domain + ports`, `infrastructure → domain + application ports`,
`app/ui → application`. The domain module has no Prisma import and no
`process.stdout` access — it is testable with no database, network, or Node
runtime.

## API Design

This bolt is **backend-only**. It exposes no new member-facing or administrator
route beyond the audit views the UX spine already specifies. Audit *writes* are
internal — invoked by other modules' use cases, never by a client directly.

| Endpoint | Method | Request | Response |
|---|---|---|---|
| *(internal)* `AuditWriter.record(event, tx)` | — | `AuditEventDraft` + `TransactionHandle` (required) | `AuditEvent` |
| *(internal)* `AuditWriter.recordNonNumbered(record, tx)` | — | `NonNumberedAuditDraft` + `TransactionHandle` (required) | `AuditEvent` |
| *(internal)* `AuditWriter.recordBatch(events, tx)` | — | `AuditEventDraft[]` + `TransactionHandle` (required) | `AuditEvent[]` — for FR-45's multi-event transaction (events 26 + 30) |
| `/admin/items/:id/audit` | GET | Server-rendered page; query params `eventType` (multi), `from`, `to`, `actor` | Reverse-chronological list, 25 per page, cursor pagination. Each row: timestamp, actor + role tag, action verb, target, expandable additional fields. |
| `/admin/lost/:id/audit` | GET | Same | Same (Lost-side parent) |
| `/admin/accounts` → account disclosure | GET | `accountId` | FR-31 events 11/12/13 + FR-52 `Member profile edited` records for that account. |
| *(internal)* `AuditTrailReader.listByParent(parentRef, cursor, limit)` | — | `ParentRef`, cursor, limit ≤ 25 | `AuditEvent[]` + next cursor |
| *(internal)* `AuditReadRecorder.record(read, tx)` | — | `AuditReadLogDraft` + `TransactionHandle` | `AuditReadLog` |
| *(internal)* `QuotaMonitor.check(resource, attemptedBytes)` | — | resource, amount | `allowed` \| `refused` |
| *(internal)* `QuotaMonitor.observe(resource)` | — | resource | `QuotaReading` |

**Route ownership.** The two `/admin/**/audit` page routes are the *read* surface.
Bolt `002-audit-reads` owns them; this bolt provides the repositories and the
read-recording use case they call. The table above records the contract so the
two bolts do not diverge — the actual page implementation is **not** in this
bolt's scope.

**The audit view is administrator-only, enforced in the application layer.**
Per FR-32 and `system-architecture.md` § Authorization model, the check happens
before the query runs, not in the template. An anonymous or non-administrator
request is refused with a 404/403 and never reaches the repository.

**Audit reads are recorded on every read** (PRD §10, UX §17.6). A read is
logged when the trail is queried — including a paginated "next page" request.

## Data Persistence

| Table | Columns | Relationships |
|---|---|---|
| `audit_events` | `id` (uuid PK), `event_number` (int, **nullable**), `event_type` (text, not null), `parent_type` (text, not null), `parent_id` (uuid, not null), `actor_id` (uuid, not null), `actor_role` (text, not null — member \| administrator \| system), `acting_administrator_id` (uuid, null), `determined_by_user_id` (uuid, null), `recorded_by_administrator_id` (uuid, null), `reason` (text, null), `previous_values` (jsonb, null), `changed_fields` (jsonb, null), `metadata` (jsonb, null), `occurred_at` (timestamptz, not null), `created_at` (timestamptz, not null, default now) | `parent_id` → the parent entity (report / claim / recovery_response / account). **No FK to `actor_id`** — a deleted account must not cascade the trail away; actors are named, and deactivated actors stay named. |
| `audit_read_logs` | `id` (uuid PK), `administrator_id` (uuid, not null), `query` (text, null), `filters` (jsonb, null), `result_count` (int, not null), `request_id` (text, null), `read_at` (timestamptz, not null), `created_at` (timestamptz, not null, default now) | `administrator_id` → account. Separate table from `audit_events` — a read is not an event on the audited entity (PRD §10). |
| `quota_snapshots` | `id` (uuid PK), `resource` (text, not null), `used_amount` (bigint, not null), `limit_amount` (bigint, not null), `observed_at` (timestamptz, not null) | None. Standalone observation record. |

### Column decisions that carry weight

**`event_number` is nullable and CHECK-constrained to 1–30.** A non-numbered
record (FR-52, FR-53) stores `NULL`. A numbered record stores its frozen
catalog number. The CHECK constraint is `event_number IS NULL OR
event_number BETWEEN 1 AND 30` — the database itself refuses an out-of-catalog
number, so an application bug cannot invent event 31. This is the mechanical
form of story `003-non-numbered-audit-records`'s acceptance criterion
"no new event numbers were introduced".

**`event_type` is a text discriminator, not a database enum.** The catalog has
30 numbered types plus 2 non-numbered types; an enum would require a migration
to add a type, which reads as a change to a frozen catalog. A CHECK constraint
or application-level enum is used instead, and the mapping to `event_number` is
asserted in the domain layer.

**`previous_values` and `changed_fields` are `jsonb`.** They are a field-name
to prior-value map. Storing them as `jsonb` keeps the schema stable and lets
the FR-53 record remain defensible without a per-field column set. Values are
stored **verbatim** and are never rendered as HTML.

**`reason` is a nullable text column, not a jsonb field.** Reasons are
audit-significant strings that stay verbatim (for example "another claim was
approved for this item") even when the user-facing copy is softer (OQ-5). A
dedicated column makes them filterable and greppable in an investigation.

**`metadata` is `jsonb` and holds only event-specific fields not covered by a
typed column** — for example event 1's category, date, location, image
presence; event 5's `triggered_by` / `triggering_action`; event 26's list of
child response IDs.

**No `updated_at` column.** The table is append-only; a column that could
change is a column that invites a code path that changes it.

**No `deleted_at` / soft-delete column.** A soft delete is still a deletion
path. The only removal is a physical `DELETE` inside the FR-10 transaction.

### Indexes

| Index | Columns | Serves |
|---|---|---|
| `idx_audit_events_parent_occurred` | `(parent_id, occurred_at DESC, id DESC)` | The trail view: reverse-chronological, 25/page, cursor-paginated. Covers the 1 s p95 NFR at 10,000 reports × 50 events. |
| `idx_audit_events_event_number_occurred` | `(event_number, occurred_at DESC)` | "Show me every event 5 ever recorded" — the FR-17 auto-rejection investigation. |
| `idx_audit_events_actor_occurred` | `(actor_id, occurred_at DESC)` | The actor filter (UX §17.3) and the "who did this" question in an investigation. |
| `idx_audit_events_parent_type` | `(parent_type, parent_id)` | Resolving a parent whose id is known but whose type is not yet resolved. |
| `idx_audit_read_logs_admin_read_at` | `(administrator_id, read_at DESC)` | Reviewing who has been reading the trail. |
| `idx_quota_snapshots_resource_observed` | `(resource, observed_at DESC)` | Latest reading per resource. |

**The `id` tiebreaker in the primary index is not decoration.** `occurred_at`
alone is not unique — two events can share a timestamp. Without a deterministic
tiebreaker, cursor pagination can skip or repeat a row. The cursor is
`(occurred_at, id)`.

### Append-only enforcement

Story `004-append-only-enforcement` requires that no code path can update or
delete a record, and that this hold even against a direct database write
bypassing the application. Three layers:

1. **Interface layer** — `AuditEventRepository` exposes `append` and read
   methods only. There is no `update`, `delete`, or `upsert` to call.
2. **Application layer** — `AuditWriter` is the only writer, and it only ever
   inserts. The `AuditReadLog` and `QuotaSnapshot` repositories are the same
   shape.
3. **Database layer** — a `BEFORE UPDATE OR DELETE` trigger on `audit_events`
   that raises an exception. This is the layer that survives an application bug
   or a direct `psql` session, and it is what the story's edge case "Direct
   database update bypassing the application | Prevented by database-level
   constraints" requires.

**The trigger must permit exactly one deletion path.** FR-10 hard-deletes an
interaction-free `Open` report and removes its trail with it — the PRD's single
exception. A blanket trigger would make that impossible. The design uses a
session-local flag: the FR-10 transaction sets a transaction-scoped
`SET LOCAL findback.allow_audit_delete = 'on'` before deleting, and the trigger
permits the delete only when that flag is set. The flag is `SET LOCAL`, so it
is scoped to the transaction and cannot leak into another request's session.

```sql
CREATE OR REPLACE FUNCTION findback_forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('findback.allow_audit_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (FR-31, story 004)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation();
```

**Why a trigger and not merely "no code path".** The story's own edge case
requires protection against a direct database write. A trigger is the only
mechanism that covers the application, a migration script, a seed script, and a
human with `psql` access. The application-layer guarantee is the everyday
path; the trigger is the backstop. The trigger is created in the Prisma
migration, so it ships with the schema and cannot be forgotten.

**`audit_read_logs` and `quota_snapshots` are also append-only** and get the
same trigger. A read log that can be edited is not an access log.

### Transaction design

```
Caller use case (e.g. approveClaim)
  └─ prisma.$transaction(async (tx) => {
        await tx.claim.update(...)                        // state change
        await auditWriter.record(draft, tx)               // same tx
        // commit — both, or neither
     })
  └─ after commit: send email                             // never inside the tx
```

**Rules enforced in code:**

- `AuditWriter.record` **throws** if the transaction handle is missing. It does
  not open its own transaction and it does not have an optional-tx overload.
  This is the "an audit write cannot commit outside its caller's transaction"
  success criterion, enforced at the type level: the parameter is not optional.
- Email is sent **after** commit, never inside the transaction (ADR-3,
  decision 4; PRD §10: email failure must not block the action). A failed
  email is logged, and the state change and its audit row remain committed.
- `recordBatch` writes several events in one caller's transaction — required by
  FR-45's Confirm Returned, which produces events 21/22 (Returned confirmed),
  26 (batch child resolution), and 30 (matched response → Completed) in a
  single transaction.
- A rolled-back state change leaves no audit record, because the audit insert
  is inside the same transaction and is rolled back with it.

**Locking.** Audit rows are never locked for update. The parent report row is
locked (`SELECT ... FOR UPDATE`) by the *caller* before deciding — that is the
caller's concern (FR-17, FR-45), not this module's. The audit module adds no
locking of its own, so it cannot deadlock with a caller's lock ordering.

## Security Design

| Concern | Approach |
|---|---|
| Authentication | Not this bolt's concern. The audit read routes use the same session resolution as the rest of the administrator surface. Sessions are revocable server-side rows (ADR-3, `system-architecture.md`). |
| Authorization | **Administrator-only, enforced in the application layer before the query runs** (FR-32). A non-administrator never reaches the repository. The repository itself has no role logic — authorization is not re-implemented at the data layer. |
| Trail integrity | Append-only by construction: insert-only port, single writer, database trigger. No update or delete path exists at any layer. |
| Sensitive values in the trail | **Allowed only where the frozen catalog names them** — FR-31 event 2 (claim reason, identifying details), FR-48 event 15 (where-found, observed identifying details), FR-31 event 14 / FR-48 event 16 (thread message text), plus the audit-significant reasons on events 4, 5, 10, 12, 24, 25. The trail is administrator-only (FR-32), and UX §17.2 confirms these render as expandable "Show details" rows for administrators. Enforced by `payload-sanitizer.ts`, which **denies by default and permits only catalog-named fields**. |
| Sensitive values in operational logs | **Never.** No password, hash, token, session id, claim reason, identifying detail, exact place, or thread body. The logger takes a typed `RequestContext` — a closed shape that has no field capable of carrying one. The type, not a runtime check, is the control. |
| Passwords and tokens | Never written to the trail or a log, in any event. Not named by any catalog event. |
| Audit-read logging | Every trail read is recorded in `audit_read_logs` with administrator, query, filters, result count, and timestamp — **in the database**, not only on stdout, because Vercel Hobby retains runtime logs for 1 hour (PRD §10, `tech-stack.md` B3). |
| Actor anonymization | Never. A deactivated account's past events still name it. Back-filling to hide an actor would defeat the record (story `004`, acceptance criterion 5). |
| Injection | Parameterized queries only. `query` and `filters` in the read log are stored as data, never interpolated into SQL. |
| Escape on render | `reason`, `previous_values`, and `metadata` are rendered as **text**, never as HTML. User-supplied markup stored in a previous value is displayed escaped. |

### Resolution of the Stage 1 conflict

Stage 1 raised a conflict between the frozen PRD's FR-31 event 2 (which names
claim reason and identifying details as event fields) and an Inception-authored
rule in `unit-brief.md` rule 6, story `001-append-only-audit-writes` acceptance
criterion 4, and `coding-standards.md` § Logging (which forbid those values from
any audit record).

**This design resolves it in favour of the PRD, on new evidence found during
Stage 2.** `EXPERIENCE.md` §17.2 — the frozen UX spine, which the Inception
work also treats as authoritative — specifies that each audit row's additional
fields are "Per PRD FR-31: claim reason, identifying details (**sensitive but
admin-visible**), substitute receiver fields, etc." The audit trail view is
therefore *designed* to display these values to administrators. A rule that
forbids them in the record would make the frozen UX unimplementable.

That settles the direction. The remaining work is to correct the three
Inception-authored artifacts so they stop contradicting the PRD, and to scope
the prohibition precisely to the **operational log**, where it is correct.

**Scope of the prohibition after this decision:**

| Field | Audit trail | Operational log |
|---|---|---|
| Claim reason, identifying details (event 2) | Recorded — catalog-named | Never |
| Where-found, observed identifying details (event 15) | Recorded — catalog-named | Never |
| Thread message text (events 14, 16) | Recorded — catalog-named | Never |
| Closure / rejection / cancellation reason (events 4, 5, 10, 12, 24, 25) | Recorded — catalog-named | Never |
| Password, hash, token, session id | Never | Never |
| Report-level exact place free text | Never — named by no catalog event | Never |
| Candidate image bytes | Never — only "image presence" (boolean) | Never |

**Action required, and it is not this stage's job to perform it:** three
artifacts must be corrected so the repository stops carrying a contradiction —
`memory-bank/intents/001-findback-lost-and-found/units/006-audit-and-observability/unit-brief.md`
(rule 6), `memory-bank/intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/001-append-only-audit-writes.md`
(acceptance criterion 4), and `memory-bank/standards/coding-standards.md`
(§ Logging). This is a documentation-only change to workflow-authored
artifacts; it does not touch the frozen PRD, the frozen UX spines, or any
product behaviour. It is listed in the Notes section below and remains open
until the owner confirms.

## NFR Implementation

| Requirement | Design Approach |
|---|---|
| **Audit trail queries ≤ 1 s p95 at 10,000 reports × 50 events** (FR-32 NFR, PRD §10) | Composite index `(parent_id, occurred_at DESC, id DESC)` makes the trail view an index range scan, not a sort. 25 rows per page caps the work per request. Cursor pagination on `(occurred_at, id)` avoids `OFFSET`, which degrades linearly with depth. The read path is raw SQL per `data-stack.md`. |
| **Audit write is transactional with the state change** | The transaction handle is a required parameter of `AuditWriter.record`; a missing handle is a type error, not a runtime branch. |
| **Append-only, no update or delete path** | Insert-only repository interface + single writer + database trigger. |
| **No update or delete code path exists** (story `004` non-functional criterion) | Enforced at three layers, and verifiable by inspection: the interface has no such method, the writer has no such method, the trigger raises on any attempt. |
| **Structured logs carry requestId, actorId, action, targetId** (PRD §10) | `RequestContext` is a closed type with exactly those fields plus `actorRole`, `targetType`, `outcome`, `ts`. Its shape mirrors the `coding-standards.md` § Logging example. |
| **No sensitive value in any log or audit record** (as now scoped) | The logger's input type has no field that can carry a sensitive value. The trail's sanitizer denies by default and permits only catalog-named fields. |
| **Audit-trail reads are logged separately, to the database** (PRD §10) | `audit_read_logs` table, written on every read including pagination. Not stdout-only, because Hobby retains runtime logs for 1 hour. |
| **Quotas warn at 70% and 90%; Blob storage refuses at 100%** | `QuotaMonitor` compares observed usage against `QuotaThreshold` (warn 0.7, critical 0.9, refuse 1.0). Only Blob **storage** refuses; every other resource warns. A threshold crossing is logged **once per crossing**, not on every request — tracked by comparing against the last snapshot for that resource. |
| **No purchase or plan upgrade from any quota condition** | `QuotaMonitor` has no upgrade path in its interface. The only automated action available is `refused` for Blob storage. Surfacing the condition is the entire response (ADR-4). |
| **No paid logging, analytics, or APM dependency** | The logger writes to stdout with no SDK. No vendor package is added. The only new dependency is none — Prisma and the existing stack cover it. |
| **Account and registration events retained indefinitely** (PRD §10) | `audit_events` has no retention job. There is no pruning path, by design (story `004`: "Given a retention or cleanup job, when it attempts to prune audit records, then no such pruning path exists"). |
| **Report trail follows report retention; hard delete removes it** | `AuditRetentionPolicy` returns the retention action from the parent type and status. The FR-10 path sets `SET LOCAL findback.allow_audit_delete = 'on'` and deletes the trail rows inside the same transaction as the report delete. |
| **Email never blocked by audit or storage failure** | Email is sent after commit. An audit write failure fails the whole transaction — an unaudited change is never committed — but a *logging* failure never blocks the action. |

## Error Handling

| Error Type | Code | Response |
|---|---|---|
| `AuditWriteOutsideTransactionError` | 500 | The transaction is impossible to commit without. Logged as a defect with the requestId; the caller's transaction rolls back. Never surfaces raw text to a member. |
| `AuditPayloadRejectedError` | 500 | A write was attempted with a field the catalog does not name for that event, or with a barred value (password, hash, token). The write is refused — the transaction rolls back. Logged as a defect; never silently coerced. |
| `AuditCatalogViolationError` | 500 | An `event_number` outside 1–30, or a numbered type with a null number, or a number that does not match its type. Refused before the insert. |
| `QuotaExceededError` | 429-style business rejection | Blob storage at its limit: the upload is refused with a clear message and administrator-visible detail. No purchase, no upgrade, no auto-delete of an existing image (`image-handling.md` §4). |
| `QuotaObservationError` | 500 | A quota reading could not be obtained. Surfaced, never guessed — the limit is not assumed to be satisfied. |
| `AuditNotFoundError` / `AuditForbiddenError` | 404 / 403 | A non-administrator, or an administrator accessing a parent they may not see. The repository is never reached. |

Error semantics follow `coding-standards.md` § Error handling: domain errors are
typed and expected; anything else is a defect and is logged as one. Expected
errors never produce a stack trace in a response and never surface raw text to
a member.

## External Dependencies

| Service | Purpose | Integration |
|---|---|---|
| **PostgreSQL** (Neon free tier, pooled) | The durable audit trail, read log, and quota snapshots | Prisma. Append-only inserts inside the caller's transaction; raw SQL for the trail query. |
| **Vercel Blob (private store)** | Current storage bytes and operation counts for quota monitoring | `@vercel/blob` client — `list()` for size, operation counters for Simple/Advanced ops. Read-only for monitoring. |
| **Vercel platform metrics** | Function invocation count, fast-origin transfer, data transfer | Vercel REST API, polled by the daily cron job (Hobby allows 100 jobs/day, ±59 min drift — `tech-stack.md` B4). Poll results are written as `quota_snapshots`. |
| **Vercel Dashboard / DB metrics** | Database storage size | Read via the provider's metrics endpoint; recorded as a snapshot. |
| **Vercel runtime logs** | Diagnostic stdout only | Not a compliance artifact — 1-hour retention. Audit reads are therefore written to the database, not only to stdout. |
| **No email provider in this bolt** | — | Email is not sent by the audit module. |

**Quota observation frequency.** Blob bytes are checked **on every upload**
before writing (`image-handling.md` §4) — that is the enforcement point, not a
polled approximation. The other resources are observed by the daily cron, which
is why only Blob storage can refuse: only it is checked at the moment of use.

**The cron job must be idempotent and tolerate ±59 minutes of drift**, and it
must never trigger a purchase or an upgrade (ADR-4, `tech-stack.md` B4).

## Notes and Open Items

### Open item 1 — the three artifacts to correct (owner confirmation)

Correcting the Stage 1 conflict means editing three workflow-authored files so
they stop contradicting the frozen PRD and the frozen UX spine:

| File | What changes |
|---|---|
| `.../units/006-audit-and-observability/unit-brief.md` | Rule 6 currently forbids claim reasons, identifying details, exact places, and thread bodies in "an audit record or a log". Split it: the trail may carry catalog-named fields; the log never may. |
| `.../units/006-audit-and-observability/stories/001-append-only-audit-writes.md` | Acceptance criterion 4 ("contains no claim reason, no identifying details, no exact place, no thread body…") must become "contains no password, hash, or token, and no FR-37 value that the event's catalog entry does not name". |
| `memory-bank/standards/coding-standards.md` | § Logging currently says "Never log … Claim reasons, identifying details, thread message bodies, or any FR-37 sensitive value" — that sentence is correct for the log and should stay, but a note must be added that the **trail** is a separate record where the catalog names such fields. |

**This design does not perform those edits.** It is the owner's call, and the
edits touch a privacy rule. They are proposed here, precisely stated, and
awaiting confirmation.

### Open item 2 — the FR-10 deletion flag needs an ADR

The `SET LOCAL findback.allow_audit_delete = 'on'` flag is the mechanism that
lets the FR-10 hard delete remove a trail while every other delete is refused.
It is a genuine trade-off between two frozen requirements (FR-31's
append-only rule and FR-10's hard-delete rule), and it introduces a capability
that could in principle be misused.

**Recommended: record it as an ADR in Stage 3.** Suggested shape — "Allow
audit deletion only inside an FR-10 hard-delete transaction, via a
transaction-scoped session flag, enforced by a database trigger." Stage 3 is
the optional ADR Analysis stage and this is exactly the kind of decision it
exists for. It is presented to the owner at Stage 3 rather than written now.

### Open item 3 — concurrency strategy for two administrators deciding the same Claim

Listed in `system-architecture.md` § "Open items for the first DDD bolt" as an
item for this bolt. The audit module's part of the answer is settled: audit rows
are appended inside the caller's transaction and are never locked for update, so
the audit trail adds no lock ordering and cannot deadlock with a caller's
parent-row lock. The caller's own concurrency strategy (parent-row
`SELECT … FOR UPDATE`) belongs to the claims bolt, not this one. **No further
audit-side action is required.**

### Open item 4 — audit query shape (settled here)

Also listed in `system-architecture.md` § "Open items for the first DDD bolt" as
an item for this bolt. **Settled in this design:** the composite index
`(parent_id, occurred_at DESC, id DESC)`, cursor pagination on `(occurred_at, id)`,
25 rows per page, and a raw SQL query. The 1 s p95 target at 10,000 reports ×
50 events is met by index range scan plus a capped page size. This item is
closed.

### Open item 5 — the existing `AuditEvent` / `AuditReadLog` schema

The Step 0 scaffold already created `prisma/schema.prisma` with `AuditEvent`
and `AuditReadLog` models, and the migration `20261025052150_init_audit_skeleton`
was applied. **Stage 4 (Implement) must reconcile that schema with this
design** — the scaffold is a starting shape, not the final one. Expect at
minimum: the nullable `event_number` with its 1–30 CHECK constraint, the
`event_type` discriminator, the trigger, and the `SET LOCAL` deletion flag. The
scaffold was written before this design existed, so a diff is expected and
correct.

### Design decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | Insert-only repository port; no update/delete/upsert in the interface | Append-only enforced structurally, not by a permission check that could be widened |
| 2 | Transaction handle is a required parameter, not optional | "An audit write cannot commit outside its caller's transaction" is a type-level guarantee |
| 3 | Database trigger as the backstop, not the primary mechanism | The story requires protection against a direct database write bypassing the application |
| 4 | `SET LOCAL` session flag to permit exactly one deletion path | FR-10 hard delete must remove the trail; transaction-scoped so it cannot leak |
| 5 | `event_number` nullable + CHECK 1–30, `event_type` as text | The database itself refuses an out-of-catalog number; a text type means adding a record type is not a schema migration that reads as renumbering |
| 6 | No `updated_at`, no soft-delete column | A column that could change invites a code path that changes it |
| 7 | Raw SQL for trail reads, Prisma for writes | `data-stack.md` mandates raw SQL for audit queries |
| 8 | Catalog-aware sanitizer: deny by default, permit only named fields | Makes the FR-31 event 2 requirement implementable without opening the trail to arbitrary sensitive values |
| 9 | Closed `RequestContext` type for the logger | A log line cannot carry a sensitive value because the type has no field for one |
| 10 | Audit reads written to the database, not only stdout | Hobby retains runtime logs for 1 hour; the PRD requires the access pattern to be reviewable |
