---
id: 017-lost-lifecycle-determination
stage: 5
stage_name: test
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
created: 2026-10-30T09:00:00Z
completed: 2026-10-30T09:00:00Z
verification_command: "npx vitest run src/domain/recovery/ src/application/listings/recovery-response-selection-service.test.ts src/application/listings/recovery-response-determination-service.test.ts src/application/listings/recovery-response-determination-email.test.ts src/infrastructure/listings/recovery-response-selection-constraint.test.ts src/infrastructure/listings/prisma-recovery-response-selection-adapters.test.ts 'src/app/api/reports/[id]/recovery-responses/[responseId]/select/route.test.ts' 'src/app/api/admin/reports/[id]/recovery-responses/[responseId]/determine/route.test.ts'"
---

# Bolt 017 — Stage 5: Test Report

## Overview

The verification of the `017-lost-lifecycle-determination` bolt: the Lost
report's owner chooses one candidate to check, an administrator records the
owner's determination, and the report's status moves accordingly — with the
two actors preserved apart in the audit trail.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The selection rule | `src/domain/recovery/recovery-response-selection.ts` | 003 | FR-43 |
| The determination rule | `src/domain/recovery/recovery-response-determination.ts` | 004 | FR-43, ADR-11 |
| The Lost report's lifecycle | `src/domain/recovery/lost-report-status.ts` | 005 | FR-42 |
| The selection use case | `src/application/listings/recovery-response-selection-service.ts` | 003 | FR-43 |
| The determination use case | `src/application/listings/recovery-response-determination-service.ts` | 004 | FR-43 |
| The determination email | `src/application/listings/recovery-response-determination-email.ts` | 004 | FR-46 |
| The ports | `ports/lost-report-subject-reader.ts`, `ports/recovery-response-selection-repository.ts`, `ports/recovery-response-responder-reader.ts` | 003, 004 | FR-43 |
| The persistence | `prisma-lost-report-subject-reader.ts`, `prisma-recovery-response-selection-repository.ts`, `prisma-recovery-response-responder-reader.ts` | 003, 004 | FR-41, FR-43 |
| The transport | `src/app/api/reports/[id]/recovery-responses/[responseId]/select/`, `src/app/api/admin/reports/[id]/recovery-responses/[responseId]/determine/` | 003, 004 | FR-43 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**. The broader
> `src/infrastructure/listings`, `src/application/listings`, and
> `src/domain/recovery` layer was run separately, and its result is recorded
> in the section *"The blast radius, measured"* below.

## The bolt's real subject: two actors, and a rule that cannot race

FR-43 states two rules that pull in opposite directions, and the whole bolt
is the machinery that holds both at once.

**The owner determines; the administrator records.** The determination is the
owner's act — they physically inspected the item. The administrator's act is
to enter that determination in the system. FR-43 is emphatic: *"The
administrator does not independently decide whether the item belongs to the
owner."*

**A rule that cannot race.** *"A Lost report may have exactly one Recovery
Response in `Selected for Verification` status at any time."* Two owner
sessions selecting different candidates concurrently must resolve to
exactly one commit.

### The two halves are checked separately

The determination's decision checks the recorder's authority and the maker's
identity **independently**, and the audit event carries them in **two
different columns**:

| Role | Who | Where it is recorded |
|---|---|---|
| the **maker** | the Lost-report **owner** | `determinedByUserId` |
| the **recorder** | the acting **administrator** | `recordedByAdministratorId` |

**The maker is a server-side fact.** The service reads the report's owner
out of the database and compares the supplied maker against it. A client can
name a maker in the request, but it cannot make that maker the owner — the
comparison is against the database, not against the request.

**The check is about role, not identity.** The same person may fill both
halves in two capacities: where the Lost-report owner is themselves an
administrator acting in their administrator capacity, that is a legitimate
determination. Refusing it would push operators toward fabricating a second
identity, which is worse than the collision it prevents.

### The index is the rule; the check is the explanation

The migration creates a partial unique index scoped to exactly one status:

```sql
CREATE UNIQUE INDEX "uq_recovery_responses_one_selected_per_report"
    ON "recovery_responses" ("report_id")
    WHERE "status" = 'Selected for Verification';
```

**The predicate is one status, and that is deliberate.** A report may hold
any number of `Submitted` responses — the siblings, on standby — and the
terminal statuses are history. A plain unique index on `report_id` would
forbid the siblings outright, and the sibling-preservation rule (*"Selection
never closes or rejects a sibling"*) is exactly what this bolt must not
break.

**`Match Confirmed` is deliberately outside the constrained set.** A confirmed
response has left `Selected for Verification`, so it does not hold the
report's selection slot. FR-43's rule about a confirmed match (*"`Match
Confirmed` does NOT unlock another selection"*) is enforced by the **domain**
— the selection decision checks the confirmed outcome before it checks
anything else — and by the report's own status, which stays `Verification
Pending` and so fails the report-status whitelist. The index is not asked to
carry that rule, because a `Match Confirmed` response and a newly selected
response are not two selected responses.

**The race resolves at the database.** The service reads the report's
selection facts and refuses a second selection, but two requests racing
could both pass that read. The index cannot race: PostgreSQL serialises the
two updates, and the second fails with `23505`. The repository translates
that into `ConcurrentSelectionError`, so the caller refuses with the owner's
own words rather than surfacing a Prisma error code.

## `Match Confirmed` does not move the report

**This is the bolt's most consequential fact, and it is asserted three
ways.** The item has been *identified*; it has not been *physically
returned*. FR-42 is explicit: *"A Match Confirmed determination does NOT end
Verification Pending; the Lost report intentionally remains `Verification
Pending` until Confirm Returned transitions it to `Returned`."*

1. **The domain's table carries the row.** `TRANSITION_TARGETS.MatchConfirmed`
   is `Verification Pending` — a row that *states* the no-op rather than an
   absent row that a reader could mistake for "not yet implemented".
2. **The decision reports it honestly.** The table's target equals the
   current status, so the decision returns `Unchanged` — not `Moved` to the
   status it was already in.
3. **The service writes nothing.** The determination service moves the
   report's status **only** on the `not_a_match` path. The test asserts the
   *absence* of `reports.moveToOpen` in the call sequence, which is a
   stronger assertion than asserting that some other call happened.

**The `Not a Match` path is the mirror image.** The response becomes
`Not a Match` — terminal, and it never returns to `Submitted` — and the
report returns to `Open`, so the standby pool becomes selectable again.

## The email is sent after the commit, and its failure is not the determination's failure

ADR-3's decision 4: the notification is a *consequence* of the determination,
not a part of it. A determination that commits and then fails to send has
**succeeded** — the outcome is recorded and the trail is written.

**The test asserts the order, not just the outcome.** The email's position
in the call sequence is compared against the transaction's, so a refactor
that moved the send inside the transaction would fail the suite rather than
pass it quietly.

**The message says the team will be in touch, not that the item was
returned.** The email builder's test asserts the *absence* of "has been
returned" — because a confirmed match has not returned anything yet, and an
email that said so would be telling the responder a lie the workflow has not
established.

## Verification

### Command

```
npx vitest run src/domain/recovery/ \
  src/application/listings/recovery-response-selection-service.test.ts \
  src/application/listings/recovery-response-determination-service.test.ts \
  src/application/listings/recovery-response-determination-email.test.ts \
  src/infrastructure/listings/recovery-response-selection-constraint.test.ts \
  src/infrastructure/listings/prisma-recovery-response-selection-adapters.test.ts \
  'src/app/api/reports/[id]/recovery-responses/[responseId]/select/route.test.ts' \
  'src/app/api/admin/reports/[id]/recovery-responses/[responseId]/determine/route.test.ts'
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Domain — `src/domain/recovery/` | 9 | 177 | ✅ pass |
| Application — the bolt's three suites | 3 | 26 | ✅ pass |
| Infrastructure — the bolt's two suites | 2 | 23 | ✅ pass |
| Transport — the bolt's two routes | 2 | 25 | ✅ pass |
| **Total** | **16** | **251** | ✅ **251 pass, 0 fail** |

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions |
|---|---|---|---|
| `domain/recovery/lost-report-status.ts` | 100% | 100% | 100% |
| `domain/recovery/recovery-response-selection.ts` | 100% | 100% | 100% |
| `domain/recovery/recovery-response-determination.ts` | 100% | 100% | 100% |
| `application/listings/recovery-response-selection-service.ts` | 96.96% | 93.33% | 100% |
| `application/listings/recovery-response-determination-service.ts` | 97.29% | 91.66% | 100% |
| `application/listings/recovery-response-determination-email.ts` | 100% | 100% | 100% |
| `infrastructure/listings/prisma-lost-report-subject-reader.ts` | 100% | 81.81% | 100% |
| `infrastructure/listings/prisma-recovery-response-selection-repository.ts` | 87.09% | 61.90% | 85.71% |
| `infrastructure/listings/prisma-recovery-response-responder-reader.ts` | 100% | 100% | 100% |
| **Total** | **97.4%** | **89.1%** | **97.4%** |

**The uncovered branches are the unique-violation translation** in the
selection repository — the path where the *database's* index fires rather
than the application's check. It is exercised by the constraint suite at the
schema level (the index is proven to reject a second selected response) and
by the service suite at the application level (the service refuses a write
that lands nothing), so the rule is proven from both sides even though the
*translation* of the driver's error is not.

## What was verified

### The selection rule (domain, 18 tests)

- The owner may select a `Submitted` response on an `Open` report.
- The report's move to `Verification Pending` is part of the decision, not
  optional.
- A non-owner is refused; a non-`Open` report is refused; a non-`Submitted`
  response is refused.
- The already-selected response is an idempotent **no-op**, not a refusal.
- **The `Match Confirmed` lock is unconditional** — it is checked before
  ownership, before the report's status, and before the no-op. A repeated
  selection on a report whose match is confirmed is the lock, not the no-op.
- `assertSelectionPermitted` throws a permission failure for the ownership
  refusal and a conflict for the state refusals.

### The determination rule (domain, 22 tests)

- An administrator may record the owner's determination.
- A non-administrator recorder is refused; a recording with no maker is
  refused; a maker who is not the owner is refused.
- A response that is not `Selected for Verification` is refused — including
  one that has already been determined.
- **The two halves are checked separately**: the recorder's authority is
  checked first, the maker's completeness before the maker's identity.
- The same person may fill both halves in two capacities.
- `match_confirmed` moves the response to `Match Confirmed` and leaves the
  report `Verification Pending`; `not_a_match` moves the response to
  `Not a Match` and returns the report to `Open`.
- A third outcome is refused rather than defaulted.

### The Lost report's lifecycle (domain, 18 tests)

- The machine owns exactly `Open` and `Verification Pending`, and refuses
  the Found side's `Claim Requested` and `Claim Approved`.
- A selection moves `Open` → `Verification Pending`; a not-a-match moves
  `Verification Pending` → `Open`; a withdrawal and an administrator's close
  both move to `Closed`.
- **A confirmed match is `Unchanged`, not `Moved`.**
- A terminal report accepts nothing; a cause that does not apply to the
  current status is refused.
- **`Returned` is not offered by any cause** — it is reachable only through
  Unit 005's Confirm Returned.

### The selection use case (application, 8 tests)

- The response moves, the report moves, and both events are written — in
  that order, inside one transaction.
- **The idempotent no-op writes nothing**: no transaction, no write, no
  event. The suite asserts the *absence* of each call.
- A non-owner, a missing report, a confirmed match, a withdrawn response, a
  missing response, and a lost race are each refused — and the last three
  assert that nothing else was written.

### The determination use case (application, 12 tests)

- A confirmed match moves the response and **does not move the report**;
  a not-a-match moves both and writes event 28.
- The event's draft carries `determinedByUserId` and
  `recordedByAdministratorId` in **two different fields**.
- A non-administrator recorder, a missing maker, a maker who is not the
  owner, a response that is not awaiting determination, a missing response,
  and a lost race are each refused.
- **The email goes out after the commit**, asserted by comparing the two
  positions in the call sequence.
- **A failed send still leaves a successful determination.**

### The persistence (infrastructure, 23 tests against a live database)

- The partial unique index exists and is scoped to exactly the
  `Selected for Verification` status — read from `pg_indexes`, so the
  migration's predicate and the domain's vocabulary cannot drift apart.
- **A second selected response on the same report is refused by the
  database**, and the row is verified unchanged afterwards.
- The sibling responses survive, and many `Submitted` responses may coexist
  on one report.
- A new selection is permitted once the previous one was ruled `Not a Match`.
- The conditional writes land exactly once — the response's selection, the
  response's determination, and the report's two moves.
- The subject reader reads a Lost report, and reads a **Found** report as
  absent.
- A response's status is scoped to its report, and a response on another
  report reads as absent.
- Every adapter **refuses a handle that carries no usable transaction**,
  rather than silently falling back to the root client.

### The transport (application layer routes, 25 tests)

- The selection route: 401 for anonymous, 403 for a `Pending` account, 403
  for a bad CSRF token, 400 for a non-UUID path id, **403 with the domain's
  own message** for a non-owner, 409 for a state conflict.
- The determination route: 403 for an anonymous or non-administrator
  caller, 400 for a missing or unrecognised outcome, 400 for a malformed
  maker id, 403 with the domain's own message, 409 for a conflict.
- **Both responses carry no stored field** — the body is asserted key by
  key, not by a spot check.
- **The selection route never reads the body**, so a client cannot redirect
  a selection at another report.
- **The determination route takes the recorder from the session and the maker
  from the body**, and the two are never confused.

## Success Criteria

| # | Criterion | Where it is proven |
|---|---|---|
| 1 | Selecting one response moves it to `Selected for Verification` and the report to `Verification Pending` | `recovery-response-selection.ts` (decision carries both), `recovery-response-selection-service.ts` (the call sequence) |
| 2 | Siblings remain `Submitted` and display as `Submitted — Standby` | `recovery-response-selection-constraint.test.ts` (the siblings survive; many `Submitted` may coexist) |
| 3 | Selection never closes or rejects a sibling | `recovery-response-selection-constraint.test.ts` (the sibling's status is unchanged) |
| 4 | Concurrent selections resolve to exactly one commit | `recovery-response-selection-constraint.test.ts` (the index refuses the second), `recovery-response-selection-service.ts` (the conditional write lands nothing) |
| 5 | `Match Confirmed` is non-terminal and the report stays `Verification Pending` | `lost-report-status.ts` (`Unchanged`), `recovery-response-determination-service.ts` (the report's move is absent) |
| 6 | `Not a Match` is terminal and returns the report to `Open` so another candidate can be selected | `recovery-response-determination.ts` (the outcome's statuses), `recovery-response-selection-constraint.test.ts` (a new selection lands after a not-a-match) |
| 7 | Events 18/19 record `determined_by` and `recorded_by` as two separate values | `recovery-response-determination-service.test.ts` (the draft's two fields), `lost-side-event-factory.ts` (bolt 003's `assertDeterminationPair`) |
| 8 | Withdrawal reaches `Closed`, never `Returned` | `lost-report-status.ts` (`ReporterWithdrawn` → `Closed`; no cause targets `Returned`) |

**Criterion 8 is the one this bolt delivers by table rather than by use
case.** The Lost report's *withdrawal* is bolt `008`'s operation, which is
complete; this bolt's contribution is the lifecycle table that names the
cause's target, so the withdrawal's target is stated in one place and is
`Closed` rather than `Returned`. The table's completeness is proven by the
test that asserts **no cause targets `Returned`**.

## The blast radius, measured

The wider layer was run to confirm this bolt did not disturb what came
before:

```
npx vitest run src/infrastructure/listings/ src/application/listings/ src/domain/recovery/
```

| Layer | Files | Tests | Result |
|---|---|---|---|
| `src/infrastructure/listings/` | 25 | 391 | ✅ pass |
| `src/application/listings/` | 21 | 426 | ✅ pass |
| `src/domain/recovery/` | 9 | 177 | ✅ pass |
| **Total** | **55** | **994** | ✅ **994 pass, 0 fail** |

**One migration was added, and it was applied to the database.** The
migration `20261030180000_recovery_response_selection_constraints` adds the
one-selected-response-per-report index and the determination's two audit
indexes. It was applied with `prisma migrate reset -f`, so the whole schema
was rebuilt from the migration history — and every one of the 994 tests
above ran against the rebuilt schema.

**The `reports_status_check` constraint was deliberately not re-declared.**
Bolt `007` already created it, and it admits every status either side uses —
`Open`, `Claim Requested`, `Claim Approved`, `Verification Pending`,
`Returned`, and `Closed`. The Lost lifecycle's statuses are inside that
vocabulary, so a second constraint would have been a duplicate rather than a
tightening. The migration records this reasoning in its own comments.

**The determination's audit columns were deliberately not re-declared
either.** Bolt `001` created `determinedByUserId` and
`recordedByAdministratorId` on the `audit_events` table, and the
reconciliation migration widened them to `UUID`. What was missing was the
**read path**, and the migration adds the two indexes.

**A first draft of the migration created duplicate snake_case columns.**
The `audit_events` table predates the snake_case convention — bolt `001`
created it with camelCase columns and bolt `007` renamed only the *tables* —
so the draft's `determined_by_user_id` and `recorded_by_administrator_id`
columns were duplicates of columns that already existed under their own
names. The draft was corrected to create only the indexes, and the database
was rebuilt from the corrected migration.

## A test that had to be rewritten

**The constraint suite's "a new selection after a not-a-match" test could
not borrow the shared report.** The earlier test in the same file had left a
response in `Selected for Verification`, so the report's selection slot was
already held — and the new selection was refused by the very index the test
was about.

Two rules were in tension: the **one-live-response-per-responder-per-report**
index from bolt `015` (which refuses a second live response from the same
responder on the same report) and the **one-selected-per-report** index this
bolt adds. The test was rewritten to run on its own report, with two fresh
responders — and the reasoning is recorded in the test's own comment, because
a future edit that reuses the shared report would hit the same wall.

**No constraint was weakened.** The rule stayed as the PRD states it; the
fixture changed.

## Three type errors found at the closeout

The suites were green, but `tsc --noEmit` was not clean — the tests compiled
under Vitest's transpile-only path while the type checker read them strictly.
Three errors were found and fixed; none was in the bolt's production code, and
none was a false alarm.

1. **Two `Harness` classes declared `events` twice.** Each harness had an
   `events: AuditEventRecord[]` array for the generic audit writer *and* an
   `events` object for the Lost-side event factory — a duplicate identifier
   (`TS2300`/`TS2717`). **Neither was read by any assertion**, so the array was
   dead weight; but the *factory* is the one with a meaning, and its name is
   what makes the call sequence legible. The factory is now `lostEvents` and
   the array keeps `events`. The collision was a naming mistake, not a design
   one.
2. **A test read `reportStatus` off an unnarrowed union.** The selection
   decision is a discriminated union of `Permitted` and `Refused`, and only
   the `Permitted` arm carries `reportStatus`. The test had been written as a
   short-circuit expression that called `decideSelection` twice and relied on
   the `&&` to narrow — which the checker does not carry across a second call.
   The test now binds the decision once and narrows on `decision.kind`.

**The lesson worth keeping is the asymmetry between "the tests pass" and "the
tests type-check."** Vitest transpiles without checking, so a suite can be
green and still not compile. The bolt's own verification command runs the
suites; `tsc --noEmit` is a separate gate, and it was the gate that found
these. Both are now clean.

## Owner Items

1. **`durable_execution` is not applied to the selection or determination
   write paths.** Both are single-transaction operations with conditional
   writes, and the PRD's §10 concurrency NFR is met by the database's
   partial unique index rather than by a retry. A deployment that later
   needs the write to survive a transport failure would need the durable
   execution adapter bolt `023` introduces.
2. **The `Standby` display condition is not wired to the owner's screen.**
   `src/domain/recovery/standby-display.ts` already derives it (bolt `011`),
   and this bolt guarantees the *stored* status stays `Submitted` for the
   siblings — but the rendering of `Submitted — Standby` belongs to bolt
   `021` (the web admin surface).
3. **The determination's email has no link to the report.** The message
   tells the responder the outcome and that the team will be in touch. A
   link to the response's own page would need the response's id, and the
   builder deliberately takes no id — the responder reaches their own
   response through the authenticated surface (FR-39), not through a link in
   an email.
4. **`Returned` is not reachable from this bolt's table.** It is reachable
   only through Unit 005's Confirm Returned (bolt `019`). That is the
   PRD's own instruction, and the table's completeness is asserted by the
   test that confirms no cause targets it.
5. **The Lost report's withdrawal and closure use cases are bolt `008`'s.**
   This bolt's contribution is the lifecycle table that names their targets.
   The operations themselves are complete and their own suites cover them.
6. **The two new routes have no rate limit.** The submission route is rate
   limited (ADR-15) because it is a public, unauthenticated-adjacent write
   path. The selection and determination routes are behind an authenticated
   actor with a role check, and ADR-15's limit table does not name them.
   If a deployment wants them limited, the rule belongs in
   `readListingsRateLimitConfig`.
