---
id: 019-returns-closeout
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 001-confirm-returned-default-receiver
  - 002-confirm-returned-substitute-receiver
  - 003-no-receiver-no-returned-guard
created: 2026-10-23T13:14:00Z
started: 2026-10-30T09:20:00Z
completed: 2026-10-30T09:45:00Z
current_stage: test
stages_completed: [implement, test]

requires_bolts:
  - 001-audit-core
  - 008-reporting-lifecycle
  - 016-claim-decisions
  - 017-lost-lifecycle-determination
enables_bolts:
  - 020-returns-moderation
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 019-returns-closeout

## Overview

The single Confirm Returned implementation, shared by both recovery directions.

## Objective

Deliver Returned confirmation with the default receiver, with a substitute
receiver, and the absolute no-receiver guard — one code path for both directions.

## Stories Included

- **001-confirm-returned-default-receiver**: Found → approved claimant, Lost → report owner (Must)
- **002-confirm-returned-substitute-receiver**: name, default receiver's authorization, relationship (Must)
- **003-no-receiver-no-returned-guard**: no receiver, no Returned (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [~] **1. model**: Skipped by owner direction
- [~] **2. design**: Skipped by owner direction
- [x] **3. implement**: Complete → source
- [x] **4. test**: Complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): confirmations are audited
- **008-reporting-lifecycle** (required): terminal status semantics
- **016-claim-decisions** (required): the approved claim defines the Found-side default receiver
- **017-lost-lifecycle-determination** (required): the Lost-side precondition of `Match Confirmed`

### Enables
- 020-returns-moderation

## Success Criteria

- [x] Returned is confirmed by an administrator only, never by the member or the Lost-side owner
- [x] The default receiver is derived: approved claimant for Found, report owner for Lost
- [x] A substitute records name, the default receiver's authorization, and a relationship from the closed set
- [x] Authorization and relationship are not recorded when the substitute is the default receiver
- [x] Confirmation without a receiver is refused at the domain boundary, not only in the form
- [x] Concurrent confirmations resolve to exactly one commit
- [x] There is one implementation of this transition, not one per direction

## Notes

The guard belongs here rather than in the next bolt because it is a precondition
of the confirmation itself. Folding it in means a Returned row with no receiver is
impossible to construct rather than merely discouraged.

## Outcome

**One Confirm Returned implementation, shared by both recovery directions.**
The bolt delivers the four layers for the transition — the domain's rules in
`src/domain/returns/`, the use case and its two ports in
`src/application/listings/`, the Prisma adapters in
`src/infrastructure/listings/`, and the thin admin route — plus the
`return_confirmations` table and the migration that carries FR-25's guard into
the schema.

**The "one implementation, not one per direction" property is structural, not
conventional.** `memory-bank/standards/system-architecture.md` § Module map
reserves `returns/` for FR-23..FR-25, and that directory did not exist until
this bolt. There is no `found-returns/` and no `lost-returns/` for the two
directions to drift apart *into*. The report's **type is an input** to the
decision, not a branch point in the call graph, and the suites drive both
directions through the *same* functions — a suite split into two near-identical
halves would prove that two implementations exist, which is exactly what the
story forbids.

**The precondition table is keyed by report type and total over the two.**
A Found report requires `Claim Approved` (FR-23); a Lost report requires
`Verification Pending` (FR-45). A single list of acceptable statuses would let
a Found report be confirmed from the Lost side's precondition — a state that
cannot exist for it. A type outside the table is refused rather than
defaulted. **The adapter imports the table rather than restating it**, so the
conditional `UPDATE`'s `WHERE` clause and the domain's rule cannot disagree.

**The default receiver is derived, never chosen.** Found → the claimant on
the *approved* Claim; Lost → the Lost-report owner. The approved claimant is
resolved in the reader's **query**, so a report whose only Claim is `Pending`
reads as having no approved claimant — which is the truth. **A Found report
with no approved Claim cannot be confirmed at all, even with a substitute**,
because the authorization of a substitution is the default receiver's consent
and without the default receiver there is nobody whose consent could be
recorded. The client never names the receiver: the route's body has no field
through which one could be asserted.

**FR-25's guard is enforced three times over, and each would hold alone.** The
domain refuses a receiverless confirmation before anything is written — so an
API caller cannot bypass it. `default_receiver_account_id` is **`NOT NULL`**,
so a receiverless row is *unrepresentable* — the state FR-25 forbids cannot be
written even by a path that bypassed the domain entirely. And the
`return_confirmations_receiver_present_check` constraint requires the
substitute's three fields to be present together or absent together, so a
partial record of a handover nobody authorised is also unrepresentable.

**The concurrency rule is a fact, not a rule.** The domain's read-and-refuse
check is *advisory*; the conditional `UPDATE` is the guarantee. It carries the
precondition in its `WHERE` clause, so the second of two concurrent
administrators' writes matches no rows, the write lands nothing, and the
conflict is the outcome. The unique index `uq_return_confirmations_report_id`
is the second line of defence against the same race. **A confirmation that did
not happen gets no audit event** — the event is written after the move, inside
the same transaction, and the trail is append-only.

**The report's move, the confirmation row, and the audit event are one act.**
The report is read *outside* the transaction, so a refusal costs no
transaction; the move and the event are written *inside* it, so they commit
together. A report that is `Returned` with no confirmation row would leave the
item marked recovered with nobody answerable for it — the exact state FR-25
exists to prevent.

**The event catalog was not extended.** Events 6, 7, 21, and 22 already
existed, and this bolt adds no event and no event number. The four-way
mapping — direction × receiver kind — lives in one function. **The Found side
has no event factory of its own**, so the event *builder* lives in the domain
and the Found-side events are written through the `AuditWriter` directly.

**The relationship is a whitelist, and the database holds the same five.**
The domain refuses a value outside FR-24's set, and the CHECK constraint's
definition is read out of `pg_constraint` and compared against the domain's
own — so a value added on one side without the other is a *failure*, not a
quiet divergence.

## Acceptance Criteria Not Implemented

1. **The Lost-side closeout is not delivered here.** Unit 005's rule 3 — that
   a Lost `Returned` resolves every Recovery Response and locks every thread
   in the same transaction — belongs to story `004`
   (`complete-lost-verification-closeout`) and to bolt `020`. This bolt
   confirms the transition and records the receiver; it does not resolve the
   Lost side's responses. **The unit's rule 3 is therefore not yet
   satisfied**, and it is recorded as such rather than left implicit.
2. **The administrator's screen is not built.** The administrator may confirm
   a return through this route, but the surface that lists the reports
   awaiting a return belongs to Unit 007 and bolt `021`.