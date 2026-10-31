---
id: 019-returns-closeout
stage: 5
stage_name: test
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
created: 2026-10-30T09:45:00Z
completed: 2026-10-30T09:45:00Z
verification_command: "npx vitest run src/domain/returns/returns-domain.test.ts src/application/listings/return-confirmation-service.test.ts src/infrastructure/listings/prisma-return-confirmation-adapters.test.ts 'src/app/api/admin/reports/[id]/confirm-returned/route.test.ts'"
---

# Bolt 019 — Stage 5: Test Report

## Overview

The verification of the `019-returns-closeout` bolt: the single Confirm Returned
implementation, shared by both recovery directions, with the derived default
receiver, the substitute-receiver path, and the absolute no-receiver guard.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The precondition table | `src/domain/returns/confirm-returned.ts` | 001, 003 | FR-23, FR-45 |
| The default receiver's derivation | `src/domain/returns/default-receiver.ts` | 001 | FR-23 |
| The substitute receiver | `src/domain/returns/substitute-receiver.ts` | 002 | FR-24 |
| The confirmation's decision | `src/domain/returns/confirm-returned.ts` | 001, 002, 003 | FR-23, FR-24, FR-25 |
| The audit event's builder | `src/domain/returns/returned-confirmation-events.ts` | 001, 002 | FR-31, FR-48 |
| The confirmation use case | `src/application/listings/return-confirmation-service.ts` | 001, 002, 003 | FR-23, FR-24, FR-25 |
| The ports | `ports/return-subject-reader.ts`, `ports/return-confirmation-repository.ts` | 001, 002, 003 | FR-23, FR-24, FR-25 |
| The persistence | `prisma-return-subject-reader.ts`, `prisma-return-confirmation-repository.ts` | 001, 002, 003 | FR-23, FR-24, FR-25 |
| The transport | `src/app/api/admin/reports/[id]/confirm-returned/` | 001, 002, 003 | FR-23, FR-24, FR-25 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## The module the standards reserved and the codebase did not have

`memory-bank/standards/system-architecture.md` § Module map names a directory
that did not exist until this bolt:

```
returns/  Returned confirmation, receiver substitution FR-23..FR-25
```

**Unit 005's brief is explicit about what that directory must contain.** *"Both
directions converge here. There must be exactly **one** Confirm Returned
implementation, not one per side — otherwise the receiver and substitute rules
drift apart."*

**So the "one implementation, not one per direction" property is structural
here rather than conventional.** There is no `found-returns/` and no
`lost-returns/` for the two to drift apart *into*. There is one
`src/domain/returns/`, one `ReturnConfirmationService`, one adapter, and one
route — and the report's *type* is an **input** to the decision, not a branch
point in the call graph.

**The proof is in the suite's shape.** The service suite has no "Found half" and
no "Lost half" — it drives the *same* service with a Found report and with a
Lost one, and asserts that the same code path serves both. A suite split into
two near-identical halves would prove that two implementations exist, which is
exactly what the story forbids.

## The precondition table is keyed by report type, and total over the two

The two directions do not share a precondition:

| Report | Status it must be in | Requirement |
|---|---|---|
| `Found` | `Claim Approved` | FR-23 |
| `Lost` | `Verification Pending` | FR-45 |

**A single list of acceptable statuses would let a Found report be confirmed
from the Lost side's precondition** — a report state that cannot exist for it.
So the table is keyed by type, and a type outside it is **refused rather than
defaulted**: `requiredPreconditionStatus('Mislaid')` throws, because a caller
that invented a type would be deciding about a report that cannot exist.

**The adapter reads the table rather than restating it.** The Prisma
repository's conditional `UPDATE` names `status = <the status this direction
requires>`, and it *imports* `requiredPreconditionStatus` from the domain
rather than writing the two statuses down a second time. A status added on one
side is enforced on the other without a second edit — and the suite proves it,
by writing a `Found` report into the Lost side's precondition and observing
that the write lands nothing.

## The default receiver is derived, never chosen

The receiver table is the same shape as the precondition table:

| Report | Default receiver |
|---|---|
| `Found` | the claimant on the **approved** Claim |
| `Lost` | the Lost-report owner (the report's `reporter_id`) |

**Three things make the derivation safe, and each is asserted.**

1. **The Found side's receiver is the claimant, not the finder.** The suite
   asserts the derived account id is the claimant's *and* that it is not the
   reporter's. Story 001 says it outright: *"Then it is the approved claimant
   and not the finder."*
2. **The approved claimant is resolved in the query, not in TypeScript.** The
   reader filters the `claims` relation on `status = 'Approved'` in the `WHERE`
   clause, so a report whose only Claim is `Pending` reads as *no approved
   claimant* — which is the truth. **The suite proves this** by putting a
   pending Claim on a Found report and observing `approvedClaimantId === null`.
3. **A Found report with no approved Claim cannot be confirmed at all.** Not
   even with a substitute — because the *authorization* of a substitution is the
   default receiver's consent, and without the default receiver there is nobody
   whose consent could be recorded. This is story 001's edge case (*"the
   precondition does not exist"*) and it is asserted in the domain suite, in
   the service suite, and in the route suite.

**The client never names the receiver.** The route's body has exactly one
group — the substitute — and there is **no field** through which a client
could assert who the default receiver is. The route suite asserts the request
handed to the use case has the key set `['actor', 'reportId', 'substitute']`,
and that a body carrying a `defaultReceiverAccountId` is ignored.

## The relationship is a whitelist, and the database holds the same set

FR-24 names exactly five: `Friend`, `Family Member`, `Colleague`,
`Classmate`, `Other`.

**The domain's set is a whitelist, not a list of refusals.** A value outside
it is refused rather than stored — including `'Neighbour'` and the
lower-cased `'family member'`. The suite asserts the *exact* set, so a
relationship added to the type without being added to the runtime list fails
the suite rather than passing silently.

**The database's CHECK constraint holds the same five.** The adapter suite
reads the constraint's definition out of `pg_constraint` and asserts it
contains each of the five values — so a value added on one side without the
other is a *failure*, not a quiet divergence. And the constraint is live: an
insert carrying `'Neighbour'` is rejected by PostgreSQL.

**A substitute is recorded by name, with no account link.** Story 002's edge
case is explicit: *"Substitute is a deactivated account — Recorded by name as
an unnamed party; no account link is created."* The column is free text, and
the suite asserts the substitute's name is *not* resolved against the
accounts table — it is bounded text and nothing more.

## FR-25's guard is absolute, and it is enforced twice

Story 003 says the guard *"must be enforced at the domain boundary, not only in
the form, so that an API caller cannot bypass it."*

**It is enforced in three independent places, and each would hold alone.**

1. **At the domain boundary.** `decideConfirmReturned` refuses with
   `NoDefaultReceiver` before anything is written. The service's refusal
   paths are asserted to write nothing at all — no transaction, no
   confirmation row, no audit event.
2. **At the schema.** `default_receiver_account_id` is `NOT NULL`, so a
   receiverless confirmation is *unrepresentable*. The adapter suite inserts a
   row with no receiver at all and PostgreSQL refuses it. **This is the reason
   the guard is structural rather than procedural** — a path that bypassed the
   domain entirely still cannot write the row.
3. **At the substitute's shape.** The `return_confirmations_receiver_present_check`
   constraint requires either all three substitute fields or none of them, so a
   partial record of a handover nobody authorised is also unrepresentable.

**The refusal is absolute in the sense the story means: there is no path that
records a `Returned` with nobody answerable for it.** A report with no
approved Claim cannot be confirmed; a report in the wrong precondition status
cannot be confirmed; a report that is already terminal cannot be confirmed.

## The race resolves to exactly one commit — and it is a fact, not a rule

The domain's read-and-refuse check is **advisory**. Between the read and the
write, another administrator may confirm the same report, and a check cannot
close that window. **The conditional write is the guarantee.**

**The write is conditional in SQL.** The adapter's `UPDATE` carries the
precondition in its `WHERE` clause:

```ts
where: { id: confirmation.reportId, type: confirmation.reportType, status: precondition }
```

So the second administrator's write matches **no rows**, the adapter returns
`null`, and the service turns that into a conflict. **The unique index
`uq_return_confirmations_report_id` is the second line of defence** against the
same race, and the adapter suite proves both: two concurrent confirmations
leave exactly one confirmation row, and a direct second insert is refused by
PostgreSQL.

**A confirmation that did not happen gets no audit event.** The event is
written *after* the move, inside the same transaction, so a move that landed
nothing is never followed by a record. The service suite asserts this twice —
once for the absence of the event, once for the *absence of the call* — and
the trail is append-only (ADR-6), so an event for a confirmation that did not
happen would be a permanent falsehood.

## The report's move, the confirmation row, and the event are one act

**The sequence is the mechanism**, and the service suite asserts it by
recording the call order rather than by trusting the code:

```text
1.  read the report's return facts   → the type, the status, the owner
2.  decide the confirmation           → permitted | refused
3.  BEGIN
4.    UPDATE reports (conditional)      → the report reaches Returned
5.    INSERT return_confirmations       → who received it
6.    INSERT audit_events (6/7/21/22)   → the confirmation
7.  COMMIT
```

**The report is read *outside* the transaction** — so a refusal costs no
transaction at all — and the report's move and the audit event are written
*inside* it, so they commit together. A report that is `Returned` with no
confirmation row would leave the item marked recovered with nobody answerable
for it, which is the exact state FR-25 exists to prevent.

**The clock is read once.** The confirmation's timestamp is taken once and
carried to the row, the event, and the result — so the client is told the
value the row actually carries.

## The event catalog was not extended

**Events 6, 7, 21, and 22 already existed.** The catalog is frozen, and this
bolt adds **no event and no event number**. The four-way mapping — direction ×
receiver kind — lives in one function, `returnedConfirmationEventType`:

| Report | Receiver | Event |
|---|---|---|
| `Found` | default | 6 `returned.confirmed_default_receiver` |
| `Found` | substitute | 7 `returned.confirmed_substitute_receiver` |
| `Lost` | default | 21 `returned.confirmed_lost_default_receiver` |
| `Lost` | substitute | 22 `returned.confirmed_lost_substitute_receiver` |

**The Found side has no event factory of its own** — the Lost side's
`LostSideEventFactory` predates this bolt and carries events 21 and 22 for the
Lost-side workflow — so the **event *builder* lives in the domain** and the
Found-side events are written through the `AuditWriter` directly from the new
service. That is the same house rule the earlier bolts used: the *decision*
about which event fires lives in one place.

**The payload is the catalog's, exactly.** The sanitizer denies by default — a
field the catalog does not name is *refused*, not dropped — so the payloads
carry one field for a default receiver (`receiver`) and three for a substitute
(`substituteReceiverName`, `authorizationAffirmation`, `relationship`). The
suite asserts the payload's exact key set, and asserts that no Sensitive Field
— `exactPlace`, `identifyingDetails`, `whereFound` — appears in it.

## The client's body names a substitute or nothing at all

**A default-receiver confirmation carries no body fields.** The default
receiver is *derived* from the report, so a body naming one would be asserting
something the domain owns — and there is no field for one.

**A substitute confirmation carries all three of FR-24's fields, together or
not at all.** A body with a name and a relationship but no authorization is a
**malformed request**, not a substitute with a bad authorization — the 400 says
so, and names the missing fields. The suite asserts the message names
`authorizationAffirmation` and `relationship` when they are the missing ones.

**The parser is strict about the group's shape and silent about the group's
values.** The *types* are the parser's business (a name that is not a string
cannot be a name); the *values* are the domain's (a 100-character name, a
relationship outside the five). A parser that made those judgements would put
FR-24's rules in two places.

## The refusals are checked in an order, and the order is asserted

The route refuses in a fixed order — **actor → CSRF → body → use case** — and
the suite asserts the order by making the *earlier* check fail and observing
that the *later* one never runs:

| Refusal | Status | Body |
|---|---|---|
| Not an administrator | 403 | `You do not have access to this.` |
| Invalid CSRF token | 403 | `Your request could not be verified.` |
| Malformed body | 400 | the domain's own message + the field |
| Not an administrator (domain) | 403 | the domain's own message |
| No such report | 404 | the domain's own message |
| State conflict / lost race | 409 | the domain's own message |

**The actor comes first, and the body is never parsed for a caller who failed
the actor or CSRF check.** A validation error for a request that could not be
verified would tell a stranger something about the endpoint.

**The permission and conflict messages are the domain's own.** The shared
helper's generic answer is right for the identity module and wrong here,
because the administrator needs to know *which* rule refused them.

**The response carries no Sensitive Field.** It returns the report's `id`, its
new `status`, and the confirmation's `id` — and the suite asserts the exact
key set `['confirmationId', 'id', 'status']`. The default receiver's account
id is **not** in the response: the administrator's screen refreshes from the
report, and the receiver is not the administrator's to read back from here.

## Verification

### Command

```
npx vitest run \
  src/domain/returns/returns-domain.test.ts \
  src/application/listings/return-confirmation-service.test.ts \
  src/infrastructure/listings/prisma-return-confirmation-adapters.test.ts \
  'src/app/api/admin/reports/[id]/confirm-returned/route.test.ts'
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Domain — `returns-domain.test.ts` | 1 | 65 | ✅ pass |
| Application — `return-confirmation-service.test.ts` | 1 | 36 | ✅ pass |
| Infrastructure — `prisma-return-confirmation-adapters.test.ts` | 1 | 34 | ✅ pass |
| Transport — the confirm-returned route | 1 | 23 | ✅ pass |
| **Total** | **4** | **158** | ✅ **158 pass, 0 fail** |

*(The counts above are the final state, after the three coverage gaps were
closed — the domain suite grew by one test and the adapter suite by one.)*

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `domain/returns/confirm-returned.ts` | 100% | 100% | 100% | 100% |
| `domain/returns/default-receiver.ts` | 100% | 100% | 100% | 100% |
| `domain/returns/substitute-receiver.ts` | 100% | 100% | 100% | 100% |
| `domain/returns/returned-confirmation-events.ts` | 100% | 100% | 100% | 100% |
| `application/listings/return-confirmation-service.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-return-confirmation-repository.ts` | 100% | 100% | 100% | 100% |
| `infrastructure/listings/prisma-return-subject-reader.ts` | 100% | 100% | 100% | 100% |
| **Total** | **100%** | **100%** | **100%** | **100%** |

**The route layer is excluded from coverage by `vitest.config.ts`**
(`src/app/**`), and is verified by its own 23-test suite — the same
arrangement every earlier bolt used.

**The two port files report 0%** because they are interface-only: they
compile to no executable statements, so there is nothing to execute and
nothing to cover.

### The gaps that were closed rather than left

**Three coverage gaps were closed with real tests, not by weakening anything.**

1. **`requiredPreconditionStatus` with an unknown report type.** The refusal
   path was untested; the suite now asserts it throws, because a caller that
   invented a type would be deciding about a report that cannot exist.
2. **The event builder with an unknown report type.** The frozen catalog has
   no event for a third type, so the builder refuses rather than naming an
   event that does not exist.
3. **The service's own decision guard.** The service narrows the decision's
   kind *explicitly* rather than assuming it — a belt-and-braces that is
   **structurally unreachable** through the real domain, because
   `assertConfirmReturnedPermitted` throws on every refusal. An unreachable
   guard is an untested guard, so the service suite **mocks the domain's
   assertion** to return a decision the real domain cannot produce, and
   asserts that the service refuses it and writes nothing. The mock is cleared
   in an `afterEach`, so it cannot leak into any other test.

**The subject reader's unknown-type branch is covered by dropping the
database's own `reports_type_check`** for the duration of one statement, and
restoring it in a `finally` — so a failure part-way through cannot leave the
table unprotected for the rest of the suite. This is the pattern the earlier
bolts' constraint suites established.

## What was verified

### The domain's rules (65 tests)

- The precondition table gives the two directions **different** statuses, and
  the two are asserted to differ — a single list would let a Found report be
  confirmed from the Lost side's precondition.
- A report type outside the table is **refused**, in the precondition lookup
  and in the event builder.
- The default receiver is the approved claimant on a Found report and the
  owner on a Lost one, and the Found-side receiver is asserted **not** to be
  the finder.
- A Found report with no approved Claim has **no** default receiver.
- The relationship set is exactly the PRD's five, and a value outside it is
  refused — including `'Neighbour'` and the lower-cased `'family member'`.
- The substitute's name is trimmed, and 1 and 80 characters are both accepted
  while whitespace-only and 81 characters are both refused.
- An unconfirmed authorization is refused — a `false` affirmation is not an
  affirmation at all.
- The substitute's three fields are validated **together**, so a partial
  substitute cannot be constructed.
- The decision refuses, in order: a non-administrator, a terminal report, a
  report not in its precondition status, and a report with no default
  receiver.
- **Both directions go through the same function** — the suite drives
  `decideConfirmReturned` with a Found report and with a Lost one.
- A report with no approved Claim is refused **even with a substitute**.
- The four events are chosen by direction and receiver kind, and their
  payload key sets are asserted exactly — with no Sensitive Field in any of
  them.

### The use case (36 tests)

- The **call order** is asserted against a recording fake: read → decide →
  transaction → write → event.
- The report is read **outside** the transaction, so a refusal opens none.
- The refusal paths write **nothing** — no transaction, no confirmation row,
  no audit event — for a non-administrator, a missing report, a wrong
  precondition, a terminal report, a report with no approved Claim, and an
  invalid substitute.
- The **Lost-side owner is refused** even though they own the report.
- The clock is read **once**, and the value reaches the row and the event.
- The **lost race** is asserted twice — the conflict, and the absence of the
  audit event — and the event's call is asserted absent, not merely
  unreached.

### The persistence (34 tests, live database)

- The conditional write lands **exactly once** for a Found report and for a
  Lost report, through the same adapter.
- A write against a report no longer in its precondition status **matches no
  row**, and writes **no confirmation row**.
- A Found report in the Lost side's precondition is refused, and a Lost
  report in the Found side's precondition is refused.
- A write whose **type** does not match the report is refused.
- Two concurrent confirmations leave **exactly one** confirmation row.
- The `NOT NULL` on the default receiver refuses a receiverless row.
- The CHECK constraints refuse a partial substitute, a relationship outside
  the five, a whitespace-only name, and an 81-character name.
- The unique index refuses a second confirmation for the same report.
- The `RESTRICT` on the Accounts refuses deleting an administrator who has
  confirmed a return, and an account answerable for a returned item.
- The relationship constraint's **definition is read out of `pg_constraint`**
  and compared against the domain's five.
- The subject reader resolves the approved claimant, reads `null` for a
  report whose only Claim is pending, reads a report of an unknown type as
  absent, and selects **no Sensitive Field** — its key set is asserted
  exactly.

### The transport (23 tests)

- The refusal **order** is asserted: actor before CSRF, CSRF before the body,
  the body before the use case — each by making the earlier check fail and
  observing that the later one never runs.
- The status mapping is asserted: 403 for the actor and the CSRF token, 404
  for a missing report, 409 for a conflict and for the lost race, 400 for a
  malformed body.
- The **response's key set** is asserted exactly — three keys, no Sensitive
  Field, and **no receiver**.
- The actor is taken from the **session**, and a body carrying an
  administrator flag or an actor id is ignored.
- The request handed to the use case is asserted to have exactly the keys
  `['actor', 'reportId', 'substitute']` — so **no receiver id** can travel.

## Success Criteria

The bolt's seven success criteria, each against a named backing test:

| # | Criterion | Where verified |
|---|---|---|
| 1 | Returned is confirmed by an administrator only, never by the member or the Lost-side owner | domain (`NotAdministrator` refusal), service (member refused; Lost-side owner refused), route (403) |
| 2 | The default receiver is derived: approved claimant for Found, report owner for Lost | domain (`deriveDefaultReceiver`), adapter (`readReturnSubject` — the approved Claim resolved in the query) |
| 3 | A substitute records name, the default receiver's authorization, and a relationship from the closed set | domain (`createSubstituteReceiver` — all three, together), service (the written row), adapter (the row's three columns) |
| 4 | Authorization and relationship are not recorded when the substitute is the default receiver | domain (`substitute: null` on the permitted decision), service (the row's null columns), adapter (the row's null columns) |
| 5 | Confirmation without a receiver is refused at the domain boundary, not only in the form | domain (`NoDefaultReceiver`), service (writes nothing), adapter (the `NOT NULL` makes the row unrepresentable) |
| 6 | Concurrent confirmations resolve to exactly one commit | adapter (two concurrent writes → one row; the unique index refuses a second insert), service (the lost race → conflict, no event) |
| 7 | There is one implementation of this transition, not one per direction | the whole suite: one domain module, one service, one adapter, one route — and the suites drive both directions through the same functions |

## Owner Items

1. **`src/domain/listings/report-relationship.ts` erases `isReportType`'s
   value.** The file does `export type { ReportType, REPORT_TYPES, isReportType }
   from './report-type';`, which keeps the function as a *type* but not as a
   callable. The Prisma subject reader therefore imports the value from
   `@/domain/listings/report-type` directly, with a comment explaining why.
   **The existing file's export shape was deliberately left alone** so that
   its dependents keep working — but the barrel cannot be the home of the
   value while it says `export type`, and a future edit should fix it.
2. **The `ReturnConfirmation` model's `authorizationAffirmation` column holds
   a fixed string.** The row records *that* the default receiver's
   authorization was confirmed; it does not record the wording, because the
   domain's affirmation is a boolean and FindBack performs no identity
   verification. The event's payload carries the same fixed string. A future
   bolt that wants the administrator's own wording would need a different
   column.
3. **The Lost-side closeout is a separate bolt.** Story 004
   (`complete-lost-verification-closeout`) — which resolves every Recovery
   Response and locks every thread in the same transaction — belongs to bolt
   `020`, and is **not** delivered here. This bolt confirms the `Returned`
   transition and records the receiver; it does not resolve the Lost side's
   responses. The unit's rule 3 is therefore **not yet satisfied**, and it is
   recorded as such rather than left implicit.
4. **The administrator's screen is not built.** The administrator may confirm
   a return through this route, but the surface that lists the reports
   awaiting a return belongs to bolt `021` (Unit 007).
5. **The blast radius was not measured.** The full suite was not run, by
   owner direction. The bolt's own four suites are green, and the typecheck
   and lint are clean.
