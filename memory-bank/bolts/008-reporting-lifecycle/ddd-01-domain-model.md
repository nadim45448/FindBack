---
stage: model
bolt: 008-reporting-lifecycle
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-29T06:05:00Z
---

# Bolt 008 — Stage 1: Domain Model

## Overview

What a reporter and a moderator may do to a report **after it exists**.

Four operations, four stories: the reporter's edit, delete, and withdraw, and
the administrator's edit. They share one report, one audit trail, and one
rule that recurs in all four — **the terminal-status block**.

The model is deliberately shaped around the fact that **these four
operations have four different preconditions**, and the temptation is to
collapse them into one "can modify report" check. They are not collapsed.

## Static Model: reporting-lifecycle

### Entities

- **Report** (existing, extended): id, type (`Lost`/`Found`), name, category,
  description, date, campusArea, exactPlace, identifyingDetails, imageRef,
  status, reporterId, createdAt, updatedAt — **Business rules**: the FR-8
  field set is closed and is an aggregate invariant, not a convention (bolt
  `007`); the reporter is server-derived and is never a request field; the
  status is one of the six canonical values, and only `Open` and `Closed` are
  written by this bolt.
- **ReportInteraction** (new): the *existence* of a Claim on a Found report or
  a Recovery Response on a Lost report — **Business rules**: this entity
  carries **no content**, only the fact that an interaction exists. It exists
  because FR-10's delete gate is about a *fact*, and modelling the fact
  directly is what lets the gate be a type-asymmetric pure function rather
  than a scan of another module's tables.
- **ReportEdit** (new): the changed-field snapshot a report edit produces —
  **Business rules**: carries the field names, the previous values, and the
  new values for the fields that changed; **no field that did not change
  appears**, so "no change" is representable as an empty edit.

### Value Objects

- **ReportStatus** (existing): `Open`, `Claim Requested`, `Claim Approved`,
  `Verification Pending`, `Returned`, `Closed` — **Constraints**:
  `Returned` and `Closed` are **terminal**; the literals are the PRD's
  verbatim and are never renamed.
- **TerminalStatus** (new): a `ReportStatus` narrowed to the two terminal
  values — **Constraints**: the narrowing is what makes "blocked at both
  terminal statuses, each with its own message" a *type* rather than two
  independent `if` statements that could drift.
- **EditOutcome** (new): `Changed` | `Unchanged` — **Constraints**:
  distinguishes "the edit applied" from "the edit requested nothing", which
  is the difference between writing an audit record and writing none.
- **WithdrawalDecision** (new): `Permitted` | `Blocked` — **Constraints**:
  the blocked case carries the reason, so the refusal is a value rather than
  a thrown string.
- **DeletionDecision** (new): `Permitted` | `BlockedByInteraction` |
  `BlockedByStatus` — **Constraints**: the two blocked cases are
  **distinguishable**, because they map to different responses — a 409 pointing
  at Withdraw versus a plain refusal.
- **PreviousValues** (new): the pre-edit values of the changed fields —
  **Constraints**: present only when the report carries an interaction; this
  is FR-19's conditional requirement, expressed as the absence of a value
  rather than a flag.
- **FieldSnapshot** (new): one field's name, previous value, and new value —
  **Constraints**: the field name is drawn from the editable set, so a
  snapshot cannot name a field that is not editable.

### Aggregates

- **Report** (existing aggregate root, **extended**): Members: the FR-8 field
  set, `status`, `reporterId`, `imageRef`, timestamps — **Invariants**:
  1 - The FR-8 field set is closed; no field beyond it is stored.
  2 - The reporter is server-derived and is never client-asserted.
  3 - The status is one of the six canonical values.
  4 - **`type` is immutable.** A report is Found or Lost for its whole life.
     This is the invariant that makes FR-10's type-asymmetric interaction
     rule well-defined: the type cannot change under the gate.
  5 - **`reporterId` is immutable.** FR-53's editable set excludes reporter
     identity, and FR-9 excludes it too.
  6 - **The status only ever moves `→ Closed` in this bolt.** Withdrawal
     reaches `Closed`; a delete removes the row entirely; an edit never
     changes the status. FR-22 and FR-42 own every other transition.
- **ReportEdit** (new aggregate root — **small**): Members: a `FieldSnapshot`
  list — **Invariants**:
  1 - Every snapshot names a field in the editable set.
  2 - A snapshot's previous value is the value the field held before this
     edit, so a chain of edits reconstructs the history.
  3 - **An edit with no changed fields is not an edit** — the aggregate is
     empty and produces no audit record.
- **ReportDeletion** (new aggregate root — **ephemeral**): Members: the report
  id, the actor, the interaction snapshot that was empty — **Invariants**:
  1 - The report is `Open`.
  2 - The interaction snapshot is empty.
  3 - **The deletion removes the report's audit entries too.** This is the
     one path in the system that removes audit rows, and it is gated by
     ADR-6's transaction-scoped flag.

### Domain Events

- **ReportEdited**: Trigger: the reporter or an administrator edits a
  non-terminal report — Payload: the report id, the actor, the changed
  fields, the previous values, the timestamp.
- **ReportDeleted**: Trigger: the reporter hard-deletes an interaction-free
  `Open` report — Payload: the report id, the actor, the timestamp.
- **ReportWithdrawn**: Trigger: the reporter withdraws an eligible report —
  Payload: the report id, the actor, the **previous** status, the timestamp.
  The previous status is part of the payload because FR-31 event 9 and FR-48
  event 23 both name it explicitly.

**The three events are distinct, and the Found-side and Lost-side
withdrawals are distinct events.** FR-31 event 9 is
`report.found_withdrawn_by_reporter` and FR-48 event 23 is
`report.lost_withdrawn_by_reporter` — two different numbers for two different
sides. This is the ADR-9 pattern: the audit module owns the numbers, the
listings module owns the business values, and the firing module calls the
catalog.

### Domain Services

- **ReportEditService** (reporter edit, FR-9 + FR-19): Operations: `edit` —
  Dependencies: the `ReportFieldValidator` (bolt `007`), the audit catalog,
  the report repository.
- **ReportDeletionService** (reporter hard delete, FR-10): Operations:
  `delete` — Dependencies: the interaction reader, the audit catalog (for the
  permitted deletion), the report repository, the blob store.
- **ReportWithdrawalService** (reporter withdrawal, FR-11 + FR-20): Operations:
  `withdraw` — Dependencies: the interaction reader, the audit catalog, the
  report repository.
- **AdministratorReportEditService** (FR-53): Operations: `edit` —
  Dependencies: the `ReportFieldValidator`, the non-numbered audit catalog,
  the report repository, the blob store.
- **ReportInteractionReader** (port): reads the *existence* of a Claim or
  Recovery Response on a report. **The port carries a count, not a list** —
  the gate needs only "is there at least one", and a count is the smallest
  answer that satisfies it.

### Repository Interfaces

- **ReportRepository** (existing, **extended**): Entity: `Report` — Methods:
  `create`, and now `findById`, `update`, `delete`. The `update` receives the
  changed fields and the actor's edit; the `delete` receives the report and
  the interaction snapshot that was empty.
- **ReportInteractionReader** (new): reads interaction existence per report.
- **AuditCatalog** (existing): fires `report.edited_by_reporter` (event 8),
  `report.found_withdrawn_by_reporter` (event 9),
  `report.lost_withdrawn_by_reporter` (event 23), and the non-numbered
  `report.edited_by_administrator`.

### Ubiquitous Language

- **Report**: A Lost or Found report — an item's record in the system.
- **Interaction**: A Claim on a Found report, or a Recovery Response on a Lost
  report. The *existence* of one, which is what FR-10's gate tests.
- **Interaction-free**: A report with no Claim (Found) or no Recovery
  Response (Lost). **Not** "no interaction of any kind" — the rule is
  type-asymmetric.
- **Terminal status**: `Returned` or `Closed`. A report in a terminal status
  accepts no further change.
- **Blocked by interaction**: The report has an interaction, so hard deletion
  is unavailable and the reporter must Withdraw. Answered with HTTP 409.
- **Blocked by status**: The report is not `Open`, so hard deletion is
  unavailable for a different reason, with a different answer.
- **Withdrawal**: The reporter's action that moves a report to `Closed`.
  **Never** to `Returned` — there is no path by which a reporter action
  produces a `Returned` status.
- **Administrator edit**: The narrow moderation capability of FR-53. Not
  unrestricted editing.
- **Previous values**: The values a field held before an edit. Present when
  the report carries an interaction, absent otherwise.

---

## The four operations, and why they do not share a gate

This is the model's load-bearing observation.

All four operations ask some form of "may this actor change this report?" —
and all four would naturally be written as one `canModify(report, actor)`
check. That check does not exist, because the four preconditions differ in
**kind**, not merely in value:

| Operation | Precondition | Why it is not the others' |
|---|---|---|
| Reporter edit | not terminal | Says nothing about ownership of *content* beyond "you are the reporter" |
| Administrator edit | not terminal | **Different actor**, and a *narrower* editable set |
| Hard delete | `Open` **and** interaction-free | **Two** conditions, one of which is about another module's records |
| Withdrawal | type-specific allowed-status, **and** (Lost only) pre-Match-Confirmed | **Depends on the type**, and on a *sub-aggregate's* state |

Two consequences follow, and both are worth stating because each would
otherwise be re-derived:

1 - **The editable set is an argument, not a property of the actor.** The
   reporter edits the FR-8 content set; the administrator edits the FR-53
   set, which is the same content set **minus** the reporter and type, and
   **plus** image replacement. A single `canModify` returning a boolean
   cannot express the difference, and a single implementation of "apply the
   edit" cannot either — they take different field sets and write different
   audit records.

2 - **The interaction gate is type-asymmetric, and that asymmetry is the
   requirement.** FR-10: a Found report's interaction is a Claim; a Lost
   report's is a Recovery Response. A Found report with a Recovery Response
   is not a valid combination, and a Lost report has no Claims. The gate is
   therefore a function of `(type, hasClaim, hasRecoveryResponse)`, and the
   type is immutable — so the gate is decided once, at the aggregate, and
   cannot be changed under itself.

## The terminal-status block, and why it is a value

FR-9 blocks edits at both `Returned` and `Closed`, **each with its own
message**:

- "Returned reports cannot be edited."
- "Closed reports cannot be edited."

FR-53 blocks administrator edits at the same two statuses.

The temptation is a single boolean `isTerminal(status)` plus a message built
by string substitution. The model instead narrows the status to a
`TerminalStatus`, which makes the **two distinct messages a requirement of
the type** rather than a convention: a function that must produce a message
for a `TerminalStatus` cannot be handed a non-terminal one, and a
`TerminalStatus` carries the information needed to pick the right message.

This matters because the two messages are **frozen UX** (the PRD names them
verbatim, and `coding-standards.md` § Error handling forbids editing
user-facing wording while writing code). A message assembled by substitution
would produce "Returned reports cannot be edited." from a template and
"Closed reports cannot be edited." from the same template — correct by luck,
and it would keep working only as long as nobody reordered the status list.
A narrowed type fails loudly instead.

## FR-9's conditional audit requirement

FR-19's traceability rule has two halves, and only the first is unconditional:

1 - **Every** reporter edit is recorded with actor, timestamp, and a snapshot
   of changed fields.
2 - **Once any Claim exists on a Found report, or any Recovery Response
   exists on a Lost report**, every subsequent edit is recorded **with the
   changed fields and the previous values**.

The second half is conditional on a fact about the report's history, and the
model expresses it as the **presence or absence of a `PreviousValues`
value** rather than as a boolean flag. A snapshot without previous values is
therefore a different *kind of thing* from one with them, and the two audit
records — event 8's `changedFieldsSnapshot` versus the administrator's
non-numbered `changedFields` + `previousValues` — are not the same shape.

**The rule does not restrict which fields may be edited.** FR-19 governs
what the trail must preserve, not what may change. A sensitive field (an
over-long exact place, FR-37) is still editable by its reporter; the
consequence is only that its *previous value* joins the audit record, which
is administrator-only (FR-32).

## FR-10's interaction-free rule

The gate is:

```text
Found → deletable iff status is Open AND no Claim exists
Lost  → deletable iff status is Open AND no Recovery Response exists
```

**Two blocked cases, and they answer differently.** A report that has an
interaction gets **HTTP 409** with a message pointing at the Withdraw action
— because deletion has become unavailable *and there is a remaining path*.
A report whose status is not `Open` is refused, because the 409's advice
("withdraw instead") would be wrong there: a `Returned` report cannot be
withdrawn either.

The model therefore distinguishes `BlockedByInteraction` from
`BlockedByStatus`, and this is not a cosmetic difference — it is the
difference between two different answers to two different situations.

**A rejected Claim is still an interaction.** A Claim that was already
rejected is a terminal Claim, and its existence still blocks deletion. The
same holds for a terminal Recovery Response. The gate tests *existence*, not
*activity* — and the model says so explicitly, because "interaction-free"
could easily be read as "no live interaction".

## FR-10's audit deletion, and ADR-6

FR-10 is the **only** path in the system that removes audit records, and ADR-6
enforces append-only at the database level with a `BEFORE UPDATE OR DELETE`
trigger on `audit_events`. The single permitted deletion is gated by a
transaction-scoped `SET LOCAL findback.allow_audit_delete = 'on'` flag, which
**only the FR-10 hard-delete path sets, after the eligibility check passes**.

The model records this as an invariant of the `ReportDeletion` aggregate and
as a constraint on the deletion service: the flag is set **after** the
eligibility check, never before, and the row delete and the audit delete
happen in **one transaction**. `SET LOCAL` rather than `SET`, because pooled
connections must carry no residue between requests (ADR-3).

**The report row and its audit entries are removed together.** A deleted
report whose audit history survives would leave orphan trail entries
pointing at a report that no longer exists.

## FR-11's two type-specific rules

FR-11's withdrawal rules differ by type, and the difference is not
incidental:

**Found:** allowed on `Open` or `Claim Requested`; blocked on `Claim
Approved`, `Returned`, `Closed`.

**Lost:** allowed on `Open` or `Verification Pending` **before Match
Confirmed has been recorded**; blocked once Match Confirmed is recorded, and
on `Returned` and `Closed`.

The Lost-side guard has a subtlety worth naming: **`Match Confirmed` is a
Recovery Response status, not a Lost-report lifecycle status.** The
withdrawal guard tests whether that Recovery Response status *has been
recorded on the report*. It is a question about a sub-aggregate, not about
the report's own status.

So the withdrawal decision is a function of:

```text
(type, report.status, hasClaimApproved, hasMatchConfirmed)
```

and the two extra facts are read through the interaction port. Note the
Found-side rule turns on `Claim Approved` — which is likewise a Claim
status, not a report status — so **both** types' withdrawal gates consult a
dependent record's state, not only the report's own status.

**The withdrawal reaches `Closed`, never `Returned`.** There is no path by
which a reporter action produces a `Returned` status. This is a hard
invariant of the withdrawal operation, and it is the reason withdrawal is
modelled as its own operation rather than as a generic status transition —
a generic transition table would have `Returned` available to it.

## FR-11's dependent-record resolution

Withdrawal resolves dependent records **in the same transaction as the report
transition**:

**Found side:** every **Pending** Claim transitions to `Rejected` with audit
reason "report withdrawn by reporter". Claim history is preserved — only
Pending Claims change; Approved and Rejected Claims are untouched. Per-Claim
threads become read-only. The Claim rejection email (FR-29) is sent to each
affected claimant.

**Lost side:** every **non-terminal** Recovery Response — including any
currently `Selected for Verification` and all `Submitted` — transitions to
`Resolved — Report Closed`. Threads become read-only. History is preserved.
**No closure email is sent to responders** (FR-30).

The asymmetry is deliberate and is the PRD's: the Found side sends an email,
the Lost side does not. The model records the email as a consequence of the
Found-side withdrawal and its **absence** as a consequence of the Lost-side
one, because an omission is exactly the kind of thing that gets "helpfully"
added later.

**A withdrawal with nothing to resolve is still a withdrawal.** A Found
report in `Open` with no Claims transitions to `Closed` and writes its audit
record. The dependent-record resolution is a consequence, not a precondition.

**The dependent records are not this module's to own.** The Claim statuses
belong to Unit 003 and the Recovery Response statuses to Unit 004. This
bolt therefore states the *required outcome* — "every Pending Claim becomes
Rejected" — and calls the owning modules' transitions through their
contracts, exactly as ADR-9 and ADR-10 establish for the audit catalog. The
model does **not** re-implement FR-41's state machines; ADR-10 records
explicitly why a second implementation of the Recovery Response state machine
is the single largest correctness risk in the system.

## FR-53's editable set, and why it is a set

FR-53's editable set is **exactly**: report name, category, description,
date, location (campus area enum value and exact-place free text),
identifying details, image replacement.

**Not** editable: reporter identity, report type, report lifecycle status,
any Claim content, any Recovery Response content, any audit-trail entry, any
Returned-confirmation fields, any substitute-receiver fields.

The model's `FieldSnapshot` names a field drawn from the editable set, so
**an ungoverned field cannot be snapshotted** — the type does not merely
discourage it, it cannot express it.

Three of the blocked items are already impossible by other means, and the
model says which:

- **Reporter identity** is immutable by aggregate invariant (5).
- **Report type** is immutable by aggregate invariant (4).
- **Lifecycle status** is unchanged by FR-53 explicitly, and the admin edit
  path does not carry a status field at all — a separate `updateStatus`
  method, not an optional field on a shared update.

The rest are not this module's to block: Claim content, Recovery Response
content, audit entries, Returned-confirmation fields, and
substitute-receiver fields live in other modules, and this bolt simply never
reaches them. **The editable set is a whitelist, and the whitelist is
enforced by the shape of the request** — the same "closed field set" mechanism
bolt `007` used for the FR-8 field set, and for the same reason.

## FR-53's audit record is non-numbered

FR-53's audit record is a **non-numbered append-only record**: acting
administrator, timestamp, report id, changed fields, previous values. It
introduces **no new FR-31 or FR-48 event number** — the catalog is frozen,
and FR-31's own rule is that the non-numbered set grows only when a
requirement explicitly asks for a record. FR-53 does.

The catalog already carries `report.edited_by_administrator` as a non-numbered
entry with exactly the fields `changedFields` and `previousValues`, and
`report.edited_by_reporter` (event 8) as a numbered entry with exactly
`changedFieldsSnapshot`. **The two reporter and administrator edits write
different-shaped records**, and the model records that difference rather than
unifying them — a unified record would have to carry a "which kind was
this" flag, and the catalog's whole point is that the *type* of the event
tells you its shape.

**The administrator's record carries previous values unconditionally.** FR-53
does not make previous values conditional on an interaction the way FR-19
does. The model records that as a difference between the two edits, not as a
shared mechanism with a flag.

## The image replacement question

FR-53's editable set includes **image replacement**, and its technical note
is precise: "Image replacement uploads a new blob and deletes the old one;
blobs are never overwritten."

This is the **same compensating shape as bolt `007`'s create**, and for the
same reason: a blob store cannot join a PostgreSQL transaction. The sequence
is upload → write → on failure delete the new blob → delete the old blob.

Two rules the model records:

1 - **Blobs are never overwritten.** The old blob is deleted only after the
   new one is safely stored and the row points at it.
2 - **The reporter cannot replace the image.** FR-9's editable set is the
   FR-8 content set; story 013's image attachment is bolt `010`'s, and this
   bolt does not build it. The administrator's image replacement is
   therefore the **only** image write this bolt performs, and it must not
   accidentally acquire a reporter-side twin.

**Image validation is bolt `010`'s.** The blob store's own validation
(mime type, size, dimensions) already exists from bolt `007`; this bolt
uses it and does not extend it.

## The no-op edit

FR-53's edge cases name one: "Edit made with no field changed → No-op; no
change snapshot is recorded."

So an edit that changes nothing produces **no audit record**. The
`EditOutcome` value exists for exactly this: the service must be able to
say "nothing changed" without that being an error, and without writing a
record. A service that returned `void` would have to signal this by
returning a falsy value or by throwing, and both are wrong — one conflates
"no change" with failure, the other makes a legitimate request an error.

This also means the **reporter's** edit follows the same rule, even though
FR-9 does not spell it out: an edit that changes nothing writes no record.
The rule is stated once, in the model, and applies to both.

## The edit never changes the status

FR-9: "Editing a report does not change its status." FR-53: the same, three
times over.

**This is an aggregate invariant, not a rule enforced at the call site.** The
edit path carries no status field; the report's status is not part of the
edit's input, so there is no value to change it to. The same reasoning
bolt `007` used to close the FR-8 field set — "closed by construction, not
by review" — applies here.

It is also why FR-22 and FR-42 are named in FR-53's blocked list: those FRs
own lifecycle movement, and this path cannot perform it.

## Invariants of this bolt, collected

1 - **FR-8's field set is closed** (bolt `007`, inherited).
2 - **The reporter is server-derived**, never client-asserted.
3 - **The report type is immutable.**
4 - **The reporter identity is immutable.**
5 - **An edit never changes the lifecycle status.**
6 - **The status only ever moves `→ Closed` in this bolt.**
7 - **Withdrawal reaches `Closed`, never `Returned`.**
8 - **The terminal-status block is typed**, and the two messages are distinct.
9 - **The interaction gate is type-asymmetric** and reads interaction
   *existence*, not activity.
10 - **The delete gate's two blocked cases are distinguishable**, because they
    answer differently.
11 - **The FR-53 editable set is a whitelist**, enforced by the request's
    shape.
12 - **The administrator's audit record is non-numbered**, and the
    reporter's is numbered — two different record shapes.
13 - **The reporter's audit record carries previous values only when the
    report carries an interaction**; the administrator's carries them always.
14 - **An edit that changes nothing writes no record.**
15 - **The report row and its audit entries are deleted together**, and only
    on the FR-10 path, under ADR-6's flag.
16 - **Blobs are never overwritten**, and the old blob is deleted only after
    the new one is stored and referenced.
17 - **Dependent-record resolution happens in the same transaction as the
    report transition.**
18 - **No email is sent for a reporter's edit or an administrator's edit**
    (FR-30). The Found-side withdrawal sends the Claim rejection email
    (FR-29); the Lost-side withdrawal sends none (FR-30).

## What this bolt does **not** model

Recorded so the boundary is explicit and the next bolt does not have to
re-derive it:

- **The FR-22 / FR-42 status machines** — Units 003, 004, and 005, and the
  `Claim Requested` / `Claim Approved` / `Verification Pending` transitions.
  This bolt reads those statuses; it does not produce them.
- **The Claim and Recovery Response state machines** — Units 003 and 004. The
  withdrawal's dependent-record outcomes are stated as requirements on those
  modules, not re-implemented here (ADR-10's reasoning).
- **The Claim rejection email's content and transport** — Unit 003 owns the
  FR-29 email; this bolt triggers it.
- **The report detail view and My Reports** — bolt `009`'s listings and the
  web surface's job (FR-49's retrieval rules).
- **Image validation and delivery** — bolt `010`, plus `image-handling.md`
  for the FR-39 authorization on every read.
- **Administrator close and remove-inappropriate-content** — FR-21 and
  FR-36, Unit 005.
- **The audit trail's read path** — Unit 006's, already complete.

## Open questions carried to Stage 2

Each has a stated default, so Stage 2 is never blocked.

1 - **How is the "previous value" captured for a field whose value is
   `null`?** A report with no exact place has a `null` exact place; an edit
   that sets one must record that the previous value was absent, which is
   different from an empty string. **Default:** the snapshot carries an
   explicit `absent` marker rather than `null`, so "was not set" and "was
   empty" stay distinguishable — the same `undefined` versus `null`
   distinction bolt `006`'s row-mapping suite settled.

2 - **Does the administrator's edit include the image in the same
   transaction as the field changes?** **Default:** no. The blob lifecycle is
   outside the transaction, exactly as bolt `007` modelled the create path,
   and the image is replaced after the field write succeeds — so a failed
   image upload cannot roll back a content edit.

3 - **Who owns the transition of a Pending Claim to `Rejected` when the
   Found report is withdrawn?** **Default:** Unit 003's transition, invoked
   through its contract from this bolt's service, inside this bolt's
   transaction. This bolt states the required outcome; it does not
   re-implement the Claim state machine.

4 - **Does the reporter's edit re-validate the date bound against the
   current date?** **Default:** yes — bolt `007`'s validator is reused
   unchanged, so a report that was valid when created may become invalid
   when edited. That is the correct behaviour (the bound is a product rule,
   not a creation-time fact), and it is a real consequence worth surfacing at
   Stage 2 rather than discovering in the implementation.

5 - **Is the withdrawal's "blocked by Match Confirmed" reported distinctly
   from "blocked by status"?** **Default:** both are refusals, but with
   distinct messages, because the member's remedy differs — a post-Match
   Confirmed Lost report cannot be withdrawn by anyone through this path,
   while a `Returned` report was already closed by an administrator.

## Notes

### Why the interaction is modelled as existence, not as a relationship

FR-10's gate needs one bit per side. Modelling it as an entity with content
would invite the model to carry Claim data it has no business holding, and
would make the delete service look like it participates in the Claim
lifecycle. Modelling it as a *fact* — "has a Claim", "has a Recovery
Response" — keeps this bolt a consumer of the other modules' facts rather
than a second view of their records.

The port returns a count rather than a boolean so that the *absence* of an
interaction is distinguishable from "the question was not asked" — a
boolean port cannot distinguish "no Claim" from "the reader did not look",
and the difference between those two is exactly the difference between a
successful delete and a wrongly-permitted one.

### Why the two edit operations are separate services, not one with a flag

The reporter's edit and the administrator's edit share a validator, an
aggregate, and a repository. They differ in **actor**, **editable set**,
**audit record shape**, and **previous-values rule**. A single service with a
boolean parameter would carry four conditionals, and the conditionals would
be the *only* thing distinguishing two genuinely different business
operations — which is how a moderation edit quietly acquires a reporter's
capability, or a reporter's edit acquires a previous-values rule it should
not have.

The shared part — the validation of the submitted fields — is already a
single implementation (bolt `007`'s `ReportFieldValidator`), and it is shared
because it genuinely is one thing: the FR-8 field rules.

### The audit events already exist

All four audit events this bolt fires are **already in the frozen catalog**,
with their numbers and their required field sets:

- Event 8 `report.edited_by_reporter` — `changedFieldsSnapshot`
- Event 9 `report.found_withdrawn_by_reporter` — `previousFoundStatus`
- Event 23 `report.lost_withdrawn_by_reporter` — `previousLostStatus`
- Non-numbered `report.edited_by_administrator` — `changedFields`,
  `previousValues`

**This bolt adds no event and no event number.** The catalog is frozen, and
ADR-9's guarantee is structural — a firing module cannot invent an event
number or omit a required field. The interesting part of the stage is
therefore not "which event" but **"which fields does this event actually
carry"**, because the catalog's required-field list is a *minimum* and the
PRD's own wording says "a snapshot of changed fields", which may be broader.

### The bolt's dependency on two units it does not own

Bolt `008` reads Claim state (to decide withdrawal and deletion) and Recovery
Response state (the same). Both belong to Units 003 and 004, which are
**not yet built** — the unit's plan has `008` before `009` and `010`, and
Units 003/004 come later.

This is a real sequencing constraint, and Stage 2 must resolve it rather than
discover it in the implementation: the withdrawal and deletion paths need to
know whether a Claim or Recovery Response exists, and those tables may not
exist yet.

Three shapes are available, and the choice belongs to Stage 2:

1 - **Query the tables directly** through a port that this bolt owns, with
   the tables created by the migration when Units 003/004 arrive.
2 - **Define the interaction reader's port now** and implement it later,
   making this bolt's tests run against a stub until the real tables exist.
3 - **Reorder the plan** so the Claims and Recovery Responses tables are
   created earlier, by their own bolts.

**The default carried to Stage 2 is option 1 with the port defined now** —
the schema for `claims` and `recovery_responses` is knowable from the PRD
and the unit briefs, and a migration that creates the tables early is
cheaper than a bolt that is blocked. But the choice is Stage 2's, and this
stage's job is to make sure the choice is *visible* rather than discovered
in the implementation.
