---
id: 016-claim-decisions
stage: 5
stage_name: test
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
created: 2026-10-30T06:30:00Z
completed: 2026-10-30T06:30:00Z
verification_command: "npx vitest run src/domain/listings/claim-decision.test.ts src/application/listings/claim-decision-service.test.ts src/application/listings/claim-review-service.test.ts src/app/api/admin/claims/claim-admin-routes.test.ts src/infrastructure/listings/prisma-claim-decision-adapters.test.ts"
---

# Bolt 016 — Stage 5: Test Report

## Overview

The verification of the `016-claim-decisions` bolt: the administrator
decides which claim is real, and every consequence of that decision — the
review screen, the atomic approval, the rejection, the Found report's
status moves, and the three auto-rejection triggers.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The decision gate | `src/domain/listings/claim-decision.ts` | 003, 004 | FR-17, FR-18 |
| The rejection reason's bound | `src/domain/listings/claim-decision.ts` | 004 | FR-18 |
| The auto-rejection's trigger | `src/domain/listings/claim-auto-rejection.ts` | 006 | FR-17 |
| The auto-rejection's softened copy | `src/domain/listings/claim-auto-rejection-copy.ts` | 006 | FR-17 |
| The three audit events | `src/domain/listings/claim-decision-events.ts` | 003, 004, 006 | FR-17, FR-18 |
| The review screen's assembly | `src/domain/listings/claim-review.ts` | 002 | FR-16 |
| The report's status machine | `src/domain/listings/found-report-status.ts` | 005 | FR-22 |
| The decision use case | `src/application/listings/claim-decision-service.ts` | 003, 004 | FR-17, FR-18 |
| The review screen's use case | `src/application/listings/claim-review-service.ts` | 002 | FR-16 |
| The decision email | `src/application/listings/claim-decision-email.ts` | 003, 004 | FR-17 |
| The persistence | `src/infrastructure/listings/prisma-claim-decision-repository.ts` | 003, 004, 006 | FR-17, FR-18 |
| The reads | `src/infrastructure/listings/prisma-claim-decision-reader.ts`, `prisma-claim-review-reader.ts` | 002, 003 | FR-16 |
| The transport | `src/app/api/admin/claims/` | 002, 003, 004 | FR-16, FR-17, FR-18 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own modules and its own five
> suites**. The broader suite's state at the last full run is recorded in
> `memory-bank/maintenance-log.md`; this report does not claim a full-suite
> result it did not measure.

## The bolt's real subject: two administrators, one item

**The whole bolt exists because of one concurrency hazard.** Two
administrators, two different Claims, one Found item. Each reads the Claim
as `Pending`, each reads the report as `Claim Requested`, and each believes
they may approve. Without a mechanism, both commit and the item has two
winners.

**The mechanism is the Found report's row lock,** and the bolt has **three
layers** of protection. Each is necessary, and each closes a window the
others leave open:

| Layer | Where | Closes |
|---|---|---|
| The advisory pre-transaction read | `readDecisionState` before the transaction opens | A decision on an already-decided Claim — refused without opening a transaction at all |
| The in-transaction re-read, after the lock | `readDecisionState` inside the transaction | The window between the advisory read and the lock |
| The conditional write | `UPDATE … WHERE "status" = 'Pending'` | The window between the re-read and the write |

The service suite proves the **order** — the lock comes *before* the
re-read, and both come before the write. It proves the second layer by
making the fake reader report a decided Claim on its second call. The
database suite proves the first and third layers against the **live
PostgreSQL**.

### The row lock was proven, not asserted

**The lock's behaviour was measured rather than assumed.** A temporary probe
opened two transactions against the live database: the first took the lock
and paused; the second blocked on `SELECT … FOR UPDATE`. The probe printed:

```
A locked, saw Claim Requested
A wrote 1
B locked, saw Claim Approved
B wrote 1
```

**B waited for A's commit and then read A's move.** That is the fact the
whole design rests on, and it is a fact about the database rather than about
a mock's return value.

> **PostgreSQL's default isolation is `read committed`,** and under it
> `SELECT … FOR UPDATE` **re-reads the row after the lock is acquired**. A
> transaction that took its snapshot before the other committed therefore
> still sees the committed value. The database's
> `default_transaction_isolation` was read and confirmed as `read committed`.

The probe was deleted once it had done its job. The behaviour it revealed
is now asserted by two permanent tests.

### A defect the first serialisation test found — in the test, not the code

The first version of the serialisation test **allowed both approvals to
land.** The probe showed why: the test's helper wrote the Claim
unconditionally and made only the *report's* move conditional on the observed
status. The real service refuses the second administrator because
`decideFoundReportTransition({currentStatus: 'Claim Approved', cause:
'ClaimApproved'})` returns `Refused`.

**No production code was changed — the defect was in the test.** The helper
was rewritten to consult the transition table exactly as the service does.
The finding is recorded here because a test that proves concurrency safety
must itself be modelled on the production path, or it proves nothing.

### The ordering is forced, not hoped for

A concurrency test that runs two transactions "at the same time" is
asserting on a race: it passes or fails depending on which transaction
happened to win the lock. Both lock tests therefore **start the first
transaction, wait 100 ms, and only then start the second** — so the first
provably holds the lock when the second arrives. The tests assert
`first === 'Claim Requested'` and `second === 'Claim Approved'`.

## The stored reason and the visible copy are separate artefacts

**The softening rule is a mapping, never a rewrite.** The audit trail
carries the trigger's reason verbatim; the email a rejected claimant reads
carries softened copy that never contains it. The two are separate values
produced by separate modules.

The domain suite asserts the separation from both sides: the audit event's
payload carries the exact trigger reason, and the copy never contains the
stored reason verbatim. It also asserts the copy's three refusals — no
blame, no promise of a reopen, no naming of the winning claimant — and that
the contact path names an administrator rather than a colleague.

> **The auto-rejection's decider is `null` by design.** A reporter-caused
> rejection has no administrator: the human is in the audit event's
> `triggeredBy`, and the decider column stays empty. The suite proves the
> `triggeredBy` names the human while the decider remains `null`.

## The audit catalog was not changed

**Events 3, 4, and 5 already existed** — `claim.approved` (no fields),
`claim.rejected_by_administrator` (`['reason']`), and `claim.auto_rejected`
(`['triggeredBy','triggeringAction','foundReportId','autoRejectionReason']`).
The bolt's payload builders carry exactly what the sanitizer permits, and
nothing more. The payload sanitizer **denies by default**, so naming the
permitted fields permits exactly those fields; the approval's empty payload
is stored as `null` metadata.

## The route's authorisation is one shared path

**All three administrator routes — the review screen, the approval, and the
rejection — refuse the same actors,** because they all go through
`resolveAdministrator`. The route suite proves this from the outside: an
anonymous actor and a member actor are refused by every route, and a
non-administrator is refused **before the request body is read** — the suite
asserts the body was never touched.

## Verification

### The command

```bash
npx vitest run \
  src/domain/listings/claim-decision.test.ts \
  src/application/listings/claim-decision-service.test.ts \
  src/application/listings/claim-review-service.test.ts \
  src/app/api/admin/claims/claim-admin-routes.test.ts \
  src/infrastructure/listings/prisma-claim-decision-adapters.test.ts
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint src/domain/listings/ src/application/listings/ src/app/api/admin/ src/infrastructure/listings/` | ✅ clean, no errors |
| Test | the five suites above | ✅ **5 files, 168 tests, all passing** |
| Full suite | `npm run verify` | ⏭️ **not run** — out of scope by owner direction |

### Coverage

Scoped to **this bolt's own modules**:

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| The bolt's modules | **100** | **98.03** | **100** | **100** |

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `claim-decision.ts` | 100 | 100 | 100 | 100 |
| `claim-auto-rejection.ts` | 100 | 100 | 100 | 100 |
| `claim-auto-rejection-copy.ts` | 100 | 100 | 100 | 100 |
| `claim-decision-events.ts` | 100 | 100 | 100 | 100 |
| `claim-review.ts` | 100 | 100 | 100 | 100 |
| `claim-decision-service.ts` | 100 | **94.73** | 100 | 100 |
| `claim-decision-email.ts` | 100 | 100 | 100 | 100 |
| `claim-review-service.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-decision-reader.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-decision-repository.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-review-reader.ts` | 100 | 100 | 100 | 100 |
| `src/app/api/admin/claims/**` | 100 | 100 | 100 | 100 |

**The two uncovered branches in `claim-decision-service.ts` (lines 296 and
537) are the transition table's `Unchanged` outcome, and they are provably
unreachable from this bolt's two callers.** `Unchanged` is produced only
when the cause's target equals the current status. For `ClaimApproved` the
target is `Claim Approved`, and a report already at `Claim Approved`
refuses the cause outright; for `LastPendingClaimRejected` the target is
`Open`, and that cause applies only at `Claim Requested`. Neither can
produce `Unchanged`. The `Unchanged` outcome exists for `ClaimSubmitted`,
which bolt 013's submission path uses — and that path **is** covered by
bolt 013's suite. The unreachable branches were left in place rather than
removed, because removing them would mean the service stopped handling a
transition outcome the domain can return.

## What was verified

### The domain (1 suite, 59 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-decision.test.ts` | 59 | The gate's whitelist, the rejection reason's 10–500 bound (naming the field, never the value), the transition table's three outcomes, the three triggers, the copy separation, the three audit events' exact payloads, and the defensive `never`-guards |

### The application (2 suites, 49 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-decision-service.test.ts` | 40 | The lock precedes the re-read; the approval, the rejection, the report's move, and the events share one transaction handle; the emails are sent **after** `transactions.run`; a decided Claim writes nothing; the conditional write landing `false` is a conflict; the report already `Claim Approved` is a conflict; one auto-rejection event per competitor, carrying the trigger's verbatim reason; the auto-rejection's actor is `system` while `triggeredBy` names the human; **no decision email ever reaches the finder**; a competitor decided elsewhere is left alone; the report returns to `Open` only when no `Pending` claim remains |
| `claim-review-service.test.ts` | 9 | The screen is assembled from the reader's facts; the count is **derived** from the list and cannot disagree with it; the decision action is withdrawn for every terminal status; a Claim with no evidence shows the empty string; a read-only assembly opens no transaction and reads once |

### The transport (1 suite, 25 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-admin-routes.test.ts` | 25 | All three routes refuse the same actors; a non-administrator is refused **without the body being read**; a bad CSRF token is refused; the review screen carries the evidence, the item details, the competing-claim references and count, and the decision-availability flag; the approval takes the actor from the session; a lost race is a **409**; a bound-breaking reason is a **400** naming the field; the parser drops every other field |

### The database (1 suite, 35 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `prisma-claim-decision-adapters.test.ts` | 35 | The approval writes the decider and the time; the conditional write refuses a non-`Pending` Claim; the rejection stores the reason; the auto-rejection stores the trigger's reason and leaves the decider **null** while the decision time is present; every write refuses a handle with no transaction; the reader supplies the claimant's email; the competing-claim read excludes the Claim itself and includes only `Pending` Claims; the lock reads the status; the **row lock serialises** — the second transaction sees `Claim Approved`; the review reader assembles claim, item, and competitors, renders dates as `YYYY-MM-DD`, shows `''` for a Claim with no evidence, and reads a Claim with no dates without throwing; the database's own constraints refuse a decided Claim with no decision time and a `Pending` Claim with one |

The database suite runs against the **live database** and skips only when
`DATABASE_URL` is unset. It ran for every measurement in this report.

## Success Criteria

Every criterion is traced to the suite that proves it.

### 1. Approval auto-rejects every other Pending claim and moves the report to `Claim Approved` in one transaction

**Proven by** `claim-decision-service.test.ts` and
`prisma-claim-decision-adapters.test.ts`.

The service suite proves the approval, every auto-rejection, the report's
move, and every audit event **share one transaction handle** — the harness's
`assertHandle` throws if any of them is given a different one. It proves the
order: the lock, the re-read, the approval, the move, the events, and only
then the email.

The database suite proves the writes land: the approval stores the
administrator and the decision time, and the auto-rejection stores the
trigger's reason with a **null** decider.

### 2. Two administrators cannot both approve the same claim

**Proven by** `claim-decision-service.test.ts` and
`prisma-claim-decision-adapters.test.ts`.

This is the criterion with three layers, and each is proven:

**The advisory read refuses it.** A Claim that is already decided is
refused before a transaction opens.

**The re-read refuses it.** The service suite makes the reader report the
Claim as decided on its second call and asserts the service refuses with a
conflict and writes nothing.

**The conditional write refuses it.** The database suite writes to a Claim
that is no longer `Pending` and asserts the write does not land — and the
service turns a `false` landing into a `ClaimDecisionConflictError`, which
the route maps to a **409**.

**And the two administrators approving two *different* Claims on the same
item are serialised.** The database suite proves it against the live
PostgreSQL: the first transaction commits and the second reads
`Claim Approved`, the transition table refuses it, and exactly one Claim
ends up `Approved` while the other is still `Pending`.

### 3. Rejection returns the report to `Open` only when no `Pending` claim remains

**Proven by** `claim-decision-service.test.ts`.

The count of remaining `Pending` Claims is read **inside** the transaction,
after the rejection — so the answer is the count as of the decision. The
suite proves both halves: a rejection leaving no `Pending` Claim returns the
report to `Open`, and a rejection leaving another `Pending` Claim leaves it
at `Claim Requested` with the other Claim untouched.

### 4. The three auto-rejection triggers each record their own audit reason

**Proven by** `claim-decision.test.ts` and
`claim-decision-service.test.ts`.

The three reasons are distinct and stored verbatim: *"another claim was
approved for this item"*, *"report withdrawn by reporter"*, and *"report
closed by administrator"*. The domain suite proves each trigger maps to its
own reason, and the service suite proves the approval's auto-rejection
records the trigger's reason **verbatim** — not a paraphrase.

**Each auto-rejection is a separate event.** The suite proves one event per
competitor, not one combined entry.

### 5. User-facing auto-rejection copy is softened while the audit reason stays verbatim

**Proven by** `claim-decision.test.ts`.

The two are separate artefacts. The suite asserts the copy **never contains
the stored reason verbatim**, that it names no winner, that it promises no
reopen, that it does not blame, and that its contact path names an
administrator.

### 6. There is no `Closed` Claim status

**Proven by** `claim-status.test.ts` (bolt 013) and by this bolt's suites.

The Claim vocabulary is `Pending`, `Approved`, `Rejected`, `Returned` — four
statuses, and **no `Closed`**. A closed *report* does not imply a closed
*Claim*: the auto-rejection marks the Claim `Rejected`, because the claim
was declined rather than closed. The domain suite asserts that a rejected
Claim is `Rejected` and never `Closed`.

### 7. A decision on a non-`Pending` claim is a conflict, not a silent overwrite

**Proven by** `claim-decision-service.test.ts`,
`claim-admin-routes.test.ts`, and `prisma-claim-decision-adapters.test.ts`.

The gate is a **whitelist** — only `Pending` may be decided, and every
terminal status is refused. The service suite asserts all three terminal
statuses are refused and that **nothing is written** when one is. The route
suite asserts the conflict is a **409** and carries the conflict message
rather than a generic error. The database suite proves the conditional write
does not land, so there is no overwrite to begin with.

## A real distinction this stage made precise: 404 versus 409

**The two refusals are different, and conflating them would mislead the
administrator.** The suite now proves the distinction in both directions:

- A Claim that **does not exist** — or that vanished between the advisory
  read and the lock — is a **404**. Nothing is written and the report does
  not move.
- A Claim that **was decided by someone else** is a **409**. The
  administrator who lost a race needs to know they were not wrong — they
  were simply second — and the message says exactly that.

The domain gate names both reasons (`ClaimNotFound` and
`ClaimNotPending`), and the service maps them to two different error types,
which the route maps to two different status codes.

## A test that had to be rewritten to prove anything

**The serialisation test's first version proved nothing** — it allowed both
approvals to land because the helper lacked the transition table's
refusal. The fix was to model the helper on the production path.

**Two more tests failed for the same underlying reason** — a read or a
cleanup happening at the wrong moment:

- The unknown-status test read the Claim **after** its `finally` had reset
  the row, so it saw `Pending`. The read was moved inside the `try`.
- The competing-claim test read **after** the `finally` had deleted the
  row, so it saw an empty list. The read was moved inside the `try`.

**And one test could not restore its constraint.** The
`claims_pending_fields_check` constraint forbids exactly the row the
competing-claim test needed to write, so re-adding the constraint failed
on that row — and the table was left unprotected for the rest of the suite.
The row is now deleted **before** the constraint is restored, and the
`DROP` statements are `IF EXISTS` so a failed run cannot leave the table
unprotected. The `claims` table's eleven constraints were verified present
after every run.

## Owner Items

1. **The `CHECK` constraints are invisible to Prisma.** They live only in
   the migration SQL. A `prisma migrate diff` against a drifted schema
   would not flag their absence — the protection is a test, not the
   migration tooling. This carries forward from bolt 013.

2. **The bolt's own tests drop and restore constraints at runtime.** The
   database suite drops `claims_status_check`,
   `claims_decision_fields_check`, `claims_pending_fields_check`, and
   `reports_status_check` to write rows the constraints forbid, and
   restores them in a `finally`. **Every drop must be paired with a restore
   that cannot fail on the row it was testing** — a restore that fails
   leaves the table unprotected for every suite that follows. The `DROP`s
   are `IF EXISTS` and the offending rows are cleared first.

3. **The blanket-delete race is still latent in the pre-existing suites.**
   This bolt's database suite deletes **only the rows it created**, by id.
   The pre-existing suites in `src/infrastructure/listings/` still use
   blanket deletes. This carries forward from bolt 011.

4. **Two branches in `claim-decision-service.ts` are unreachable** (lines 296
   and 537 — the transition table's `Unchanged` outcome). This is proved
   above, not assumed. They were left in place rather than removed, because
   the service must still handle an outcome the domain can return.

5. **The database's time zone must be set to UTC explicitly by the
   deployment.** This carries forward from bolt 007 and still constrains
   every timestamp comparison the Claim lifecycle makes.

6. **The `Returned` Claim status is out of this bolt's auto-transition
   table.** `Returned` is deliberately unreachable from the auto-transition
   table: a Claim is returned through the handover flow in Unit 005, not by
   a report status transition. The bolt's suites assert that the Found
   report machine never produces it.

7. **The full suite has not been run against this bolt.** The owner scoped
   this stage to the bolt's own suites. Before the next bolt that touches
   the `claims` table or the Found report machine, a full run is
   advisable — particularly because this bolt's migration-free changes to
   shared code paths (`found-report-status.ts`, the `ClaimStatus` type) sit
   beside bolt 013's.
