---
id: 011-lost-status-model
stage: 5
stage_name: test
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
created: 2026-10-29T16:55:00Z
completed: 2026-10-29T16:55:00Z
verification_command: "npm run verify"
---

# Bolt 011 — Stage 5: Test Report

## Overview

The verification of the `011-lost-status-model` bolt: the eight-status Lost-side
state machine, defined before anything transitions it.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The canonical status set | `src/domain/recovery/recovery-response-status.ts` | 002 | FR-41 |
| The transition table | `src/domain/recovery/recovery-response-transition.ts` | 002 | FR-41 |
| The derived `Standby` display | `src/domain/recovery/standby-display.ts` | 002 | FR-41, D7 |
| The responder's withdrawal | `src/domain/recovery/recovery-response-withdrawal.ts` | 007 | FR-41 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is no
domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standard, `memory-bank/standards/lost-side.md`.

## The bolt's real subject: one vocabulary, five copies

**The Recovery Response status set had been written down five times** — as an
array, a type, and a predicate in one module; a second type union in another; a
raw SQL `IN (...)` list in an adapter; a Prisma `where: { status: { in: [...] } }`
in another adapter; and the eight literals in the migration's `CHECK` constraint.
They had already drifted.

All five now derive from **`src/domain/recovery/recovery-response-status.ts`**,
which is the single implementation point for FR-41's vocabulary. The two
adapter copies import the same constant the domain uses, so a status added to
the model reaches the query that filters on it without anyone editing a second
list.

### A wrong fact was propagating into a test

`report-interaction-records.ts` described `Match Confirmed` as "terminal for
this purpose," and `report-lifecycle-decisions.test.ts` asserted
`isNonTerminalRecoveryResponseStatus('Match Confirmed') === false`. **FR-41
says `Match Confirmed` is non-terminal** — the Lost report stays
`Verification Pending` until an administrator confirms the physical hand-off.

The *behaviour* was correct (a withdrawal is blocked by the separate
`hasMatchConfirmed` fact, so no matched response reaches the resolve step), but
the *name* was a second, wrong answer to "which statuses are non-terminal?".
The constant and predicate were therefore **renamed for what they actually
do** — `WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES` and
`isResolvedByReportWithdrawal` — and the doc comment now states the
distinction explicitly. A test now asserts both facts side by side.

The rename was carried through every layer that spoke the old name, because a
half-renamed vocabulary is worse than either:

| Before | After |
|---|---|
| `NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` | `WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES` |
| `isNonTerminalRecoveryResponseStatus` | `isResolvedByReportWithdrawal` |
| `NonTerminalRecoveryResponseToResolve` | `WithdrawalResolvedRecoveryResponse` |
| `resolveNonTerminalRecoveryResponses` | `resolveWithdrawalResolvedRecoveryResponses` |
| `nonTerminalRecoveryResponses` | `withdrawalResolvedRecoveryResponses` |

The doc comments and `describe` blocks that described the resolve set as
"non-terminal" were corrected at the same time — in
`report-interaction-records.ts`, `report-withdrawal-service.ts`,
`report-interaction-resolver.ts`, `report-interaction-reader.ts`,
`prisma-report-interaction-resolver.ts`, `prisma-report-interactions.test.ts`,
`report-withdrawal-service.test.ts`, `lost-side-event-factory.ts`, and
`lost-side-events.ts`. The **canonical** non-terminal set keeps the word
"non-terminal", because there it is the correct word.

## Verification Command

```bash
npm run verify
```

which is:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint .` | ✅ clean, no errors |
| Test | `vitest run` | ✅ **107 files, 1,796 tests, all passing** |
| Build | `next build` | ✅ clean, all routes registered |

The build is unchanged by this bolt — the bolt adds no route, because a state
machine is not a surface. The routes registered are the twenty the previous
bolts established, including `ƒ /api/reports/[id]/image`.

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 92.60 | 88.65 | 95.10 | 92.65 |
| `src/domain/recovery` | 100 | 100 | 100 | 100 |

The global 80% line-coverage floor is met with margin, and the bolt's own four
modules are at **100% on every metric** — statements, branches, functions, and
lines.

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `recovery-response-status.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-transition.ts` | 100 | 100 | 100 | 100 |
| `standby-display.ts` | 100 | 100 | 100 | 100 |
| `recovery-response-withdrawal.ts` | 100 | 100 | 100 | 100 |

### Stability

The full suite was run **three consecutive times** after the final change, each
time reporting `1,796 passed / 0 failed`. A green run is only meaningful if it
reproduces, and this bolt's suites touch a shared database.

## What was verified

### The domain (4 suites, 66 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-response-status.test.ts` | 12 | The eight statuses are canonical, the terminal set is exactly five, the non-terminal set is its complement, and `Standby` is not a status |
| `recovery-response-transition.test.ts` | 22 | The table is total, an illegal transition throws, and no status moves backwards or out of a terminal status |
| `standby-display.test.ts` | 17 | The `Standby` label is a display value only, the stored status never changes, and the predicate and the derivation never disagree |
| `recovery-response-withdrawal.ts` | 15 | The withdrawal is permitted only from `Submitted`, and the three refusal reasons carry three different messages |

### The database (2 suites, 19 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `recovery-response-status-constraint.test.ts` | 11 | The `CHECK` constraint exists, names exactly the eight canonical statuses, and the **database itself** rejects `Standby` and four other invalid values |
| `recovery-response-deactivation-acceptance.test.ts` | 8 | Deactivating a responder leaves their responses intact, and the foreign key forbids a cascade |

Both suites run against the **live database** and skip only when `DATABASE_URL`
is unset. Under `npm run verify` the variable is set, so **both suites ran** —
the test counts above include them, and the constraint suite's eleven
assertions were each verified to execute rather than skip.

## Success Criteria

Every criterion is traced to the suite that proves it.

### 1. Status is constrained to the eight persisted values by schema, not only by code

**Proven by** `recovery-response-status-constraint.test.ts` →
*"the constraint the schema carries"*.

> **A drafting slip, corrected here.** The story's prose says *"exactly the
> seven real Recovery Response statuses"*, and the bolt's success criterion
> repeated "seven". Its own acceptance criterion lists **eight**, its Technical
> Notes name five terminal statuses out of those eight, the PRD names eight,
> and the database's `CHECK` constraint enforces eight. **Eight is correct**,
> and the criterion text has been corrected in `bolt.md` to match. The
> implementation was always eight — the slip was only ever in the prose.

The constraint's own text is read from the database with
`pg_get_constraintdef(oid)`, the eight string literals are extracted from it by
regular expression, and the result is compared as a sorted array against
`RECOVERY_RESPONSE_STATUSES`. The suite fails if the migration's list and the
domain's list drift apart.

> **The constraint already existed** — bolt 008's migration added it, and it
> already enumerated exactly the eight canonical statuses. So this criterion was
> already *satisfied*. It was **unproven**, which is a different thing: the
> next migration to touch that table could have relaxed the constraint and no
> test would have failed.

The suite also asserts the constraint does **not** name `Standby`, which is the
literal the criterion turns on.

### 2. Writing `Standby` is rejected at the database level

**Proven by** `recovery-response-status-constraint.test.ts` →
*"the writes the database rejects"*.

The write is attempted against the live database and the error is caught. The
row is then verified **absent** afterwards, so a constraint that raised a
warning without blocking the write would fail the suite.

Five values are proven to be rejected by the database:

| Value | Why it must be rejected |
|---|---|
| `Standby` | A display condition, never a persisted value |
| `Completed` | Not one of the eight canonical statuses |
| `Verification Pending` | A Lost **report** status — the two state machines share no vocabulary |
| `Pending` | A **Claim** status — the two state machines share no vocabulary |
| `submitted` | The literals are verbatim; `submitted` is not `Submitted` |

A final test asserts that **a refused write changes nothing** — the rows
accepted before the refusal are still there, and no partial row was left.

### 3. A sibling displays `Submitted — Standby` while its stored status stays `Submitted`

**Proven by** `standby-display.test.ts`.

The load-bearing assertion is that **the stored status never changes**.
`STANDBY_DISPLAY_STATUS` is the PRD string, em dash included, and
`storedStatusOf(STANDBY_DISPLAY_STATUS)` is `null` — the label is not a status,
so it cannot be stored.

`deriveDisplayStatus` calls `isStandby`, so the two forms of the rule can never
disagree about the same response; a test asserts that agreement across every
sibling. The suite also covers the story's edge case: the label disappears once
the selection becomes `Not a Match`, and it **moves** when the selection moves
— because the derivation reads the current statuses every time, with nothing
stored to remember either.

### 4. `Match Confirmed` is treated as non-terminal everywhere it is evaluated

**Proven by** `recovery-response-status.test.ts` and
`recovery-response-transition.test.ts`.

The non-terminal set is *derived* as the complement of the terminal set, so a
status is classified by exactly one set and the two cannot disagree.
`recovery-response-transition.test.ts` proves `Match Confirmed` has outgoing
transitions and may move to `Completed — Report Returned`.

The correction described above is proved by
`report-lifecycle-decisions.test.ts` → *"is false for Match Confirmed, because
a withdrawal is blocked before it"*, which asserts both facts side by side:
`isResolvedByReportWithdrawal('Match Confirmed')` is `false`, while
`isNonTerminalRecoveryResponseStatus('Match Confirmed')` is `true`.

> **The report's own status is story 005's business, not this bolt's.** The
> criterion says the parent Lost report *remains* `Verification Pending`, but
> "the Lost report's lifecycle" is explicitly **out of scope** for this story,
> and the report's transition table lives in `src/domain/listings/`. What this
> bolt owns is the half that makes the statement true: `Match Confirmed` is
> **not** an ending, so no rule here can move the report. `recovery-response-status.test.ts`
> asserts that `Verification Pending` is a **report** status and is absent
> from the response vocabulary — the two state machines share no enum.

### 5. An illegal transition throws rather than partially applying

**Proven by** `recovery-response-transition.test.ts` → *"asserting a transition"*.

The story is explicit: *"the transition throws rather than silently degrading
or partially applying."* `assertRecoveryResponseTransition` throws
`IllegalTransitionError`; it does not return `false` that a caller might
ignore. A test asserts the function returns **nothing** on success, so there is
no path that returns a "not done" result a caller could overlook.

The decision form and the throwing form carry the **same message**, and a test
asserts they agree — one answer to "may this move?", in two forms.

The table is **total**: every one of the eight statuses is a key, so an illegal
transition is a *lookup that misses* — never "not yet implemented".

### 6. Withdrawal is refused once a response is selected or past `Submitted`

**Proven by** `recovery-response-withdrawal.test.ts`.

| State | Outcome | Reason |
|---|---|---|
| `Submitted`, not selected | permitted → `Withdrawn` | The responder's own exit |
| `Selected for Verification` | refused | `AlreadySelected` — the owner's decision is in progress |
| `Match Confirmed` | refused | `NotSubmitted` — the outcome is recorded |
| any terminal status | refused | `Terminal` |

The three reasons carry **three different messages**, because the responder's
remedy differs with them — a responder waiting on the owner should not be told
the response is closed. A test asserts the three messages are distinct.

`assertWithdrawalPermitted` throws `ConflictError` (the codebase's **409**):
the request is well-formed, but the current state of the world conflicts with
it.

The suite also cross-checks the rule against the transition table —
`withdrawalIsATransition('Submitted')` is `true` — so the two cannot drift.

### 7. Deactivating a responder leaves their existing responses intact

**Proven by** `recovery-response-deactivation-acceptance.test.ts`, against the
live database.

The application's guarantee is **structural**:
`AccountDeactivationService` holds only an `AccountRepository` and a
`SessionRepository`, so it has no repository through which it *could* reach a
Recovery Response. That is the strongest form of the guarantee — but structural
arguments decay silently, so the criterion is now also proved at the database
level: a responder is deactivated, and then

- the response row is still there,
- its status is still `Submitted`,
- it is still attributed to the deactivated responder,
- it was **not** silently turned into `Withdrawn`,
- the report's own status did not move,
- and every response the responder holds survived, not just the one.

The database backs this up independently:
`recovery_responses_responder_id_fkey` is **`ON DELETE RESTRICT`**, so deleting
a responder's account is *refused by the database* while they still hold
responses. A test asserts that rule directly, so a future migration cannot
quietly relax it to `CASCADE`.

## A real defect this stage caught: the cleanup race

**The first version of the two new database suites deleted rows with blanket
statements** — `DELETE FROM "reports"` and `DELETE FROM "recovery_responses"`.
The suite passed in isolation, but the **full suite** failed, with 60–72
failures across eight unrelated files.

The symptom was a foreign-key violation on `reports_reporter_id_fkey` in
suites that had nothing to do with this bolt: the blanket delete had removed
another worker's reporter account while that worker was mid-insert. The failing
set *changed between runs* — the signature of a concurrency race, not a logic
error.

The diagnosis was established by measurement rather than assumption:

| Configuration | Result |
|---|---|
| Baseline (bolt 11 stashed entirely) | 1,710 passed, **0 failed** |
| Domain changes only, no new database suites | 1,777 passed, **0 failed** |
| Plus the constraint suite (blanket deletes) | 1,788 passed, 0 failed *(first run)* |
| Plus both new suites (blanket deletes) | 1,796 total, **60–72 failed** |

The fix was to delete **only the rows each suite created**, by id, rather than
the whole table. After that change the suite passed **three consecutive times**
at `1,796 passed / 0 failed`.

> **The existing suites in `src/infrastructure/listings/` still use blanket
> deletes** — six of them issue `DELETE FROM "reports"`:
> `prisma-report-lifecycle.test.ts`,
> `prisma-report-image-reader.test.ts`,
> `prisma-report-listing-reader.test.ts`,
> `prisma-report-listing-reader.performance.test.ts`,
> `prisma-report-repository.test.ts`,
> `visibility-readers-integration.test.ts`, and
> `prisma-report-interactions.test.ts`. The same latent race is available to
> them, and it will fire the first time a suite is added that depends on a
> report fixture while another suite cleans up. **This is recorded as an owner
> item below** rather than fixed here, because changing six existing suites'
> cleanup semantics is outside this bolt's scope.

## Owner Items

1. **The blanket-delete race is still latent in six existing suites.** The
   fix applied to this bolt's two new suites — delete by id, not by table —
   should be applied to `prisma-report-lifecycle.test.ts`,
   `prisma-report-image-reader.test.ts`, `prisma-report-listing-reader.test.ts`,
   `prisma-report-listing-reader.performance.test.ts`,
   `prisma-report-repository.test.ts`,
   `visibility-readers-integration.test.ts`, and
   `prisma-report-interactions.test.ts`. Until then, adding a new
   report-fixture-dependent suite can fail suites that are not its own.

2. **The `CHECK` constraint is invisible to Prisma.** It lives only in the
   migration SQL, because Prisma's schema language cannot express it. A
   `prisma migrate diff` against a schema that has drifted from the migrations
   would **not** flag the constraint's absence. The `model RecoveryResponse`
   doc comment now names the constraint and the migration that adds it, and
   `recovery-response-status-constraint.test.ts` fails if the constraint is
   missing or names the wrong statuses — but the protection is a test, not the
   migration tooling.

3. **`Match Confirmed` is non-terminal, and the codebase now agrees — but the
   name that carried the wrong fact is gone, not merely re-documented.** Any
   future reader who introduces a *new* status must decide whether it is
   terminal, and the only place that question is answered is
   `TERMINAL_RECOVERY_RESPONSE_STATUSES`. The non-terminal set is derived, so
   a new status is non-terminal unless it is explicitly listed as terminal —
   which is the safe default, but it is a default rather than a decision, and
   the domain design stage for the Lost-side lifecycle should confirm it.

4. **The withdrawal rule is a domain rule with no application service behind
   it yet.** `assertWithdrawalPermitted` is proven and ready, but nothing calls
   it — bolt 015's response-submission path and the withdrawal route that
   follows it must invoke it. Until then the rule is unreachable from the API.

5. **The `Standby` derivation has no renderer.** `deriveDisplayStatus` and
   `isStandby` are proven, but no component calls them yet. The Lost report's
   response list must use the derivation — never a stored value — for the
   `Submitted — Standby` label to appear.

6. **The database's time zone must be set to UTC explicitly by the
   deployment.** This remains outstanding from bolt 007 and still constrains
   every timestamp comparison the Lost-side lifecycle will make.
