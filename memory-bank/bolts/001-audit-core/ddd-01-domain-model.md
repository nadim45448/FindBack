---
unit: 006-audit-and-observability
bolt: 001-audit-core
stage: model
status: complete
created: 2026-10-26T08:23:50Z
updated: 2026-10-26T08:23:50Z
intent: 001-findback-lost-and-found
stories:
  - 001-append-only-audit-writes
  - 003-non-numbered-audit-records
  - 004-append-only-enforcement
  - 006-operational-logging-and-quota
---

# Static Model - Audit and Observability

> **Stage 1 output.** Documentation only — no source code was read, written, or
> modified to produce this artifact, per the DDD bolt type's Stage 1 constraint.
> Behaviour is defined by the frozen PRD; the audit catalog below is transcribed
> from it, not invented here.

## Bounded Context

**Audit and Observability** owns the durable, defensible record of what happened
in FindBack, and the operational evidence that the system is running inside its
$0 budget.

It is a **supporting** bounded context: it depends on nothing, and every other
context writes through it. It does **not** decide business rules — deciding
*which* event fires for an action belongs to the acting context (accounts,
reports, claims, recovery, returns). This context records whatever event is
emitted, and refuses to record anything it was not given.

| Concern | Owner |
|---|---|
| The audit event catalog (FR-31 events 1–14, FR-48 events 15–30) | Audit context (numbering and field set are frozen) |
| Which event fires for a given business action | The acting unit |
| Audit event structure, write path, immutability | Audit context |
| Audit-trail reads and read logging | Audit context (bolt `002-audit-reads`) |
| Lost-side events 15–30 | Audit context (bolt `003-audit-lost-side-events`) |
| Structured operational logging | Audit context (this bolt) |
| Quota monitoring and refusal | Audit context (this bolt) |

**Boundary rule.** The audit context has no knowledge of Claim, Recovery
Response, or Report lifecycles. It knows *that* an event happened, *who* did it,
*when*, and *what the PRD says that event must carry*. Any rule requiring
interpretation of business state ("was this report `Open`?") is evaluated by the
caller and passed in as a value.

## Domain Entities

| Entity | Properties | Business Rules |
|---|---|---|
| **AuditEvent** | id, eventNumber (nullable — numbered events carry 1–30; non-numbered records carry null), eventType, parentType, parentId, actorId, actorRole, actingAdministratorId, determinedByUserId, recordedByAdministratorId, reason, previousValues, changedFields, metadata, occurredAt | Append-only. No update path, no delete path. `eventNumber` is either a FR-31/FR-48 catalog number (1–30) or null — never a value outside the frozen catalog, and never a new number. An event that is written for a transition that did not commit is a defect. Retention follows the parent entity's retention rule. |
| **AuditReadLog** | id, administratorId, query, filters, resultCount, readAt | A recorded *read* of the trail — a distinct record type, not an event on the audited entity. Administrator-only. Not part of the numbered catalog. |
| **QuotaSnapshot** | id, resource, usedAmount, limitAmount, observedAt | A recorded usage reading against a verified free-tier limit. Not part of the numbered catalog. Not a purchase trigger. |

### AuditEvent — event-specific fields

The PRD assigns additional fields per event. These are **not** optional
baggage: an event missing its required field is malformed.

- **Event 1 — Report created**: reporter, report ID, name, category, type (lost/found), date, location, optional fields, image presence.
- **Event 2 — Claim submitted**: claimant, claim ID, item ID, **reason**, **identifying details**, date lost. *(see "Open conflict" below — this is the one event whose field list is contested)*
- **Event 3 — Claim approved**: administrator, claim ID, item ID.
- **Event 4 — Claim rejected by administrator**: administrator, claim ID, item ID, reason.
- **Event 5 — Claim auto-rejected**: `actor` (system), `triggered_by` (the human or system actor whose action caused the rejection), `triggering_action` (Claim approval / Found-side report withdrawal / Administrator Close), claim ID, Found report ID, auto-rejection trigger reason, timestamp. Three triggers, three fixed reason strings.
- **Event 6 — Returned confirmed (default receiver)**: administrator, item ID, receiver (claimant on the approved claim).
- **Event 7 — Returned confirmed (substitute receiver)**: administrator, item ID, substitute receiver name, authorization affirmation, relationship.
- **Event 8 — Report edited by reporter**: reporter, item ID, snapshot of changed fields.
- **Event 9 — Found report withdrawn by reporter**: Found-report owner, Found report ID, previous Found lifecycle status (`Open` or `Claim Requested`). Lost-side withdrawal is **not** recorded here.
- **Event 10 — Found report closed by Administrator**: administrator, Found report ID, previous Found lifecycle status (`Open` / `Claim Requested` / `Claim Approved` — Found statuses only), closure reason.
- **Event 11 — Registration approved**: administrator, user ID.
- **Event 12 — Registration rejected**: administrator, user ID, reason. Not exposed to the rejected user.
- **Event 13 — Account deactivated**: administrator, user ID.
- **Event 14 — Message posted in per-claim thread**: actor (claimant / finder / administrator), claim ID, message text.
- **Event 15 — Recovery Response submitted**: responder, Lost report ID, response ID, where-found, observed identifying details, date found, image presence.
- **Event 16 — Message posted in per-Recovery-Response thread**: actor (Lost-report owner / responder / administrator), response ID, message text.
- **Event 17 — Recovery Response selected for verification**: Lost-report owner, Lost report ID, response ID.
- **Event 18 — Recovery Response determined Match Confirmed**: `determined_by` (Lost-report owner), `recorded_by` (acting administrator), Lost report ID, response ID, verification timestamp.
- **Event 19 — Recovery Response determined Not a Match**: same actor model as event 18.
- **Event 20 — Recovery Response withdrawn by responder**: responder, Lost report ID, response ID.
- **Event 21 — Returned confirmed (Lost report, default receiver)**: administrator, Lost report ID, receiver (Lost-report owner).
- **Event 22 — Returned confirmed (Lost report, substitute receiver)**: administrator, Lost report ID, substitute receiver name, authorization affirmation, relationship.
- **Event 23 — Lost report withdrawn by reporter**: Lost-report owner, Lost report ID, prior Lost lifecycle status (`Open` or `Verification Pending`, pre-Match-Confirmed only). No duplicate event 9.
- **Event 24 — Lost report closed by Administrator (normal)**: administrator, Lost report ID, reason, prior Lost lifecycle status (`Open` or `Verification Pending`, pre-Match-Confirmed only).
- **Event 25 — Lost report cancellation after Match Confirmed (exceptional)**: administrator, Lost report ID, exceptional reason, prior Lost lifecycle status (`Verification Pending`), prior selected response ID with its status at close time (`Match Confirmed`).
- **Event 26 — Lost report Returned — automatic child response resolution**: actor (system, identifying the administrator who confirmed Returned), Lost report ID, list of all non-selected non-terminal child response IDs transitioning to `Resolved — Report Returned`, and explicit reference to the matched selected response ID transitioning to `Completed — Report Returned` under event 30.
- **Event 27 — Lost report Closed — automatic child response resolution**: actor (system, identifying administrator or reporter who triggered closure), Lost report ID, list of child response IDs transitioning to `Resolved — Report Closed`.
- **Event 28 — Lost report Verification Pending returned to Open after Not a Match**: actor (system, identifying the administrator who recorded the outcome), Lost report ID, prior selected response ID.
- **Event 29 — Lost report current state transition to Verification Pending**: actor (system, identifying the owner who selected), Lost report ID, selected response ID.
- **Event 30 — Recovery Response transition to Completed — Report Returned**: actor (system, identifying the administrator who confirmed physical return), Lost report ID, response ID, the matched selected response's new canonical status (`Completed — Report Returned`).

### Non-numbered records

FR-31 states that additional audit records required by other requirements join the
append-only administrator-visible history but receive **no** numbered
workflow-event identifier.

| Record | Trigger | Required fields |
|---|---|---|
| **Member profile edit** | FR-52 | actor, timestamp, changed fields, previous values |
| **Administrator report edit** | FR-53 | acting administrator, report ID, timestamp, changed fields, previous values |

Numbering these would modify a frozen catalog; omitting them would leave real
actions unrecorded. Both are therefore non-numbered.

## Value Objects

| Value Object | Properties | Constraints |
|---|---|---|
| **EventNumber** | value (1–30) | Exactly one of the thirty frozen catalog numbers, or absent. Never a value outside 1–30. Never minted by application code — only transcribed from the PRD catalog. Equality by value. |
| **AuditEventType** | catalog key | Identifies the specific event (e.g. `claim.submitted`, `recovery_response.determined_match_confirmed`). Every numbered event type maps to exactly one EventNumber; non-numbered types map to none. A type with an EventNumber must be a catalog type. |
| **ActorRef** | actorId, actorRole | `actorRole` ∈ {member, administrator, system}. A `system` actor additionally names the human who caused the action (`triggered_by` / `actingAdministratorId`), so no event is anonymous. Deactivated actors remain named — the trail is never back-filled to hide them. |
| **DeterminationActor** | determinedByUserId, recordedByAdministratorId | The owner-determines / administrator-records pair. Both parts are mandatory and always distinct in role. Used by events 18 and 19 only. |
| **ParentRef** | parentType, parentId | `parentType` ∈ {report, claim, recovery_response, account, claim_thread_message, recovery_response_thread_message}. Provides the retention link and the contextual route the trail is read from. |
| **FieldChangeSet** | changedFields, previousValues | Pairs of field name and prior value. Stored verbatim — never rendered as HTML, never interpreted. On an FR-53 edit this is what makes a moderation edit defensible after the fact. |
| **AuditPayload** | metadata | Free-form key/value detail for event-specific fields not covered by a typed property. Must not contain any FR-37 Sensitive Field. |
| **QuotaThreshold** | resource, limitAmount, warnAt (0.7), criticalAt (0.9) | A resource has exactly two warning thresholds and one refusal threshold. A quota condition may never cause a purchase or a plan upgrade. |
| **RequestContext** | requestId, actorId, actorRole, action, targetType, targetId, outcome | The operational log line. `requestId` is present on every line. `outcome` ∈ {success, denied, error}. |

## Aggregates

| Aggregate Root | Members | Invariants |
|---|---|---|
| **AuditTrail** (per parent entity) | AuditEvent records, addressed by ParentRef | 1. Append-only — no update, no delete, for any actor including administrators. 2. Every event's `eventNumber` is null or a frozen catalog number. 3. An event exists only if the state change it describes committed. 4. Retention follows the parent entity's rule; the FR-10 hard delete of an interaction-free `Open` report removes its trail with it — the **only** deletion path. 5. `Returned` / `Closed` reports retain their trail indefinitely. 6. Non-numbered records never carry an event number. 7. The trail is administrator-only (FR-32); no member, reporter, claimant, responder, or anonymous actor gains trail access by participating. |
| **AuditEvent** (as a record) | its own immutable fields | 1. Constructed once; never mutated. 2. Carries actor, action, target, timestamp and the event-specific fields its catalog entry requires. 3. Carries no FR-37 Sensitive Field except where the frozen catalog explicitly names one (see conflict below). 4. Its `occurredAt` is the moment of the action, not the moment of the write. |
| **AuditReadLog** (as a record) | its own immutable fields | 1. Append-only, like the trail. 2. Names the administrator, the query, the filters, the result count, and the timestamp. 3. Stored in the database, not only on stdout, because Vercel Hobby retains runtime logs for one hour. 4. Is not itself a numbered event and does not appear in the trail it records. |
| **QuotaMonitor** | QuotaSnapshot readings per resource | 1. A reading is a fact, not a decision. 2. A threshold crossing is surfaced once per crossing, not on every request. 3. Only Blob **storage** at its limit refuses; every other resource warns. 4. No reading may trigger a purchase, an upgrade, or an automatic scale-out. |

### Aggregate boundary note

The audit trail is **not** an aggregate root that owns its events in the
relational sense. Events belong to a *parent* aggregate in another bounded
context (a Report, a Claim, a Recovery Response, an Account). The audit
context references that parent for retention and read-context; it does not own
it and does not guard its invariants. This is what allows every other context to
write through the trail without the trail knowing their rules.

## Domain Events

Domain events here are **emitted by other contexts** and recorded by this one.
The audit context does not publish workflow events; it records them.

| Event | Trigger | Payload |
|---|---|---|
| `audit.recorded` | Any state change that committed | eventType, eventNumber (nullable), parentType, parentId, actorId, actorRole, actingAdministratorId, determinedByUserId, recordedByAdministratorId, reason, previousValues, changedFields, metadata, occurredAt |
| `audit.read` | An administrator read the trail | administratorId, query, filters, resultCount, readAt, requestId |
| `audit.record_refused` | An audit write was attempted outside the caller's transaction, or carried a malformed payload | eventType, parentId, reason, requestId |
| `quota.threshold_crossed` | A resource crossed 70% or 90% of its verified limit | resource, usedAmount, limitAmount, threshold, observedAt |
| `quota.refused` | A new upload was attempted while Blob storage was at its 1 GB limit | resource, usedAmount, limitAmount, observedAt |

`quota.threshold_crossed` and `quota.refused` are operational, not workflow —
they are not part of the numbered catalog and never appear in the audit trail.

## Domain Services

| Service | Operations | Dependencies |
|---|---|---|
| **AuditWriter** | `record(event)` — append one event to the caller's open transaction; `recordNonNumbered(record)` — append an FR-52/FR-53 record; refuses a write with no open transaction | AuditTrail (in-memory model), transaction context supplied by the caller |
| **EventCatalog** | `numberFor(eventType)` → EventNumber or null; `requiredFieldsFor(eventNumber)` → field set; `isCatalogType(eventType)` | The frozen PRD catalog (FR-31 events 1–14, FR-48 events 15–30) |
| **AppendOnlyGuard** | `assertNotUpdatable(record)`; `assertNotDeletable(record)`; `assertValidCatalogNumber(eventNumber)` | AuditTrail, EventCatalog |
| **AuditRetentionPolicy** | `retentionFor(parentType, parentStatus)` → retain-with-parent / retain-indefinitely / remove-with-hard-delete | Report lifecycle rules (FR-10, FR-31 retention consequences) |
| **AuditPayloadSanitizer** | `assertNoSensitiveValues(payload)` — rejects FR-37 Sensitive Fields before a write is accepted | FR-37 sensitive field set |
| **OperationalLogger** | `log(context)` — emit one structured JSON line to stdout; `logAuditRead(read)` — record to the database *and* stdout | RequestContext, AuditWriter |
| **QuotaMonitor** | `observe(resource)` → reading; `check(resource, attemptedAmount)` → allowed / refused; `warnIfCrossed(resource)` | Verified Vercel Hobby limits (Blob 1 GB, 10,000 simple ops, 2,000 advanced ops, 10 GB transfer, 10 GB fast origin transfer, 1,000,000 function invocations, 1 GB database) |

## Repository Interfaces

| Repository | Entity | Methods |
|---|---|---|
| **AuditEventRepository** | AuditEvent | `append(event, transaction)` — insert only; `listByParent(parentRef, cursor, limit)` — reverse-chronological, 25 per page; `listByEventNumber(number, cursor, limit)`; `countByParent(parentRef)`. **No `update`, no `delete`, no `upsert`.** |
| **AuditReadLogRepository** | AuditReadLog | `append(read, transaction)`; `listByAdministrator(administratorId, cursor, limit)`. No update, no delete. |
| **QuotaSnapshotRepository** | QuotaSnapshot | `append(snapshot)`; `latestFor(resource)`; `listFor(resource, since)`. No update, no delete. |
| **QuotaLimitProvider** | QuotaThreshold | `limitFor(resource)` → the verified free-tier limit. Read-only configuration; never mutated at runtime. |

## Ubiquitous Language

| Term | Definition |
|---|---|
| **Audit Event** | One append-only record describing an auditable system or user action: actor, action, target/context, timestamp, and the event-specific fields required by FR-31 or FR-48. |
| **Audit Trail** | The ordered, append-only record of who did what when on a Report, Claim, Recovery Response, User/Registration, per-Claim thread, per-Recovery-Response thread, or Lost-side verification action. Visible only to administrators. |
| **Audit Read Log** | The record of a read of the trail — a distinct record type, deliberately separate from the trail it describes. |
| **Numbered event** | An audit event carrying one of the thirty frozen catalog numbers (FR-31 events 1–14, FR-48 events 15–30). |
| **Non-numbered record** | An append-only audit record required by another requirement — currently FR-52 profile edits and FR-53 administrator report edits — that carries no catalog number. |
| **Event catalog** | The frozen, complete set of thirty numbered workflow/lifecycle events. The application may not extend it. |
| **Parent entity** | The Report, Claim, Recovery Response, Account, or thread message an audit event belongs to. Determines both retention and the contextual route the trail is read from. |
| **Actor** | The person or system that performed the recorded action. A system actor always names the human whose action caused it. |
| **Determination actor** | The `determined_by` / `recorded_by` pair on FR-48 events 18 and 19 — the owner who physically determined the match, and the administrator who recorded that determination. |
| **Append-only** | The property that no audit record can ever be updated or deleted — enforced by the absence of a path, not by a permission check that could be widened. |
| **Interaction-free Open report** | An `Open` report with no Claim (Found) or no Recovery Response (Lost) — the only report eligible for hard delete, and therefore the only case where a trail is removed. |
| **Sensitive value** | A field whose visibility is restricted under FR-37. Sensitive values are never written to a log line. Whether they may appear in a trail record is governed by the frozen catalog, not by this context. |
| **Quota threshold** | The 70% and 90% warning points against a verified free-tier limit. |
| **Quota refusal** | The refusal of a new upload when Blob storage is at its 1 GB limit — the only automated quota action. |
| **Operational log** | A structured JSON line on stdout, diagnostic only. It is not the compliance artifact, because Vercel Hobby retains runtime logs for one hour. |
| **Audit read** | An administrator reading the trail. Recorded so the access pattern is reviewable. |

## Open conflict — FR-31 event 2 and the "no sensitive values in the trail" rule

**This model does not resolve the conflict; it records it and states the reading
this model is built on, pending owner confirmation.**

**The two positions.**

- **The frozen PRD, FR-31 event 2** requires that a Claim-submitted event carry
  the claimant's **reason** and **identifying details**. FR-31 event 15
  likewise requires the Recovery Response's **where-found** and **observed
  identifying details**. FR-31 event 14 and FR-48 event 16 require the
  **message text** of thread posts.
- **The rule recorded during Inception** in
  `memory-bank/intents/001-findback-lost-and-found/units/006-audit-and-observability/unit-brief.md`
  states that "claim reasons, identifying details, exact places, thread bodies,
  passwords, and tokens are **never** written to an audit record or a log."
  The same prohibition was written into story `001-append-only-audit-writes`
  (acceptance criterion: an audit write "contains no claim reason, no
  identifying details, no exact place, no thread body, no password, and no
  token") and into `memory-bank/standards/coding-standards.md` § Logging.

**Why the Inception rule is the narrower one and therefore the error.** The
Inception rule was authored by this workflow, not inherited from the frozen
product definition. The PRD is the frozen source of truth and is *more
specific*: it names the exact events that carry these fields. A blanket
prohibition contradicts the catalog it sits beside, and PRD §0 states the PRD
is authoritative for the product. FR-37 governs *visibility to viewers*, not
*storage in an administrator-only record* — the PRD itself makes the administrator
the one role that sees Claim reason and identifying details.

**Reading this model is built on.** The audit trail may carry the fields the
frozen catalog explicitly names for a given event, and the operational log
never may. Specifically:

| Field | Audit trail (catalog-named events only) | Operational log |
|---|---|---|
| Claim reason, identifying details | Allowed on event 2 only (FR-31 names them) | Never |
| Recovery Response where-found, observed identifying details | Allowed on event 15 only (FR-48 names them) | Never |
| Thread message body | Allowed on events 14 and 16 only | Never |
| Closure / rejection / cancellation reason | Allowed on events 4, 5, 10, 12, 24, 25 | Never |
| Password, hash, token, session id | Never | Never |
| Exact place free text (report-level) | Never named by any catalog event | Never |

**What this means for implementation.** `AuditPayloadSanitizer` therefore
denies by default and permits only catalog-named fields, rather than denying a
blanket set. The distinction is: **the trail is an administrator-only record
that the PRD says must contain certain values; the log is a diagnostic stream
that must never contain them.** Passwords, hashes, and tokens are barred from
both.

**Confirmation required.** This reading changes two Inception-authored
artifacts (`unit-brief.md` rule 6 and story `001-append-only-audit-writes`
acceptance criterion 4) and one standard (`coding-standards.md` § Logging), and
it changes what the *audit trail view* can display. It is raised here rather
than decided unilaterally because it touches a frozen-catalog requirement and a
privacy rule simultaneously. **Owner confirmation is requested before Stage 2
designs the payload shape.**

## Open item carried to Stage 2

`system-architecture.md` § "Open items for the first DDD bolt" lists the audit
query shape for 10,000 reports × 50 events within 1 s p95 as an item for this
bolt. The repository interface above states the shape — reverse-chronological,
25 per page, cursor-based — but the index and pagination strategy is a Stage 2
(Technical Design) concern and is deliberately not settled here.

## Story coverage

| Story | Covered by |
|---|---|
| `001-append-only-audit-writes` | AuditEvent, AuditWriter, AuditTrail invariants 1/3, EventCatalog, the transactional-write rule in "Aggregate boundary note" and the story's own technical notes |
| `003-non-numbered-audit-records` | "Non-numbered records" section, AuditEvent `eventNumber` nullable rule, AuditTrail invariant 6, FR-52/FR-53 field sets |
| `004-append-only-enforcement` | AppendOnlyGuard, AuditEventRepository (no update/delete/upsert), AuditTrail invariants 1/4/5, the FR-10 hard-delete exception, the "Interaction-free Open report" term |
| `006-operational-logging-and-quota` | OperationalLogger, RequestContext, QuotaMonitor, QuotaSnapshot, QuotaThreshold, QuotaLimitProvider, the quota terms in Ubiquitous Language |

## Completion criteria

- [x] All domain entities identified and documented
- [x] Business rules captured for each entity
- [x] Aggregate boundaries defined
- [x] Domain events specified
- [x] Repository interfaces defined
- [x] All stories covered by domain model
- [x] Ubiquitous language documented
- [ ] **Owner confirmation of the FR-31 event 2 conflict reading** (raised above)
