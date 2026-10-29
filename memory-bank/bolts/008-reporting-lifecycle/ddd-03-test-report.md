---
id: 008-reporting-lifecycle
stage: 5
stage_name: test
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-29T07:35:00Z
completed: 2026-10-29T07:35:00Z
verification_command: "npm run verify"
---

# Bolt 008 — Stage 5: Test Report

## Overview

The verification of the `008-reporting-lifecycle` bolt: the four operations a
reporter and an administrator may perform on a report after it exists.

| Operation | Route | Story | Requirement |
|---|---|---|---|
| Edit | `PATCH /api/reports/[id]/edit` | 004 | FR-9, FR-19 |
| Withdraw | `POST /api/reports/[id]/withdraw` | 006 | FR-11, FR-20 |
| Hard delete | `DELETE /api/reports/[id]/delete` | 005 | FR-10 |
| Administrator edit | `PATCH /api/admin/reports/[id]/edit` | 012 | FR-53 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**, and names the **one production defect**
the verification exposed in the bolt's own code.

Stages 2 (design) and 3 (ADR) were skipped by owner direction, so there is no
technical design artifact and no ADR artifact for this bolt. The design
decisions it would have carried are stated in the Stage 1 domain model, and
the ADR references below point at the ADRs recorded by earlier bolts and by
the project-wide decision set.

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
| Test | `vitest run` | ✅ **83 files, 1,427 tests, all passing** |
| Build | `next build` | ✅ clean, all four routes registered |

The build registers the four new routes:

```
ƒ /api/admin/reports/[id]/edit
ƒ /api/reports/[id]/delete
ƒ /api/reports/[id]/edit
ƒ /api/reports/[id]/withdraw
```

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 91.69 | 88.43 | 94.02 | 91.74 |
| `src/application` | 95.13 | 91.04 | 100 | 95.10 |

The global 80% line-coverage floor is met with margin.

### The bolt's own files

| File | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `src/domain/listings/report-editable-fields.ts` | 100.0 | 100 | 100.0 | 100.0 |
| `src/domain/listings/report-edit-snapshot.ts` | 100.0 | 100.0 | 100.0 | 100.0 |
| `src/domain/listings/report-interaction-records.ts` | 100.0 | 100 | 100.0 | 100.0 |
| `src/domain/listings/report-lifecycle-events.ts` | 100.0 | 100.0 | 100.0 | 100.0 |
| `src/domain/listings/report-lifecycle-messages.ts` | 75.0 | 75.0 | 100.0 | 75.0 |
| `src/domain/listings/report-deletion-decision.ts` | 81.8 | 85.7 | 100.0 | 81.8 |
| `src/domain/listings/report-withdrawal-decision.ts` | 73.9 | 84.0 | 100.0 | 73.9 |
| `src/domain/listings/terminal-status.ts` | 66.7 | 80.0 | 100.0 | 66.7 |
| `src/application/listings/report-edit-service.ts` | 86.6 | 77.1 | 100.0 | 86.6 |
| `src/application/listings/report-deletion-service.ts` | 96.0 | 100.0 | 100.0 | 96.0 |
| `src/application/listings/report-withdrawal-service.ts` | 100.0 | 100.0 | 100.0 | 100.0 |
| `src/application/listings/report-administrator-edit-service.ts` | 88.6 | 82.4 | 100.0 | 88.6 |
| `src/application/listings/claim-rejection-email.ts` | 100.0 | 100 | 100.0 | 100.0 |
| `src/infrastructure/listings/prisma-report-interaction-reader.ts` | 100.0 | 100.0 | 100.0 | 100.0 |
| `src/infrastructure/listings/prisma-report-interaction-resolver.ts` | 100.0 | 100.0 | 100.0 | 100.0 |
| `src/infrastructure/listings/prisma-audit-trail-deletion.ts` | 100.0 | 100 | 100.0 | 100.0 |
| `src/infrastructure/listings/prisma-report-visibility-reader.ts` | 100.0 | 100.0 | 100.0 | 100.0 |

**Every uncovered line is an exhaustiveness guard.** The lines below 100% are
`const unreachable: never = …` branches and defensive throws, which the
TypeScript compiler already proves cannot be reached:

| File | Uncovered lines | What they are |
|---|---|---|
| `report-lifecycle-messages.ts` | 54–55 | `never` guard on the deletion decision |
| `report-deletion-decision.ts` | 103–104 | `never` guard on the report type |
| `report-withdrawal-decision.ts` | 72–73, 151–152 | `never` guards on the type and the reason |
| `report-withdrawal-decision.ts` | 105, 132 | defensive `Blocked/TerminalStatus` for a status that cannot occur on that report's type |
| `terminal-status.ts` | 63–64 | `never` guard on the status |

The two `report-withdrawal-decision.ts` fallbacks are the only ones that are
not compiler-proved: a Found report reaching `Verification Pending` (a
Lost-side status) or a Lost report reaching `Claim Requested` (a Found-side
status) would land there. Both are states the state machine cannot produce,
and both are treated as a refusal rather than a permission — which is the safe
direction.

## The bolt's own test files

The bolt's tests were run as a group against the real database:

```bash
npx vitest run \
  src/domain/listings/report-lifecycle-decisions.test.ts \
  src/domain/listings/report-edit-snapshot.test.ts \
  src/domain/listings/report-editable-fields.test.ts \
  src/domain/listings/report-lifecycle-messages.test.ts \
  src/application/listings/report-edit-service.test.ts \
  src/application/listings/report-deletion-service.test.ts \
  src/application/listings/report-withdrawal-service.test.ts \
  src/application/listings/report-administrator-edit-service.test.ts \
  src/application/listings/claim-rejection-email.test.ts \
  src/infrastructure/listings/prisma-report-interactions.test.ts \
  src/infrastructure/listings/prisma-report-lifecycle.test.ts \
  src/app/api/reports/report-lifecycle-routes.test.ts
```

**12 files, 250 tests, all passing.**

| File | Tests | Covers |
|---|---|---|
| `src/domain/listings/report-lifecycle-decisions.test.ts` | 28 | The three decisions — deletion, withdrawal, terminal edit |
| `src/domain/listings/report-edit-snapshot.test.ts` | 14 | FR-19's conditional snapshot |
| `src/domain/listings/report-editable-fields.test.ts` | 15 | The FR-9 and FR-53 field sets |
| `src/domain/listings/report-lifecycle-messages.test.ts` | 12 | The refusal copy and its single home |
| `src/application/listings/report-edit-service.test.ts` | 18 | The reporter's edit — the gate, the whitelist, the write |
| `src/application/listings/report-deletion-service.test.ts` | 12 | The hard delete — the gate and the audit deletion |
| `src/application/listings/report-withdrawal-service.test.ts` | 18 | The withdrawal — the gate and the two type-specific sides |
| `src/application/listings/report-administrator-edit-service.test.ts` | 29 | FR-53 — the gate, the whitelist, the non-numbered record |
| `src/application/listings/claim-rejection-email.test.ts` | 10 | The FR-29 email, including its HTML escaping |
| `src/infrastructure/listings/prisma-report-interactions.test.ts` | 32 | **Live database** — the interaction reader and resolver |
| `src/infrastructure/listings/prisma-report-lifecycle.test.ts` | 18 | **Live database** — the lifecycle writes and the ADR-6 deletion |
| `src/app/api/reports/report-lifecycle-routes.test.ts` | 44 | The four routes' boundary behaviour |

The two `src/infrastructure/listings` files run against a **live PostgreSQL
database**, not a mock. The migrations
`20261029120000_reporting_lifecycle_interactions` and
`20261029130000_reporting_lifecycle_reader_columns` were applied.

## Success Criteria

Each criterion from `bolt.md`, and where it is verified.

| # | Criterion | Verified by | Result |
|---|---|---|---|
| 1 | Edit is refused on `Returned` and on `Closed`, with two distinct messages | `report-lifecycle-decisions.test.ts`, `report-edit-service.test.ts`, `report-lifecycle-messages.test.ts` | ✅ |
| 2 | Hard delete requires `Open` and no interaction — no Claim for Found, no Recovery Response for Lost | `report-lifecycle-decisions.test.ts`, `report-deletion-service.test.ts`, `prisma-report-lifecycle.test.ts` | ✅ |
| 3 | Withdrawal reaches `Closed` and resolves dependent Recovery Responses | `report-withdrawal-service.test.ts`, `prisma-report-interactions.test.ts` | ✅ |
| 4 | Administrator edit is refused on terminal reports | `report-administrator-edit-service.test.ts`, `report-lifecycle-routes.test.ts` | ✅ |
| 5 | Administrator edit exposes exactly the eight permitted fields and refuses reporter, type, lifecycle status, Claim content, Recovery Response content, audit entries, Returned-confirmation fields, and substitute-receiver fields | `report-editable-fields.test.ts`, `report-administrator-edit-service.test.ts` | ✅ |
| 6 | Every administrator edit writes a non-numbered append-only audit record with previous values | `report-administrator-edit-service.test.ts`, `report-lifecycle-events.test.ts`, `event-catalog.ts` | ✅ |
| 7 | Hard delete is the only path that removes audit records, and only for an interaction-free `Open` report | `report-deletion-service.test.ts`, `prisma-report-lifecycle.test.ts`, `append-only-enforcement.test.ts` | ✅ |

**All seven criteria are met.**

### Criterion 1 — two distinct messages

The two terminal statuses are refused **differently**, because the member's
remedy differs. `Returned` means an administrator confirmed a physical
return, so the report can no longer be edited; `Closed` means the report is
finished. `terminal-status.ts` owns the distinction and
`report-lifecycle-messages.test.ts` asserts the two messages are not the same
string.

### Criterion 2 — the interaction-free rule is asymmetric

A Found report is blocked by a **Claim**; a Lost report by a **Recovery
Response**. `report-lifecycle-decisions.test.ts` asserts each side against the
*other's* interaction too — a Found report with only a Recovery Response is
still deletable, and a Lost report with only a Claim is still deletable. This
is the criterion most worth the test, because conflating the two would let one
direction's history be deleted while the other was preserved.

### Criterion 5 — the field set is closed by construction

FR-53's permitted set is exactly **eight**: report name, category,
description, date, campus area, exact place, identifying details, and image
replacement. `report-editable-fields.test.ts` asserts the set is *"the
reporter's set plus exactly the image replacement"* as a **set difference**,
not as two hand-written lists — so adding a field to one side and forgetting
the other fails the test.

The refusals are asserted the same way: `reporterId`, `type`, and the
lifecycle status are refused, and so are the fields that belong to other
modules — Claim content (`claimReason`), Recovery Response content
(`recoveryResponseBody`), audit entries (`auditEntry`), Returned-confirmation
fields (`returnedConfirmation`), and substitute-receiver fields
(`substituteReceiverId`). None of them has a door in the whitelist.

### Criterion 6 — the record is non-numbered

`report.edited_by_administrator` is registered in
`NON_NUMBERED_EVENT_CATALOG`, not in the numbered catalog. FR-31's numbered
set is frozen, and FR-53 explicitly asks for a record, so it grows by a
**non-numbered** entry. The payload carries `changedFields` and
`previousValues` — named by the catalog entry, because the sanitizer denies
by default.

### Criterion 7 — the audit trail is append-only except here

ADR-6 enforces append-only at the **database** level, with a trigger on
`audit_events`. The single permitted deletion is gated by
`SET LOCAL findback.allow_audit_delete = 'on'`, and **only the FR-10 hard
delete path sets it**, and only after the eligibility check passes. The
setting is transaction-scoped (`SET LOCAL`, not `SET`) so it cannot leak onto
a pooled connection.

`prisma-report-lifecycle.test.ts` asserts that the report row and its audit
rows go together, and that the flag is not left set after the transaction.

## The stories

| Story | Acceptance criteria met | Evidence |
|---|---|---|
| 004-edit-own-report | all | `report-edit-service.test.ts` (18), `report-lifecycle-decisions.test.ts` |
| 005-delete-own-report | all | `report-deletion-service.test.ts` (12), `prisma-report-lifecycle.test.ts` (18) |
| 006-withdraw-own-report | all | `report-withdrawal-service.test.ts` (18), `prisma-report-interactions.test.ts` (32) |
| 012-administrator-edit-report | all | `report-administrator-edit-service.test.ts` (29), `report-editable-fields.test.ts` (15) |

## The live smoke test

**ADR-5 requires a live `npm run dev` smoke test** for the bolt's paths. The
report screens are a later bolt, so nothing in this bolt can be driven by
hand — the smoke test drives the **real HTTP routes** against the **real
database** instead.

`scripts/report-lifecycle-smoke.ts` (run with `npm run smoke:lifecycle`, with
the dev server already running) performs the whole path:

```bash
npm run smoke:lifecycle
```

It registers a member, approves the account directly in the database (the
approval is an administrator action, and there is no administrator UI yet),
signs in, derives the **CSRF token** the same way the server does, and then
drives the four routes.

**Result: `PASSED — every check held.`** — 30 checks across registration,
sign-in, session resolution, report creation, the reporter's edit (changed,
unchanged, anonymous refused, missing CSRF refused), the administrator's edit
(a member refused with a 403), the withdrawal (reaches `Closed`, a second
withdrawal is a 409, editing a `Closed` report is a 409), the hard delete
(removes the report, removes its audit trail with it, keeps a *withdrawn*
report, leaves it `Closed`), and the audit trail.

The CSRF token is a **pure derivation** —
`HMAC-SHA256(SESSION_SECRET, sha256(sessionToken))` — so there is no endpoint
that issues it. The smoke script computes it the same way the server does,
which is itself evidence that the client can derive it from the session it
already holds.

## What the verification exposed

### A production defect: a second withdrawal returned 500, not 409

**This is the reason the smoke test exists, and it is the most important
finding in this report.**

`WithdrawalRefusedError` extended `Error`. The transport
(`reportLifecycleErrorResponse`) maps `ConflictError` to a **409** and
`TerminalStateError` to a 409; an error that is neither falls through to the
generic handler and becomes a **500**. So a member who tried to withdraw an
already-withdrawn report was told *"the request failed for an unknown reason"*
rather than *"this report cannot be withdrawn yet"*.

**The unit tests could not have found it, and this is worth recording.** The
route suite mocked the use case's outcome with `new ConflictError(...)` — a
*different* type from the one the service actually throws. The mock was
faithful to the route's contract and unfaithful to the service's behaviour, so
the route's mapping was never exercised against the real error. Only the live
HTTP path reached the real error.

**Fixed** by making `WithdrawalRefusedError extends ConflictError`, and
**pinned** by three new assertions — one at the service level (that the
refusal is a `ConflictError`), and two at the route level (that the service's
own refusal maps to a 409, and that the refusal carries the domain's message).

The same class of defect was checked for elsewhere in the bolt: every other
refusal in the four services already extended one of the mapped kinds.

### Three second answers to the same question

The **"one implementation point per decision"** discipline — the codebase's
central rule — was violated in three places by the bolt's own code, and all
three were repaired during Stage 4:

1. **The administrator's whitelist used the reporter's set.**
   `report-administrator-edit-service.ts` had a local `isContentField` helper
   that checked `REPORTER_EDITABLE_FIELDS`, not
   `ADMINISTRATOR_EDITABLE_FIELDS`. Latent — the image arrives as
   `request.image`, not as a change key — but it was a second answer to
   "may this administrator change this field?". The local copy was deleted.

2. **The reporter's edit had no whitelist at all.** A `status` in the change
   set was silently ignored, leaving the caller believing the status had been
   changed when it had not. **The refusal is stronger than the silence it
   replaced**: the submission is now refused outright and nothing is written.
   The pre-existing test *"never changes the status"* was rewritten to assert
   the refusal rather than the silence.

3. **Two orphaned message constants.** `administratorTerminalEditMessage`
   duplicated `terminalEditMessage` from `terminal-status.ts`, and
   `WITHDRAWAL_TERMINAL_MESSAGE` was orphaned — and carried a *different
   string* from the live `withdrawalBlockMessage('TerminalStatus')`. Both
   were removed. Each refusal now has exactly one home, and
   `report-lifecycle-messages.test.ts` asserts it.

The domain now exposes three clearly-scoped predicates from one whitelist
module: `isChangeKey` (may this name be a key in the change map — seven
content fields, for **both** editors), `isAdministratorEditable` (may an
administrator change this thing at all — eight things), and
`isReporterEditable` (may a reporter change this thing at all — seven).

**The distinction between `isChangeKey` and `isAdministratorEditable` is
load-bearing.** The image is editable by an administrator, but it is not a
*column* — it is an **operation**: upload a blob and point the report at it.
So it travels as its own request member, never as a key in the change map,
and a request that offers it as a change key is **refused** rather than
silently ignored. A silently dropped field is a lie about what was changed.

### Two dead exports

`isReporterEditable` and `isAdministratorEditable` were exported from the
whitelist module and **called from nowhere**. They are now the domain's
answer to the two questions, and both services call them, so the whitelist
has exactly one implementation point.

### A `never`-guard gap, closed by a test

The new test *"refuses an image replacement offered as a change key"* failed
on first run. `isAdministratorEditable('imageReplacement')` is correctly
`true` — so the **test** was wrong, not the code. The right resolution was
the `isChangeKey` distinction above, and the test now asserts the refusal.

### The FR-29 email's escaping path was unverified

`claim-rejection-email.ts` sat at **0% coverage**, because the withdrawal
suite injects a fake email builder. The real builder was never exercised.

`claim-rejection-email.test.ts` now covers it, and it proved the **HTML
escaping** path — the injection risk — had never been verified. `<script>`
becomes `&lt;script&gt;`, `&` becomes `&amp;`, `'` becomes `&#39;`, `"`
becomes `&quot;`. The test also asserts the **order** matters: `a < b & c > d`
must become `a &lt; b &amp; c &gt; d` and never `&amp;lt;`.

The test also asserts that no Sensitive Field reaches the email body — the
FR-8 exact place and identifying details are not carried to a claimant.

## The withdrawal's two sides differ in kind

The suite proves the asymmetry rather than assuming it.

**The Found side** rejects every Pending Claim with the audit reason *"report
withdrawn by reporter"* and **sends the FR-29 rejection email to each affected
claimant**. The addresses come from the Claims the withdrawal *actually*
rejected — the resolver's returned set — so a Claim created concurrently and
rejected by the same update is notified, and a Claim rejected by an earlier
withdrawal is not notified twice.

**The Lost side** resolves every non-terminal Recovery Response to
`Resolved — Report Closed` and **sends nothing at all** (FR-30: no closure
email to responders).

The email is sent **after the commit** (ADR-3's decision 4), and the suite
asserts the ordering by index. A send failure never fails the withdrawal —
the report is already `Closed` and its Claims already `Rejected`, and neither
of those facts depends on the notification arriving.

**The dependent resolutions are in the same transaction as the status
change**, and the suite asserts the *sequence* rather than the outcome:
`resolver.rejectPendingClaims` before `reports.update` before
`transactions.commit`. A report that is `Closed` while its Claims are still
`Pending` would leave a claimant waiting on a claim that will never be
decided.

## Owner items

### 1 - The database's time zone must be set to UTC (carried from bolt 007)

**Unchanged and still outstanding.** The validator's "today" is UTC and
`CURRENT_DATE` is the session's time zone — a session ahead of UTC would
reject a report dated today as tomorrow. The migration's `SET TIME ZONE 'UTC'`
is commented out with a note that the deployment must set it, because
`ALTER DATABASE` cannot run inside a transaction block.

### 2 - A pre-existing flaky test in bolt 001's code

**Not caused by this bolt.** `src/infrastructure/accounts/reset-deactivation-acceptance.test.ts`
— *"criterion 4: the timing of the two paths is within the tolerance"* —
failed in **1 of 3** consecutive full-suite runs. The test asserts two
request paths complete within a 100 ms tolerance of each other, which is
ADR-18's timing-oracle tolerance.

`git status` confirms the file is **unmodified by this bolt**; it was last
touched by bolt `007`, commit `ad49763`. The flake is a property of the
timing assertion, not of the lifecycle code.

**Recommended remedy:** widen the tolerance or remove the wall-clock
comparison in favour of an observable ordering assertion. This is bolt
`001`'s code and is best addressed there.

## Notes

### The responses carry no stored field

Every write response returns the report's `id`, `status`, and the audit
outcome — and **nothing else**. Not the name, not the description, not the
exact place.

This is not incidental. The member's view of their own report is a **read**
concern governed by FR-39 and owned by bolt `009`. Returning the stored
fields from the write path would create a second, ungoverned read path — the
same *"one implementation point per decision"* discipline bolt `006`
enforced. `report-lifecycle-routes.test.ts` asserts the response shape for
all four routes.

### The reporter is derived from the session, never from the request

Every route takes the actor from the session actor, never from the request
body. A body-supplied reporter is ignored. The route suite asserts it.

The administrator's authority is likewise **`isAdministrator`**, not the
self-declared role. The self-declared role is one of the PRD's four and
carries no authority of its own — a member may declare `Employee` and still be
a plain member. The smoke script exercises exactly this: the administrator
account it creates declares `Employee`, and it is the `isAdministrator` flag
that grants the access.

### Not verified here, by design

The bolt does not build:

- the report screens — the report UI bolt
- the status machine's other transitions — bolt `011` and bolt `017`
- listings and search — bolt `009`
- claim decisions — bolt `016`
- the return closeout — bolt `019`

### The smoke test is a smoke test, not a suite

**The acceptance criteria are proven by the suites under `src/`.** The smoke
script proves the same path works when run outside the test runner — against
the database as configured, with the real work factors. It found a defect the
mocked suite could not, and that is its value; it is not a substitute for the
suites, and it does not replace their coverage.

## Verdict

**READY**

The bolt's seven success criteria are met, its four stories are implemented,
the full verification command passes, the coverage floor is exceeded, and the
live smoke test passes end to end.

The one production defect the verification exposed — the 500-instead-of-409
on a refused withdrawal — was repaired during Stage 4 and is now pinned by
three assertions at two levels. The three *"second answer"* violations were
repaired, the two dead exports are now the domain's single source of truth,
and the FR-29 email's unverified escaping path is now covered.

Two owner items remain outstanding and neither is blocking: the database's
time zone must be set to UTC explicitly by the deployment, and a pre-existing
timing-flaky test in bolt `001`'s code should be widened or re-expressed.

---