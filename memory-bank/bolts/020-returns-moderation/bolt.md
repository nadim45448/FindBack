---
id: 020-returns-moderation
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 004-complete-lost-verification-closeout
  - 005-close-report
  - 006-remove-inappropriate-content
  - 007-lost-side-notification-events
created: 2026-10-23T13:14:30Z
started: 2026-10-30T10:00:00Z
completed: 2026-10-30T16:30:00Z
current_stage: test
stages_completed: [implement, test]

requires_bolts:
  - 001-audit-core
  - 003-audit-lost-side-events
  - 019-returns-closeout
enables_bolts:
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 020-returns-moderation

## Overview

The terminal transitions and the notifications that fire with them.

## Objective

Deliver the atomic Lost-side closeout that resolves every response and locks
every thread, administrator closure with its resolution rules, content removal,
and the Lost-side notification events.

## Stories Included

- **004-complete-lost-verification-closeout**: report, all responses, all threads, events 7 and 8 — one transaction (Must)
- **005-close-report**: closure to `Closed`, resolving dependents, never implying recovery (Must)
- **006-remove-inappropriate-content**: removal that preserves the audit record (Must)
- **007-lost-side-notification-events**: events 4–8 with the event-8 gate enforced (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [~] **1. model**: Skipped by owner direction
- [~] **2. design**: Skipped by owner direction
- [x] **3. implement**: Complete → source
- [x] **4. test**: Complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): every terminal transition and removal is audited
- **003-audit-lost-side-events** (required): events 24–26 and 30 fire from here
- **019-returns-closeout** (required): the Returned transition this bolt extends

### Enables
- 021-web-admin

## Success Criteria

- [x] Lost closeout resolves the report, every response, every thread, and both notifications in one transaction
- [x] A partial failure leaves no partial state
- [x] Event 8 fires only when the response is `Completed — Report Returned` and the report is `Returned`
- [x] Event 8 does not fire at `Match Confirmed`; standby responders never receive it
- [x] Closure resolves non-terminal responses to `Resolved — Report Closed` in the same transaction
- [x] Post-`Match Confirmed` closure is exceptional-administrator-only, requires a reason, and is event 25
- [x] No closure email reaches any responder or claimant
- [x] Content removal hides content from members while preserving its audit record
- [x] A send failure never rolls back or blocks a transition

## Notes

Four stories at the upper limit, but they share one property: each is a terminal
state change with irreversible consequences, and splitting them would mean testing
the atomic closeout without the closure rules that share its transaction boundary.

## Outcome

**Four terminal transitions, delivered as one bolt across the four layers.**
The bolt delivers the domain's rules in `src/domain/recovery/` (the closeout's
plan and the closure's route), `src/domain/moderation/` (the removal's
decision), and `src/domain/notifications/` (the five events and their gates);
the use cases and their ports in `src/application/listings/` and
`src/application/notifications/`; the Prisma adapters in
`src/infrastructure/listings/`; and the two thin admin routes under
`src/app/api/admin/reports/[id]/close-lost/` and `.../remove-content/`.

**The closeout is one transaction, and the atomicity is a fact rather than a
promise.** The report's move, the matched response's completion, every other
response's resolution, and both audit events are written inside one
transaction — and the live-database suite proves the rollback the hard way:
it moves the matched response out from under the closeout, so the adapter's
guard fires *inside* the transaction, and the report is still `Verification
Pending` afterwards.

**The batch's set is the statement's `RETURNING` set (ADR-10).** The set that
was resolved and the set that is reported are the same set by construction —
not a read followed by a write, which could disagree with itself.

**Event 8's gate reads what the write produced, and that was a real bug.**
The closeout's `notify()` had been reading the matched response's status from
the subject — the object read *before* the write, which carries `Match
Confirmed`. The gate requires `Completed — Report Returned`, so **the
successful-recovery email was silently never sent.** The module's own doc
comment already stated the intent; the code did not honour it. The status is
now threaded out of `write()` and into the gate, and the suite pins it.

**The two closure routes are decided by the responses, never by the client.**
`Verification Pending` covers both the pre- and post-determination phases, so
the report's status cannot tell the routes apart — the matched response's
status can. The close-lost route passes **no route flag**, so a client cannot
choose whether its close is "ordinary" and cannot choose which audit event (24
or 25) its report receives.

**No closure email is possible, not merely absent.** The close service takes
**no `EmailSender` at all** — the suite asserts the constructor's arity — so a
future edit that wanted to add one would have to change the constructor before
it could. FR-30's "no closure email to responders or claimants" is enforced by
the shape of the code.

**A removal withholds the content; it never deletes it.** The trail is
append-only with no correction path (ADR-6), so a removal that physically
deleted the content would leave the audit record naming something that no
longer exists. The removal is a **row** — `content_removals` — plus a marker
on the content's own row, and the live-database suite asserts the content
survives the mark (`image_ref` and the message `body` both still there).

**A removal is not a closure, and the two routes keep them apart.** The
remove-content route carries no closure request; the request handed to the use
case is asserted to have exactly the keys `['actor', 'reason', 'reportId',
'target']`. The report's status is never written by a removal — FR-36 says so
explicitly, and the live-database suite asserts the report is still `Open`
after one.

**The removal's row is inserted before the content is marked.** The unique
constraint on the target is the second line of defence against a duplicate, and
it must refuse *before* the content is touched — so a duplicate raises the
constraint error, which rolls the transaction back with the content's mark.

**The catalogue was not extended.** Events 4–8 and 24–27 and 30 already
existed. The removal's trail event is `content.removed_by_administrator`,
which is **non-numbered** — a record FR-36 requires that the frozen catalog
does not number.

## Acceptance Criteria Not Implemented

1. **The Items Awaiting Return queue and the confirm-returned form are not
   built.** Story 004's last two acceptance criteria — the queue that lists
   reports whose Lost side is `Match Confirmed`, and the form that shows the
   Lost-report owner and the matched response — belong to Unit 007 and bolt
   `021`. The backend this bolt delivers is what those surfaces will read.
2. **The Found-side closure's auto-rejection of pending Claims and the FR-29
   claim-rejection email are not delivered here.** Story 005 names them, and
   they are the **Found-side** path — Unit 003's territory. This bolt
   delivers the Lost-side closure, which is the one the Lost-side queue
   needs. The Found-side path is recorded as not yet satisfied rather than
   left implicit.
3. **A thread post racing the closeout is not directly exercised.** The
   closeout's transaction boundary is proven, and the thread repository's own
   locking belongs to bolt `018`; the race between the two is not tested
   here.