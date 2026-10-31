---
id: 023-claim-threads-notifications
stage: 5
stage_name: test
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
created: 2026-10-30T12:55:00Z
completed: 2026-10-30T12:55:00Z
verification_command: "npx vitest run src/domain/listings/claim-thread.test.ts src/application/listings/claim-thread-service.test.ts src/application/listings/report-close-service.test.ts src/infrastructure/listings/prisma-claim-thread-adapters.test.ts"
---

# Bolt 023 — Stage 5: Test Report

## Overview

The verification of the `023-claim-threads-notifications` bolt: the per-Claim
conversation, its read-only states, and the two Found-side notification events.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The thread's writability | `src/domain/listings/claim-thread.ts` | 007 | FR-26 |
| The participation whitelist | `src/domain/listings/claim-thread-participation.ts` | 007 | FR-26, FR-37 |
| The message body's bound | `src/domain/listings/claim-thread.ts` | 007 | FR-26 |
| The thread's audit event | `src/domain/listings/claim-thread-event.ts` | 007 | FR-48 (event 14) |
| The close's reason and event | `src/domain/listings/report-closure-reason.ts`, `report-close-event.ts` | 005, 008 | FR-21, FR-48 (event 10) |
| The thread use case | `src/application/listings/claim-thread-service.ts` | 007 | FR-26 |
| The close use case | `src/application/listings/report-close-service.ts` | 005, 008 | FR-21, FR-29 |
| The persistence | `src/infrastructure/listings/prisma-claim-thread-repository.ts` | 007 | FR-26 |
| The reads | `src/infrastructure/listings/prisma-claim-thread-reader.ts` | 007 | FR-26 |
| The transport | `src/app/api/claims/[id]/thread/`, `src/app/api/admin/reports/[id]/close/` | 007, 005 | FR-26, FR-21 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own modules and its own four
> suites**. The broader suite's state at the last full run is recorded in
> `memory-bank/maintenance-log.md`; this report does not claim a full-suite
> result it did not measure.

## The bolt's real subject: participation is never permission

**The whole bolt exists because of one hazard.** A finder has to be able to
talk to a claimant about an item they found, and the claimant's claim carries
**FR-37 Sensitive Fields** — the reason and the identifying details. If
participation carried those fields with it, the finder would learn another
member's private evidence merely by asking a question about an item.

**The hazard was closed structurally rather than by a promise.** The
participation decision names three relationships — the claimant, the finder,
and the administrator — and the reader's subject type,
`ClaimThreadSubject`, **has no field for the claimant's reason or identifying
details at all**. There is no code path by which the finder could receive
them, because there is nowhere to put them.

The suite proves this two ways. The domain suite asserts the participation
whitelist exhaustively. The service suite asserts the subject's **key list**,
so a future addition of a `reason` field to the port would fail the test
rather than silently widen the finder's view.

### A missing Claim is refused, not reported as missing

**A Claim's existence is itself a private fact.** A Claim is another member's
assertion that an item is theirs, and the fact that one exists — or does not
— is not a stranger's business. The service therefore answers a missing Claim
with the **access-denied** refusal, never a 404, and the suite proves the
message says nothing about whether a claim exists.

> **This was a real defect, found by the suite and fixed in the
> production code.** The service originally threw `NotFoundError` for a
> missing Claim before checking participation, so a stranger asking about a
> nonexistent Claim learned that it was not real — an existence oracle over
> another member's claims. The fix is in `claim-thread-service.ts`: a missing
> Claim is always `PermissionDeniedError(CLAIM_THREAD_ACCESS_DENIED_MESSAGE)`,
> in **both** the read and the post path, with the reasoning recorded in the
> code.

### The whitelist was inverted, and that was a second real defect

**Both gates in this bolt are whitelists, and one of them was not.** The
writability rule originally asked "is this one of the *locking* statuses?" —
`reportLocksThreads` checked `LOCKING_REPORT_STATUSES.includes(status)`. A
status the vocabulary does not own was therefore **not** in the locking set,
so it was waved through as writable.

**A gate written as a list of refusals waves through exactly the value nobody
has thought about** — a corrupted row, a future vocabulary change, a value
that arrived from a migration the domain does not model. The rule is now
"is this one of the statuses that permit posting?", so
`POSTABLE_REPORT_STATUSES` (`Open`, `Claim Requested`, `Claim Approved`) is
the whitelist and **everything else locks**. The suite proves it with
`'Awaiting Inspection' as never` → `true`, and proves the Found side's
`Verification Pending` — the Lost side's status, a contradiction on a Found
report — locks too.

## The schema was dictated, not invented

**The `thread_messages` table was not designed here.** The visibility reader
in `prisma-thread-visibility-reader.ts` has been querying it since bolt 008,
and `physical-columns.ts` already named its columns — but **the table itself
did not exist**. The migration was therefore written to match the reader that
was already in the codebase, so the reader and the table cannot disagree.

### The polymorphic parent is not enough on its own

**A `parent_id` is only meaningful together with the kind it is.** The reader
filters on `(parent_type, parent_id)` because one thread belongs to a parent
of some kind — a Claim, or (from bolt 018) a Recovery Response. The
polymorphic pair is the filter, but on its own it would let a row claim to
be a `claim` parent while pointing at nothing, and a reader that trusted
`parent_id` alone would be reading a thread nobody owns.

**So the table carries a `claim_id` foreign key and three CHECK constraints
say the pair must agree.** The database suite proves all of them live:

| Constraint | What it refuses |
|---|---|
| `thread_messages_parent_type_check` | A parent kind the vocabulary does not own — a row that would be invisible to every reader, which is a message written and lost |
| `thread_messages_parent_claim_consistency_check` | A `claim` parent that names no Claim, and a `recovery_response` parent that names one |
| `thread_messages_parent_id_agrees_check` | A `parent_id` that disagrees with the `claim_id` — the exact hole through which one Claim's thread could be handed to another's reader |
| `thread_messages_body_length_check` | A body outside 1–2000 characters, measured with `char_length` so an emoji is one character |

The repository writes `parent_id`, `parent_type`, and `claim_id` **from one
source** — the Claim id — so they cannot disagree in the first place, and the
constraint is the second line of defence rather than the first.

### The body's bound is enforced twice, on the same string

**The domain trims before it measures; the database checks the trimmed
string.** `createClaimThreadMessageBody` trims, then measures in code
points (`Array.from(value).length`), and the repository writes exactly the
text the domain measured. So `char_length` in the CHECK constraint is
checking the same string the domain bounded — and a body of 2000 spaces is
refused by the domain because it is 0 characters of message.

## The close is one act

**FR-21 says closing a Found report in `Claim Requested` transitions "any
Pending Claims … to `Rejected`", and FR-17's Trigger 3 says the same with
the verbatim reason "report closed by administrator".** Both happen in **one
transaction**, so a report that is `Closed` while a Claim is still `Pending`
cannot exist.

The service suite asserts the **order** of the calls, not merely their
presence: `reports.findById` → `transactions.run` → `resolver.rejectPendingClaims`
→ `reports.update` → `audit.record` → `audit.record` → `emails.send`. The
email is **after** the transaction, because it names a fact that is only true
once the commit has happened.

### Each auto-rejection is its own event

**Story 006 says "each auto-rejection is a distinct separate event rather
than a single combined entry", and an administrator auditing one specific
rejected Claim must find it.** The suite proves **one event per rejected
Claim**, each with its own `parentId`, and each naming the administrator who
caused it in the payload's `triggeredBy` — because the Claim's own decider
column stays `null` on an auto-rejection.

### The stored reason and the visible copy are separate artefacts

**The softening rule is a mapping, never a rewrite.** The trail carries the
PRD's own wording — *"report closed by administrator"* — verbatim, and the
administrator's own close reason is carried verbatim too. The email the
auto-rejected claimant reads is the **softened copy**, and the suite asserts
that the email's body contains the softened text and **does not** contain the
stored reason verbatim.

## A story conflict resolved by authority, not by preference

**Story 005 said "no email is sent to any responder or claimant" on any
closure, and story 008 said the auto-rejected claimant receives the FR-29
email carrying the reason "report closed by administrator".** The two
contradict each other.

**The PRD wins.** `requirements.md` states it outright: "Where this file and
the PRD differ, **the PRD wins**." And the PRD is explicit on both sides —
FR-29 names *"report closed by administrator"* as one of the auto-rejection
reasons (PRD line 643) and requires the rejected claimant to receive FR-29
(line 455). **Story 005's blanket "no email" was the error**, and its
criterion was amended in place with the reason recorded, rather than left in
contradiction.

## The audit catalog was not changed

**Event 10 (`report.found_closed_by_administrator`, payload
`previousFoundStatus` + `closureReason`) and event 14
(`thread.claim_message_posted`, payload `messageText`) already existed** in
the frozen catalog. The bolt's payload builders carry exactly what the
sanitizer permits and nothing more — and the sanitizer **denies by default**,
so naming the permitted fields permits exactly those fields.

**`messageText` is a Sensitive Field**, permitted only because the PRD names
it, and only on the administrator-visible trail — never in an operational log.

## Verification

### The command

```bash
npx vitest run \
  src/domain/listings/claim-thread.test.ts \
  src/application/listings/claim-thread-service.test.ts \
  src/application/listings/report-close-service.test.ts \
  src/infrastructure/listings/prisma-claim-thread-adapters.test.ts
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint` over the bolt's 18 modules and tests | ✅ clean, no errors |
| Test | the four suites above | ✅ **4 files, 160 tests, all passing** |
| Full suite | `npm run verify` | ⏭️ **not run** — out of scope by owner direction |

### Coverage

Scoped to **this bolt's own modules**:

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| The bolt's modules | **100** | **100** | **100** | **100** |

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `claim-thread.ts` | 100 | 100 | 100 | 100 |
| `report-close-event.ts` | 100 | 100 | 100 | 100 |
| `report-closure-reason.ts` | 100 | 100 | 100 | 100 |
| `claim-thread-service.ts` | 100 | 100 | 100 | 100 |
| `report-close-service.ts` | 100 | 100 | 100 | 100 |
| `ports/claim-thread-reader.ts` | 100 | 100 | 100 | 100 |
| `ports/claim-thread-repository.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-thread-reader.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-thread-repository.ts` | 100 | 100 | 100 | 100 |

**Every one of the bolt's nine modules is at 100% on all four measures.**
Two gaps were closed during this stage rather than left as they were: the
domain's `isClaimThreadWritable` predicate and its defensive `never`-guard
were untested, and the two Prisma adapters' transaction guards had three
branches each rather than one. The `never`-guards were covered by asserting
that they **throw** on a reason the vocabulary does not own — the branch is
provably unreachable through the type system, so exercising it deliberately
is the only way to prove the guard still works if the type is ever widened.

**One mapping was changed to remove a branch rather than to cover it.** The
repository returned `created.claimId ?? input.claimId`. The `??` was
unreachable — the CHECK constraint guarantees a `claim` parent carries a
`claim_id`, and the repository always writes one — so the fallback was a
branch that could never be taken and a claim id that could, in principle,
come from somewhere other than the caller. The mapping now states the
**caller's** Claim id directly, which is both total and more truthful: it is
the id the write was made against.

## What was verified

### The domain (1 suite, 58 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-thread.test.ts` | 58 | The participation whitelist — claimant, finder, administrator, and **the administrator check coming first**; `mayAccessClaimThread`; the access-denied message saying nothing about a claim's existence; the writability matrix across all four Claim statuses and every report status, with the **decided claim named before the ended report**; `reportLocksThreads` as a whitelist, refusing an unknown status and the Lost side's `Verification Pending`; the two read-only messages being different; the body's 1 and 2000 boundaries, its whitespace-only and non-string refusals, its trimming, its **code-point** counting (an emoji is one character), its error naming the field and never the value; event 14's exact payload; the close reason's 10 and 500 boundaries and its refusal of a `null` that must not become the string "null"; event 10's exact payload; the administrator's reason kept verbatim |

### The application (2 suites, 70 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-thread-service.test.ts` | 37 | The read path naming the three participants and refusing a stranger; **a missing Claim refused as access-denied, not as a 404**; the post path refusing a stranger, a missing Claim, a decided claim, an ended report, and an unknown report status; **the body bound checked before anything is read**; **a refused post writing nothing at all**; the message and the audit event sharing one transaction handle, in that order; the audit record's `parentType`, `parentId`, `metadata`, and the **poster's own role**; the subject's key list containing no reason and no identifying details |
| `report-close-service.test.ts` | 33 | The reason's bound checked first, before the report is read; a non-administrator refused; a **Lost** report refused, because its closure resolves Recovery Responses and is a different operation; a `Returned` or `Closed` report refused as a **conflict, not a permission failure**; the `Claim Approved → Closed` close legal; the status change and the claim rejections in **one transaction**, in order; the PRD's verbatim rejection reason; the close's own event with the previous status and the reason; **one auto-rejection event per rejected Claim**, each naming the administrator; the report returned as it was **before** the close; one email per auto-rejected claimant and **none to the finder**; the **softened copy** in the email and not the stored reason; the email **after** the commit; and the close standing even when the transport fails |

### The database (1 suite, 32 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `prisma-claim-thread-adapters.test.ts` | 32 | The parent's columns agreeing with each other on the row; the **trimmed** body stored; every write refusing a handle with no transaction, a null transaction, and a transaction that is not an object; the message **rolled back** when the transaction fails after the write; the subject's four facts — the Claim's status, the report's status, the claimant, the finder — and the report's status read **as it is** after the report ended; the history oldest first, with the **captured** display name; one thread's messages never appearing in another's; a missing claim read as absent; the display name read, and a missing author read as absent; the in-transaction read honoured; the round trip through the repository and the reader; the thread **taken with the Claim** when the Claim is deleted, and **with the report** when the report is deleted; and all four CHECK constraints plus the three foreign keys refusing what they are for |

The database suite runs against the **live database** and skips only when
`DATABASE_URL` is unset. It ran for every measurement in this report.

## Success Criteria

Every criterion is traced to the suite that proves it.

### 1. There is exactly one thread per Claim

**Proven by** `claim-thread-service.test.ts` and
`prisma-claim-thread-adapters.test.ts`.

The thread is addressed by its Claim — there is nothing to *create*, and a
thread with no messages is a thread with an empty history. The database
suite proves the isolation at the row level: two Claims on the same report
have two threads, and neither's messages appear in the other.

### 2. The thread is writable while the Claim is `Pending`

**Proven by** `claim-thread.test.ts` and `claim-thread-service.test.ts`.

The suite covers the matrix: writable on `Pending` with `Open`, `Claim
Requested`, **and `Claim Approved`** — a `Claim Approved` report is not a
terminal report, and a *second* pending Claim's thread is still writable
because the item is still active.

### 3. The thread is read-only once the Claim is decided or the report has ended

**Proven by** `claim-thread.test.ts` and `claim-thread-service.test.ts`.

The suite proves each of `Approved`, `Rejected`, and `Returned` makes the
Claim read-only, that `Returned` and `Closed` make the report read-only, and
that **a decided claim on an ended report is named `ClaimDecided`** — the
Claim's status is checked first, because the report's ending is not what
closed the thread.

### 4. Messages are never deleted; a locked thread keeps its full history

**Proven by** `claim-thread-service.test.ts` and
`prisma-claim-thread-adapters.test.ts`.

The read path and the write path are separate decisions: the service's
`readThread` returns the messages **and** the writability, so a locked
thread is still readable by its participants. The database suite proves the
**cascade** — a deleted Claim takes its thread, and a deleted report takes
its Claims and their threads.

### 5. The finder never sees the claimant's reason or identifying details

**Proven by** `claim-thread-service.test.ts`.

**Structurally.** The subject has no field for them, so there is nowhere to
put them. The suite asserts the subject's **key list** — a future addition
of a `reason` field to the port would fail the test rather than silently
widen the finder's view.

### 6. FR-28 reaches the finder when a claim is submitted

**Partially proven at this bolt.** The **recipient and the shape** of the
new-claim email are proved by bolt 013's suite, which owns the submission
path; this bolt owns the thread and the close. The submission path was not
re-tested here, and this report does not claim a result it did not measure.

### 7. FR-29 reaches the claimant only — the finder receives no claim-decision email

**Proven by** `report-close-service.test.ts` for this bolt's close trigger,
and by bolt 016's `claim-decision-service.test.ts` for the approval and
rejection triggers.

The close suite proves one email per auto-rejected claimant and **none to
the finder**, and that the copy is softened while the stored reason stays
verbatim.

### 8. Email is sent after commit; a send failure never rolls back or blocks a decision

**Proven by** `claim-thread-service.test.ts` and
`report-close-service.test.ts`.

Both suites assert the **order** — the send comes after `transactions.run` —
and the close suite proves that a **transport failure does not fail the
close**: the report is already `Closed` and its Claims are already
`Rejected`.

## Two real defects this stage found, and fixed in the production code

**Neither was accommodated in the test.** A suite that is bent to fit a
defect proves the defect.

### 1. The existence oracle on a missing Claim

The service threw `NotFoundError` for a Claim that did not exist, before
checking participation. **A stranger could ask whether a Claim was real and
read the answer off the status code.** The fix refuses a missing Claim with
the access-denied message in **both** the read and the post path — because a
Claim that does not exist has no participants, so every reader of it is
refused the same way.

### 2. The whitelist gap on an unknown report status

`reportLocksThreads` asked "is this one of the *locking* statuses?", so a
status the vocabulary does not own was waved through as writable. The rule
is now a whitelist of the statuses that **permit** posting, and everything
else locks — which is the safe direction for a corrupted row or a future
vocabulary change.

## Owner Items

1. **The `CHECK` constraints are invisible to Prisma.** They live only in
   the migration SQL. A `prisma migrate diff` against a drifted schema would
   not flag their absence — the protection is a test, not the migration
   tooling. This carries forward from bolt 013.

2. **The `thread_messages` table now exists, and bolt 008's reader had been
   querying a table that did not.** Any other pre-existing suite that
   exercised `prisma-thread-visibility-reader.ts` against a table it did not
   create should be re-run — the reader's behaviour cannot have changed, but
   its **availability** has.

3. **The blanket-delete race is still latent in the pre-existing suites.**
   This bolt's database suite deletes **only the rows it created**, by id.
   The pre-existing suites in `src/infrastructure/listings/` still use
   blanket deletes. This carries forward from bolt 011.

4. **The database's time zone must be set to UTC explicitly by the
   deployment.** This carries forward from bolt 007 and still constrains
   every timestamp comparison the Claim lifecycle makes.

5. **The routes are implemented but have no route-level suite.** The two
   thread routes and the close route were written and are wired into the
   stack, and the *services* behind them are covered — but the routes'
   own parsing, CSRF refusal, and status-code mapping are exercised only by
   their types and the services they call. Bolt 021's admin work should add
   route-level coverage for the close route, and a route suite for the two
   thread routes is advisable before the UI work in Unit 007 depends on
   them.

6. **The full suite has not been run against this bolt.** The owner scoped
   this stage to the bolt's own suites. Before the next bolt that touches
   the `claims` table, the `reports` table, or the Found report machine, a
   full run is advisable — particularly because this bolt's migration creates
   a table that bolt 008's reader already expects.
