---
id: 018-lost-threads
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 006-per-recovery-response-thread
  - 007-responder-withdraws-response
  - 008-recovery-response-audit-events
created: 2026-10-23T13:13:30Z
started: 2026-10-30T09:00:00Z
completed: 2026-10-30T09:15:00Z
current_stage: test
stages_completed: [implement, test]

requires_bolts:
  - 001-audit-core
  - 003-audit-lost-side-events
  - 011-lost-status-model
  - 015-lost-response-submit
  - 017-lost-lifecycle-determination
enables_bolts:
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 018-lost-threads

## Overview

One private conversation per Recovery Response, and the audit record of it.

## Objective

Deliver per-Recovery-Response threads with server-enforced isolation between
competing responders, plus the FR-48 audit events for the Lost-side workflow.

## Stories Included

- **006-per-recovery-response-thread**: one thread per response, never per report (Must)
- **007-responder-withdraws-response**: the responder's own narrow exit (Must)
- **008-recovery-response-audit-events**: events 15–30 recorded with actors and no sensitive values (Must)

**Story 007 was added to this bolt at implementation time.** It was marked
`complete` by bolt `011`, and bolt `011` delivered only the domain's
decision — the use case, the adapter, and the route did not exist, and
FR-48's event 20 was never fired. This bolt closes that gap.

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
- **001-audit-core** (required): posting and lifecycle are audited
- **011-lost-status-model** (required): thread writability derives from response status
- **015-lost-response-submit** (required): the responses that own threads
- **017-lost-lifecycle-determination** (required): statuses that lock and unlock threads

### Enables
- 021-web-admin

## Success Criteria

- [x] There is exactly one thread per Recovery Response and never one per Lost report
- [x] A competing responder cannot read another response's thread; denial happens at the API layer
- [x] Threads are writable while `Submitted`, `Selected for Verification`, or `Match Confirmed`
- [x] Threads are read-only at any terminal status or when the report is `Returned` or `Closed`
- [x] Messages are never deleted; a locked thread still shows its full history
- [x] Administrators see every response's thread during verification, standby included
- [x] No audit record contains an observed identifying detail, exact place, or thread body

## Notes

A per-report thread would leak every candidate's conversation to every other
candidate. The isolation must be enforced in the query, not by omitting a link
from the page.

## Outcome

**One private conversation per Recovery Response, and the responder's own exit
from a response they made.** The bolt delivers three layers each for the
thread and the withdrawal — the domain's rules, the use cases, the Prisma
adapters, and the routes — plus the FR-48 events 16 and 20 that the two
write paths fire.

**The isolation is structural, in three places at once.** The thread's
subject carries **no field** for the responder's where-found, observed
identifying details, or date found, so participation cannot leak private
evidence. The participation rule is derived from **that one Response's**
participants only, so the decision function has no input that could name a
competing responder. And the reader filters on the `(parent_type, parent_id)`
pair the pre-existing visibility reader filters on, with the database's own
CHECK constraint refusing a `recovery_response` parent that names a Claim.

**A missing Response is refused with the generic 403, never a 404.** The
Response's existence is a private fact about another member's assertion, and
a 404 would answer the question the isolation exists to keep private.

**The withdrawal's narrowness is a fact, not a rule.** The write is a
conditional `UPDATE` matching only a response still `Submitted`, so a
response selected between the read and the write is not withdrawn, the write
lands nothing, and no audit event is recorded for a withdrawal that did not
happen.

**The report is structurally untouched by a withdrawal.** The service holds no
report port at all, so there is no code path that could reach the report.

**No migration was needed.** The `thread_messages` table's constraints
already anticipated the `recovery_response` parent kind; this bolt only had
to write the rows the schema was waiting for.

**The two sides share no vocabulary.** The Lost side's writability whitelist
is the Lost side's own (`Open`, `Verification Pending`), the rate-limit
bucket is the Lost side's own, and neither module imports the other.

## Acceptance Criteria Not Implemented

1. **The thread is not paginated.** Story 006's edge case names a long
   thread as *"Paginated; ordering is stable"*. The history is returned in
   a stable order, but there is no pagination. Adding it changes
   `RecoveryResponseThreadReader.listThreadMessages`'s signature, which wants
   a deliberate decision rather than an accidental one.
2. **The concurrent-post edge case is unaddressed.** Story 006 names *"Post
   attempted concurrently with the report reaching `Returned` | Exactly one
   succeeds"*. The message write carries no conditional predicate, so a post
   racing the report's closure may land in a thread that has just become
   read-only. Closing it needs a conditional write keyed on the parent
   Response's status, which the schema does not carry.
3. **The administrator's screen is not built.** The administrator may read
   and post to every Response's thread through these routes, but the surface
   that lists them belongs to bolt `021`.