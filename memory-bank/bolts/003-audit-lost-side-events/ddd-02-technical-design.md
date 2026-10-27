---
unit: 006-audit-and-observability
bolt: 003-audit-lost-side-events
stage: design
status: complete
created: 2026-10-26T13:20:00Z
updated: 2026-10-26T13:20:00Z
intent: 001-findback-lost-and-found
stories:
  - 002-lost-side-audit-events
---

# Technical Design - Audit and Observability (Lost-side events)

Bolt `003-audit-lost-side-events`, story `002-lost-side-audit-events`.

> **Stage 2 output.** Documentation only — no source code was read, written, or
> modified to produce this artifact, per the DDD bolt type's Stage 2 constraint.
> Transforms `ddd-01-domain-model.md` into a technical design. Product behaviour
> remains as the frozen PRD defines it.

## Architecture Pattern

**Hexagonal (ports and adapters) inside the layered modular monolith**, inherited
from bolt `001-audit-core`, bolt `002-audit-reads`, and
`system-architecture.md` § Architecture style. This bolt adds **no new
architectural pattern**.

What this bolt *does* add is a **second writer for the same table**. Bolt 001
established one writer — `AuditWriter` — inside the audit module. This bolt's
whole subject is that **events 15–30 are fired from three different modules**
(unit 004's recovery workflow, unit 005's return/close workflow, and unit 002's
report-withdrawal workflow), and the catalog that defines them must still live
in exactly one place.

The pattern is therefore unchanged, but the **ownership of the catalog** is a
design decision, and it is the decision this bolt exists to make.

### Decision 1 — the Lost-side catalog lives in the `audit` module, and the firing modules call it

**The catalog lives in `src/domain/audit/`. The firing modules call it; they do
not own it.**

`system-architecture.md` § Module map assigns **FR-48 to two modules**:
`recovery/` (FR-40..FR-48) and `audit/` (FR-31, FR-32, FR-48). That is a
deliberate overlap in the standard, and this bolt resolves it: **FR-48's
*catalog* belongs to `audit/`; FR-48's *transitions* belong to `recovery/`.**

| Concern | Module | Why |
|---|---|---|
| The event numbers 15–30, their names, their required field sets | `audit/` | The catalog is frozen and shared. One definition, so it cannot drift. |
| Which transition fires which event | `recovery/`, `returns/`, `listings/` | Deciding *when* an event fires is a business rule of the acting workflow. |
| The audit event's structure, validation, and write path | `audit/` | Already built and tested by bolt 001. |

**Why not let unit 002 (withdrawal) own the Lost-side events it fires.** Two
reasons, and the second is decisive.

1. **It would create two definitions of event 27.** Unit 002 fires event 27 from
   the withdrawal path; unit 005 fires it from the close path. If each owned
   its own, the two copies would drift — and the drift would be invisible until
   an investigation compared them.
2. **The audit module already has the enforcement machinery.** The catalog-aware
   sanitizer, the event-number CHECK constraint, the append-only trigger, and
   the "a numbered type must have a number and a non-numbered type must not"
   assertion all live in `audit/`. A second writer would need all of it, and
   the copy would be a second chance to be weaker.

**Why not let unit 004 own the whole catalog.** The same argument, inverted:
unit 004's `recovery/` module would then hold a definition of the event
catalog, and `audit/` — whose entire job is the trail — would not know what
event 27 means. The `audit` module is the only module every other module
depends on for trail writes, which makes it the natural single home.

**The cost of this decision, stated plainly.** `audit/` must not import from
`recovery/`. The direction is one-way: `recovery/` depends on `audit/`. This is
already the case in the module map, and it is why the catalog's field sets are
expressed as **values passed in by the caller** rather than as a rule the audit
module evaluates against a Recovery Response.

### Decision 2 — the audit module exposes a typed Lost-side event factory; the firing module supplies the business values

The `audit` module exposes a factory that **builds** a Lost-side audit event
from a typed draft. The factory owns:

- the event number and the event type for each catalog entry,
- the required-field set and the refusal when a required field is missing,
- the determination-pair rule for events 18/19,
- the system-actor rule for events 26–30,
- the batch-completeness rule for events 26/27.

The firing module owns:

- *whether* the transition happened (it is the module that performs it),
- the business values: the report id, the response ids, the status before and
  after, the reason, the human who caused a system transition.

This is the hexagonal boundary drawn in the right place. The audit module
**validates the shape of a record**; it does not **decide whether a transition
is legal**. A Recovery Response's legal transitions are `recovery/`'s business
rule, and `audit/` never evaluates them.

**The consequence that matters for the "no gap" criterion.** Because the
factory is the only way to build a Lost-side event, a firing module cannot
invent an event number, cannot forget a required field, and cannot write a
determination without both halves of the pair. The gap criterion is therefore
enforced by the *shape* of the API, not by each firing module remembering the
rules.

### Decision 3 — the batch event's child list is assembled inside the transaction that performs the resolution

Stage 1's Open items 2 and 3 asked the same question from two sides: how does
the batch event (26, 27) know the exact set of child responses it resolved?

**The list is the set the transaction actually resolved, read back from the
transaction's own writes — not re-queried afterwards, and not passed in from
the caller.**

```text
BEGIN
  lock the Lost report row                    ← SELECT ... FOR UPDATE
  UPDATE recovery_responses SET status = 'Resolved — Report Returned'
    WHERE lost_report_id = $id
      AND status IN ('Submitted', 'Selected for Verification', 'Match Confirmed')
      AND id <> $matchedResponseId
    RETURNING id, previous_status             ← the exact set, from the write
  INSERT audit_events (event 26, metadata = { childResponseIds: [...], ... })
  INSERT audit_events (event 30, ...)         ← the matched response
COMMIT
```

**Why the `RETURNING` clause and not a second SELECT.** A second `SELECT`
inside the same transaction would see the same rows, so it would be
correct — but it is a second statement that can disagree with the first if the
`UPDATE`'s predicate is ever changed. `RETURNING` makes the list *a product of
the write*, so the list and the state change cannot diverge by construction.
This is the strongest form of the guarantee available, and it is cheap: one
statement instead of two.

**Why not a re-query after the transaction.** A re-query outside the
transaction could see a different set — a response submitted concurrently, or
one whose status changed between the commit and the re-query. The batch event
would then name a response it did not resolve, or omit one it did. The
trail would be wrong in a way no test could catch, because the discrepancy
depends on timing.

**Why not a list passed in by the caller.** The caller would have to compute
the set correctly — which is the very thing the audit module is supposed to
guarantee. Passing it in moves the error to every firing module.

**The `previous_status` column is read too**, because event 27's field set
requires the status each response was in at close time. The `RETURNING` clause
provides it in the same statement, so the before-state is captured atomically
with the after-state.

### Decision 4 — events 26 and 30 are written through one call, and the pairing is enforced by the call

Stage 1's pairing rules (events 26 and 30 in the same transaction; event 26
references event 30 by response id) are enforced **structurally**: the factory
exposes a single method for the Returned closeout that writes both, or
neither.

```text
LostSideEventFactory.recordReturnedCloseout({
  lostReportId, matchedResponseId, resolvedResponseIds, actingAdministratorId, ...
}, tx)  →  writes event 26 and event 30 together
```

There is no way to write event 26 without event 30, because there is no
method that writes event 26 alone. The factory validates that the matched
response id appears in event 26's cross-reference before it writes either.

**The same pattern for the Closed path**: `recordClosedCloseout(...)` writes
event 27. Event 27 is alone in its transaction — it is the *only* event the
closed path needs beyond the trigger event (23, 24, or 25), which the firing
module writes separately because it is a different business action.

### Decision 5 — no new table, no new column, and one new index that the read path needs to be proven against

**No new table and no new column.** The sixteen Lost-side events are
`AuditEvent` rows with `event_number` in 15–30. The batch lists live in
`metadata` (jsonb), which bolt 001 already provides for exactly this kind of
event-specific detail — bolt 001's own design names "event 26's list of child
response IDs" as the example.

**No migration is required for the schema to accept these events.** The
`event_number` CHECK constraint is `IS NULL OR BETWEEN 1 AND 30`, which
already admits 15–30. The `parent_type` values already include `report` and
`recovery_response`.

**One new index is *not* proposed.** See the Indexes section — the existing
`idx_audit_events_trail` serves the Lost-side trail, and Stage 5 must measure
it rather than assume it.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────┐
│      Presentation                                          │
│  app/(admin)/lost/[id]/audit/page.tsx   ← Unit 007        │
│  No new route in this bolt.                                │
├──────────────────────────────────────────────────────────┤
│      Application                                           │
│  application/audit/                                       │
│    lost-side-event-factory.ts       (NEW)                 │
│      recordResponseSubmitted / recordThreadMessage /      │
│      recordSelectedForVerification / recordDetermination / │
│      recordResponseWithdrawn / recordReturned /           │
│      recordLostWithdrawn / recordAdministratorClosed /     │
│      recordExceptionalCancellation /                       │
│      recordReturnedCloseout / recordClosedCloseout /       │
│      recordNotAMatchReturnToOpen / recordToVerificationPending│
│    ports/audit-event-repository.ts    (exists — insert-only)│
├──────────────────────────────────────────────────────────┤
│      Domain                                                │
│  domain/audit/                                             │
│    event-catalog.ts                  (exists — EXTENDED)  │
│      + the 16 FR-48 entries, their field sets, and the    │
│        event type ↔ number mapping                         │
│    lost-side-event-factory.ts         (NEW — pure)         │
│      builds a LostSideAuditEvent; validates the required  │
│      fields, the determination pair, the system actor, and │
│      the batch completeness                                │
│    lost-side-audit-event.ts           (NEW — value objects)│
│      LostSideEventNumber, DeterminationActor,             │
│      BatchResolution, ChildResponseReference,              │
│      SystemActorCause, PriorLifecycleStatus                │
├──────────────────────────────────────────────────────────┤
│      Infrastructure                                        │
│  infrastructure/audit/                                    │
│    prisma-audit-event-repository.ts  (exists — no change) │
│  infrastructure/recovery/  ← owned by Unit 004, later      │
│    prisma-recovery-response-repository.ts                  │
│      (the `RETURNING` batch write — Open item 3)          │
├──────────────────────────────────────────────────────────┤
│      Firing modules — NOT in this bolt                     │
│  domain/recovery/     (Unit 004) — events 15, 16, 17,     │
│                                  18, 19, 20, 28, 29       │
│  domain/returns/      (Unit 005) — events 21, 22, 24,     │
│                                  25, 26, 27, 30           │
│  domain/listings/     (Unit 002) — events 23, 27           │
└──────────────────────────────────────────────────────────┘
```

**The firing modules are not built by this bolt.** This bolt builds the catalog
and the factory. The `recovery/`, `returns/`, and `listings/` modules do not
exist yet — they are built by units 004, 005, and 002 in later bolts. The
factory is the contract those bolts will call.

**Why the factory is in `domain/`, not `application/`.** It is a pure function
of its input: it validates and builds, and it performs no I/O. The `AuditWriter`
in `application/` does the I/O — it inserts the event inside the caller's
transaction. Bolt 001 already drew that line, and this bolt keeps it.

**Why the `RETURNING` write belongs in `infrastructure/recovery/`, not here.**
The batch update moves Recovery Response rows, and that table belongs to unit
004's `recovery/` module. The `audit` module must not write to it. The
audit module's involvement in the batch is: *read the resolved set, put it in
the event, write the event*. The `RETURNING` clause is how the set is obtained;
where the statement lives is unit 004's business.

**This creates a coordination requirement, and it is stated rather than
hidden.** For the batch event to name the exact set, the update and the
`RETURNING` must be in the same transaction as the audit insert — and the
update belongs to another module. The mechanism is that the firing module
passes the resolved set to the factory, and the factory records it. The
**guarantee** that the set is exact therefore lives at the boundary between
the two modules, and it is enforced by the contract in the "Cross-module
contract" section below. This is the single most important interface in the
bolt, and it is a candidate for the Stage 3 ADR.

## API Design

This bolt is **backend-only**. It exposes no new route. The Lost-side trail is
read through the same contextual route unit 007 will render
(`/admin/lost/:id/audit`), which bolt 002 already built.

### The factory's public surface

| Method | Writes | Firing module | Unit |
|---|---|---|---|
| `recordResponseSubmitted(draft, tx)` | 15 | 004 | `recovery/` |
| `recordThreadMessagePosted(draft, tx)` | 16 | 004 | `recovery/` |
| `recordSelectedForVerification(draft, tx)` | 17 | 004 | `recovery/` |
| `recordDetermination(draft, tx)` | 18 **or** 19 | 004 | `recovery/` |
| `recordResponseWithdrawn(draft, tx)` | 20 | 004 | `recovery/` |
| `recordReturnedConfirmed(draft, tx)` | 21 **or** 22 | 005 | `returns/` |
| `recordLostWithdrawn(draft, tx)` | 23 | 002 | `listings/` |
| `recordAdministratorClosed(draft, tx)` | 24 | 005 | `returns/` |
| `recordExceptionalCancellation(draft, tx)` | 25 | 005 | `returns/` |
| `recordReturnedCloseout(draft, tx)` | **26 + 30** | 005 | `returns/` |
| `recordClosedCloseout(draft, tx)` | 27 | 002 or 005 | `listings/` / `returns/` |
| `recordNotAMatchReturnToOpen(draft, tx)` | 28 | 004 | `recovery/` |
| `recordToVerificationPending(draft, tx)` | 29 | 004 | `recovery/` |

**Thirteen methods for sixteen events.** The three multi-event methods
(`recordDetermination` writes 18 or 19; `recordReturnedConfirmed` writes 21 or
22; `recordReturnedCloseout` writes 26 and 30) are the ones where a single
business action produces more than one event. The rest write one event each.

**The two methods that write the report's own lifecycle events** —
`recordSelectedForVerification` (17) and `recordNotAMatchReturnToOpen` (28) —
are deliberately *separate* from the report-transition methods
(`recordToVerificationPending` (29), `recordReturnedCloseout` (26)). They are
separate because they are called by different modules at different moments, and
because the story's no-gap criterion depends on both halves being recorded.
The **same** is true of `recordDetermination` (18/19), which is separate from
`recordToVerificationPending`.

> **This is a point where the design is deliberately not clever.** A "one
> method per business action" API would be more elegant: `selectForVerification`
> would write 17 and 29 together, and `recordNotAMatch` would write 19 and 28
> together. That API is *rejected*, and the reason is worth recording.
>
> The two events record two different things — the *response's* transition and
> the *report's* transition — and the PRD gives them different actor models.
> Event 17's actor is the owner; event 29's actor is the system identifying the
> owner. Event 19's actor is the administrator; event 28's actor is the system
> identifying the administrator. Merging them would force one actor model onto
> two different facts, and the merged event's actor would be wrong for one of
> them. The pair is recorded as two events because the PRD says it is two
> events, and because the events are separately queryable — a filter on event
> type must find "the report entered Verification Pending" without also
> matching "a response was selected".

### The draft shapes

Every draft is a closed TypeScript type. A draft cannot carry a field the
catalog does not name for that event, and it cannot omit one the catalog
requires.

```text
ResponseSubmittedDraft
├── lostReportId            uuid
├── recoveryResponseId      uuid
├── responderId             uuid
├── whereFound              { campusArea, exactPlace? }   ← sensitive, event 15
├── observedIdentifyingDetails  string                    ← sensitive, event 15
├── dateFound               date
├── imagePresent            boolean
└── occurredAt              timestamptz
```

```text
DeterminationDraft                        ← events 18 and 19
├── lostReportId            uuid
├── recoveryResponseId      uuid
├── determinedByUserId      uuid   ← the Lost-report owner. REQUIRED.
├── recordedByAdministratorId uuid  ← the acting administrator. REQUIRED.
├── determination           'match_confirmed' | 'not_a_match'
├── verificationTimestamp   timestamptz
└── occurredAt              timestamptz
```

```text
SystemActorDraft                          ← events 26, 27, 28, 30
├── lostReportId            uuid
├── cause                   SystemActorCause
│   ├── actingAdministratorId  uuid   ← events 26, 27 (admin path), 28, 30
│   └── actingMemberId         uuid   ← event 29 (the owner who selected)
│                                 and event 27 (the reporter who withdrew)
└── occurredAt              timestamptz
```

```text
BatchResolutionDraft                      ← events 26 and 27
├── lostReportId            uuid
├── resolvedResponses       ResolvedResponse[]   ← non-empty
│   ├── recoveryResponseId  uuid
│   └── previousStatus      RecoveryResponseStatus
├── targetStatus            'resolved_report_returned' | 'resolved_report_closed'
├── matchedResponseId?      uuid   ← event 26 only: the reference to event 30
└── occurredAt              timestamptz
```

### The cross-module contract — the one interface that must not drift

The batch event's correctness depends on a value crossing a module boundary.
The contract is:

```text
The firing module performs the batch status update and obtains the resolved
set from the update itself (RETURNING). It passes that exact set to the
factory. The factory records it verbatim in the event's metadata.

The factory MUST NOT accept a set that omits a response the caller resolved,
and the caller MUST NOT pass a set it did not resolve. Neither side can
enforce that alone; the pairing is the contract.
```

**What this design does about it.** It (a) fixes the *shape* — the set is
passed, not re-derived, and the factory refuses an empty set; (b) names the
*mechanism* — the set comes from the write's `RETURNING` clause; and (c) makes
the failure **detectable** — Stage 5 asserts that the event's list is exactly
the set of responses that changed status in that transaction.

**What it cannot do.** It cannot make a wrong set impossible from inside the
`audit` module, because the set is only knowable by the module that performed
the update. A caller that passes a stale or filtered set would produce a
well-formed event with a wrong list. This is the honest limit of the
boundary, and it is why the contract is stated as a contract rather than as a
guarantee. It is also the reason the batch contract is the **ADR candidate**.

### The `Determination` actor model on the wire

Events 18 and 19 store two distinct values, and the existing
`audit_events` columns already hold them: `determined_by_user_id` and
`recorded_by_administrator_id`. Bolt 001's schema has both, nullable, and no
new column is needed.

**The guard refuses three things**: a draft missing either half; a draft where
both halves are the same user id; and a draft whose `determinedByUserId` is
not the Lost report's owner (the factory receives the owner id from the firing
module as a fact, and refuses a mismatch).

The third check is worth stating because it is the one that makes the event
meaningful. FR-43 is emphatic that the administrator does **not** independently
determine the match. If the determination's maker is not the owner, the event
records something the PRD forbids.

## Data Persistence

### Tables

**No new table. No new column. No migration required for correctness.**

| Table | This bolt's operation | Columns used | Notes |
|---|---|---|---|
| `audit_events` | INSERT | all columns | `event_number` in 15–30. The existing `CHECK (event_number IS NULL OR event_number BETWEEN 1 AND 30)` already admits them. The append-only trigger permits no UPDATE or DELETE. |
| `audit_read_logs` | — | — | Unchanged. A Lost-side trail read is recorded exactly like any other. |
| `recovery_responses` | **not written by this module** | `id`, `status`, `lost_report_id` | Read by unit 004's batch update. The audit module never writes this table. |

**The `metadata` jsonb column carries the Lost-side event-specific fields.**
This is what bolt 001's design reserved it for, and it is why no migration is
needed. The mapping:

| Event | Typed column | `metadata` jsonb keys |
|---|---|---|
| 15 | `parent_id` = report, `actor_id` = responder | `recoveryResponseId`, `whereFound`, `observedIdentifyingDetails`, `dateFound`, `imagePresent` |
| 16 | `parent_type` = `recovery_response_thread_message`, `parent_id` = message | `recoveryResponseId`, `messageText` |
| 17 | `parent_id` = report, `actor_id` = owner | `recoveryResponseId` |
| 18, 19 | `parent_id` = report, `actor_id` = acting administrator, `determined_by_user_id`, `recorded_by_administrator_id` | `recoveryResponseId`, `verificationTimestamp` |
| 20 | `parent_id` = report, `actor_id` = responder | `recoveryResponseId` |
| 21, 22 | `parent_id` = report, `actor_id` = administrator, `reason` = receiver name for 22 | `receiverId`, `substituteReceiverName?`, `substituteAuthorizationAffirmation?`, `substituteRelationship?` |
| 23 | `parent_id` = report, `actor_id` = owner, `reason` | `priorLifecycleStatus` |
| 24 | `parent_id` = report, `actor_id` = administrator, `reason` | `priorLifecycleStatus` |
| 25 | `parent_id` = report, `actor_id` = administrator, `reason` | `priorLifecycleStatus`, `priorSelectedResponseId`, `priorSelectedResponseStatus` |
| 26 | `parent_id` = report, `actor_id` = system, `acting_administrator_id` | `resolvedResponseIds[]`, `resolvedResponseStatuses[]`, `matchedResponseId`, `matchedResponseEventNumber` (= 30) |
| 27 | `parent_id` = report, `actor_id` = system, `acting_administrator_id` | `resolvedResponseIds[]`, `resolvedResponseStatuses[]` |
| 28 | `parent_id` = report, `actor_id` = system, `acting_administrator_id` | `priorSelectedResponseId` |
| 29 | `parent_id` = report, `actor_id` = system, `actor_id` names the owner | `selectedResponseId` |
| 30 | `parent_id` = report, `actor_id` = system, `acting_administrator_id` | `recoveryResponseId`, `newCanonicalStatus` (= `Completed — Report Returned`) |

**Two of these need a closer look.**

**Event 29's actor.** The PRD says "actor (system; identifying the owner who
selected)". The schema's `actor_id` is `uuid not null`, and `actor_role` has a
closed set of `member | administrator | system`. The event's `actor_role` is
`system`, and `actor_id` holds the **owner's** id — the human the system
acted on behalf of. `acting_administrator_id` is **null** for this event,
because there is no administrator in it. This is the one event in the catalog
whose causing human is a plain member, and it is the reason the design
separates `actor_id` (the owner) from `acting_administrator_id` (the
administrator) rather than collapsing them.

**Event 27's actor.** The PRD says "actor (system; identifying administrator
**or** reporter who triggered closure)". The two triggers are different
humans with different roles. The design resolves this as: `actor_role` is
`system` in both cases; `acting_administrator_id` carries the administrator
when an administrator triggered the closure, and is **null** when the reporter
did; and `actor_id` carries the triggering human in both cases, with
`actor_role` distinguishing them would be wrong — so a **`metadata.triggeredByRole`**
key records whether the cause was an administrator or the reporter. The
`acting_administrator_id` column is nullable for exactly this reason.

**Verbatim reasons (events 24, 25).** The reason goes in the `reason` column,
which bolt 001 made a dedicated nullable text column precisely so that
audit-significant strings stay verbatim and greppable. It is stored exactly as
given. The user-facing copy may be softer; the audit reason may not.

### Indexes

**No new index is proposed in this bolt.** The reason is the same as bolt
002's, and it is a reason about scale.

The Lost-side trail is read through the contextual query bolt 002 built:

```sql
WHERE "parentType" = $parentType AND "parentId" = $parentId
ORDER BY "occurredAt" DESC, "id" DESC
LIMIT $limit + 1
```

`idx_audit_events_trail` on `(parent_type, parent_id, occurred_at DESC, id
DESC)` already serves it, and bolt 002's Stage 5 proved the plan is an index
scan with no sort at the PRD's scale.

**A Lost report with many Recovery Responses produces more rows under one
parent than a Found report does.** The PRD's own NFR is "the verification
screen renders within 1 second at p95 against a Lost report with up to **50
Recovery Responses**", and the audit NFR is measured at 50 events per report.
So the worst case is a bounded, known shape — and the index serves it.

**This is a decision to be measured, not assumed.** Stage 5 must:
1. seed a Lost report with 50 Recovery Responses and their full event set
   (the no-gap trace produces several events per response), and
2. assert the plan for that parent's trail is an index scan with no sort, and
   the p95 is inside the 1 s budget.

If the plan degrades, Stage 5 raises the index question rather than assuming
it away — the same discipline bolt 002 applied to its filtered query.

**One index consideration is worth recording for Stage 5.** The batch event
(26, 27) stores a *list* of response ids in `metadata`. There is no index on
that list, and there should not be one: the list is read by a human
investigating one report, in the report's own trail, where it is already
present. Indexing a jsonb array of uuids would add write cost on the audit
path for a query nobody makes.

## Security Design

| Concern | Approach |
|---|---|
| **Authorization** | Unchanged from bolt 002. The administrator check runs in the application layer before the query. This bolt adds no read path, so it adds no authorization surface. |
| **Event 15's sensitive fields** | `whereFound` and `observedIdentifyingDetails` are FR-37 Sensitive Fields, catalog-named for event 15 only. They are recorded in the administrator-only trail and **never** in the operational log. Bolt 001's catalog-aware sanitizer is extended to admit them for event 15 and to refuse them for every other event. |
| **Event 16's message text** | Catalog-named for event 16. Recorded in the trail, never in the log. |
| **Events 24, 25's reasons** | Catalog-named. Verbatim in the trail, never in the log. |
| **Passwords, hashes, tokens** | Never written to the trail or a log, in any event. Not named by any catalog event. |
| **The determination pair is not forgeable by a client** | Both halves are supplied by the firing module from server-side state — the owner id from the report, the administrator id from the session. No client-supplied value reaches either. |
| **Actor derivation** | Roles are derived from the server-side session, never client-asserted (`system-architecture.md` § Authorization model). The `system` role is set by the factory for events 26–30, and only for those. |
| **The batch list as data** | The resolved response ids are stored as jsonb **data**. No response id is ever interpolated into a query. A caller passing a hostile id has it recorded verbatim and it matches no row. |
| **Escape on render** | `reason`, `metadata`, and every event-specific text value are rendered as **text**, never as HTML — bolt 001's rule, unchanged. Event 15's `observedIdentifyingDetails` and event 16's `messageText` are the two values where this matters most, because both are user-supplied free text. |
| **The trail stays administrator-only** | FR-32. A responder, a Lost-report owner, or any member gains no trail access by participating. Unchanged from bolt 002. |
| **No new attack surface** | This bolt adds no route, no query, no table, and no dependency. Its only output is a set of inserts through an existing insert-only port. |

## NFR Implementation

| Requirement | Design Approach |
|---|---|
| **Audit trail queries ≤ 1 s p95 at 10,000 reports × 50 events** | `idx_audit_events_trail` serves the Lost-side parent filter and the ordering, unchanged from bolt 002. **Measured** for the 50-Recovery-Response shape in this bolt's Stage 5, not assumed. |
| **Verification screen ≤ 1 s p95 at up to 50 Recovery Responses** (FR-48 NFR) | The audit trail for such a report holds a bounded, known number of rows under one parent, served by the same index. The screen itself is Unit 007's; this bolt's obligation is that the trail query behind it does not become the bottleneck. |
| **The Lost Returned closeout is atomic** | Events 21/22, 26, and 30 are written in the same transaction as the report's `Returned` transition and the responses' terminal transitions. A partial closeout writes nothing. |
| **A rolled-back closeout leaves no closeout events** | The story's edge case. Because the audit inserts are inside the same transaction, a rollback discards them with the state changes. |
| **The batch list is the exact set resolved** | The set comes from the batch update's `RETURNING` clause, in the same transaction. See Decision 3. |
| **No gap between unit 004's and unit 005's events** | Every event is written through the one factory, under one parent (`parent_type = 'report'`, `parent_id` = the Lost report). No event is parented to a response when it describes a report, or vice versa. |
| **Audit reasons stay verbatim** | The `reason` column is a dedicated text column, populated with the administrator's string unchanged. The user-facing copy is a separate concern in the UI layer. |
| **No paid dependency** | No new package. The factory, the catalog extension, and the guards are pure TypeScript. |
| **Scalability** | One insert per event, inside a transaction the caller already opened. The Lost-side closeout writes three events and one batch update — a constant number of statements, independent of the number of responses. |
| **Read-only load is unchanged** | This bolt adds rows to a table that is already read by the contextual trail query. No new read pattern, no new index, no new query shape. |

## Error Handling

| Error Type | Code | Response |
|---|---|---|
| `AuditCatalogViolationError` | 500 | A Lost-side event was built with a number outside 15–30, or a number that does not match its type. Refused before the insert. Bolt 001's existing error type, reused. |
| `AuditPayloadRejectedError` | 500 | A required field for the event was missing, or a field the catalog does not name was supplied. The write is refused and the caller's transaction rolls back. |
| `DeterminationActorError` | 500 | Event 18/19 was built with a missing half of the pair, the same id in both halves, or a `determinedByUserId` that is not the Lost report's owner. Refused. |
| `SystemActorCauseError` | 500 | A system-actor event (26–30) was built with no causing human, or with a cause that names neither an administrator nor a member. Refused. |
| `BatchResolutionError` | 500 | A batch event (26, 27) was built with an empty resolved set, or event 26 was built without a matched response reference. Refused. |
| `EventPairingError` | 500 | The Returned closeout's event 26 and event 30 disagree — the matched response id in event 26 is not the one event 30 records. Refused; neither is written. |

**All of these are defects, not business outcomes.** They mean the code that
built the event violated a frozen catalog rule, and the whole transaction
rolls back. That is the correct response: an unaudited or wrongly-audited
transition must never commit. Per `coding-standards.md` § Error handling, they
are logged as defects with their request id and never surface raw text to a
member.

**The batch contract's failure mode is different, and it is honest about it.**
`BatchResolutionError` catches a *malformed* set. It cannot catch a *wrong*
set — a caller that passes a set it did not resolve produces a well-formed
event with a wrong list. That is the boundary limit stated in the
cross-module contract, and it is the reason the contract is the ADR candidate.

## External Dependencies

| Service | Purpose | Integration |
|---|---|---|
| **PostgreSQL** | The trail rows written | Prisma, via the driver adapter, inside the caller's transaction. No raw SQL is required by this bolt — the batch `RETURNING` clause belongs to unit 004's infrastructure. |
| **No email** | — | The audit module sends no email. FR-46's eight email events are Unit 005's `notifications/` module, and they are a separate mechanism from the audit catalog. The two must not be conflated: an email event is not an audit event, and no audit event fires an email. |
| **No Blob** | — | The trail records *image presence* (a boolean) on event 15, never image bytes. The image itself lives in private Blob storage under `image-handling.md`. |
| **Vercel runtime logs** | Diagnostic only | The operational log records the *fact* of an action. It never carries event 15's identifying details or event 16's message text. |
| **No new dependency** | — | This bolt adds no package. The factory and the guards are pure TypeScript. |

## Conflict — the story's criterion 3 names events 24/25 in the Returned closeout, and the frozen PRD forbids it

**This design does not resolve the conflict silently. It records it, states the
reading it is built on, and asks for owner confirmation.**

**The two positions.**

- **The Inception-authored criterion.** Story `002-lost-side-audit-events`
  acceptance criterion 3 reads: "**Given** the Lost Returned closeout in Unit
  005, **When** it commits, **Then** events **24 through 26 and 30** are
  recorded in the same transaction." Bolt `003`'s own success criteria repeat
  it: "Events 24–26 and 30 fire from Unit 005's closeout in the same
  transaction."

- **The frozen PRD.** Events 24 and 25 are **Closed-path** events. Event 24 is
  "Lost report closed by Administrator (Administrator-triggered normal closure)"
  and event 25 is "Lost report cancellation after Match Confirmed by
  Administrator (exceptional)". The Lost report's **Returned** closeout is
  recorded by events 21/22 (the handoff), 26 (the batch child resolution), and
  30 (the matched response's individual terminal event). The PRD's own climax
  beat names exactly those: "FR-48 events 15, 17, 18, 21, 26, and 30".

**Why the PRD's reading is the correct one.** FR-21 states that
`Returned → Closed` is **"Unavailable (Returned is terminal)"**. A Lost report
that has reached `Returned` can never be closed, so event 24 and event 25 —
both of which record a closure — cannot occur in the Returned closeout's
transaction, or in any transaction after it. The criterion is not merely
imprecise; it names events that the frozen state machine makes impossible in
that path.

The likely origin of the error is the phrase "24 through 26": read as a range
it sweeps in events 24 and 25, both of which belong to the *Closed* path,
alongside 26 which belongs to the *Returned* path. The intended set was almost
certainly **21, 22, 26, and 30** — the four events the PRD names for the
Returned closeout.

**The reading this design is built on.** The Returned closeout writes events
**21 or 22, 26, and 30** in one transaction. The Closed closeout writes events
**23, 24, or 25, and 27** in one transaction. Events 24 and 25 never appear in
a Returned transaction.

**The design is built so that this reading is mechanically enforced, whichever
way the owner confirms.** `recordReturnedCloseout` writes 26 and 30 and has no
path to 24 or 25; `recordClosedCloseout` writes 27; `recordAdministratorClosed`
writes 24 and `recordExceptionalCancellation` writes 25. There is no method
that can put a closure event into a Returned transaction. So if the owner
confirms the PRD's reading, **no code change is needed** — the design already
forbids it. If the owner instead confirms the story's literal text, the
required change is a *product* change to a frozen state machine, which is a
different and much larger conversation.

**Confirmation requested.** The owner is asked to confirm that criterion 3
reads "events 21, 22, 26, and 30" for the Returned closeout, and that the
bolt's success criterion becomes "events 21, 22, 26, and 30 fire from Unit
005's closeout in the same transaction". Two artifacts would be corrected on
confirmation: the story's acceptance criterion 3 and the bolt's success
criteria. Neither is corrected by this design, because the correction changes
a story criterion and a success criterion — both owner-owned.

**The owner confirmed this reading on 2026-10-27.** The story's acceptance
criterion 3 and the bolt's success criterion were corrected to name **21 or
22, 26, and 30**, and each correction carries an annotation in place stating
the reason and pointing here. The prediction this design made held: **no code
change was needed**. The Stage 4 implementation's `recordReturnedCloseout`
writes events 26 and 30 and has no path to event 24 or 25;
`recordClosedCloseout` writes 27; `recordAdministratorClosed` writes 24 and
`recordExceptionalCancellation` writes 25. There is still no method that can
put a closure event into a Returned transaction.

## Design decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | **The Lost-side catalog lives in `audit/`; the firing modules call it and do not own it** | FR-48 is assigned to two modules by the standard. The catalog is frozen and shared; two definitions would drift, and the drift would be invisible until an investigation compared them. `audit/` already owns the enforcement machinery. |
| 2 | **A typed factory in `domain/audit/` builds the events; the firing module supplies the business values** | The audit module validates the *shape* of a record and never decides whether a transition is legal. The one-way dependency `recovery → audit` is preserved, and a firing module cannot invent an event number or omit a required field. |
| 3 | **The batch's child list comes from the update's `RETURNING` clause, inside the transaction** | The list is a product of the write, so it cannot diverge from the write. A re-query could see a different set; a caller-supplied list moves the error to every firing module. |
| 4 | **Events 26 and 30 are written by one method, and the pairing is validated before either is written** | The PRD requires both in the same transaction. A method that writes only one does not exist, so the pairing is structural rather than a convention. |
| 5 | **The response-level and report-level events of one business action are separate methods** | Event 17's actor is the owner; event 29's is the system identifying the owner. Merging them would force one actor model onto two different facts, and would break the event-type filter. |
| 6 | **No new table, no new column, no migration** | `event_number`'s existing 1–30 CHECK already admits 15–30, and `metadata` (jsonb) already exists for event-specific detail — bolt 001's own design names "event 26's list of child response IDs" as its example. |
| 7 | **No new index** | `idx_audit_events_trail` serves the Lost-side parent filter and the ordering. The worst case is a bounded 50-Recovery-Response shape. **Stage 5 measures it.** |
| 8 | **The determination pair is checked against the report's actual owner** | FR-43 is emphatic that the administrator does not independently determine the match. An event whose maker is not the owner records something the PRD forbids. |
| 9 | **Event 29 carries the owner in `actor_id`; event 27 carries the trigger's role in `metadata`** | The schema's `actor_id` is `not null` and its role set is closed. Event 29's human is a member, and event 27's cause is either an administrator or the reporter. Collapsing these into the administrator column would lose exactly the distinction the PRD draws. |
| 10 | **Verbatim reasons go in the `reason` column** | Bolt 001 made it a dedicated text column for exactly this reason — greppable, and stored exactly as given even where the user-facing copy is softer. |

## Open items carried to Stage 3 (ADR) and Stage 4 (Implement)

1. **The batch contract across the module boundary — the ADR candidate.** The
   batch event's correctness depends on a set that only the module performing
   the update can know. Decision 3 settles *how* the set is obtained
   (`RETURNING`, inside the transaction) and Decision 3's contract states what
   each side owes. What it cannot do is make a wrong set impossible from
   inside `audit/`. The question Stage 3 must answer: **should the batch
   resolution be moved out of the firing module and into a shared
   application-layer use case that owns the update, the `RETURNING`, and the
   event together?** That would make the guarantee enforceable rather than
   contractual — and it would move a Recovery Response write into the audit
   module's application layer, which is a real architectural cost, since the
   `recovery_responses` table belongs to unit 004. Two defensible answers, and
   the consequences differ. This is raised rather than decided here.
2. **The Lost-side trail's plan at the 50-Recovery-Response shape.** Decision 7
   commits to no new index. Stage 5 must seed that shape, assert the plan is
   an index scan with no sort, and assert the p95 is inside the 1 s budget. If
   the plan degrades, Stage 5 raises the index question rather than assuming
   it away.
3. **The `event_type` names for the sixteen Lost-side events.** The catalog
   needs a stable key per event (bolt 001 used `claim.submitted`,
   `recovery_response.determined_match_confirmed` as its examples, and the
   UX spine's §17.4 icon table names the events in prose). The names must be
   the same strings bolt 001's `event-catalog.ts` and bolt 002's filter
   already use, and Unit 007's action-type filter will offer them. Stage 4
   reconciles the names against the existing catalog rather than inventing a
   second vocabulary.
4. **Whether event 16's message text is subject to the same retention
   treatment as FR-31 event 14.** Carried from Stage 1's Open item 4. FR-31
   event 14 says "message text (subject to retention)"; FR-48 event 16 says
   only "message text". The audit context does not decide retention, but the
   value is stored, so the design needs to know which rule governs it.
5. **The `event_type` check constraint.** Bolt 001 left the `event_type`
   discriminator as text with the mapping asserted in the domain layer.
   Sixteen new type strings do not change that decision, but Stage 4 must
   confirm that the domain-layer assertion is exhaustive over the new types
   and that a Lost-side type with a mismatched number is refused.
6. **The firing modules are not built by this bolt.** The factory is the
   contract units 002, 004, and 005 will call. Stage 4 implements the factory
   and its guards, and the story's cross-unit criterion is discharged by tests
   that exercise the factory the way each firing module will use it — not by
   the firing modules themselves, which do not exist yet.

## Story coverage

| Story criterion | Discharged by |
|---|---|
| Any Recovery Response transition commits its FR-48 event from 15–30 | The factory's thirteen methods; the catalog's sixteen entries; `AuditWriter` (reused) writes inside the caller's transaction |
| Events 18/19 store `determined_by` and `recorded_by` as two distinct values | `DeterminationDraft` with two required fields; `DeterminationActorError` refusing a missing half, a duplicated half, or a maker who is not the owner; the existing `determined_by_user_id` and `recorded_by_administrator_id` columns |
| The Lost Returned closeout commits its events in the same transaction | Decision 4 — `recordReturnedCloseout` writes 26 and 30 together; `recordReturnedConfirmed` writes 21/22; all inside the caller's single transaction, and all rolled back together. **The criterion's literal "24 through 26 and 30" conflicted with the frozen PRD; the owner confirmed the PRD's reading on 2026-10-27 and the criterion was corrected to "21 or 22, 26, and 30".** The design enforces the PRD's reading structurally: no method can write 24 or 25 inside a Returned transaction. |
| The trail covers submission, selection, determination, closeout or closure, and the reason for each terminal resolution | Events 15, 17, 18/19, 21/22 or 24/25, and 26/27/30 — each under `parent_type = 'report'`, `parent_id` = the Lost report; events 24 and 25 carry the `reason` verbatim; the batch events name every response they resolved and its prior status |
| Events from unit 004 and unit 005 appear under the same parent with no gap | Decision 1 (one catalog), Decision 6 (one parent for every report-level event), the unit-ownership map in the domain model, and the no-gap trace of events 15, 17, 18, 21, 26, 29, 30 |
| Audit reasons are stored verbatim even where user-facing copy was softened | The `reason` column, populated with the administrator's string unchanged; the `verbatim reason` boundary rule; events 24 and 25's field sets |

## Completion criteria

- [x] Architectural pattern selected and documented
- [x] Layer structure defined
- [x] API contracts designed
- [x] Data persistence planned (no new tables or columns; the batch read mechanism and the index question specified)
- [x] Security approach documented
- [x] NFR approach planned
- [x] Integration points documented
- [x] Story criteria mapped to the design
- [x] Open items carried forward, with the ADR candidate named
- [x] The story's criterion 3 conflict with the frozen PRD recorded, with the reading the design is built on stated, and owner confirmation requested — **confirmed 2026-10-27; the story's criterion 3 and the bolt's success criterion were corrected to "21 or 22, 26, and 30"**
