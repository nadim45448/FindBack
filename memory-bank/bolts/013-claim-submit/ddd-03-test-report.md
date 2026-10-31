---
id: 013-claim-submit
stage: 5
stage_name: test
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
created: 2026-10-29T19:30:00Z
completed: 2026-10-29T19:30:00Z
verification_command: "npm run verify"
---

# Bolt 013 — Stage 5: Test Report

## Overview

The verification of the `013-claim-submit` bolt: the Found-side Claim
submission path — a member claims a Found report as theirs, and the Claim,
the report's status move, the audit event, and the finder's notification all
commit together or not at all.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The three Sensitive Fields and their bounds | `src/domain/listings/claim-reason.ts`, `claim-identifying-details.ts`, `claim-date-lost.ts` | 001 | FR-15 |
| The submission validator | `src/domain/listings/claim-field-validator.ts` | 001 | FR-15 |
| The submission gate | `src/domain/listings/claim-submission-decision.ts` | 001 | FR-15, FR-49 |
| The Claim status vocabulary | `src/domain/listings/claim-status.ts` | 001 | FR-15 |
| The audit event | `src/domain/listings/claim-submitted-event.ts` | 001 | FR-15 |
| The use case | `src/application/listings/claim-submission-service.ts` | 001 | FR-15 |
| The persistence | `src/infrastructure/listings/prisma-claim-repository.ts` | 001 | FR-15 |
| The schema constraints | `prisma/migrations/20261029160000_claim_submission_constraints/` | 001 | FR-15 |
| The transport | `src/app/api/claims/route.ts` | 001 | FR-49 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments, in the migration SQL, and in the governing standards under
`memory-bank/standards/`.

## The bolt's real subject: a claim is a *submission*, and not every claim row is one

**A `Pending` Claim and a Claim row are not the same thing.** The three
Sensitive Fields — the reason, the identifying details, and the date lost —
are **required at submission**, because a half-asserted claim asserts nothing.
But a Claim row can also be written by a **lifecycle path**: a withdrawal's
auto-rejection, say, never went through the submission form and genuinely
carries none of them.

The first implementation of this bolt had only one shape for a Claim, and it
chose the *submission* shape — `reason` and `identifyingDetails` were
non-nullable. The new adapter suite found the consequence immediately: reading
back a **decided** Claim threw, because the repository rebuilt the absent
reason through `createClaimReason('')` and the constructor refuses a string
shorter than 20 characters. The repository was therefore doing one of two
things, both wrong: it **fabricated** a field the row did not have, or it
**crashed** on a row that was perfectly legal.

The fix was to make the distinction explicit in the type. `PersistedClaim`
now declares `reason: ClaimReason | null` and
`identifyingDetails: ClaimIdentifyingDetails | null`, and the absence is
carried through as an explicit `null` rather than an empty string wearing a
value object's clothes. The **submission** path is still guaranteed to carry
all three — `ValidatedClaim` keeps them non-nullable, and the validator is
the only path to a `ValidatedClaim`. The database agrees: the
`claims_pending_fields_check` constraint requires all three on a `Pending`
Claim and permits their absence on a decided one.

> **The audit event describes what was *submitted*, not what was *stored*.**
> When the persisted shape became nullable, the audit event — which names
> exactly three additional fields — would have been built from a shape that
> might not carry them. The service now builds the event from the
> **validated** Claim plus the minted id, which is both type-correct and
> semantically right: the event records what the member submitted.

### The gate was failing open

The submission gate decides whether a member may claim a report. It was
written as a list of refusals — *"not this account, not this report, not this
owner, not this status"* — and **anything it did not name was permitted**.

That is a gate that **fails open**. A report status the bolt had never seen —
the Lost-side `Verification Pending`, say — was waved through, because it
matched no refusal. So was a `null` status: a report whose status could not
be read was treated as a report whose status was fine.

The gate is now a **whitelist**. Only `Open` and `Claim Requested` accept a
claim, and every other status — recognised or not, present or absent — is
refused with `ReportNotOpenForClaims`. The suite asserts the whitelist
**as a property** across all six canonical report statuses, so a status added
to the vocabulary later fails the test unless the gate is updated with it.

### The uniqueness constraint is the rule; the application check is the explanation

The story is explicit: *"The one-`Pending`-Claim-per-item-per-member rule is
enforced by a database uniqueness constraint, not only by an application
check."* The application's check reads first and writes second, so two
requests racing could both pass it. The constraint cannot race: PostgreSQL
serialises the two inserts on the index and the second one fails.

The constraint is a **partial unique index** over `(report_id, claimant_id)`
`WHERE "status" = 'Pending'`. The partiality is what makes a second claim
possible once the first is decided — a member whose claim was rejected may
claim again, and the PRD requires that new Claim to sit alongside the
retained history. A plain unique index on the pair would forbid it.

The adapter suite proves that **the constraint's own refusal is translated
into a business outcome**: the `P2002` the driver raises becomes a
`DuplicatePendingClaimError` carrying the member's own message, so the
route's **409** mapping is reached rather than a 500. It also proves the
negative — a foreign-key failure is a **defect**, and a defect must not be
dressed up as *"you already have a claim pending"*.

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
| Test | `vitest run` | ✅ **123 files, 2,166 tests, all passing** |
| Build | `next build` | ✅ clean, all routes registered |

The build is unchanged by this bolt except for one new route: `ƒ /api/claims`.

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 93.19 | 87.79 | 94.25 | 93.25 |

The global 80% line-coverage floor is met with margin, and the bolt's own
modules are at **100% on every metric** — statements, branches, functions, and
lines — with one exception noted below.

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `claim.ts` | 100 | 100 | 100 | 100 |
| `claim-status.ts` | 100 | 100 | 100 | 100 |
| `claim-reason.ts` | 100 | 100 | 100 | 100 |
| `claim-identifying-details.ts` | 100 | 100 | 100 | 100 |
| `claim-date-lost.ts` | 100 | 100 | 100 | 100 |
| `claim-field-validator.ts` | 100 | 100 | 100 | 100 |
| `claim-submission-decision.ts` | 100 | 100 | 100 | 100 |
| `claim-submitted-event.ts` | 100 | 100 | 100 | 100 |
| `claim-submission-service.ts` | 100 | 100 | 100 | 100 |
| `new-claim-email.ts` | 100 | 100 | 100 | 100 |
| `ports/claim-repository.ts` | 100 | 100 | 100 | 100 |
| `ports/pending-claim-reader.ts` | 100 | 100 | 100 | 100 |
| `prisma-claim-repository.ts` | 100 | **95.23** | 100 | 100 |
| `prisma-claim-subject-reader.ts` | 100 | 100 | 100 | 100 |
| `prisma-pending-claim-reader.ts` | 100 | 100 | 100 | 100 |

`prisma-claim-repository.ts` sits at 95.23% branch coverage because the
`isUniqueViolation` guard tests four independent conditions and the suite
exercises three of them — the `error` being a non-object, `error` being
`null`, and the `code` differing from `P2002`. The fourth (`code` being
`P2002`) is the one the uniqueness test proves. The uncovered branch is the
`error !== null` half of the first condition, and it is defensive rather than
reachable from Prisma.

### Stability

The full suite was run **three consecutive times** after the final change,
each time reporting `2,166 passed / 0 failed`. A green run is only meaningful
if it reproduces, and this bolt's suites touch a shared database.

## What was verified

### The domain (3 suites, 53 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-value-objects.test.ts` | 25 | The reason is 20–1000 characters, the identifying details are 10–500, the date lost is at most 365 days old and never in the future, and every bound is **inclusive** at its edge |
| `claim-submission-decision.test.ts` | 19 | The gate permits only `Open` and `Claim Requested`, refuses each of its six reasons with a distinct message, and **fails closed** on an unrecognised or absent status |
| `claim-status.test.ts` | 9 | The four statuses are canonical, the array is frozen, three are terminal, `Pending` is the only non-terminal, and the Claim vocabulary shares nothing with the Recovery Response vocabulary |

### The application (1 suite, 24 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-submission-service.test.ts` | 24 | The gate runs before the validation, the validation runs before anything is written, the Claim and the report's move and the audit event commit together, the report only moves when it was `Open`, and a **send failure never fails the submission** |

### The transport (1 suite, 27 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claims-route.test.ts` | 27 | The status codes, the **order** of the refusals, the exact response key set, the `Location` header, and that the reason and identifying details are **never echoed** |

### The database (2 suites, 32 tests)

| Suite | Tests | What it proves |
|---|---|---|
| `claim-submission-constraint.test.ts` | 11 | The `CHECK` constraints and the partial unique index exist, their **own text** is read from `pg_constraint` and compared against the domain's bounds, and the **database itself** refuses an out-of-bounds write |
| `prisma-claim-adapters.test.ts` | 21 | The repository's write, read, translation, and refusal; the pending reader's agreement with the partial index; and the subject reader's report-with-owner-and-email read |

Both suites run against the **live database** and skip only when
`DATABASE_URL` is unset. Under `npm run verify` the variable is set, so
**both suites ran** — the test counts above include them.

## Success Criteria

Every criterion is traced to the suite that proves it.

### 1. A claim requires reason, identifying details, and date lost

**Proven by** `claim-value-objects.test.ts` and
`claim-submission-constraint.test.ts`.

The domain's bounds are the story's: a reason of **20–1000** characters and
identifying details of **10–500**. The suite proves each bound at its edge
and one character outside it, and proves the date lost is present.

The database proves the same rule independently. The constraint suite reads
the constraint's **own text** out of `pg_constraint` with
`pg_get_constraintdef(oid)` and compares the **numbers** in it against the
domain's constants — so the migration and the domain cannot drift apart
without the suite failing.

> **PostgreSQL normalises `BETWEEN`.** The migration writes
> `char_length("reason") BETWEEN 20 AND 1000`; `pg_get_constraintdef` returns
> `char_length(reason) >= 20 AND char_length(reason) <= 1000`. The suite
> asserts the **normalised** form. The comparison is still exact — the
> numbers are the domain's numbers — but the assertion matches what the
> database actually stores.

A `Pending` Claim is also required to carry all three fields plus
`submitted_at`, by the `claims_pending_fields_check` constraint. The
constraint suite proves the database refuses a `Pending` Claim that is
missing any of them.

### 2. `date lost` is at most 365 days old and not in the future

**Proven by** `claim-value-objects.test.ts` and
`claim-submission-constraint.test.ts`.

The domain applies the rule with an **injected clock**, so the bound is
testable at its edge: a date exactly 365 days before today is **accepted**
(the bound is inclusive), one day further is refused, and tomorrow is
refused.

The database applies the same rule against `CURRENT_DATE`, so the constraint
holds even for a path that bypasses the validator. The suite proves the
database refuses a write whose `date_lost` is out of bounds.

The story's edge cases are covered explicitly: *date lost is today* is
accepted, and only **future** dates are refused.

### 3. A member cannot claim their own report; the action returns 403

**Proven by** `claim-submission-decision.test.ts` and `claims-route.test.ts`.

The gate refuses `OwnReport`, and the route maps it to **403**. The suite
asserts the status code and that the response carries the *own report*
message rather than a generic refusal.

The **order** matters and is proved: a member claiming their own report on a
*closed* report is told it is their own report, not that the report is
closed. Telling a member about the report's status when they were not
entitled to it would leak a fact.

### 4. One Pending claim per item per member

**Proven by** `prisma-claim-adapters.test.ts` and
`claim-submission-constraint.test.ts`.

This criterion has **three** halves, and the suite proves each.

**The application refuses the duplicate.** The pending-claim reader answers
`true` when the member holds a `Pending` Claim on the report, the gate
refuses with `AlreadyPendingClaim`, and the service raises a
`ConflictError` — which the route maps to **409**.

**The database refuses the duplicate.** The adapter suite writes the same
Claim twice and asserts the second write raises
`DuplicatePendingClaimError` carrying the member's own message. This is the
**untranslated** case — the constraint firing where the application check did
not — and it is still a *business* outcome, not a 500.

**A decided Claim does not count.** A member whose claim was **Rejected** may
claim again, and the new Claim sits alongside the retained history. The
pending reader proves a `Rejected` Claim does not make the read say yes, and
the partial unique index is what makes the second write possible — a plain
unique index on the pair would forbid it.

The suite also proves the **negative**: a foreign-key failure is **not**
translated into a duplicate-pending-claim error. Only the uniqueness
violation becomes a business outcome; a defect must not be dressed up as
*"you already have a claim pending"*.

### 5. A `Pending` account cannot submit a claim

**Proven by** `claim-submission-decision.test.ts` and `claims-route.test.ts`.

The account's capability is resolved **once**, at the `ActorContext`
boundary, and the service does not re-read the account or write its own
`if (status !== 'Active')` guard. The flag travels with the actor.

The gate refuses `AccountNotActive`, and the route maps it to **403** with a
clear message. The account check runs **first**, before anything is said
about the report — a member whose account is not active is not entitled to
learn whether a report is closed.

### 6. The claim is created `Pending` and the report becomes `Claim Requested`

**Proven by** `claim-submission-service.test.ts` and
`prisma-claim-adapters.test.ts`.

The adapter suite proves the repository writes the Claim with its **minted
id** and a `Pending` status, and reads it back with the reason and the
identifying details **intact** — the Sensitive Fields survive the round trip
because they are rebuilt through their own constructors, so a row carrying an
out-of-bounds value would be **refused** on the way out rather than carried
into the domain unchecked.

The service suite proves the **transition**: a report that was `Open` moves
to `Claim Requested`, and a report already at `Claim Requested` **stays
there** — a second member's Claim is legitimate, and moving it again would
write a transition that did not happen.

The Claim, the report's move, and the audit event are written in **one
transaction**. A report that is `Open` while a `Pending` Claim sits on it
would show the finder no claim against their item. The service suite proves
the order (`claims.create` → `reports.update` → `audit.record`) and that the
audit event is inside the transaction — an audit entry for a transition that
did not happen is a defect, and the trail is append-only with no correction
path, so the error would be permanent.

The email is sent **after** the commit. The suite proves a **send failure
never fails the submission**: the Claim stands, and neither the Claim's
pending state nor the report's status depends on the notification arriving.

### 7. Submission does not make the finder able to see the claim's reason or identifying details

**Proven by** `claims-route.test.ts`.

This is the subtle criterion, and the route suite proves it from the
**outside**: the 201 response's key set is asserted **exactly**, and the
response carries **neither the reason nor the identifying details**. A
response that merely happened not to include them would not be enough — the
assertion is on the complete key set, so a future field added to the
response body would fail the test.

The visibility rule itself lives in the read projection
(`claim-projection.ts`), which the Found-report owner may never be granted
the two private fields. The route proves the **submission** side of the
split; the projection's own suite covers the read side.

## A real defect this stage caught: a decided Claim could not be read back

**The adapter suite found it on its first run.** A Claim row written by a
lifecycle path — a withdrawal's auto-rejection — carries no reason and no
identifying details. Reading it back called `createClaimReason('')` because
the repository coerced the absent value to an empty string, and the
constructor **refuses** a string shorter than 20 characters. The read
therefore **threw**.

Nothing had caught it before because the bolt's earlier tests only ever read
back Claims the bolt itself had written — and every Claim the bolt writes
carries all three fields. **The defect was in a path the tests did not
exercise.**

The fix was to make the distinction explicit rather than to loosen the
constructor. `PersistedClaim` now declares the two fields nullable, the
repository carries the absence through as an explicit `null`, and the
`claims_pending_fields_check` constraint keeps the *submission* guarantee
where it belongs — on a `Pending` Claim.

The audit event was affected by the same change, because it names exactly
three additional fields and the persisted shape might no longer carry them.
It is now built from the **validated** Claim plus the minted id, which is
both type-correct and semantically right: the event records what the member
submitted, not what the row happens to hold.

## A real defect this stage caught: the migration's constraint broke three pre-existing suites

**The full suite failed with 12 failures across three files this bolt does
not touch** — `prisma-report-image-reader.test.ts`,
`prisma-report-listing-reader.test.ts`, and
`prisma-report-interactions.test.ts`.

The cause was **this bolt's own migration**. The `claims_pending_fields_check`
constraint requires a `Pending` Claim to carry `reason`,
`identifying_details`, `date_lost`, and `submitted_at`. Bolt 008 and bolt 009
created the `claims` table and wrote bare `Pending` Claims into it — those
fixtures were legal when they were written, and the new constraint made them
illegal.

The tempting fix was to weaken the constraint. **That was rejected.** The
constraint is correct: it is what makes "a `Pending` Claim carries all three
fields" a fact about the *database* rather than a fact about one call site.
The fixtures were stale, so **the fixtures were updated** — each now supplies
the three submission fields and `submitted_at` for a `Pending` Claim, and
supplies a rejection reason for a `Rejected` one (a constraint bolt 008
already carried).

The measurement that settled it:

| Configuration | Result |
|---|---|
| Baseline (bolt 13 stashed entirely) | 1,806 passed, **0 failed** |
| Bolt 13's implementation, no new suites | 1,813 passed, **0 failed** |
| Plus the constraint suite | 1,822 passed, **0 failed** |
| Plus the adapter suite | 1,834 passed, **12 failed** in three pre-existing files |
| After updating the three stale fixtures | 2,166 passed, **0 failed** |

> **A constraint that lands late is a constraint that breaks other bolts.**
> Bolt 008 created the `claims` table empty; bolt 013 is the first bolt to
> **write** a Claim, so it is the bolt that owns the table's submission-side
> constraints — and therefore the bolt that paid for adding them. This is
> recorded as an owner item, because the next bolt to touch this table will
> meet the same constraint and the same obligation.

## A flaky failure that was not this bolt's

One full-suite run reported `expected 249 to be greater than or equal to 250`
in `reset-deactivation-acceptance.test.ts` — a **1 millisecond** timing
assertion in bolt 005. The file was re-run in isolation and passed all 50 of
its tests, and the following full runs passed. It is a **timing flake in an
earlier bolt's test**, not a regression from this one, and it is recorded
here only so the next reader does not mistake it for one.

## Owner Items

1. **The `CHECK` constraints are invisible to Prisma.** They live only in the
   migration SQL, because Prisma's schema language cannot express them. A
   `prisma migrate diff` against a schema that has drifted from the
   migrations would **not** flag the constraints' absence. The
   `claim-submission-constraint.test.ts` suite fails if a constraint is
   missing or names the wrong bounds — but the protection is a test, not the
   migration tooling.

2. **The `Pending` Claim's required fields are now a database fact, and any
   future write path must honour them.** A path that writes a `Pending` Claim
   without the three submission fields and `submitted_at` will be refused by
   the database. Bolt 016's claim-decision paths write *decided* Claims, so
   they are unaffected — but any new path that creates a `Pending` Claim must
   supply them.

3. **The blanket-delete race is still latent in the existing suites.** This
   bolt's two new database suites delete **only the rows they created**, by
   id. The pre-existing suites in `src/infrastructure/listings/` still use
   blanket deletes, and the same latent race is available to them. This was
   already recorded as an owner item in bolt 011's test report and remains
   outstanding.

4. **`prisma-claim-repository.ts` is at 95.23% branch coverage.** The
   uncovered branch is the `error !== null` half of `isUniqueViolation`'s
   first condition. It is defensive — Prisma never raises `null` — so the
   suite exercises the three reachable cases instead of manufacturing a
   `null`. The bolt's own files are otherwise at 100% on every metric.

5. **The claim visibility projection is not yet exercised by this bolt.** The
   criterion *"submission does not make the finder able to see the claim's
   reason or identifying details"* is proven from the **submission** side by
   the route suite — the 201 response's key set is asserted exactly, and
   neither private field appears. The **read** side of the split lives in
   `claim-projection.ts`, which bolt 013 wrote but whose own suite belongs to
   the bolt that renders claims to the finder (bolt 014's web threads and
   bolt 016's decisions). The projection is at 96.15% statements, and the
   gap is that read path, not the submission path.

6. **The database's time zone must be set to UTC explicitly by the
   deployment.** This remains outstanding from bolt 007 and still constrains
   every timestamp comparison the Claim lifecycle will make. The
   `date_lost` bound is evaluated against `CURRENT_DATE`, so a database whose
   clock is not UTC may disagree with the domain's injected clock by a day.
