---
id: 011-lost-status-model
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 002-recovery-response-status-model
  - 007-responder-withdraws-response
created: 2026-10-23T13:10:00Z
started: 2026-10-29T12:00:00Z
completed: 2026-10-29T17:30:00.000Z
current_stage: test
stages_completed:
  - implement
  - test

requires_bolts:
  - 001-audit-core
  - 007-reporting-core
enables_bolts:
  - 015-lost-response-submit
  - 017-lost-lifecycle-determination
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 011-lost-status-model

## Overview

The eight-status Lost-side state machine, defined before anything transitions it.

## Objective

Establish the Recovery Response status set, forbid `Standby` from ever being
persisted, and define responder withdrawal.

## Stories Included

- **002-recovery-response-status-model**: the canonical 8 statuses, `Standby` never stored (Must)
- **007-responder-withdraws-response**: withdrawal only while `Submitted` and unselected (Must)

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
- **001-audit-core** (required): every transition is audited
- **007-reporting-core** (required): responses attach to Lost reports

### Enables
- 015-lost-response-submit
- 017-lost-lifecycle-determination

## Success Criteria

- [x] Status is constrained to the eight persisted values by schema, not only by code
- [x] Writing `Standby` is rejected at the database level
- [x] A sibling displays `Submitted — Standby` while its stored status stays `Submitted`
- [x] `Match Confirmed` is treated as non-terminal everywhere it is evaluated
- [x] An illegal transition throws rather than partially applying
- [x] Withdrawal is refused once a response is selected or past `Submitted`
- [x] Deactivating a responder leaves their existing responses intact

## Notes

This bolt precedes response submission deliberately. The status machine is the
most intricate part of FindBack, and building it first means the submit,
selection, determination, and closeout bolts are constrained by it rather than
each inventing a transition.

### The vocabulary had four copies; it now has one

**The Recovery Response status set was written down four times**, and the
copies had already drifted:

| Where it was written down | What it was |
|---|---|
| `src/domain/audit/lost-side-events.ts` | array, type, and predicate |
| `src/domain/listings/report-interaction-records.ts` | a second type union |
| `src/infrastructure/listings/prisma-report-interaction-resolver.ts` | a raw SQL `IN (...)` list |
| `src/infrastructure/listings/prisma-report-interaction-reader.ts` | a Prisma `where: { status: { in: [...] } }` |
| the migration's `CHECK` constraint | the eight literals, in SQL |

All five now derive from **`src/domain/recovery/recovery-response-status.ts`**,
which is the single implementation point for FR-41's vocabulary. The two
infrastructure copies now import the same constant the domain uses, so a
status added to the model reaches the query that filters on it without anyone
editing a second list.

### A wrong fact was propagating into a test

`report-interaction-records.ts` described `Match Confirmed` as "terminal for
this purpose," and `report-lifecycle-decisions.test.ts` asserted
`isNonTerminalRecoveryResponseStatus('Match Confirmed') === false`. **FR-41
says `Match Confirmed` is non-terminal** — it is the single most consequential
fact in the Lost-side state machine, because the report stays
`Verification Pending` until an administrator confirms the physical hand-off.

The *behaviour* was correct (a withdrawal is blocked by the separate
`hasMatchConfirmed` fact, so no matched response ever reaches the resolve
step) but the *name* was a second, wrong answer to "which statuses are
non-terminal?". The constant and predicate were therefore **renamed for what
they actually do** — `WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES` and
`isResolvedByReportWithdrawal` — and the doc comment now states the
distinction explicitly. The canonical non-terminal set correctly contains
`Match Confirmed`, and a test now asserts both facts side by side.

The rename was carried through **every layer that spoke the old name** — the
type, the port method, the field, and the doc comments — because a
half-renamed vocabulary is worse than either: a reader would meet
`WithdrawalResolvedRecoveryResponse` in the domain and
"non-terminal" in the prose above it, and reasonably wonder which one was
wrong.

### The constraint already existed; it was unproven

The `recovery_responses_status_check` constraint was added by bolt 008's
migration and already enumerated exactly the eight canonical statuses, so the
criterion "writing `Standby` is rejected at the database level" was already
*satisfied*. It was **unproven**, which is a different thing — and the next
migration to touch that table could have relaxed it with no test failing.

`recovery-response-status-constraint.test.ts` now reads the constraint's own
text out of `pg_constraint` and compares it against the domain's list, so the
migration and the domain cannot drift apart unnoticed; and it attempts real
writes, proving the database refuses `Standby`, an unlisted status, a Lost
report status, a Claim status, and a differently-cased one.

### Prisma cannot express `CHECK` constraints

The constraint lives **only in the migration SQL** — Prisma's schema language
has no way to write it. The `model RecoveryResponse` doc comment now says so,
names the constraint and the migration that adds it, and points at both the
domain module and the test that proves it. A reader of `schema.prisma` alone
would otherwise reasonably assume the constraint was enforced by the ORM.

### `Standby` is a display condition, never a stored value

A sibling of the `Selected for Verification` response renders as
`Submitted — Standby` on screen while its **stored status stays `Submitted`**.
`deriveDisplayStatus` and `isStandby` are two forms of one rule — the
derivation calls the predicate, so they cannot disagree about the same
response.

### The transition table is total, and it throws

`RECOVERY_RESPONSE_TRANSITIONS` is a `Record` keyed by every one of the eight
statuses, so an illegal transition is a **lookup that misses** — never "not
yet implemented". `assertRecoveryResponseTransition` **throws**
`IllegalTransitionError` rather than returning `false`, because a caller that
ignored a `false` would proceed to write a transition the rules forbid. The
decision form (`decideRecoveryResponseTransition`) and the throwing form carry
the *same* message, and a test asserts they agree.

### Withdrawal is the responder's own exit, and it is narrow

Permitted **only** from `Submitted`. `Selected for Verification` is refused as
`AlreadySelected` (the owner's decision is in progress), `Match Confirmed` as
`NotSubmitted` (the outcome is recorded, though the status is non-terminal),
and every terminal status as `Terminal`. The three reasons carry three
different messages, because the responder's remedy differs with them.

### Deactivation preserves responses — structurally, and now provably

`AccountDeactivationService` holds only an `AccountRepository` and a
`SessionRepository`, so it has no repository through which it *could* reach a
Recovery Response. That is the strongest form of the guarantee — but
structural arguments decay silently, so the criterion is now also proved
against the live database: the response row survives, its status is untouched,
it is not silently turned into `Withdrawn`, and the report's own status does
not move. The database backs this up independently —
`recovery_responses_responder_id_fkey` is **`ON DELETE RESTRICT`**, so
deleting a responder's account is refused by the database while they still
hold responses, and a test asserts that rule so a future migration cannot
quietly relax it to `CASCADE`.

### A cleanup race this bolt hit — and fixed in its own suites

The two new database suites initially cleaned up with blanket deletes
(`DELETE FROM "reports"`, `DELETE FROM "recovery_responses"`). Each suite
passed alone, but the **full suite failed with 60–72 failures across eight
unrelated files** — another worker's reporter account was deleted while that
worker was mid-insert, producing a foreign-key violation in a suite with no
connection to this one. The failing set changed between runs, which is the
signature of a race rather than a logic error.

The diagnosis was by measurement, not assumption: with the bolt stashed the
suite was green at 1,710 tests; with only the domain changes it was green at
1,777; the failure appeared only once both blanket-deleting suites ran. The
fix is to **delete only the rows a suite created, by id**. After that the
suite passed three consecutive times at 1,796 tests.

**Six existing suites still delete the whole table** — see the test report's
owner items. The latent race is still there.