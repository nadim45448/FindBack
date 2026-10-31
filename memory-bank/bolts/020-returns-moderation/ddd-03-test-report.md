---
id: 020-returns-moderation
stage: 5
stage_name: test
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
created: 2026-10-30T16:30:00Z
completed: 2026-10-30T16:30:00Z
verification_command: "npx vitest run src/domain/recovery/lost-returned-closeout.test.ts src/domain/recovery/lost-closure-decision.test.ts src/domain/notifications/lost-side-notifications.test.ts src/domain/moderation/content-removal.test.ts src/application/listings/lost-report-closeout-service.test.ts src/application/listings/lost-report-close-service.test.ts src/application/listings/content-removal-service.test.ts src/application/notifications/lost-side-notifications.test.ts 'src/app/api/admin/reports/[id]/close-lost/route.test.ts' 'src/app/api/admin/reports/[id]/remove-content/route.test.ts' src/infrastructure/listings/prisma-lost-report-closeout-adapters.test.ts src/infrastructure/listings/prisma-content-removal-adapters.test.ts"
---

# Bolt 020 — Stage 5: Test Report

## Overview

The verification of the `020-returns-moderation` bolt: the atomic Lost-side
closeout, administrator closure with its two routes, content removal, and the
Lost-side notification events with the event-8 gate enforced.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The closeout's plan | `src/domain/recovery/lost-returned-closeout.ts` | 004 | FR-45, FR-41 |
| The closure's route | `src/domain/recovery/lost-closure-decision.ts` | 005 | FR-21, FR-42 |
| The removal's decision | `src/domain/moderation/content-removal.ts` | 006 | FR-36 |
| The events and their gates | `src/domain/notifications/lost-side-notifications.ts` | 007 | FR-46 |
| The closeout use case | `src/application/listings/lost-report-closeout-service.ts` | 004, 007 | FR-45, FR-46 |
| The closure use case | `src/application/listings/lost-report-close-service.ts` | 005 | FR-21 |
| The removal use case | `src/application/listings/content-removal-service.ts` | 006 | FR-36 |
| The dispatcher | `src/application/notifications/lost-side-notification-dispatcher.ts` | 007 | FR-46, FR-39 |
| The email builders | `src/application/notifications/lost-side-email-builders.ts` | 007 | FR-46 |
| The persistence | `prisma-lost-report-closeout-repository.ts`, `prisma-lost-report-closeout-reader.ts`, `prisma-content-removal-repository.ts` | 004, 005, 006 | FR-45, FR-21, FR-36 |
| The transport | `src/app/api/admin/reports/[id]/close-lost/`, `.../remove-content/` | 005, 006 | FR-21, FR-36 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## Two real defects were found and fixed by the suites

### Event 8 would never have fired

**The closeout's `notify()` read the matched response's status from the
subject — the object read *before* the write.** The subject carries the
matched response at `Match Confirmed`, which is the *prior* status. Event 8's
gate requires `Completed — Report Returned` **and** report `Returned`, so the
gate refused the very event the closeout exists to fire, and **the
successful-recovery email was silently never sent**.

The module's own doc comment had already stated the intent — *"The matched
response's status is read from what the write produced, not from what the plan
hoped for"* — and the code did not honour it. The fix threads the status out
of `write()` (from `plan.matched.targetStatus`) and into `notify()`'s gate
evaluation. **The suite now asserts the gate reads the write's outcome**, and
it would have caught this before the fix.

### The service's `eventId` fallback was dead code, and its comment was wrong

The close service held an `if (eventId === '')` fallback that could never
fire — both route branches assign `eventId` unconditionally — and the comment
above it claimed the opposite of what the code did. The dead branch was
**removed** and the result now returns the batch event's (event 27's) id
unconditionally, which is what the comment always said. **A branch that
cannot execute is a branch nobody has checked**, and one that contradicts its
own documentation is worse than none.

## The closeout is one transaction, and the atomicity is proven

**The report's move, every response's resolution, and every audit event are
one act.** The service suite asserts the call order against a recording fake:

```text
1.  read the report's facts       → the responses and their statuses
2.  decide the closeout           → the plan
3.  BEGIN
4.    UPDATE reports (conditional)     → the report reaches Returned
5.    UPDATE recovery_responses        → the matched response completes
6.    UPDATE recovery_responses …      → every other one resolves
7.    INSERT audit_events              → the closeout and the batch
8.  COMMIT
9.  dispatch events 7 and 8           → strictly post-commit
```

**The batch's set is the statement's `RETURNING` set (ADR-10),** not a
read-then-write. The live-database suite asserts this directly: the set the
repository reports *is* the set the statement affected, by construction.

**A partial failure leaves no partial state.** The live-database suite proves
it the hard way: it moves the matched response out from under the closeout, so
the adapter's guard fires **inside** the transaction — and the report is still
`Verification Pending` afterwards. The guard throws, so the report's move and
the batch resolution both roll back with it.

**The conditional write is what makes the race resolve to one commit.** A
write against a report no longer in its precondition status matches no rows,
the repository returns `null`, and the service turns that into the conflict the
story requires. The domain's read-and-refuse check is *advisory*; the
conditional `UPDATE` is the guarantee.

## The three statuses are distinct, and the terminal one is left alone

| Response | Status after the closeout |
|---|---|
| The matched response | `Completed — Report Returned` |
| Every other non-terminal response | `Resolved — Report Returned` |
| A response already terminal | **unchanged** |

**The matched response has its own write, with its own status.** A row that
matched both statements would end up with whichever landed last — so the
matched response is completed by a separate conditional `UPDATE`, and the
batch statement excludes it.

**A terminal response is named in the plan's `untouched` set.** A response
already at `Not a Match` was ruled out before the handoff, and rewriting it
would destroy the history the trail depends on. The plan accounts for **every**
response exactly once and never twice.

## Event 8's gate is the PRD's conjunction, and it is narrow

**The gate requires `Completed — Report Returned` **and** report `Returned`.**
The domain suite proves each condition independently:

| Condition | Verdict |
|---|---|
| `Completed — Report Returned` + report `Returned` | **permitted** |
| `Match Confirmed` + report `Returned` | **refused** |
| `Completed — Report Returned` + report still `Verification Pending` | **refused** |
| A standby responder | **refused** |
| A resolved responder | **refused** |
| The status missing | **refused** |

**Standby responders receive no event 8.** Receiving it would tell someone the
item was not theirs to keep. The closeout resolves them — they *are* resolved
— but the notification names only the matched responder.

**The gate's evaluation order is the report's condition first.** A report that
has not returned has nothing to tell a responder, whatever the response's
status says.

## The gate is evaluated against what the write produced

This is where the first defect lived, and the suite now pins it:

> **The gate reads the write's outcome, not the subject's prior status.** The
> subject carried the matched response at `Match Confirmed` — the *prior*
> status, which event 8's gate would refuse — and event 8 is precisely the
> event the completed handoff fires.

The service now threads the post-write status out of `write()` and into the
gate. The suite asserts the gate is permitted in the closeout's own path — a
regression that would have shipped the email-silently-lost bug.

## The two closure routes are decided by the responses, never by the client

| The report's responses | Route | Audit event |
|---|---|---|
| No response at `Match Confirmed` | `OrdinaryClosure` | FR-48 event 24 |
| A response at `Match Confirmed` | `ExceptionalCancellation` | FR-48 event 25 |

**`Verification Pending` covers both the pre- and post-determination phases,**
so the report's status cannot tell the two apart — the matched response's
status can. The route is therefore decided **over the responses**, read from
the database.

**The client cannot choose the route.** The close-lost route's body carries no
route flag; the request handed to the use case is asserted to have exactly the
keys `['actor', 'reason', 'reportId']`. The route's response reports the route
the *service* took.

**The exceptional route requires a documented reason.** The reason is validated
first — before the report is even read — and its bound (10–500 characters) is
the same bound an administrator's Found-side closure reason uses, because the
two are the same kind of field.

**A closure reaches `Closed` and never `Returned`.** Closure must never read
as a recovery: it reaches `Closed`, it sends no responder email, and it
requires a reason.

## No closure email reaches any responder — and the absence is structural

**The close service takes no `EmailSender` at all.** The suite asserts it
structurally:

```ts
expect(LostReportCloseService.length).toBe(4);
```

The constructor takes four arguments and none of them is a sender, so the
service *cannot* send a closure email — a future edit that wanted to add one
would have to change the constructor before it could. This is FR-30's "no
closure email to responders or claimants" enforced by the shape of the code
rather than by care.

**Every non-terminal response resolves to `Resolved — Report Closed` in the
same transaction as the report's move.** The live-database suite asserts both
the report's new status and every response's new status.

## A removal withholds the content; it never deletes it

**The trail is append-only with no correction path (ADR-6).** A removal that
physically deleted the content would leave the audit record naming something
that no longer exists, and the trail would be describing a fact it could no
longer verify. So the removal **marks** the content withheld:

| Kind | The marker |
|---|---|
| `report_image` | `reports.image_withheld` |
| `report_description` | `reports.description_withheld` |
| `thread_message` | `thread_messages.body_withheld` |

**The live-database suite asserts the content survives the mark.** The
report's `image_ref` is still there after the removal, and the thread
message's `body` is still there. The removal is a **row**, not a deletion.

**The removal's status never touches the report's status.** FR-36 says so
explicitly: *"the report's status is unchanged unless closure was separately
requested."* The live-database suite asserts the report is still `Open` after
a removal, and the service suite asserts the report's status is never written
at all — the service takes no route to a closure.

## A repeated removal records one removal

**The idempotence rule is read from the data.** Whether a target is already
withheld is a fact about the content, read from the content's own row — never
asserted by a client. A client that could assert it would be choosing whether
its own repeated action produced a second audit record.

**A repeat is permitted but records nothing.** The second call succeeds — the
content *is* withheld, which is what the caller asked for — and the trail
already holds this exact moderation act, so no second entry is written.

**The removal row is inserted *before* the content is marked.** The unique
constraint on the target is the second line of defence against a duplicate, and
it must refuse *before* the content is touched — so the service calls
`recordRemoval` first, and a duplicate raises the constraint error, which rolls
the transaction back with the content's mark. The service suite asserts the
order, and the live-database suite asserts the unique index refuses the second
row.

## The database's own constraints agree with the domain's rules

**The constraints are not restatements — they are live refusals.** The
live-database suite drives each one:

| Constraint | What it refuses |
|---|---|
| The unique index on `(report_id, target_kind, target_id)` | a second removal of the same target |
| The `CHECK` on `target_kind` | a kind the domain does not hold |
| The `CHECK` on `removal_reason` | a reason outside 10–500 characters |
| `recovery_responses_status_check` | a status the vocabulary does not name |

**The reader refuses a status the vocabulary does not name.** The database's
own constraint already rejects such a write, so the reader's guard is only
reachable by a row that bypassed it — and treating it as a nearby status would
invent a fact. The suite drops the constraint for one statement and restores it
in a `finally`, **restoring the row's status before re-adding the constraint**
— because the constraint cannot be re-added while a row violates it, and the
drop is made conditional so an interrupted run cannot leave the table
unprotected.

## The removals and the closures are two actions, and the routes keep them apart

**The remove-content route carries no closure request.** The request handed to
the use case is asserted to have exactly the keys
`['actor', 'reason', 'reportId', 'target']` — **no `close` flag**. A body
asking for both would be making two moderation decisions in one call, and the
administrator may or may not also close the report.

**The route hands the use case no `route` flag either.** The close-lost route
passes no route, so the client cannot assert that its close is "ordinary" and
cannot choose which audit event (24 vs 25) its report receives.

**The actor comes from the session, never from the body.** A body carrying an
administrator flag or an actor id is ignored, in both routes.

## The refusals are checked in an order, and the order is asserted

Both routes refuse in a fixed order — **actor → CSRF → body → use case** — and
the suites assert the order by making the *earlier* check fail and observing
that the *later* one never runs.

| Refusal | Status | Body |
|---|---|---|
| Not an administrator | 403 | `You do not have access to this.` |
| Invalid CSRF token | 403 | `Your request could not be verified.` |
| Malformed body | 400 | the message + the field |
| No such report / no such content | 404 | the domain's own message |
| State conflict | 409 | the domain's own message |
| Field rule failure | 400 | the domain's own message + the field |

**A caller who is not an administrator learns nothing about the request's
validity** — not even whether their CSRF token was good.

**The response carries no Sensitive Field, and it carries no status.** The
remove-content route's body is asserted key by key as
`['id', 'recorded', 'target']` — **no `status`**, because a removal did not
change the report's status. The close-lost route's body is
`['id', 'resolvedCount', 'route', 'status']`.

## Verification

### Command

```
npx vitest run \
  src/domain/recovery/lost-returned-closeout.test.ts \
  src/domain/recovery/lost-closure-decision.test.ts \
  src/domain/notifications/lost-side-notifications.test.ts \
  src/domain/moderation/content-removal.test.ts \
  src/application/listings/lost-report-closeout-service.test.ts \
  src/application/listings/lost-report-close-service.test.ts \
  src/application/listings/content-removal-service.test.ts \
  src/application/notifications/lost-side-notifications.test.ts \
  'src/app/api/admin/reports/[id]/close-lost/route.test.ts' \
  'src/app/api/admin/reports/[id]/remove-content/route.test.ts' \
  src/infrastructure/listings/prisma-lost-report-closeout-adapters.test.ts \
  src/infrastructure/listings/prisma-content-removal-adapters.test.ts
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Domain — `lost-returned-closeout.test.ts` | 1 | 20 | ✅ pass |
| Domain — `lost-closure-decision.test.ts` | 1 | 17 | ✅ pass |
| Domain — `lost-side-notifications.test.ts` | 1 | 25 | ✅ pass |
| Domain — `content-removal.test.ts` | 1 | 15 | ✅ pass |
| Application — `lost-report-closeout-service.test.ts` | 1 | 23 | ✅ pass |
| Application — `lost-report-close-service.test.ts` | 1 | 25 | ✅ pass |
| Application — `content-removal-service.test.ts` | 1 | 19 | ✅ pass |
| Application — `lost-side-notifications.test.ts` | 1 | 14 | ✅ pass |
| Transport — the close-lost route | 1 | 21 | ✅ pass |
| Transport — the remove-content route | 1 | 25 | ✅ pass |
| Infrastructure — `prisma-lost-report-closeout-adapters.test.ts` | 1 | 22 | ✅ pass |
| Infrastructure — `prisma-content-removal-adapters.test.ts` | 1 | 16 | ✅ pass |
| **Total** | **12** | **242** | ✅ **242 pass, 0 fail** |

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `domain/recovery/lost-returned-closeout.ts` | 100% | 100% | 100% | 100% |
| `domain/recovery/lost-closure-decision.ts` | 100% | 100% | 100% | 100% |
| `domain/notifications/lost-side-notifications.ts` | 100% | 100% | 100% | 100% |
| `domain/moderation/content-removal.ts` | 100% | 100% | 100% | 100% |
| `application/listings/lost-report-closeout-service.ts` | 100% | 100% | 100% | 100% |
| `application/listings/lost-report-close-service.ts` | 100% | 100% | 100% | 100% |
| `application/listings/content-removal-service.ts` | 100% | 100% | 100% | 100% |
| `application/notifications/lost-side-email-builders.ts` | 100% | 100% | 100% | 100% |
| `application/notifications/lost-side-notification-dispatcher.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-lost-report-closeout-repository.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-lost-report-closeout-reader.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-content-removal-repository.ts` | 100% | 100% | 100% | 100% |
| **Total** | **100%** | **100%** | **100%** | **100%** |

**The route layer is excluded from coverage by `vitest.config.ts`**
(`src/app/**`), and is verified by its own 46-test suite — the same
arrangement every earlier bolt used.

### The gaps that were closed rather than left

**Every gap was closed with a real test, or by removing dead code — never by
weakening an assertion.**

1. **The closeout's event-8 gate was reading the wrong status.** Fixed in
   the code, and the suite now pins the behaviour.
2. **The close service's `eventId === ''` fallback was dead code** and its
   comment described the opposite behaviour. The branch was removed and the
   result now returns the batch event's id unconditionally.
3. **The close service's `prior === undefined` guard was structurally
   unreachable** — the domain takes the exceptional route only when a
   response is at `Match Confirmed`. The suite **mocks the domain's
   `decideLostClosure`** to return a decision the real domain cannot produce,
   and asserts the guard refuses it and writes nothing. The mock is cleared in
   an `afterEach`, so it cannot leak into another test.
4. **The close service's `StatusNotApplicable` refusal arm** — the second
   refusal, distinct from the terminal one — is covered by the same mock, and
   the suite asserts the service's message says which refusal it was.
5. **The content-removal service's `Refused` arm** — an unknown target kind
   arriving at runtime — is covered by a test that passes a kind the closed
   union does not hold. The kind is checked in the route, but the service is
   the domain's own gate and must refuse it too.
6. **The closeout's event-7 branch with no owner address** — a deactivated
   report owner — is covered: event 7 is skipped, and the transition still
   commits.
7. **The dispatcher's link fallback** — a responder event naming no response
   — is covered: the link points at the report rather than at a link with an
   empty segment.
8. **The reader's unknown-status guard** is covered by dropping the database's
   own CHECK constraint for one statement, with the row restored *before* the
   constraint is re-added.
9. **The reader's transaction-handle branch** is covered by reading the
   subject inside a transaction, as the closeout service does.
10. **The reader's no-selected-response branch** is covered by a report whose
    responses are all terminal.
11. **The closeout repository's matched-response guard** is covered by moving
    the matched response out from under the closeout — and the test asserts
    the report's status is unchanged, proving the rollback.

## What was verified

### The domain's rules (77 tests)

- The plan names the matched response; it is never inferred from order.
- A non-completable matched response refuses the **whole** closeout and
  resolves nothing.
- A terminal response is never touched and is named in `untouched`.
- The three statuses are distinct, and the plan accounts for every response
  exactly once and never twice.
- The reason is validated **first** — empty, under 10, over 500, and
  whitespace-only are all refused.
- `CLOSABLE_LOST_REPORT_STATUSES` is exactly `['Open', 'Verification
  Pending']`.
- `Returned` and `Closed` are terminal; any other status is
  `StatusNotApplicable`.
- A `Match Confirmed` response takes the exceptional route, with the matched
  responses named.
- The route is decided by the responses and not by the report's status.
- The catalogue is exactly the five events numbered 4–8, and the reverse
  lookup finds nothing for 1 or 9.
- The recipients table is asserted exactly.
- Event 8's gate refuses each of its five failure conditions and permits
  only the PRD's conjunction, with the report's condition evaluated first.
- The removal's three kinds are closed, and the reason's bound is enforced.
- A reason containing markup is kept verbatim.
- `recordsNewRemoval` is `!alreadyRemoved`, and a repeated removal is
  permitted but records nothing.

### The use cases (81 tests)

- The closeout's **call order** is asserted against a recording fake: read →
  decide → transaction → write → event → dispatch.
- The batch event's actor is a **system** actor with the administrator named
  in the typed `actingAdministratorId` column.
- The removal's write order is asserted: `readTargetState` → transaction →
  `recordRemoval` → `withholdContent` → `audit.record`.
- The removal row carries the administrator and the reason **verbatim**.
- The trail event is `content.removed_by_administrator` with the payload
  `{ targetKind, targetId, removalReason }`.
- The report's status is never written by a removal.
- The close service's **call order** is asserted, and the refusal paths write
  nothing.
- The close service takes **no email sender** — asserted structurally.
- The dispatcher sends events 5, 7, and 8 with the PRD's subjects; events 4
  and 6 are **refused** (`sent === false`, no message sent), because they
  belong to the Recovery Response workflow's own senders (ADR-14).
- The owner is pointed at `/my-reports/{id}` and the responder at
  `/my-recovery-responses/{id}`.
- A name carrying markup is escaped in the HTML body and kept verbatim in the
  text body.
- No Sensitive Field is carried.
- **A send failure returns `false` and does not throw** — a send failure never
  rolls back or blocks the transition (PRD §10, ADR-3 decision 4).

### The persistence (38 tests, live database)

- The conditional write lands only on `Verification Pending`; a report no
  longer in its precondition matches no rows and the repository returns
  `null`.
- The matched response completes to `Completed — Report Returned`; every other
  non-terminal response resolves to `Resolved — Report Returned`; a
  `Not a Match` response keeps its status.
- The reported set **is** the statement's `RETURNING` set.
- The report's move is skipped when the confirmation has already made it.
- The matched-response guard fires when the response changed underneath, and
  the report's status proves the rollback.
- The close moves `Open → Closed` and resolves every non-terminal response to
  `Resolved — Report Closed`; a terminal report matches no rows.
- The reader resolves the selected response **from the responses themselves**,
  carries the responder's address, finds nothing for a missing report or a
  **Found** report (the type is filtered in the query), honours a caller's
  transaction, reads no selected response when there is none, and refuses a
  status the vocabulary does not name.
- The removal's read resolves each of the three kinds; a report with no image
  has no image to remove; a target on another report is not found.
- The removal **marks** the content and keeps the row — `image_ref` and the
  message `body` both survive.
- The removal row carries `target_kind`, `removal_reason`, and `removed_by`.
- The unique index refuses a second removal; the CHECK constraints refuse an
  unknown kind and an out-of-bound reason.
- A handle with no usable transaction is refused with `/transaction/i`.
- The report's status stays `Open` after a removal.

### The transport (46 tests)

- The refusal **order** is asserted in both routes: actor before CSRF, CSRF
  before the body, the body before the use case.
- The status mapping is asserted: 403 (actor, CSRF), 400 (malformed body,
  validation), 404 (no report, no content), 409 (conflict).
- The remove-content route checks the **target's shape** — not an object, an
  unknown kind, and a missing `targetId` are each a 400 naming the field.
- The response bodies are asserted key by key.
- The actor is taken from the **session**; a body carrying an administrator
  flag or an actor id is ignored.
- The request handed to the use case is asserted to carry exactly
  `['actor', 'reason', 'reportId']` for the close and
  `['actor', 'reason', 'reportId', 'target']` for the removal — **no route
  flag and no closure request.**

## Success Criteria

The bolt's nine success criteria, each against a named backing test:

| # | Criterion | Where verified |
|---|---|---|
| 1 | Lost closeout resolves the report, every response, every thread, and both notifications in one transaction | service (the call order), adapter (the report, every response, and the events land together), closeout domain (every response accounted for once) |
| 2 | A partial failure leaves no partial state | adapter (the matched-response guard fires inside the transaction and the report is still `Verification Pending`) |
| 3 | Event 8 fires only when the response is `Completed — Report Returned` and the report is `Returned` | domain notifications (the gate's five refusal conditions), service (the gate reads the write's outcome) |
| 4 | Event 8 does not fire at `Match Confirmed`; standby responders never receive it | domain notifications (refused at `Match Confirmed`; refused for a standby responder), service (only the matched responder is dispatched) |
| 5 | Closure resolves non-terminal responses to `Resolved — Report Closed` in the same transaction | adapter (the close), close domain (the plan), service (the order) |
| 6 | Post-`Match Confirmed` closure is exceptional-administrator-only, requires a reason, and is event 25 | close domain (the route, the required reason), service (event 25's payload), route (no route flag travels) |
| 7 | No closure email reaches any responder or claimant | close service (the constructor takes no `EmailSender` — asserted structurally) |
| 8 | Content removal hides content from members while preserving its audit record | adapter (the content is marked, not deleted; `image_ref` and `body` survive), service (the trail event and its payload), adapter (the unique index refuses a duplicate) |
| 9 | A send failure never rolls back or blocks a transition | dispatcher (a failure returns `false` and does not throw), closeout service (the dispatch is strictly post-commit) |

## Owner Items

1. **The report's `status` is not changed by a removal, and that is the
   product's decision rather than a limitation.** FR-36 says so, and the
   suite pins it. An administrator who wants a moderated report closed makes
   **two** calls — a removal and a closure — and the two routes keep them
   apart by construction.
2. **The Items Awaiting Return queue and the confirm-returned form are not
   built.** Story 004's last two acceptance criteria — the queue that lists
   reports whose Lost side is `Match Confirmed` and the form that shows the
   owner and the matched response — belong to Unit 007 and bolt `021`. The
   backend this bolt delivers is what those surfaces will read.
3. **The Found-side closure's auto-rejection of pending Claims and the FR-29
   claim-rejection email are not delivered by this bolt.** Story 005's
   acceptance criteria name them, and they are the Found-side path — Unit
   003's territory. The bolt delivers the **Lost-side** closure, which is the
   one the Lost-side queue needs. The Found-side path is recorded as not yet
   satisfied rather than left implicit.
4. **A thread post racing the closeout is not directly tested.** The
   closeout's transaction boundary is proven, and the thread repository's own
   locking belongs to bolt `018`; the race between the two is not exercised
   here.
5. **The blast radius was not measured.** The full suite was not run, by owner
   direction. The bolt's own twelve suites are green, and the typecheck and
   lint are clean.
