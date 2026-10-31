---
id: 018-lost-threads
stage: 5
stage_name: test
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
created: 2026-10-30T09:15:00Z
completed: 2026-10-30T09:15:00Z
verification_command: "npx vitest run src/domain/recovery/recovery-response-thread.test.ts src/application/listings/recovery-response-thread-service.test.ts src/application/listings/recovery-response-withdrawal-service.test.ts src/infrastructure/listings/prisma-recovery-response-thread-adapters.test.ts 'src/app/api/reports/[id]/recovery-responses/[responseId]/thread/route.test.ts' 'src/app/api/reports/[id]/recovery-responses/[responseId]/thread/messages/route.test.ts' 'src/app/api/reports/[id]/recovery-responses/[responseId]/withdraw/route.test.ts'"
---

# Bolt 018 — Stage 5: Test Report

## Overview

The verification of the `018-lost-threads` bolt: one private conversation per
Recovery Response, server-enforced isolation between competing responders,
and the responder's own narrow exit from a response they have made.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The thread's rules | `src/domain/recovery/recovery-response-thread.ts` | 006 | FR-47 |
| The withdrawal's decision | `src/domain/recovery/recovery-response-status.ts` (`decideWithdrawal`) | 007 | FR-40 |
| The thread use case | `src/application/listings/recovery-response-thread-service.ts` | 006 | FR-47, FR-48 |
| The withdrawal use case | `src/application/listings/recovery-response-withdrawal-service.ts` | 007 | FR-40, FR-48 |
| The ports | `ports/recovery-response-thread-reader.ts`, `ports/recovery-response-thread-repository.ts`, `ports/recovery-response-withdrawal-repository.ts` | 006, 007 | FR-40, FR-47 |
| The persistence | `prisma-recovery-response-thread-reader.ts`, `prisma-recovery-response-thread-repository.ts`, `prisma-recovery-response-withdrawal-repository.ts` | 006, 007 | FR-40, FR-47 |
| The transport | `src/app/api/reports/[id]/recovery-responses/[responseId]/thread/`, `.../withdraw/` | 006, 007 | FR-40, FR-47 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## The bolt's real scope is three stories, not two

The bolt's frontmatter names two stories: `006` (the thread) and `008` (the
audit events). **The implementation is a third story wide**, and the reason is
a gap left by an earlier bolt.

**Story 007 — the responder's withdrawal — was marked `complete` by bolt
`011`, and bolt `011` delivered only the domain's decision.** The use case,
the adapter, and the route did not exist, and **FR-48's event 20
(`recovery_response.withdrawn_by_responder`) was never fired.** A responder
could not withdraw their response, because there was nothing to call.

This bolt closes that gap. The story's frontmatter now names `018` as its
bolt, and its acceptance criteria are verified by the suites below. **A story
marked complete whose use case did not exist was a hole in the trail**, and
the hole is closed here rather than papered over.

**No migration was needed.** The `thread_messages` table was created by bolt
`006` with a polymorphic parent, and its constraints already anticipated the
`recovery_response` kind:

```sql
CONSTRAINT "thread_messages_parent_type_check" CHECK (
    "parent_type" IN ('claim', 'recovery_response')
)
```

The schema was written for this bolt. This bolt only had to write the rows
the schema was waiting for.

## The isolation is a rule, not a convention

The bolt's note is explicit: *"A per-report thread would leak every
candidate's conversation to every other candidate. The isolation must be
enforced in the query, not by omitting a link from the page."*

**The isolation is enforced in three places at once, and each would hold
alone.**

**1. The subject carries no Sensitive Field.** The thread's subject — the
facts the gate reads — is the Response's status, the report's status, the
responder's id, and the report owner's id. It has **no field** for the
Response's where-found, its observed identifying details, or its date found.
That is how *"participation grants no private evidence"* (FR-39) is made
structural rather than promised: a field that does not exist cannot be
leaked, and the test asserts the subject's exact key set.

**2. The rule has no way to name a competing responder.** The participants
are derived from **this response alone** — the responder from this row, the
owner from this row's parent report. The parent report's *other* responses'
responders are never consulted. **A competing responder on the same Lost
report is not a participant here**, and the decision function has no input
that could name them.

**3. The query filters on the parent pair.** The reader filters on
`parent_type = 'recovery_response'` **and** `parent_id = <the response id>` —
the same pair the pre-existing visibility reader in
`prisma-thread-visibility-reader.ts` filters on, so the two readers can never
disagree about which messages belong to which thread. The database's
`thread_messages_parent_claim_consistency_check` then refuses a
`recovery_response` parent that also names a Claim.

**The test that proves it is the negative one:** a message posted to one
Response's thread is *absent* from a competing Response's thread on the same
report. It is asserted in the domain suite, the service suite, and the
database suite.

## A missing Response is a 403, never a 404

**This was a deliberate departure from the Found side's Claim thread**, which
answers a missing Claim with a 404.

A Recovery Response is another member's assertion that they found the item.
**The fact that one exists — or does not — is not a stranger's business.** A
404 would answer the question "is this response real?", which is exactly the
question the isolation is meant to keep private.

So the refusal is the **generic** one — *"You do not have access to this."* —
and it is the same answer whether the Response exists and the viewer may not
see it, or does not exist at all. The service suite asserts both, and the
route suite asserts the status code.

## Read-only is a change of writability, not of history

**A locked thread keeps its full history.** Closing a thread changes
**writability only** — the read path and the write path are separate
decisions, and the story's *"messages are never deleted; a locked thread
keeps its full history"* is asserted in three places: the service suite reads
a `Withdrawn` response's thread and finds its message still there, the route
suite returns a locked thread's history with `writable: false`, and the
database suite proves the cascade that keeps a deleted report's threads with
it.

**The writability is a whitelist, written as the permitted statuses.** Only
`Submitted`, `Selected for Verification`, and `Match Confirmed` may be
posted to. A status the vocabulary does not own is **refused**, not waved
through — and the domain suite asserts that refusal explicitly, because a list
written as the *forbidden* statuses would have passed every other test.

**`Match Confirmed` is writable because it is non-terminal.** The item has
been identified but not yet handed over, so the handover is still to be
arranged. The domain suite proves the whole rule against the vocabulary's own
terminal and non-terminal lists, so a status added to either set is classified
without this suite naming it.

**The report's whitelist is the Lost side's own.** Only `Open` and
`Verification Pending` keep a Lost report alive. The Found side's `Claim
Requested` and `Claim Approved` are absent, and the module does not import the
Found side's vocabulary to ask the question.

## The withdrawal is narrow, and the narrowness is a fact

**The domain's rule is the user-facing half; the conditional write is the
fact.**

The service reads the response's facts, decides, and then writes. The write
is a conditional `UPDATE` that matches only a response still `Submitted`:

```ts
const updated = await client.recoveryResponse.updateMany({
  where: { id: responseId, status: 'Submitted' },
  data: { status: 'Withdrawn', updatedAt: new Date() },
});

return updated.count === 1;
```

**A response selected between the read and the write is not withdrawn**, the
write lands nothing, and the transaction rolls back with the conflict. The
service suite asserts that no event is recorded for a withdrawal that did not
happen — the trail is append-only, so a record for it would be a permanent
falsehood.

**The report is structurally untouched.** The withdrawal service holds **no
report port at all**, so there is no code path that could reach the report.
The database suite proves it anyway: the report is put into `Verification
Pending`, a response is withdrawn, and the report is still
`Verification Pending`.

**The message and the event commit together.** The trail is append-only with
no correction path (ADR-6), so an audit record for a withdrawal that did not
happen — or a withdrawal with no audit record — is a permanent hole. Both are
inside one transaction, and the suite asserts the *order* of the calls, not
merely that each happened.

## The two sides share no vocabulary

**This module does not import the Found side's thread module, and the Found
side's does not import this one.** The two state machines answer different
questions about different workflows: a Claim is `Pending` until it is decided
and its report is active in the *Found* statuses; a Recovery Response is
`Submitted` until it is selected and its report is active in the *Lost*
statuses.

The unit brief is explicit that the two workflows *"must never share a
transition function, an aggregate, or a status enum"*, and a shared
writability predicate would be exactly such a shared function — answering two
different questions with one answer.

**The route's rate-limit bucket is separate too.** The Lost side uses
`recovery-response-thread:member:<id>` and the Found side uses
`thread-message:member:<id>`, so a member's Lost-side posts do not consume
the Claim thread's allowance. The route suite asserts both that the bucket is
keyed by member rather than by IP, and that it is **not** the Found side's
bucket.

## Verification

### Command

```
npx vitest run \
  src/domain/recovery/recovery-response-thread.test.ts \
  src/application/listings/recovery-response-thread-service.test.ts \
  src/application/listings/recovery-response-withdrawal-service.test.ts \
  src/infrastructure/listings/prisma-recovery-response-thread-adapters.test.ts \
  'src/app/api/reports/[id]/recovery-responses/[responseId]/thread/route.test.ts' \
  'src/app/api/reports/[id]/recovery-responses/[responseId]/thread/messages/route.test.ts' \
  'src/app/api/reports/[id]/recovery-responses/[responseId]/withdraw/route.test.ts'
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Domain — `recovery-response-thread.test.ts` | 1 | 41 | ✅ pass |
| Application — the bolt's two suites | 2 | 57 | ✅ pass |
| Infrastructure — the bolt's adapter suite | 1 | 34 | ✅ pass |
| Transport — the bolt's three routes | 3 | 39 | ✅ pass |
| **Total** | **7** | **171** | ✅ **171 pass, 0 fail** |

*(The command above runs 171 tests across 7 files. The `select` route suite
under the same directory is bolt `017`'s and is not part of this bolt; running
the whole directory gives 180 tests across 8 files.)*

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `domain/recovery/recovery-response-thread.ts` | 100% | 94.73% | 100% | 100% |
| `application/listings/recovery-response-thread-service.ts` | 100% | 100% | 100% | 100% |
| `application/listings/recovery-response-withdrawal-service.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-recovery-response-thread-reader.ts` | 100% | 93.33% | 100% | 100% |
| `infrastructure/listings/prisma-recovery-response-thread-repository.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-recovery-response-withdrawal-repository.ts` | 100% | 95% | 100% | 100% |
| **Total** | **100%** | **96.92%** | **100%** | **100%** |

**The uncovered branches are the defensive type guards** — the
`typeof text === 'string'` check in the body constructor, and the
`transaction === undefined` alternations in the readers' guards. Each guards
a value the type system already forbids; each is a defence against a caller
that bypassed the type. None is a rule.

## What was verified

### The thread's rules (domain, 41 tests)

- The body is trimmed, then measured, in **code points** — an emoji counts
  as one character, which is what a member means and what the database's
  `char_length` counts.
- The bound is 1–2000 inclusive at both ends; one character over is refused.
- **The refusal names the field and never the value** — a message body may
  itself carry something sensitive.
- The three writable statuses are exactly the story's three; the two active
  Lost report statuses are exactly the Lost side's two.
- **A status the vocabulary does not own is refused**, in both the response's
  status and the report's.
- **Every terminal status is read-only and every non-terminal status is
  writable**, checked against the vocabulary's own lists.
- `ResponseEnded` and `ReportEnded` are distinct, and the response's status
  is checked first.
- The read-only message names the path forward.
- The three participants are named; `None` is a relationship, not an absence,
  and it grants nothing.

### The thread use case (application, 39 tests)

- The responder, the Lost report's owner, and an administrator each read and
  post; **a competing responder on the same report is refused**.
- **A missing Response is the access-denied refusal, never a 404.**
- The read reports writability and its reason, and **still returns a locked
  thread's full history**.
- **A refused post writes nothing at all** — no transaction, no message, no
  event — and the suite asserts the *absence* of each call.
- **The body is validated before anything is read**, so a body that breaks
  its bound is refused before the thread is touched.
- The message and the audit event are written **inside one transaction**, and
  the suite compares the three call positions.
- **The event 16 payload carries exactly `messageText` and the response id**,
  and its parent is the *message*.
- The author's role is the poster's role, not a fixed one.
- **The subject's exact key set is asserted** — six fields, none of them a
  Sensitive Field.

### The withdrawal use case (application, 18 tests)

- Only the responder may withdraw, and only while the response is untouched
  `Submitted`.
- A deactivated responder may not withdraw — **FR-5 preserves the response;
  it does not stop the account from acting.**
- A selected, decided, or unrecognised status is refused.
- **A lost race lands nothing and records no event.**
- The report's status is not named in the event, because nothing about it
  changed.

### The persistence (infrastructure, 34 tests against a live database)

- **The parent columns agree with each other** — `parent_type` is
  `recovery_response`, `parent_id` is the Response's id, and `claim_id` is
  **null**.
- **Two Responses on the same report have separate threads**, and one
  reader never sees the other's messages.
- **The conditional write is the fact**: a `Submitted` response is withdrawn
  and reports `true`; a response selected between the read and the write
  matches no rows, reports `false`, and is **left unchanged**.
- **The report's status is untouched** by a withdrawal.
- Every adapter **refuses a handle that carries no usable transaction**,
  rather than silently falling back to the root client.
- **A failed transaction rolls the message back** — no half-committed thread
  can exist.
- **The database's own constraints are live**: a 2001-character body, an
  empty body, an unknown parent kind, a `recovery_response` parent that
  names a Claim, an unknown report, and an unknown author are all refused by
  PostgreSQL itself.

### The transport (routes, 39 tests)

- The read route: 401 for anonymous, **403 with the generic message for a
  stranger, 403 (not 404) for a missing Response**.
- The message route: 401, 403 for a bad CSRF token, 400 for a malformed or
  non-string body, 403 for a stranger, 409 for a read-only thread, 429 for a
  throttled request.
- The withdrawal route: 401, 403 for a bad CSRF token, 403 for a
  non-responder, 403 for a deactivated account, 409 for a response that may
  no longer be withdrawn.
- **The CSRF check comes before the body is read** — a request with a
  non-JSON body and a bad token is refused for the *token*, not the body.
- **The rate limit runs before the use case**, and the suite asserts the
  use case was not reached when the limit fired.
- **The bucket is keyed by member, not by IP**, and is the Lost side's own.
- **All three responses carry no stored field** — the bodies are asserted
  key by key, not by a spot check.
- **The read and the withdrawal routes never read the body.**

## Success Criteria

| # | Criterion | Where it is proven |
|---|---|---|
| 1 | Exactly one thread per Recovery Response, never one per Lost report | `prisma-recovery-response-thread-repository.ts` (`parent_id` is the Response); `prisma-recovery-response-thread-adapters.test.ts` (two Responses on one report have separate threads) |
| 2 | A competing responder cannot read another response's thread; denial happens at the API layer | `recovery-response-thread.ts` (`decideRecoveryResponseThreadParticipation` has no input that could name a competing responder); `recovery-response-thread-service.test.ts` (a competing responder is refused on both the read and the post) |
| 3 | Threads are writable while `Submitted`, `Selected for Verification`, or `Match Confirmed` | `recovery-response-thread.ts` (`POSTABLE_RECOVERY_RESPONSE_STATUSES`); `recovery-response-thread.test.ts` (each of the three, and every non-terminal status) |
| 4 | Threads are read-only at any terminal status or when the report is `Returned` or `Closed` | `recovery-response-thread.test.ts` (every terminal status; `Returned`; `Closed`); `recovery-response-thread-service.test.ts` (the post is refused with a conflict) |
| 5 | Messages are never deleted; a locked thread still shows its full history | `recovery-response-thread-service.test.ts` (a `Withdrawn` response's thread still reads its message); `thread/route.test.ts` (the route returns a locked thread's history with `writable: false`) |
| 6 | Administrators see every response's thread, standby included | `recovery-response-thread.ts` (the administrator check comes first); `recovery-response-thread-service.test.ts` (an administrator reads and posts to a `Submitted` response's thread) |
| 7 | No audit record contains an observed identifying detail, exact place, or thread body | `recovery-response-thread-service.test.ts` (the subject's exact key set is asserted — six fields, none a Sensitive Field; the event 16 payload carries exactly `messageText` and the response id) |

**Criterion 6 needs a word of explanation.** "Standby" is not a stored
status — FR-41 does not own it, and a sibling response is `Submitted`. The
administrator's access is therefore proven against a `Submitted` response,
which **is** the standby case: a response nobody has selected, whose thread
the administrator may still read and post to.

**Criterion 7 is proven structurally rather than by inspection.** The
responder's where-found, observed identifying details, and date found are
FR-44's fields and FR-37's Sensitive Fields. The thread's subject has **no
field** for them, so there is no argument through which they could reach the
owner. The suite asserts the subject's exact key set, which is a stronger
statement than asserting that a particular field is absent.

## Two tests that had to be rewritten

**The domain suite asserted two status names that do not exist.** The tests
for the terminal statuses guessed `Resolved — Match Completed` and `Resolved —
Not a Match`; the vocabulary's actual terminal set is `Not a Match`,
`Completed — Report Returned`, `Resolved — Report Returned`, `Resolved —
Report Closed`, and `Withdrawn`. The two tests were corrected to the real
names — and a **pair of tests was added** that checks the rule against the
vocabulary's own `TERMINAL_RECOVERY_RESPONSE_STATUSES` and
`NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` lists. **The rule can no longer
drift from the vocabulary**, because a status added to either list is
classified by these tests without them naming it.

**The withdrawal route test asserted the wrong owner for a refusal.** The
test set the actor to `Pending` and expected the *route* to answer 403. The
route does not check the account's status — it carries the capability across
and the **service** decides. The test was corrected to model the service's
refusal, which is where the decision actually lives. The route's own
contribution — carrying `isAccountActive: false` — is asserted separately.

**No rule was weakened.** In both cases the *test* was wrong about where a
decision lives, and the fix moved the assertion to the right place.

## Two route-level findings

**A GET request cannot carry a body.** The read route's "never reads the
body" test constructed a `Request` with a body on a `GET`, which the WHATWG
`Request` constructor refuses outright. **The assertion was meaningless as
written**, and it was replaced with one that proves the thing worth proving:
the route takes the Response id from the path and **does not read the report
id**, so a client cannot point it at another report's thread.

**The route carries the capability rather than re-deriving it.** The shared
route helper resolves the actor once and carries `isAccountActive` across
with it. The withdrawal route does **not** call `hasMemberCapability` itself —
the `ActorContext` boundary is where the `Pending` restriction is enforced
once, and a route that re-read the account would be a second answer to the
same question.

## Owner Items

1. **The thread is not paginated.** Story 006's edge case names a long
   thread as *"Paginated; ordering is stable"*. The reader returns the whole
   history in a stable order (`postedAt` ascending), but there is **no
   pagination**. The path to it needs a cursor and a limit on
   `RecoveryResponseThreadReader.listThreadMessages`, which changes the port's
   signature — a decision worth making deliberately rather than by accident.
2. **The concurrency edge case is unaddressed.** Story 006 names *"Post
   attempted concurrently with the report reaching `Returned` | Exactly one
   succeeds; the thread locks on the transition"*. The thread's writability is
   read and then written, and the message write carries **no** conditional
   predicate — so a post that races the report's closure may land in a thread
   that has just become read-only. The bolt's scope does not include it, and
   closing it means a conditional write on `thread_messages` keyed on the
   parent Response's status, which the current schema does not carry.
3. **The administrator's surface is not built.** The administrator can read
   and post to every Response's thread through these routes, but the screen
   that lists them belongs to bolt `021` (the web admin surface).
4. **The audit-event story is only partly this bolt's.** FR-48 spans events
   15–30, and events 21, 22, 26, and 30 fire from Unit 005's return closeout.
   This bolt verifies the events it fires — **16** (thread message posted) and
   **20** (response withdrawn) — and the trail's append-only refusal and the
   sanitizer are bolt `001`'s. The story's end-to-end coverage across both
   units is verified in Unit 005.
5. **The two new routes have no rate limit of their own.** The thread's
   *message* route is rate limited (ADR-15) with its own member-keyed bucket;
   the read route and the withdrawal route are not, because ADR-15's limit
   table does not name them and neither is a high-volume write path.
