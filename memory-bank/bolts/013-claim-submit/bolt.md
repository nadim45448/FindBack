---
id: 013-claim-submit
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 001-submit-a-claim
created: 2026-10-23T13:11:00Z
started: 2026-10-29T14:00:00Z
completed: 2026-10-29T19:30:00Z
current_stage: test
stages_completed:
  - implement
  - test

requires_bolts:
  - 001-audit-core
  - 004-identity-core
  - 006-reporting-visibility
  - 007-reporting-core
enables_bolts:
  - 014-web-threads
  - 016-claim-decisions
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 013-claim-submit

## Overview

The Found-side workflow begins: a member claims a Found report as theirs.

## Objective

Deliver Claim submission with its required fields, its uniqueness rule, and the
notification trigger to the finder.

## Stories Included

- **001-submit-a-claim**: reason, identifying details, date lost; one Pending claim per item per member (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [x] **2. design**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [x] **3. implement**: ✅ complete → source
- [x] **4. test**: ✅ complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): submission is audited
- **004-identity-core** (required): the claimant is the actor
- **006-reporting-visibility** (required): claims must not unlock claim-reason visibility
- **007-reporting-core** (required): claims attach to Found reports

### Enables
- 014-web-threads
- 016-claim-decisions

## Success Criteria

- [x] A claim requires reason, identifying details, and date lost
- [x] `date lost` is at most 365 days old and not in the future
- [x] A member cannot claim their own report; the action returns 403
- [x] One Pending claim per item per member
- [x] A `Pending` account cannot submit a claim
- [x] The claim is created `Pending` and the report becomes `Claim Requested`
- [x] Submission does not make the finder able to see the claim's reason or identifying details

## Notes

The last criterion is the subtle one. Submitting a Claim must not widen the
finder's visibility — the whole point of the projection is that visibility is
determined by relationship, not by who recently did something.

### A submission is not every claim row

The three Sensitive Fields are **required at submission**, but a Claim row
can also be written by a **lifecycle path** — a withdrawal's auto-rejection,
say — that carries none of them. The first implementation of this bolt had
one shape for a Claim and it was the submission shape, so reading back a
decided Claim **threw**: the repository rebuilt the absent reason through
`createClaimReason('')` and the constructor refuses a short string.

`PersistedClaim` now states the absence explicitly — `reason` and
`identifyingDetails` are nullable **on the persisted shape only**. The
`ValidatedClaim` the validator produces keeps them non-nullable, and the
`claims_pending_fields_check` constraint requires all three on a `Pending`
Claim. The split is the fix: a submitted Claim carries everything, a
decided Claim carries what it happened to have, and neither is fabricated.

The audit event is built from the **validated** Claim plus the minted id,
because the event describes what was *submitted* — not what the row happens
to hold.

### The gate is a whitelist, because a gate that permits by default fails open

The submission gate was written as a list of refusals, so anything it did
not name was permitted — including a report status the bolt had never seen
and a `null` status from a report whose status could not be read. It is now
a **whitelist**: only `Open` and `Claim Requested` accept a claim, and every
other status is refused with `ReportNotOpenForClaims`. The suite asserts the
whitelist as a property across all six canonical report statuses.

### The uniqueness constraint is the rule; the application check is the explanation

The constraint is a **partial unique index** over `(report_id, claimant_id)`
`WHERE "status" = 'Pending'`. The partiality is what makes a second claim
possible once the first is decided — a member whose claim was rejected may
claim again. The application's check reads first and writes second, so two
racing requests could both pass it; the constraint cannot race.

The adapter suite proves the constraint's own refusal is translated into a
**business** outcome — the driver's `P2002` becomes a
`DuplicatePendingClaimError` carrying the member's own message, so the
route's 409 is reached rather than a 500 — and that a **foreign-key failure
is not translated**, because a defect must not be dressed up as *"you
already have a claim pending"*.

### The migration's constraint broke three pre-existing suites, and the fixtures were wrong

The `claims_pending_fields_check` constraint requires a `Pending` Claim to
carry the three submission fields and `submitted_at`. Bolt 008 and bolt 009
created the `claims` table and wrote bare `Pending` Claims into it — legal
when they were written, illegal under the new constraint. The tempting fix
was to weaken the constraint; the fixtures were stale, so **the fixtures were
updated** and the constraint was kept.

A constraint that lands late is a constraint that breaks other bolts. Any
future path that creates a `Pending` Claim must now supply all four fields.

### Verification

`npm run verify` — typecheck, lint, **123 files / 2,166 tests**, and build.
Global coverage **93.19% statements / 87.79% branches / 94.25% functions /
93.25% lines**; the bolt's own modules are at 100% on every metric except
`prisma-claim-repository.ts` (95.23% branches, one unreachable defensive
condition). Full detail in `ddd-03-test-report.md`.