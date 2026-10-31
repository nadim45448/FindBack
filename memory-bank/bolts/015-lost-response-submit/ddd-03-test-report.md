---
id: 015-lost-response-submit
stage: 5
stage_name: test
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
created: 2026-10-30T08:00:00Z
completed: 2026-10-30T08:00:00Z
verification_command: "npx vitest run src/domain/recovery/recovery-response-submission-decision.test.ts src/domain/recovery/recovery-response-value-objects.test.ts src/application/listings/recovery-response-submission-service.test.ts 'src/app/api/reports/[id]/recovery-responses/recovery-responses-route.test.ts' src/infrastructure/listings/recovery-response-submission-constraint.test.ts src/infrastructure/listings/prisma-recovery-response-adapters.test.ts"
---

# Bolt 015 — Stage 5: Test Report

## Overview

The verification of the `015-lost-response-submit` bolt: a member responds to
a Lost report, describing where they found the item, what they observed, and
when — and the response becomes a first-class record that the owner, the
administrators, and the later verification story all read.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The submission gate | `src/domain/recovery/recovery-response-submission-decision.ts` | 001 | FR-40 |
| The response's field values | `src/domain/recovery/recovery-response.ts`, `recovery-response-where-found.ts`, `recovery-response-observed-details.ts`, `recovery-response-date-found.ts` | 001 | FR-44 |
| The field validator | `src/domain/recovery/recovery-response-field-validator.ts` | 001 | FR-44 |
| The submission use case | `src/application/listings/recovery-response-submission-service.ts` | 001 | FR-40, FR-44 |
| The submission email | `src/application/listings/recovery-response-submission-email.ts` | 001 | FR-44 |
| The persistence | `src/infrastructure/listings/prisma-recovery-response-repository.ts` | 001 | FR-40, FR-44 |
| The reads | `prisma-recovery-response-reader.ts`, `prisma-recovery-response-subject-reader.ts` | 001 | FR-40 |
| The transport | `src/app/api/reports/[id]/recovery-responses/` | 001 | FR-40, FR-44 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own six suites**. The broader
> `src/infrastructure/listings`, `src/application/listings`, and
> `src/domain/listings` layer was run separately, and its result is recorded
> in the section *"The blast radius, measured"* below.

## The bolt's real subject: one live response per responder, per report

**FR-40's rule is "one *active* response per responder per Lost report",** and
the word *active* carries the whole design. A responder whose response was
`Not a Match` may respond again — the PRD allows a second attempt — and the
old response stays in the record as history. So the constraint is not "one
response ever"; it is "one response *still in play*".

**That is exactly what a partial unique index expresses,** and Bolt 015's
migration creates one:

```sql
CREATE UNIQUE INDEX "uq_recovery_responses_one_live_per_report_per_responder"
    ON "recovery_responses" ("report_id", "responder_id")
    WHERE "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed');
```

**The constrained set is the domain's non-terminal set.** The three statuses
are the ones a Response can still move from, and the domain derives
`NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` as the complement of the terminal
set — so the index and the domain cannot disagree about which statuses are
live.

**`Match Confirmed` is in the set, and that is the subtle part.** FR-41 makes
it *non-terminal* — the Lost report stays `Verification Pending` until an
administrator confirms the physical hand-off — so a responder holding one
still holds a live response and may not open another. A constrained set that
omitted it would let the confirmed responder open a second response on a
report whose outcome is already settled.

**The constraint is the rule; the application check is the explanation.** The
service reads first and writes second, so two requests racing could both pass
its check. The index cannot race: PostgreSQL serialises the two inserts, and
the second fails with `23505`. The repository translates that into
`DuplicateLiveRecoveryResponseError`, which the route answers with a **409**.
The database suite proves the translation against the live database.

## The whitelist gate fails closed

**The report-status rule is a whitelist, not a blacklist.** A report status
the domain does not know must be *refused*, not permitted by default — so
the gate enumerates the statuses that accept a response (`Open` and
`Verification Pending`) rather than the ones that do not.

**The domain suite proves this as a property over the whole vocabulary,** not
as two hand-written cases: it asserts that for every status in
`REPORT_STATUSES`, the gate's answer matches the whitelist, and that no
status outside the whitelist is accepted. A new report status added later
would therefore fail the suite rather than silently open the gate.

**The `Match Confirmed` cutoff is checked unconditionally** — before the
live-response duplicate check, and before the report-status whitelist is
consulted. Once the selected response has reached `Match Confirmed`, the
report's outcome is settled and no further response can be accepted or
selected, whatever else the report's status says.

## The `null` column is an absence, not an out-of-bounds value

**This bolt found a real design defect in its own persistence layer,** and
the database suite is what surfaced it.

A `Recovery Response` is written by two kinds of path: a **submission**
(which carries the four FR-44 fields) and a **lifecycle** (a report's
closure resolving its responses, say — which carries no submission fields at
all). The first version of the read path rebuilt the row's fields through the
*constructors* — `createRecoveryResponseObservedDetails` and its siblings —
which reject an empty string. So a lifecycle-written Response, whose columns
are `NULL`, **could not be read back at all**: the read threw
`ValidationError: Describe the identifying details you noticed.`

**The fix separates the two shapes.** The *validated* shape is non-nullable —
a submission always has its fields, and the validator guarantees it. The
*persisted* shape is nullable, because a lifecycle-written row genuinely has
none. The read rebuilds through the constructors **only when the column is
present**, and passes `null` through otherwise. This mirrors the Claim
repository's existing `reason: ClaimReason | null` pattern, so the codebase
now has one shape for the same idea on both sides.

**A `null` column is an absence, and it reads as one.** It is not a
zero-length string that fails a bound, and it is not a value that silently
fails validation. The database suite proves the round trip in both directions:
a submitted Response reads back with all four fields intact, and a
lifecycle-written Response reads back with all four absent and **without
throwing**.

## The two clocks were one clock

**The route was writing its own timestamp.** The first version of the route
answered `submittedAt: new Date().toISOString()` — a second reading of the
clock, taken after the row was written. The persisted row already carried
its own timestamp, and the two could differ by the time the response reached
the client.

**The fix threaded the persisted timestamp through the use case.**
`SubmitRecoveryResponseResult` now carries a `submittedAt: Date`, and the
service returns the validated Response's own timestamp — the value that was
actually written to the row — rather than a fresh reading. The route uses
`result.submittedAt.toISOString()`. The route suite asserts the response's
`submittedAt` is the one the use case returned.

**The rule this embodies is general:** a persisted record's timestamp is the
one the database holds. Reading the clock again is a second, slightly
different fact.

## The image write is compensated, and the compensation is ordered

**An optional candidate image may accompany the response.** The write is the
compensating sequence the `image-handling` standard describes:

1. **The blob is stored first.** If the blob cannot be stored, no row is
   written and the member is told the image was rejected.
2. **The row is written only if the blob was stored.** The row is written
   inside the transaction, with the image reference in it.
3. **The blob is deleted if the row write fails.** And the delete is issued
   **after** the transaction rolls back — a blob deleted *inside* a
   transaction that then rolls back would leave the blob alive with no row
   pointing at it, which is exactly the leak the compensation exists to
   prevent.

**The service suite proves the ordering** against a recording harness: it
asserts the blob is stored before the row is written, that a failed row
write triggers the delete, and that the delete happens **after** the
transaction ends.

**The Sensitive Fields never travel by email.** The email builder takes no
response content as a parameter at all — so the exact place, the observed
details, and the date found cannot leak through it, because there is no
argument through which they could. The service suite asserts the email is
built from the *report*'s identity and never from the response's content.

## The email is sent after the commit, and its failure is not the submission's failure

**The submission commits first; the email follows.** ADR-3's decision 4
settles this: the notification is a *consequence* of the submission, not a
part of it. A submission that commits and then fails to send a notification
has **succeeded** — the response exists and the outcome is settled. A
submission that failed to send a notification and rolled back would lose a
member's work because a mail server was down.

**The service suite proves the order** — the harness records the sequence, and
the suite asserts the email is sent **after** `transactions.run` returns, not
before and not inside it. It also proves that a **failing email does not fail
the submission**: the use case resolves successfully, and the failure is
logged rather than thrown.

## The route's refusals are ordered, and the order is asserted

**The route checks capability, then rate limit, then CSRF — and the order is
part of the contract.** The route suite asserts each check's *position* by
making the earlier check fail and observing that the later one never runs.

**The order is a cost ordering.** The capability check is a session lookup
that is already in hand; the rate limit is a cheap keyed read; the CSRF check
validates a token the body does not carry. A request that fails the
capability check should not spend a rate-limit token, and a request over the
rate limit should be rejected before the body is parsed.

**The route answers with exactly three fields.** The response body is
`['id', 'status', 'submittedAt']` and nothing else — the suite asserts the
exact key set, because a body that grew a field would risk carrying the
report's exact place or the owner's identifying details back to a responder
who is not the owner.

**The `reportId` and `responderId` in the body are dropped.** The report id
comes from the path and the responder id comes from the resolved actor — so a
client cannot redirect a response at another report or submit it as another
member. The route suite asserts both, by sending a body that names a
different report and a different responder and checking that neither reaches
the use case.

## Verification

### The command

```bash
npx vitest run \
  src/domain/recovery/recovery-response-submission-decision.test.ts \
  src/domain/recovery/recovery-response-value-objects.test.ts \
  src/application/listings/recovery-response-submission-service.test.ts \
  'src/app/api/reports/[id]/recovery-responses/recovery-responses-route.test.ts' \
  src/infrastructure/listings/recovery-response-submission-constraint.test.ts \
  src/infrastructure/listings/prisma-recovery-response-adapters.test.ts
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint src/infrastructure/listings src/domain/recovery src/application/listings 'src/app/api/reports'` | ✅ clean, no errors |
| Test | the six suites above | ✅ **6 files, 152 tests, all passing** |
| Full suite | `npm run verify` | ⏭️ **not run** — out of scope by owner direction |

### Coverage

Scoped to **this bolt's own modules**:

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| The bolt's modules | **93.61** | **83.14** | **92.85** | **93.61** |

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `recovery-response-submission-decision.ts` | 100 | 100 | 100 | 100 |
| `recovery-response.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-where-found.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-observed-details.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-date-found.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-field-validator.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-submission-service.ts` | 97.95 | 91.66 | 100 | 97.95 |
| `prisma-recovery-response-repository.ts` | 100 | 95.65 | 100 | 100 |
| `prisma-recovery-response-reader.ts` | 63.63 | 22.22 | 75 | 63.63 |
| `prisma-recovery-response-subject-reader.ts` | 60 | 33.33 | 66.66 | 60 |

**The route layer is excluded from coverage by the project's own
configuration** — `vitest.config.ts` excludes `src/app/**` — so the route's
`route.ts` and `parse-recovery-response-request.ts` do not appear in the
table above. They are verified by the route suite's 30 tests instead.

**The uncovered lines in the two readers are their defensive
`transactionClient` guards** (the `throw` on a handle that carries no usable
transaction). Those readers are shared with bolts 014 and 017, whose suites
exercise the guard; this bolt's own suite measures the reads it needs.

**The one uncovered statement in the submission service** is line 399.

## What was verified

### The domain (2 suites, 53 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-response-submission-decision.test.ts` | 23 | The gate's **whitelist** — proved as a property over the whole `REPORT_STATUSES` vocabulary, not as two hand-written cases; the `Match Confirmed` cutoff is checked unconditionally; `LIVE_RECOVERY_RESPONSE_STATUSES` is the domain's non-terminal set; the block messages are distinct and exhaustive over the refusal reasons |
| `recovery-response-value-objects.test.ts` | 30 | The bounds at their edges — 0/200 exact place, 10/500 observed details, ±30 days; `FOUND_DATE_MAX_AGE_DAYS` is **derived** from the clock rather than restated; the validator accepts a legal draft and rejects each illegal one by naming the field; `withResponder` and `withCandidateImage` return new values rather than mutating |

### The application (1 suite, 32 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-response-submission-service.test.ts` | 32 | The **sequence** — the blob is stored before the row is written, and the compensating delete is issued **after** the transaction rolls back; the email is sent **after** the commit, and a failing email does not fail the submission; the row, the audit event, and the email all share **one** transaction handle; event 15's fields are exactly the permitted set; the email is empty of the response's content; every refusal path writes nothing |

### The transport (1 suite, 30 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-responses-route.test.ts` | 30 | The **refusal order** — capability, then rate limit, then CSRF — asserted by making the earlier check fail and observing that the later one never runs; the status codes (401, 403, 429, 400, 409, 503); the body's key set is exactly `['id','status','submittedAt']`; the body's `reportId` and `responderId` are dropped; the `submittedAt` is the one the use case returned, not a second reading of the clock |

### The database (2 suites, 37 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-response-submission-constraint.test.ts` | 16 | The partial unique index's **definition**, read from `pg_indexes` and compared against the domain's live set; the second live response from the same responder is **rejected**; `Match Confirmed` holds the slot; a terminal response does not block; the CHECK constraints are read from `pg_constraint` and compared against the domain's own bounds |
| `prisma-recovery-response-adapters.test.ts` | 21 | The Sensitive Fields' round trip; the `P2002` → `DuplicateLiveRecoveryResponseError` translation; a **lifecycle-written** Response reads back with `null` fields and does not throw; the reader's live and confirmed reads; the subject reader |

The database suites run against the **live database** and skip only when
`DATABASE_URL` is unset. They ran for every measurement in this report.

## Success Criteria

Every criterion is traced to the suite that proves it.

### 1. A response requires where found, observed identifying details, and date found

**Proven by** `recovery-response-value-objects.test.ts` and
`recovery-responses-route.test.ts`.

The exact place is **optional** — FR-44's own bound is 0–200 characters, and a
responder who found the item in a courtyard may say "the library courtyard"
and nothing more. The observed details and the date found are **required**,
and the exact place's lower bound is zero rather than one because the PRD
permits the empty string. The domain suite proves the bounds at their edges —
0 and 200 for the place, 10 and 500 for the details, and the date's window at
±30 days.

### 2. The response is created `Submitted` and appears in My Recovery Responses

**Proven by** `recovery-response-submission-service.test.ts` and
`prisma-recovery-response-adapters.test.ts`.

The service suite proves the write creates the Response with status
`Submitted`, and the database suite proves the row lands with its submission
fields intact. The "appears in My Recovery Responses" half is the listing
view, which bolt 009's reader provides and this bolt's suite exercises
through the reader's live-status read.

### 3. Submission is accepted while the report is `Verification Pending` if the selected response has not reached `Match Confirmed`

**Proven by** `recovery-response-submission-decision.test.ts`.

The whitelist admits `Verification Pending`, and the domain suite proves it
admits it *as a property over the vocabulary* — for every status in
`REPORT_STATUSES`, the gate's answer matches the whitelist. The
`Match Confirmed` cutoff is a separate, unconditional check.

### 4. Submission is refused once the selected response has reached `Match Confirmed`

**Proven by** `recovery-response-submission-decision.test.ts` and
`recovery-response-submission-constraint.test.ts`.

The domain suite proves the cutoff is consulted **unconditionally** — before
the duplicate check and before the report-status whitelist — so a settled
match stops every further response whatever else the report's status says.
The database suite proves the other half: `Match Confirmed` is inside the
index's constrained set, so the responder holding it **holds the slot** and
cannot open a second response.

### 5. The response payload contains neither the report's exact place nor the owner's identifying details

**Proven by** `recovery-responses-route.test.ts` and
`recovery-response-submission-service.test.ts`.

The route's body is exactly `['id','status','submittedAt']` — the suite
asserts the exact key set, so a field that grew later would fail the suite
rather than leak. The service suite proves the **email** carries none of the
response's content: the builder takes no response content as a parameter at
all, so there is no argument through which the exact place, the observed
details, or the date could travel.

### 6. A member cannot respond to their own Lost report

**Proven by** `recovery-response-submission-service.test.ts` and
`recovery-responses-route.test.ts`.

The service refuses a submission by the report's own reporter, and the route
answers it with a **403** and a specific message. The route suite also proves
that a **Pending** account is refused — the responder must be **Active**.

### 7. Submission is rate-limited

**Proven by** `recovery-responses-route.test.ts`.

The route consults the rate limiter under a **member-scoped key**, answers a
request over the limit with a **429** and a `Retry-After` header, and runs
the check *before* the CSRF check — so an over-limit request is rejected
without the body being parsed.

### 8. The audit record contains actor and timestamp but no thread body, no exact place, and no observed identifying details

**Proven by** `recovery-response-submission-service.test.ts`.

The event's payload is exactly the permitted set — the actor and the
timestamp — and the suite asserts the payload does **not** carry the exact
place, the observed details, or the date found. The audit payload sanitizer
denies by default, so naming the permitted fields permits exactly those.

## The blast radius, measured

**Bolt 015's migration touches only the `recovery_responses` table.** It
never mentions `claims`. That was verified by reading the migration.

**The listings layer was run anyway, and it found real breakage — none of
it caused by this bolt's migration, and one of it caused by this bolt's
*code*.** The layer's state went from **15 failures** to **1311 passing
across 62 files**, and the three causes were distinct:

| Cause | Source | Fix |
|---|---|---|
| `claims_decision_fields_check` refused a decided Claim with no `decided_at` | **Bolt 016's** migration (`20261029181000_claim_decision_constraint_fix`), applied to the shared dev database | The four Claim-side suites now carry `decided_at` on a decided Claim |
| The `thread_messages` table existed but a suite asserted it did **not** | **Bolt 014's** migration (`20261030120000_claim_thread_messages`) | The suite's assertion now says the table is **present** — a statement about the schema's state at the time, which became false when the next unit landed |
| **`PrismaReportInteractionResolver.rejectPendingClaims` wrote a `Rejected` Claim with no `decided_at`** | **This bolt's own code path**, meeting bolt 016's constraint | The resolver's `UPDATE` now writes `decided_at` |

**The third is a genuine defect, and it is worth recording.** The withdrawal
path resolves the Pending Claims on a Found report — and bolt 016's
constraint requires every decided Claim to carry a decision time. The
resolver's `UPDATE … RETURNING` set the status and the rejection reason but
not the time, so **every withdrawal of a Found report with a Pending Claim
would have failed against the current schema.** The fix follows the pattern
bolt 016's own decision repository established: the `UPDATE` writes
`decided_at` alongside the status.

**The decider is left null, and that is correct.** A withdrawal's
auto-rejection was caused by a *member*, not an administrator, so there is no
administrator to name. The human who caused it is named by the audit event's
`triggeredBy` — which is where an auditor reads it.

**Two of the three causes were other bolts' drift, not this bolt's.** The
suite repairs were made where they belong — in the suites that carried the
stale inserts and the stale assertion — because a test that asserts a
transient state of the schema will fail the moment the next bolt lands.

## A test that had to be rewritten to prove anything

**The interactions suite wanted two live Responses on one report.** It wrote
a `Submitted` response and a `Selected for Verification` response from the
**same** responder — which Bolt 015's partial unique index correctly
refused, because both statuses are live and one responder may hold one live
response per report.

**The constraint was right and the fixture was wrong.** The suite was
rewritten to give the second response to a **second responder**, which is
what two real members would be. This is the same shape as bolt 016's finding:
a fixture that writes a row the schema forbids is not proving the code is
wrong — it is proving the fixture has not caught up with the schema.

## Owner Items

1. **The `CHECK` constraints are invisible to Prisma.** They live only in
   the migration SQL. A `prisma migrate diff` against a drifted schema
   would not flag their absence — the protection is a test, not the
   migration tooling. This carries forward from bolts 013 and 016.

2. **The bolt's own tests do not drop and restore constraints at runtime.**
   Bolt 016's database suite does, and every drop must be paired with a
   restore that cannot fail on the row it was testing. This bolt's suites
   write only rows the constraints allow, so they need no such dance — but
   a future suite that needs a forbidden row must follow bolt 016's
   `IF EXISTS` discipline.

3. **The blanket-delete race is still latent in the pre-existing suites.**
   This bolt's database suites delete **only the rows they created**, by id.
   The pre-existing suites in `src/infrastructure/listings/` still use
   blanket deletes. This carries forward from bolt 011.

4. **The `campus_area` column carries no foreign key, by design.** The
   campus-area set is *injected* per-deployment (ADR-20), so a foreign key
   would make the schema deployment-specific. Membership is a
   **validation** rule, and on read the stored text is passed through as
   `{ value }` without re-validating against the deployment's list — a
   report written under one deployment's list still reads back under
   another.

5. **The `Match Confirmed` cutoff is checked unconditionally, before the
   report-status whitelist.** That ordering is asserted by the domain
   suite, and it is deliberate: a settled match stops every further
   response whatever else the report's status says. A future change that
   moves the cutoff *after* the whitelist would let a response through on a
   report whose status happens to be admissible.

6. **The full suite has not been run against this bolt.** The owner scoped
   this stage to the bolt's own suites. The broader listings layer was run
   and is green (1311 passing across 62 files), but the layers outside
   `src/infrastructure/listings`, `src/application/listings`,
   `src/domain/listings`, `src/domain/recovery`, `src/application/recovery`,
   and `src/app/api/reports` were not measured here. Before the next bolt
   that touches the `recovery_responses` table or the Lost report machine, a
   full run is advisable.
