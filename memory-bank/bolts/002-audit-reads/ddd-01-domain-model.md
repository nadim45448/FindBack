---
unit: 006-audit-and-observability
bolt: 002-audit-reads
stage: model
status: complete
updated: 2026-10-26T11:14:35Z
---

# Static Model - Audit and Observability (read side)

Bounded Context

**`audit` — the read side of the trail.** Bolt `001-audit-core` built the write
side: the append-only substrate, the event catalog, the transaction-scoped
FR-10 deletion, the operational log, and quota monitoring. This bolt builds
the read side, and it is deliberately a **separate bounded context** from the
write side within the same module.

**Why the read side is a separate context.** The trail and the record of who
read the trail are two different things, and the story is explicit about it:
"Audit-read logging is deliberately separate from the trail: reading the record
of who read the record would recurse without adding accountability." The
domain model that produced the trail is the same model, but the **read** model
has its own aggregate root, its own invariants, and its own authorization
rule. Nothing in the read path may write a trail event — that would let a read
appear in the record it is reading.

**This context owns:**

| Concern | Requirement |
|---|---|
| Who may read the trail | FR-32 |
| The order, size, and pagination of a trail page | FR-32, `EXPERIENCE.md` §17 |
| The record of a read | PRD §10 (audit reads are logged) |
| The durability of that record beyond the runtime-log window | PRD §10 |

**This context does not own:**

- which events exist (that is `001-audit-core`'s frozen catalog),
- the append-only guarantee (ADR-6, `001-audit-core`),
- the payload sanitizer and the sensitive-field rules (`001-audit-core`),
- the rendering of the trail view (Unit 007, bolt `021-web-admin`),
- the identity of the administrator — that is Unit 001's `ActorContext`, which
  this context consumes as a port.

**The relationship to the identity context.** The read side needs to know
whether the viewer is an administrator. It does **not** decide that: it
consumes an `ActorContext` produced by Unit 001. This matters because
`004-identity-core` has not been built yet, and the read side must be
buildable without it. The port therefore takes the administrator flag as
data, and the enforcement — the check that refuses a non-administrator
*before* the query runs — lives here.

Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **AuditReadLog** | id, administratorId, query, filters, resultCount, requestId, readAt, createdAt | 1. A distinct record type, not an event on the audited entity. It is never written to `audit_events`.<br>2. Written on **every** read, including a read of an empty trail and including a read that returns zero rows.<br>3. Reads are **never deduplicated** — the same administrator reading the same trail twice produces two records.<br>4. Carries the administrator, the query, the filters applied, the result count, and the timestamp.<br>5. Append-only, like the trail itself. There is no update or delete path.<br>6. Carries no trail content — a read record describes the *access*, never the data that was read. |
| **TrailPage** | events, nextCursor | 1. Reverse-chronological: newest first.<br>2. At most 25 entries per page. A caller asking for more is capped, not refused.<br>3. `nextCursor` is null when the trail is exhausted, and non-null when another page exists.<br>4. A page may be empty while the trail is not exhausted — a filter that matches nothing still yields a page. |

Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **TrailViewer** | userId, isAdministrator | 1. `isAdministrator` is **data carried in**, never derived from a client-supplied header or body. It comes from the server-side session.<br>2. A viewer with `isAdministrator: false` is refused, whatever their `userId` says.<br>3. An anonymous viewer has no `userId` and is refused. |
| **TrailCursor** | occurredAt, id | 1. A strict tuple on `(occurredAt, id)`, so two events sharing a timestamp cannot cause a skipped or repeated row.<br>2. The `id` tiebreaker is not optional — `occurredAt` alone is not unique.<br>3. A cursor is opaque to its caller: it is positioned in the trail, not interpreted by the client. |
| **TrailQuery** | parentType, parentId, cursor, limit | 1. `parentType` and `parentId` together identify the parent entity whose trail is read.<br>2. `limit` is capped at 25; a larger value is clamped, not rejected.<br>3. `cursor` null means the start of the trail. |
| **ReadFilters** | key/value pairs | 1. A free-form description of the filters an administrator applied, captured for the record.<br>2. Stored as data, never interpolated into a query. |

Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **AuditTrail** | the read projection of a parent's `AuditEvent`s | 1. **Only an administrator may observe it.** The check happens in the application layer, before the repository is called — a non-administrator never reaches the query.<br>2. Ordered newest first, with a deterministic tiebreaker on `id`.<br>3. Paginated by cursor, never by offset.<br>4. A read of the trail is itself recorded, in the same operation.<br>5. Reading never writes to the trail. |
| **AuditReadLog** | the record itself | 1. Exactly one read record per read operation.<br>2. Never updated, never deleted.<br>3. Names the administrator, the query, the filters, the result count, and the time.<br>4. Contains no trail data. |

**On the AuditReadLog aggregate boundary.** The read log is its own aggregate
root, not a member of `AuditTrail`. It has a different lifecycle (append-only,
never deleted) and a different parent (the administrator, not the audited
entity). Recording a read therefore does not require loading the trail, and
the read record survives the parent entity's own lifecycle.

Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **AuditTrailRead** | An administrator reads a page of the trail | administratorId, parentType, parentId, filters, resultCount, requestId, readAt |
| **AuditTrailReadRefused** | A non-administrator attempts to read the trail | requesterId (may be null for an anonymous viewer), parentType, parentId, requestId |

**Neither domain event is written to the trail.** `AuditTrailRead` is
recorded as an `AuditReadLog` row, and `AuditTrailReadRefused` is recorded to
the operational log only. A refused read must not leave a durable trace in the
database, because the read log records *successful reads by administrators* —
a member's failed attempt is not a trail read, and logging it to a table would
make the read log a place where non-administrator activity accumulates.

Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **AuditTrailReader** | `listByParent(viewer, parentType, parentId, cursor, limit)`, `listAll(viewer, cursor, limit)` | `AuditEventRepository` (read side), `ActorContext` (supplied by the caller) |
| **AuditReadRecorder** | `record(read, transaction)` | `AuditReadLogRepository` (write side) |
| **ReadLogWriter** | `writeReadLog(read)` | `AuditReadLogRepository` |

**On where the read record is written.** The read record is written **after**
the trail query succeeds and **outside** the trail's read transaction. It is
not a trail event, so it does not belong in the read transaction, and writing
it there would make a read of the trail part of the trail's own consistency
boundary. The read is recorded in its own transaction, and a failure to record
it does not fail the read — an administrator who can see the trail can see it
whether or not the bookkeeping succeeded. The failure is surfaced in the
operational log, never silently.

**On the write's transaction.** The `AuditReadLog` row is written with a
transaction handle, exactly like a trail event. ADR-6 applies to it as much as
to the trail: the read-log table has a `BEFORE UPDATE OR DELETE` trigger that
permits no deletion at all, and the repository exposes no update or delete.

Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **AuditEventRepository** (read side) | `AuditEvent` | `listByParent(parentType, parentId, cursor, limit)`, `listAll(cursor, limit)` — both newest-first, cursor-paginated. Read-only; the insert-only write side is `001-audit-core`'s concern. |
| **AuditReadLogRepository** | `AuditReadLog` | `append(read, transaction)`, `listByAdministrator(administratorId, limit)` — append-only, no update, no delete. |

**`listByAdministrator` is for the administrator's own review of who has read
the trail.** It is read-side, so it belongs here. It is deliberately
**administrator-only** as well: the record of who read the trail is itself
sensitive, because it reveals what an administrator was investigating.

Ubiquitous Language

| Term | Definition |
|------|------------|
| **Trail read** | An administrator opening a page of the audit trail. Recorded so the access pattern is reviewable. |
| **Trail page** | One page of the trail — at most 25 entries, newest first, with a cursor for the next page. |
| **Load older** | The UX-OQ-C decision, settled: pagination moves backwards through time, with no infinite scroll. |
| **Read record** | The `AuditReadLog` row that records a trail read. A distinct record type, not an event on the audited entity. |
| **Administrator read** | A read performed by an administrator. Only these are recorded in the read log. |
| **Refused read** | A non-administrator's attempt to reach the trail. Refused before the query runs, and recorded to the operational log only. |
| **Reverse-chronological** | Newest first. The direction an investigator reads a trail. |
| **Cursor** | An opaque position in the trail, on `(occurredAt, id)`. |
| **Durable read record** | A read record in the database rather than a runtime log line — necessary because Vercel Hobby retains runtime logs for one hour, and a read must be reviewable later than that. |
| **Contextual trail** | The trail of one parent entity, read from that entity's own page. The other reading mode is the whole trail. |

## Boundary rules

**The UI is never the enforcement point.** FR-39 and FR-32 are applied in the
application layer, on every read path. A member who crafts a direct URL to an
audit view is refused server-side, and no partial content is returned. This
is the same rule `system-architecture.md` states for every visibility matrix
in the system.

**The read path may not write to the trail.** If a read produced a trail
event, the trail would contain entries about being read, and an
investigator would have to filter them out to see what actually happened. The
read record is a separate table for exactly this reason.

**A read of an empty trail is still a read.** The read record is written
whether or not the trail returned any rows. An administrator who opened the
audit view of a report with no history still performed an access.

**The whole trail and the contextual trail are the same aggregate.** Both are
the `AuditTrail`, read with a different query. They share the authorization
rule, the ordering, the page size, and the read recording. They differ only
in the filter.

## Relationship to bolt 001

`001-audit-core` already built and tested the mechanical parts this context
depends on. This bolt does not rebuild them; it composes them.

| From `001-audit-core` | Used here as |
|---|---|
| `AuditEvent` and the event catalog | The events a trail page contains |
| `AuditEventRepository.listByParent` / `listAll` | The read port, already cursor-paginated |
| `AuditTrailReader` | Already enforces the administrator check before the query |
| `AuditReadRecorder` | Already writes the read record with a transaction handle |
| The `AuditReadLog` table and its trigger | The durable read record, append-only with no deletion permitted |
| ADR-6 | The append-only guarantee, extended to the read log |

**What this bolt adds.** Bolt 001 proved the trail *can* be read quickly and
refuses non-administrators at the reader. What it did not do is answer the
story's own questions: that a read **is recorded** with the administrator,
query, filters, count, and timestamp; that the record is a **distinct type**
and not an event on the audited entity; that it is **reviewable later** than
one hour; and that a trail listing is **25 per page with no infinite
scroll**. Bolt 001's Stage 5 test report recommends re-measuring the trail
query on a Vercel Hobby deployment, which this bolt's success criteria make
explicit.

## Open items carried to Stage 2

1. **The read record's durability under a failed write.** The domain rule is
   that a failed read-record write does not fail the read. Stage 2 must
   decide whether the failure is retried, queued, or only logged — and
   `image-handling.md` §5 uses a "retry queue" for blob-delete orphans, so
   there may be a shared pattern.
2. **`listByAdministrator`'s page size and ordering.** The read log is
   reviewed by an administrator; the story does not state a page size for it.
   Stage 2 should settle it rather than inventing one later.
3. **Whether the whole-trail read needs its own index.** The contextual trail
   is covered by `idx_audit_events_trail`, which leads with `parent_type`. The
   whole trail filters on nothing, so it may need an index on `occurred_at`
   alone. Stage 2 should measure it rather than assume.
4. **The trail's filter set.** `ReadFilters` is currently free-form. The
   UX-OQ-C filters are settled in `EXPERIENCE.md` §17, and Stage 2 should
   read them from there rather than inventing a filter model.

## Story coverage

| Story | Covered by |
|---|---|
| `005-audit-visibility-and-read-logging` | AuditTrail aggregate and its four invariants, AuditReadLog entity and its six business rules, TrailViewer, TrailCursor, TrailQuery, ReadFilters value objects, AuditTrailReader and AuditReadRecorder services, both repository interfaces, the "Boundary rules" section, and the "Relationship to bolt 001" section |

## Completion criteria

- [x] All domain entities identified and documented
- [x] Business rules captured for each entity
- [x] Aggregate boundaries defined
- [x] Domain events specified
- [x] Repository interfaces defined
- [x] All stories covered by domain model
- [x] Ubiquitous language documented
- [x] Boundary against the sibling contexts stated explicitly
