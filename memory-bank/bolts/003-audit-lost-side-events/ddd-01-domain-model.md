---
unit: 006-audit-and-observability
bolt: 003-audit-lost-side-events
stage: model
status: complete
created: 2026-10-26T13:20:00Z
updated: 2026-10-26T13:20:00Z
intent: 001-findback-lost-and-found
stories:
  - 002-lost-side-audit-events
---

# Static Model - Audit and Observability (Lost-side events)

> **Stage 1 output.** Documentation only — no source code was read, written, or
> modified to produce this artifact, per the DDD bolt type's Stage 1 constraint.
> The catalog below is transcribed from the frozen PRD, not invented here.

## Bounded Context

**Audit and Observability** owns the durable, defensible record of what happened
in FindBack. This bolt models the **Lost-side half** of that record: FR-48 events
15–30, covering the Recovery Response workflow.

It is a **supporting** bounded context. It depends on nothing, and every other
context writes through it. It does **not** decide which event fires — that belongs
to the acting context. It records whatever event is emitted, and refuses to record
anything it was not given.

This bolt **extends** the model built in `001-audit-core`; it does not replace
it. `AuditEvent`, the event catalog, the append-only guarantees, the write path,
and the read path already exist and are tested. What is new here is the
**Lost-side catalog**: sixteen events, their field sets, their firing triggers,
and the rules that keep them coherent across the unit boundary.

| Concern | Owner |
|---|---|
| The Lost-side event catalog (FR-48 events 15–30) | Audit context (numbering and field set are frozen) |
| Which Lost-side event fires for a given business action | The acting unit (004, 005, 002) |
| The `RecoveryResponse` status machine | Unit 004 |
| The Lost-report lifecycle | Unit 004 (FR-42), with 005 for Returned/Closed |
| Audit event structure, write path, immutability | Audit context (bolt `001`) |
| Audit-trail reads and read logging | Audit context (bolt `002`) |

**Boundary rule — unchanged from bolt 001.** The audit context has no knowledge
of Recovery Response or Lost-report lifecycles. It knows *that* an event
happened, *who* did it, *when*, and *what the PRD says that event must carry*.
Any rule requiring interpretation of business state ("was this response
`Submitted`?") is evaluated by the caller and passed in as a value.

## Domain Entities

No new entity is introduced by this bolt. The Lost-side events are recorded as
`AuditEvent` records, exactly as the Found-side events are. This is deliberate:
the trail is one sequence, and a reader of a Lost report's trail must not have
to know that some of its rows came from a different catalog.

| Entity | Properties | Business Rules |
|---|---|---|
| **AuditEvent** (reused) | id, eventNumber (15–30 for this bolt), eventType, parentType, parentId, actorId, actorRole, actingAdministratorId, determinedByUserId, recordedByAdministratorId, reason, previousValues, changedFields, metadata, occurredAt | Append-only. `eventNumber` is a frozen FR-48 catalog number. The same three-layer append-only enforcement from bolt 001 applies — interface, single writer, database trigger. |
| **AuditReadLog** (reused) | id, administratorId, query, filters, resultCount, readAt | Unchanged by this bolt. A Lost report's trail is read exactly like any other. |
| **QuotaSnapshot** (reused) | id, resource, usedAmount, limitAmount, observedAt | Unchanged by this bolt. |

### The FR-48 catalog — events 15 to 30

Transcribed from the frozen PRD, FR-48. The PRD's wording is preserved; the
**Fires when** column is the audit context's statement of the trigger, derived
from the PRD's own consequences and the status machine in FR-41.

| # | Event | Actor | Required fields | Fires when |
|---|---|---|---|---|
| 15 | **Recovery Response submitted** | responder (member) | Lost report ID, response ID, **where-found**, **observed identifying details**, date found, image presence | A Recovery Response is created in `Submitted` |
| 16 | **Message posted in per-Recovery-Response thread** | owner / responder / administrator | response ID, **message text** | A message is posted to a per-Recovery-Response thread |
| 17 | **Recovery Response selected for verification** | Lost-report owner | Lost report ID, response ID | The owner selects one response; the response becomes `Selected for Verification` and the report becomes `Verification Pending` |
| 18 | **Recovery Response determined Match Confirmed** | **administrator** (system actor performing the write) | `determined_by` (Lost-report owner), `recorded_by` (acting administrator), Lost report ID, response ID, verification timestamp | The acting administrator records the owner's Match Confirmed determination |
| 19 | **Recovery Response determined Not a Match** | **administrator** (system actor performing the write) | `determined_by` (Lost-report owner), `recorded_by` (acting administrator), Lost report ID, response ID, verification timestamp | The acting administrator records the owner's Not a Match determination |
| 20 | **Recovery Response withdrawn by responder** | responder (member) | Lost report ID, response ID | A responder withdraws their own response while it is `Submitted` and not selected |
| 21 | **Returned confirmed (Lost report, default receiver)** | administrator | Lost report ID, receiver (Lost-report owner) | The administrator confirms physical return to the default receiver |
| 22 | **Returned confirmed (Lost report, substitute receiver)** | administrator | Lost report ID, substitute receiver name, authorization affirmation, relationship | The administrator confirms physical return to an authorized substitute receiver |
| 23 | **Lost report withdrawn by reporter** | Lost-report owner | Lost report ID, prior Lost lifecycle status (`Open` or `Verification Pending`, pre-Match-Confirmed only) | The owner withdraws the Lost report |
| 24 | **Lost report closed by Administrator (normal)** | administrator | Lost report ID, reason, prior Lost lifecycle status (`Open` or `Verification Pending`, pre-Match-Confirmed only) | An administrator closes the Lost report normally — moderation, organization removal, owner deactivation, or close while `Verification Pending` before Match Confirmed |
| 25 | **Lost report cancellation after Match Confirmed (exceptional)** | administrator | Lost report ID, exceptional reason, prior Lost lifecycle status (`Verification Pending`), prior selected response ID with its status at close time (`Match Confirmed`) | An administrator cancels a Match-Confirmed Lost report before Returned |
| 26 | **Lost report Returned — automatic child response resolution (batch)** | **system**, identifying the administrator who confirmed Returned | Lost report ID, list of all non-selected non-terminal child response IDs transitioning to `Resolved — Report Returned`, explicit reference to the matched selected response ID transitioning under event 30 | The Lost report transitions to `Returned` |
| 27 | **Lost report Closed — automatic child response resolution (batch)** | **system**, identifying the administrator or reporter who triggered closure | Lost report ID, list of child response IDs transitioning to `Resolved — Report Closed` | The Lost report transitions to `Closed` |
| 28 | **Lost report Verification Pending returned to Open after Not a Match** | **system**, identifying the administrator who recorded the outcome | Lost report ID, prior selected response ID | The selected response reaches `Not a Match` and the report returns to `Open` |
| 29 | **Lost report current state transition to Verification Pending** | **system**, identifying the owner who selected | Lost report ID, selected response ID | The Lost report transitions to `Verification Pending` |
| 30 | **Recovery Response transition to Completed — Report Returned (individual terminal)** | **system**, identifying the administrator who confirmed physical return | Lost report ID, response ID, the matched selected response's new canonical status (`Completed — Report Returned`) | The matched selected response reaches `Completed — Report Returned` |

### The pairing rules that make events 26/27/30 coherent

These are the load-bearing rules of this bolt. Getting them wrong produces a
trail that looks complete but cannot be reconstructed.

1. **Event 26 and event 30 fire in the same transaction.** Event 26 is the
   parent Lost-report-level batch record of the whole Returned transaction; event
   30 is the individual matched-response terminal record. The PRD states both
   exist "so the audit trail can be reconstructed either at the parent
   Lost-report level (event 26) or at the individual response level (event 30)."
   Neither is a substitute for the other.
2. **Event 26 references event 30 by response ID.** The matched selected
   response's ID appears in event 26's metadata as an explicit cross-reference;
   event 26's own list covers only the **non-selected** non-terminal responses.
3. **Events 26 and 27 are batch events; there is no per-child event for a
   non-matched response.** A non-matched response that resolves to
   `Resolved — Report Returned` or `Resolved — Report Closed` is named **in the
   parent's batch event** and gets no event of its own. Event 30 is the sole
   exception, because the matched response's successful terminal status is the
   outcome of the recovery and is recorded individually.
4. **Event 27 covers every closure route**, whether triggered by an
   administrator (event 24), by an administrator's exceptional cancellation
   (event 25), or by the reporter's withdrawal (event 23). The batch resolution
   is one event because the resolution is one operation, whatever caused it.
5. **Events 28 and 29 record the Lost report's own lifecycle transitions.** The
   Recovery Response status changes they accompany (the selection, the Not a
   Match) are recorded by events 17 and 19. So the Not-a-Match path writes
   events **19, 28** (and no selection event, because the selection happened
   earlier), and the selection path writes events **17, 29**.

### Which unit fires which event

The bolt's success criteria explicitly span the unit boundary — "the trail shows
no gap between events emitted by Unit 004 and Unit 005". This map is the
answer to that criterion, derived from the FR ownership in the unit briefs.

| Event | Fired by | Unit | Bolt |
|---|---|---|---|
| 15 | `submitRecoveryResponse` | 004-lost-side-recovery | 015-lost-response-submit |
| 16 | `postResponseMessage` | 004-lost-side-recovery | 018-lost-threads |
| 17 | `selectForVerification` | 004-lost-side-recovery | 017-lost-lifecycle-determination |
| 18 | `recordMatchConfirmed` | 004-lost-side-recovery | 017-lost-lifecycle-determination |
| 19 | `recordNotAMatch` | 004-lost-side-recovery | 017-lost-lifecycle-determination |
| 20 | `withdrawResponse` | 004-lost-side-recovery | 015-lost-response-submit |
| 21, 22 | `confirmReturned` (Lost side) | 005-returns-and-handover | 019-returns-closeout |
| 23 | `withdrawReport` (Lost side) | **002-reporting-and-listings** | 008-reporting-lifecycle |
| 24 | `closeReport` (Lost side, normal) | 005-returns-and-handover | 020-returns-moderation |
| 25 | `closeReport` (Lost side, exceptional) | 005-returns-and-handover | 020-returns-moderation |
| 26 | `confirmReturned` (Lost side) | 005-returns-and-handover | 019-returns-closeout |
| 27 | Lost report reaches `Closed` | 002 (withdrawal) or 005 (close) | 008 / 020 |
| 28 | `recordNotAMatch` | 004-lost-side-recovery | 017-lost-lifecycle-determination |
| 29 | `selectForVerification` | 004-lost-side-recovery | 017-lost-lifecycle-determination |
| 30 | `confirmReturned` (Lost side) | 005-returns-and-handover | 019-returns-closeout |

**Event 23's owner is worth stating plainly, because it is the one place the
audit context must not decide ownership for itself.** FR-11 (withdraw own
report) is assigned to **unit 002**, not unit 004 — unit 002's brief lists
`withdrawReport` as one of its key operations and FR-11 in its assigned
requirements. Unit 004's brief lists FR-11 nowhere; it owns the Recovery
Response lifecycle, not the report lifecycle. So the reporter's Lost-side
withdrawal is fired from unit 002's withdrawal operation, and it must emit
**event 23** (not FR-31 event 9, which is Found-side only). Unit 002's withdrawal
also resolves the child Recovery Responses to `Resolved — Report Closed`, which
means it also fires **event 27**.

**This is a cross-unit coupling that Stage 2 must settle, not Stage 1.** The
audit context records event 23 and event 27; it does not decide that unit 002
should fire them. Two candidate placements exist — unit 002 emits the Lost-side
audit events directly, or unit 002 calls a Lost-side event factory owned by
unit 004. The second keeps the catalog in one place; the first keeps the
withdrawal transaction in one place. This is raised as **Open item 1** below.

## Value Objects

| Value Object | Properties | Constraints |
|---|---|---|
| **EventNumber** (reused, narrowed) | value (15–30 for this bolt) | Exactly one of the sixteen frozen FR-48 numbers. Never minted by application code. Equality by value. Bolt 001 already enforces the 1–30 range at the database level. |
| **LostSideAuditEventType** | catalog key | Identifies one of the sixteen FR-48 event types. Every type maps to exactly one EventNumber in 15–30. A type with a number outside that range is not a Lost-side type and is refused. |
| **DeterminationActor** (reused) | determinedByUserId, recordedByAdministratorId | The owner-determines / administrator-records pair. Both mandatory, and always distinct **in role**: `determinedByUserId` is the Lost-report owner (a member), `recordedByAdministratorId` is the acting administrator. Used by events 18 and 19 only. |
| **RecoveryResponseRef** | recoveryResponseId, lostReportId | Identifies the response an event is about, together with the Lost report that owns it. Both are required on every event in this catalog, so a Lost-side event can never be read without knowing which report it belongs to. |
| **PriorLifecycleStatus** | status, side | The Lost report's lifecycle status immediately before the transition. For this bolt the value set is `Open` / `Verification Pending` only — a Lost report never holds a Found-side status, and `Match Confirmed` is a **Recovery Response** status, never a Lost-report status (the PRD says so explicitly, twice). |
| **PriorResponseStatus** | status | The response's status immediately before the transition. Value set: the eight canonical FR-41 statuses, verbatim. Used by events 26, 27, and 30 to record the state the batch moved the response out of. |
| **BatchResolution** | responseIds, targetStatus | The list of child response IDs a batch event resolves, and the terminal status they all reach. Used by events 26 and 27. Non-empty: a batch event with an empty list records nothing and must not be written. |
| **ChildResponseReference** | responseId, newStatus, crossReference | The matched selected response named inside event 26: its ID and the status it reaches, plus the event number it is recorded under (30). This is what ties the batch and individual records together. |
| **ImagePresence** | present (boolean) | Event 15 records whether a candidate image was attached, not the image itself. Images live in private Blob storage; the trail records presence only. |
| **ActorRef** (reused) | actorId, actorRole | `actorRole` ∈ {member, administrator, system}. A `system` actor additionally names the human who caused the action — `actingAdministratorId` for events 26, 28, 30; the owner for event 29. **No event in this catalog is anonymous.** |
| **AuditPayload** (reused) | metadata | Event-specific fields with no typed column. Used here for event 15's where-found and identifying details, event 16's message text, event 26's and 27's batch lists, and event 30's status change. Never carries a password, hash, or token. |

### Actor model for events 26–30 — the rule that is easiest to get wrong

The PRD describes events 26–30 with a `system` actor that *identifies* a human.
This is a pattern, not five separate exceptions, and it differs from FR-31
event 5's `triggered_by` / `triggering_action` pair.

| Event | `actorRole` | The human it identifies | Column |
|---|---|---|---|
| 26 | `system` | The administrator who confirmed Returned | `actingAdministratorId` |
| 27 | `system` | The administrator **or** reporter who triggered closure | `actingAdministratorId` |
| 28 | `system` | The administrator who recorded the Not a Match outcome | `actingAdministratorId` |
| 29 | `system` | The **owner** who selected | `actorId` (the owner is a member, not an administrator) |
| 30 | `system` | The administrator who confirmed physical return | `actingAdministratorId` |

Two consequences follow, and both matter:

- **`actorId` on a system-actor event must be a real user id.** The schema's
  `actor_id` is `uuid not null`. A system event that cannot name a human has no
  valid row. The audit context therefore requires every system-actor event to
  carry the causing human's id in `actorId` (event 29) or in
  `actingAdministratorId` (events 26, 27, 28, 30), and refuses an event that
  names neither. This is the same rule bolt 001 already recorded: "a `system`
  actor additionally names the human who caused the action, so no event is
  anonymous."
- **Event 29's human is an owner, not an administrator.** It is the one event
  in the catalog where the causing human is a plain member. Modelling it with an
  administrator-only field would lose the owner, which is precisely the
  distinction event 17 already records.

Event 27's human may be either an administrator or the reporter, so its
`actingAdministratorId` is nullable while `actorId` remains the system id.

## Aggregates

| Aggregate Root | Members | Invariants |
|---|---|---|
| **AuditTrail** (per parent entity — reused) | AuditEvent records, addressed by ParentRef | Unchanged from bolt 001, plus: 1. A Lost report's trail contains **both** the events fired by unit 004 and those fired by unit 005 (and unit 002 for withdrawal), in one sequence under one parent, with no gap between them. 2. Every event numbered 15–30 appears exactly once per occurrence. 3. The trail remains administrator-only (FR-32). |
| **AuditEvent** (as a record — reused) | its own immutable fields | Unchanged from bolt 001, plus: 4. Events 18 and 19 carry `determined_by` and `recorded_by` as two distinct values, always present. 5. Events 26 and 30 are written in the same transaction; neither may exist without the other on a Returned closeout. 6. A batch event (26, 27) names every child response it resolves. |
| **LostSideAuditTrail** (a *view* of the trail, not a new aggregate) | the FR-48 events of one Lost report | 1. Reverse-chronological, 25 per page, no infinite scroll (UX-OQ-C). 2. Readable only by an administrator. 3. A read is recorded, exactly as for any other trail. 4. **No gap**: an administrator reading a Lost report's trail sees submission, selection, determination, closeout, and the reason for each terminal resolution — in the order they happened. |

**On `LostSideAuditTrail` not being a separate aggregate.** It is the same
`AuditTrail` read with a different parent, exactly as bolt 002 modelled the
contextual and whole-trail reads. Introducing a second aggregate root would give
the trail two write paths and two authorization gates, and the gap criterion
would become unenforceable. It is named here as a *view* so that the "no gap"
criterion has a subject, not because it has a separate lifecycle.

### Aggregate boundary note — the Lost-side batch is a cross-context operation

Events 26, 27, and 30 are **batch** records. Their unit of work is a Lost
report plus all its Recovery Responses, which are aggregates owned by **two**
different contexts: the Lost report belongs to units 002/004, and the Recovery
Responses belong to unit 004.

The audit context does **not** own that batch. It records it. The batch
transaction belongs to the acting unit (005 for Returned, 002 or 005 for
Closed), which opens the transaction, performs the state changes, and writes the
audit events inside it. The audit context's only obligation is that the event
records the resolution completely and truthfully — every child response ID, and
the status it reached.

## Domain Events

No new domain-event *type* is introduced. The Lost-side events are recorded
through the same `audit.recorded` port as bolt 001. What is new is the set of
**triggers** that produce them.

| Trigger | The events it writes |
|---|---|
| Recovery Response submitted | 15 |
| Thread message posted | 16 |
| Response selected for verification | 17, **29** |
| Match Confirmed recorded | 18 |
| Not a Match recorded | 19, **28** |
| Response withdrawn by responder | 20 |
| Returned confirmed (default receiver) | 21, **26**, **30** |
| Returned confirmed (substitute receiver) | 22, **26**, **30** |
| Lost report withdrawn by reporter | 23, **27** |
| Lost report closed by administrator (normal) | 24, **27** |
| Lost report closed by administrator (exceptional) | 25, **27** |
| Recovery Response → `Resolved — Report Returned` (non-selected) | *none of its own* — named inside event 26 |
| Recovery Response → `Resolved — Report Closed` | *none of its own* — named inside event 27 |

**The bolded numbers are the ones that are easy to miss.** A response
transition does not always produce its own event. `Selected for Verification` is
recorded by event 17, and the report's move to `Verification Pending` by event
29 — two events for one action. `Not a Match` is event 19, and the report's move
back to `Open` is event 28 — again two events for one action. A non-matched
response resolving to `Resolved — Report Returned` produces no event of its own
at all; it is named in event 26's batch list.

**Returned confirmed fires three events in one transaction** — 21 or 22, then
26, then 30 — for what a member experiences as one action. This is the PRD's
design, not a duplication: 21/22 records the handoff, 26 records the parent's
batch resolution, and 30 records the matched response's individual success.

### The no-gap trace

This is the criterion the bolt exists to satisfy. The PRD's own climax beat
names the events: "FR-48 events 15, 17, 18, 21, 26, and 30 proves which
response was submitted, which was selected, what Maya determined, who recorded
the determination, who administered the handoff, that the parent Lost report
reached `Returned`, and that the matched selected Recovery Response reached
`Completed — Report Returned`."

| Step | Events | Who |
|---|---|---|
| Sam submits a response | 15 | responder |
| Maya selects Sam's response | 17, 29 | owner |
| Riley records Maya's Match Confirmed | 18 | administrator |
| Riley confirms physical return to Maya | 21, 26, 30 | administrator |
| **Total** | **15, 17, 18, 21, 26, 29, 30** | — |

The PRD names six; the complete trace is seven, because event 29 (the report's
own transition to `Verification Pending`) is required by FR-42 and is not
mentioned in that particular sentence. The trail has no gap.

## Domain Services

| Service | Operations | Dependencies |
|---|---|---|
| **LostSideEventCatalog** | `numberFor(eventType)` → EventNumber 15–30 or null; `requiredFieldsFor(number)` → field set; `isLostSideType(eventType)`; `eventsFor(trigger)` → the set of numbers one trigger writes | The frozen FR-48 catalog |
| **DeterminationActorGuard** | `assertDeterminationPair(event)` — refuses an event 18 or 19 that lacks either half of the pair, or that carries the same identity in both roles | The PRD's actor model for events 18/19 |
| **BatchResolutionGuard** | `assertBatchComplete(event)` — refuses a batch event (26, 27) that does not name every child response it resolves; `assertPairing(event26, event30)` — refuses a Returned closeout that wrote one without the other | The PRD's events 26/27/30 rules |
| **SystemActorResolver** | `resolveFor(trigger, cause)` → the `ActorRef` a system-actor event carries, refusing to produce an actor that names no human | The PRD's "system, identifying …" clauses |
| **AuditWriter** (reused) | `record(event)` — append one event to the caller's open transaction | AuditTrail, transaction context supplied by the caller |

**On the guards.** The PRD's rules about events 18/19 and events 26/27/30 are
stated as consequences that are "testable", and they are the kind of rule that a
caller can satisfy accidentally in one place and violate in another. Putting
them behind named guards, rather than leaving them as prose in each calling
unit, is what makes the story's acceptance criteria mechanically checkable.

## Repository Interfaces

**No new repository is introduced by this bolt.** The catalog is data, not
storage — the event numbers and their required field sets are already held by
bolt 001's `EventCatalog`, which the Stage 2 design will extend from 1–30 to
name the Lost-side types explicitly.

| Repository | Entity | Methods | Change |
|---|---|---|---|
| **AuditEventRepository** (reused) | AuditEvent | `append(event, transaction)` — insert only; `listByParent(parentRef, cursor, limit)`; `listByEventNumber(number, cursor, limit)`; `countByParent(parentRef)`. **No `update`, no `delete`, no `upsert`.** | Unchanged |
| **AuditReadLogRepository** (reused) | AuditReadLog | `append(read, transaction)`; `listByAdministrator(administratorId, limit)` | Unchanged |
| **QuotaSnapshotRepository** (reused) | QuotaSnapshot | Unchanged | Unchanged |

## Ubiquitous Language

| Term | Definition |
|---|---|
| **FR-48 event** | One of the sixteen numbered Lost-side audit events, 15–30. |
| **Determination event** | FR-48 event 18 or 19 — the owner's physical determination, recorded by an administrator. |
| **Determination pair** | The `determined_by` / `recorded_by` two-part identity on a determination event. |
| **Batch event** | FR-48 event 26 or 27 — a parent Lost-report-level record of many child responses resolving at once. |
| **Individual terminal event** | FR-48 event 30 — the matched selected response's own `Completed — Report Returned` record. |
| **Matched selected response** | The one Recovery Response on a Lost report that was selected for verification and reached `Match Confirmed`. It is the only response that reaches `Completed — Report Returned`. |
| **Non-selected non-terminal response** | Any other response still in `Submitted`, `Selected for Verification`, or `Match Confirmed`. It reaches `Resolved — Report Returned` or `Resolved — Report Closed`. |
| **Batch resolution** | The single operation that moves every non-terminal child response to its terminal status when the parent report reaches `Returned` or `Closed`. |
| **Actor-model event** | An event whose actor is a human directly (15, 16, 17, 20, 21, 22, 23, 24, 25) rather than the system performing an automatic transition. |
| **System-actor event** | An event whose actor is the system performing an automatic transition (26, 27, 28, 29, 30). It always names the human who caused it. |
| **Standing by** | The display-only condition in which a `Submitted` response is rendered as `Submitted — Standby` because another response is selected. **Not a persisted status.** |
| **Exceptional cancellation** | An administrator closing a Match-Confirmed Lost report before Returned, with a documented reason. Recorded as event 25. |
| **Pre-Match-Confirmed** | The window before a `Match Confirmed` determination is recorded. Determines which closure event applies: 24 (normal) or 25 (exceptional). |
| **No gap** | The property that a Lost report's trail contains every event fired by unit 004, unit 005, and unit 002, in order, under one parent. |
| **Verbatim reason** | An audit reason stored exactly as given, even where the user-facing copy for the same event was softened (OQ-5). Events 24 and 25 carry one. |

## Boundary rules

**The audit context does not own the Lost-side status machine.** It records the
transitions that FR-41 defines. If a caller reports a transition that FR-41
forbids, the defect is in the caller's state machine, not in the audit record.

**The audit context does not decide who fires an event.** The unit-ownership map
above is the record of that decision. Where two units can reach the same
transition, the transition's owner fires the event.

**A batch event is never a substitute for the events around it.** Event 27 does
not replace events 23, 24, or 25; it records the child-response resolution that
accompanies them. Likewise event 26 does not replace 21/22 or 30.

**A report-level lifecycle event is not a response-level event.** Events 28 and
29 record the Lost report's own transitions; the response transitions that
accompany them are events 17 and 19. Recording only one half leaves the trail
unreconstructable.

**Verbatim reasons.** Events 24 and 25 carry the administrator's closure or
cancellation reason. It is stored exactly as given, even where the
user-facing copy is softer. The operational log never carries it.

**Sensitive fields are permitted only where the catalog names them.** Event 15
carries where-found and observed identifying details; event 16 carries the
message text. These are the only Lost-side events that may hold sensitive
values, and they are administrator-only records (FR-32). The operational log
never carries them. Passwords, hashes, and tokens are never written to either.

## Conflict — the story's criterion 3 named events 24/25 in the Returned closeout

**Raised in Stage 2; recorded here because Stage 1 did not check it. Resolved
on owner confirmation 2026-10-27.**

Story `002-lost-side-audit-events` acceptance criterion 3 read: "**Given** the
Lost Returned closeout in Unit 005, **When** it commits, **Then** events **24
through 26 and 30** are recorded in the same transaction." The bolt's own
success criteria repeated it.

Events 24 and 25 are **Closed-path** events, and FR-21 makes `Returned →
Closed` **unavailable** ("Returned is terminal"). A Lost report that reached
`Returned` can never be closed, so neither 24 nor 25 can occur in the Returned
closeout's transaction. The PRD's own climax beat names the Returned path's
events as "15, 17, 18, 21, 26, and 30" — no 24, no 25.

The reading this model and its Stage 2 design are built on: the Returned
closeout writes events **21 or 22, 26, and 30**; the Closed closeout writes
events **23, 24, or 25, and 27**. The phrase "24 through 26" most likely meant
"21, 22, 26, and 30".

**The owner confirmed this reading on 2026-10-27.** The story's acceptance
criterion 3 and the bolt's success criterion were corrected to name **21 or
22, 26, and 30**, and both corrections are annotated in place with the
reasoning. No source code changed as a result: the Stage 4 implementation
already enforced the PRD's reading structurally — `recordReturnedCloseout` has
no path to event 24 or 25, and `recordClosedCloseout` is the only method that
reaches event 27. See the conflict section in `ddd-02-technical-design.md` for
the full argument.

## Open items carried to Stage 2

**Open item 1 — where the Lost-side catalog lives when two units can fire the
same transition.** Unit 002 owns reporter withdrawal (FR-11) and therefore
fires events 23 and 27; unit 005 owns administrator close and therefore fires
events 24, 25, and 27. Both fire event 27. The catalog must exist in exactly
one place, or the two paths can drift. Two placements are candidates: unit 002
emits the Lost-side events through a shared event factory owned by unit 004, or
each unit emits its own events through the shared `AuditWriter`. Stage 2 must
settle which, because it decides where `LostSideEventCatalog` and the guards
live and what the cross-unit test boundary looks like.

**Open item 2 — how the batch event's child list is assembled.** Events 26 and
27 name every child response they resolve. That list must be the *actual* set
the transaction resolved, not a re-query afterwards (which could see a different
set) and not a list passed in from a caller that might omit one. Stage 2 must
settle whether the batch event is assembled inside the same transaction that
performs the resolution, or read back from the rows the transaction just wrote.

**Open item 3 — the `Resolved — Report Returned` / `Resolved — Report Closed`
status transitions have no event of their own.** The story's acceptance
criterion "the trail covers … the reason for each terminal resolution" is
satisfied by the batch event's list, but only if the list is complete. This
depends on Open item 2 and is the same question asked from the other side.

**Open item 4 — whether event 16's message text is subject to the same
retention treatment as FR-31 event 14.** FR-31 event 14 says "message text
(subject to retention)"; FR-48 event 16 says only "message text". The audit
context does not decide retention, but it does need to know whether the two are
governed by the same rule, because it stores the value.

**Open item 5 — the Lost-side trail's read path needs no new capability.**
Bolt 002 already built the contextual trail read, the administrator gate, the
read recording, and the pagination. Nothing in this catalog requires a new
route, a new filter, or a new index. The one thing that *is* new is the volume
of the Lost-side events on a single report: a report with many responses
produces many rows under one parent. Stage 2 should confirm the existing
`idx_audit_events_trail` index serves that shape and needs no new index.

## Story coverage

| Story criterion | Covered by |
|---|---|
| Any Recovery Response transition commits its FR-48 event from 15–30 | The catalog table (all sixteen), the trigger table, `AuditWriter` (reused) |
| Events 18/19 store `determined_by` and `recorded_by` as two distinct values | `DeterminationActor`, `DeterminationActorGuard`, `Determination pair` term, AuditEvent invariant 4 |
| Events 21 or 22, 26, and 30 recorded in the same transaction as the Lost Returned closeout | The pairing rules (1–3), `BatchResolutionGuard`, `BatchResolution`, `ChildResponseReference`, the trigger table, AuditEvent invariant 5 |
| Trail covers response submission, provisional selection, determination, closeout or closure, and the reason for each terminal resolution | The no-gap trace, `LostSideAuditTrail` invariants, the trigger table, `Verbatim reason` term, events 24/25 carrying the reason |
| Events from Unit 004 and Unit 005 appear under the same parent report with no gap | The unit-ownership map, `LostSideAuditTrail` invariant 1, the `No gap` term, `AuditTrail` invariant 1 |
| Audit reason stored verbatim even where user-facing copy was softened | `Verbatim reason` term, the boundary rule on verbatim reasons, events 24 and 25's field sets |

## Completion criteria

- [x] All domain entities identified and documented
- [x] Business rules captured for each entity
- [x] Aggregate boundaries defined
- [x] Domain events specified
- [x] Repository interfaces defined
- [x] All stories covered by domain model
- [x] Ubiquitous language documented
- [x] The firing unit for every event is stated, including the cross-unit cases
