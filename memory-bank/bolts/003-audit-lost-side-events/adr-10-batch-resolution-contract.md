---
bolt: 003-audit-lost-side-events
created: 2026-10-27T06:05:52Z
status: accepted
accepted: 2026-10-27
superseded_by: null
---

# ADR-10: Resolve the batch child-response set inside the transaction that performs the resolution, and treat the cross-module handoff as an explicit contract

## Context

FR-48 events 26 and 27 are **batch** events. They record, in one row, that
many Recovery Responses reached a terminal status together because their parent
Lost report reached `Returned` or `Closed`.

Event 26 records "the list of all non-selected non-terminal child response IDs
transitioning to `Resolved — Report Returned`", and event 27 records "the list
of child response IDs transitioning to `Resolved — Report Closed`". Event 30
is the exception: the matched selected response's `Completed — Report Returned`
is recorded individually.

The story's acceptance criterion is correspondingly demanding:

> Given a Lost report's trail, When it is assembled, Then it covers response
> submission, provisional selection, determination, closeout or closure, **and
> the reason for each terminal resolution**

The batch event **is** the reason for each terminal resolution. If its list is
incomplete, the responses it does not name have no recorded reason for
resolving, and the criterion fails for exactly those responses.

### The problem: the set is knowable only by the module that performs the update

The `recovery_responses` table belongs to unit 004's `recovery/` module. The
audit module — which owns the event catalog per ADR-9 — does not write that
table and must not. So the audit module cannot compute the set of responses
that were resolved. Only the module that performed the batch update knows it.

That creates a handoff: one module performs a multi-row status change and must
tell another module which rows it changed, so the second can record it.

### Four ways to carry the set across the boundary

1. **The firing module re-queries the set after the update**, inside the same
   transaction.
2. **The firing module re-queries the set after the transaction commits.**
3. **The firing module computes the set itself** and passes it to the audit
   module as a list.
4. **The firing module obtains the set from the update statement itself** —
   `UPDATE … RETURNING` — and passes that.

### The forces in play

| Force | Direction |
|---|---|
| Story `002`: the trail covers "the reason for **each** terminal resolution" | The list must be complete, or the criterion fails for the missing responses |
| FR-41: "All transitions are recorded in the audit trail with actor, target Recovery Response, source/target status, and timestamp" | The **source** status is required too — not just which responses, but what they were |
| FR-48 event 25: the prior selected response's ID **with its status at close time** | The before-state is part of the record, so it must be captured atomically with the after-state |
| `data-stack.md`: "Every multi-row lifecycle transition runs in **one transaction**" | The update and the audit insert are atomic |
| `data-stack.md`: "Lock the parent report row before deciding" | The set is decided under a lock, inside the transaction |
| ADR-6: the trail is append-only; an event cannot be corrected after the fact | A wrong list is permanent — there is no update path to fix it |
| `system-architecture.md`: "audit/ … FR-31, FR-32, FR-48" but "recovery/ … FR-40..FR-48" — resolved by ADR-9 | The catalog is in `audit/`; the update is in `recovery/` |
| `system-architecture.md`: the two recovery state machines must never share a transition function or an aggregate | The audit module must not evaluate FR-41's status machine |
| FR-45: "Confirm Returned transitions the Lost report, the selected Recovery Response, and every other non-terminal Recovery Response" — atomically | The list is the record of an atomic operation |
| The $0 ceiling | No queue, no worker, no reconciliation job |

### The one thing that makes this a genuine trade-off

Option 4 — `UPDATE … RETURNING` — is the strongest mechanism available for
obtaining the set, and the technical design chose it. But choosing it does not
by itself make the **guarantee** enforceable.

The guarantee the trail needs is: *the event names exactly the responses the
transaction resolved.* With option 4, the list is a product of the write, so
it cannot diverge from the write **as long as the list that is passed is the
list that was returned**. But the passing is a handoff across a module
boundary, and the receiving module cannot verify it. A caller that passed a
filtered or stale list would produce a **well-formed event with a wrong list** —
and because ADR-6 makes the trail append-only, that error is permanent.

This is the honest limit of the boundary, and it is what this ADR settles.

## Decision

**The batch child-response set is obtained from the batch update's own
`RETURNING` clause, inside the transaction that performs the resolution. The
set is passed to the audit module as data. The handoff is an explicit,
documented contract, and the guarantee it carries is stated as a contract
rather than claimed as an enforced invariant.**

Concretely:

1. **The set comes from the write.** The batch update uses
   `UPDATE … RETURNING id, previous_status`, and the returned rows are the
   set. The audit module never re-queries to discover what changed.

2. **It happens inside the transaction.** The `RETURNING` clause, the audit
   inserts for events 26 (and 30), and the parent report's status change are
   one transaction. A rollback discards all of them together.

3. **The source status is captured in the same statement.** `RETURNING` yields
   each row's `previous_status` alongside its id, so the before-state is
   captured atomically with the after-state. FR-41's "source/target status"
   and FR-48 event 25's "status at close time" are satisfied by the same
   statement that performs the change.

4. **The audit module receives the set as data and records it verbatim.** It
   validates the *shape* — non-empty, every entry has an id and a prior
   status — and it does not attempt to verify that the set matches the
   transaction. It cannot, and pretending otherwise would be a false claim.

5. **The handoff is a written contract with named obligations.** The firing
   module owes: *the set passed is the set the update returned, unmodified.*
   The audit module owes: *the set is recorded verbatim, with each response's
   prior status, and an empty or malformed set is refused.* Neither side can
   enforce the other's half.

6. **The contract is stated at the interface, not in prose.** The cross-module
   contract is a named section of the technical design, and Stage 5 asserts
   both halves of it: that the event's list equals the set of responses whose
   status changed in that transaction, and that a malformed set is refused.

7. **The alternative placement is recorded and rejected, not quietly
   dropped.** Moving the batch resolution into a shared application-layer use
   case — one that owns the update, the `RETURNING`, and the event together —
   would make the guarantee **enforceable** rather than contractual, because
   one module would hold both the write and the record. It is rejected for the
   reasons below, and the rejection is recorded here so a future reader can
   revisit it if the forces change.

## Rationale

### Why the set comes from the `UPDATE` and not from a re-query

**A re-query inside the transaction (option 1) is correct but redundant.** It
would see the same rows, because the transaction's own writes are visible to
it. But it is a **second statement that must agree with the first** — it
re-states the predicate of the `UPDATE` in a different form. If the `UPDATE`'s
predicate is ever changed — a new non-terminal status added, a condition added
— and the re-query is not changed with it, the two disagree. The event would
then name a different set than the one that was resolved. The divergence
would be silent and would not fail any test that did not specifically check it.

**`RETURNING` makes the list a product of the write.** There is no second
statement to keep in agreement, because there is no second statement. The
predicate lives in exactly one place, and the list is what that predicate
selected. This is the strongest form of the guarantee available inside the
database, and it costs one statement instead of two.

**A re-query after the commit (option 2) is wrong, not merely weaker.** After
the commit, the transaction's isolation no longer protects the read. A
response submitted concurrently, or one whose status changed between the
commit and the re-query, could appear in the re-queried set without having been
resolved by this transaction — or a resolved response could have moved on. The
event would then name a response it did not resolve, or omit one it did. The
error depends on timing, so no test would catch it. **This option is rejected
outright.**

**A caller-computed list (option 3) moves the error to every firing module.**
The caller would have to compute the set correctly — which is the very thing
the audit module is supposed to guarantee. Two units fire event 27, so there
would be two places to get it wrong, and the guarantee would be "every firing
module remembered to pass the right list". A convention is not a guarantee.

### Why the guarantee is stated as a contract rather than claimed as an invariant

This is the part of the decision that deserves the most scrutiny, because the
temptation is to claim a guarantee the architecture cannot deliver.

**The audit module cannot verify the set.** By ADR-9, the `recovery_responses`
table belongs to `recovery/`, and the audit module must not write it or import
from `recovery/`. So when the set arrives, the audit module has no way to ask
"is this the set that was just resolved?" — the answer lives in the caller's
transaction, which the audit module has no access to.

**The alternative would move a table into the wrong module.** The way to make
the guarantee enforceable is for one module to own the update *and* the event:
a shared application-layer use case that performs the batch update, takes the
`RETURNING` rows, and writes the audit event — all inside a transaction it
controls. Nothing could then be passed wrongly, because nothing is passed.

**That alternative is rejected, for three reasons.**

1. **It puts the `recovery_responses` write in the audit module's application
   layer.** The audit module's job is the trail. Giving it a use case that
   updates Recovery Response rows makes it a participant in FR-41's state
   machine — and `system-architecture.md` names that as "the single largest
   correctness risk in the system", because the two recovery flows must never
   share a transition function or an aggregate. An audit use case that performs
   a Recovery Response transition is a transition function adjacent to the
   audit module, and the next use case would be a second one.

2. **It inverts the dependency ADR-9 just settled.** The catalog is in `audit/`
   precisely so that the firing modules depend on it and it depends on none of
   them. A shared batch use case would have to live somewhere both could reach
   — and whichever module hosted it would become the owner of FR-41's status
   change, which is unit 004's by assignment.

3. **It would not generalise.** The batch pattern is not the only place a set
   crosses a module boundary. If the guarantee cannot be made here without
   moving a table, the same problem will recur wherever the audit module
   records something another module computed. A rule that only works for one
   case is not a rule.

**So the guarantee is stated as a contract, and the contract is made
checkable.** A contract is weaker than an invariant, and saying so is more
honest than claiming an invariant the boundary cannot support. What the
decision buys is that the contract is **written down, named, and asserted in
tests** — which is materially better than the unnamed convention it replaces,
and materially better than a false claim of enforceability.

### Why `RETURNING` rather than a second statement inside the transaction

The three reasons compose: it cannot diverge from the write; it captures the
source status in the same statement; and it is one statement rather than two.
The cost is that the caller must use `RETURNING` correctly — but that is a
requirement on one statement in one place, and it is a requirement the
contract already states.

### Why the audit module validates shape and not correspondence

The audit module validates that the set is **well-formed**: non-empty, every
entry carrying a response id and a prior status, and every prior status a
value from FR-41's canonical eight. This is the same kind of validation it
performs for every event — shape, not business truth.

It does not attempt to validate that the set corresponds to what happened. That
check would require reading `recovery_responses`, which the audit module must
not do. Attempting it would also be a race: by the time the check ran, the
rows could have changed again.

**The practical consequence is stated plainly**: a caller that passed a
wrong-but-well-formed set would produce a permanently wrong event. The
mitigation is not a mechanism — it is that the contract is in the interface,
the failing case is tested, and ADR-6's append-only guarantee means the
defect is *detectable* in the trail (a response that resolved with no
recorded reason) rather than invisible.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Re-query the set inside the transaction** (option 1) | Correct — sees the transaction's own writes; no change to the caller's statement | A second statement that must agree with the `UPDATE`'s predicate; if the predicate changes and the query does not, the two diverge silently | `RETURNING` gives the same result from one statement, so the second statement's only contribution is a chance to drift |
| **Re-query the set after the transaction commits** (option 2) | Simple; the caller does not have to thread rows through | **Wrong under concurrency** — the set can differ from what the transaction resolved, depending on timing; untestable | The error is timing-dependent and no test would catch it. Rejected outright |
| **The caller computes the set and passes it** (option 3) | No change to the caller's statement; the caller already knows what it changed | Moves the guarantee to every firing module; two units fire event 27, so two places to get it wrong; the guarantee becomes a convention | The whole point of the audit module is that it guarantees, rather than trusts |
| **Move the batch resolution into a shared application-layer use case** that owns the update, the `RETURNING`, and the event | Makes the guarantee **enforceable** — one module holds both the write and the record, so nothing can be passed wrongly | Puts the `recovery_responses` write in the audit module's application layer, making it a participant in FR-41's state machine — the risk `system-architecture.md` calls the single largest correctness risk in the system; inverts the one-way dependency ADR-9 settles; does not generalise to other set-valued events | Rejected, and recorded here so the trade-off is visible rather than implied |
| **The audit module reads `recovery_responses` to verify the set** | Would make the correspondence checkable at write time | Breaks the module boundary ADR-9 establishes; introduces a race — the rows can change between the transaction and the check; the audit module would be reading a table it must not depend on | It would verify a snapshot, not the transaction, and would still not be a guarantee |
| **Reconcile the set later, in a background job** | Eventual correction of a wrong list | There is no update path — ADR-6 makes the trail append-only, so a correction would be a second event, not a fix; a reconciled event contradicts the first, which is worse than a single wrong one; a cron job on Hobby fires once a day, ±59 min | An append-only trail cannot be corrected in place, and a second contradictory event makes the trail harder to read, not more correct |
| **Store the resolved set by reading the responses' final statuses later** | No handoff at write time | Loses the **source** status, which FR-41 requires; a response that was subsequently changed (impossible while terminal, but the rule must hold) would corrupt the record; the event's meaning becomes time-dependent | The record must state what happened at that moment, not what is true when read |

## Consequences

### Positive

- **The list cannot diverge from the write it describes.** It is a product of
  the `UPDATE`, not a parallel statement that could disagree.
- **The source status is captured atomically** with the after-state, in the
  same statement — satisfying FR-41's "source/target status" and FR-48 event
  25's "status at close time" without a second read.
- **The update, the event, and the report's transition are one transaction.**
  A partial closeout writes nothing, which is the story's own edge case.
- **No background job, no reconciliation, no new table, no new dependency.**
  The $0 ceiling is untouched.
- **The guarantee is stated honestly** — as a contract with named obligations
  — rather than claimed as an invariant the boundary cannot support.
- **The contract is testable.** Stage 5 asserts that the event's list equals
  the set of responses whose status changed in that transaction, and that a
  malformed set is refused.

### Negative

- **The guarantee is contractual, not enforced.** A firing module that passed
  a wrong-but-well-formed set would produce a permanently wrong event. The
  audit module cannot detect this at write time.
- **The firing modules must honour an obligation that is not
  machine-checkable at the boundary.** It is checkable in tests, not in code.
- **A future reader may mistake the contract for an invariant.** This is why
  the decision states it in these terms in the technical design, in the
  interface's own documentation, and here.
- **The rejected alternative is a real capability that is given up.** If the
  guarantee ever matters more than the module boundary — for instance if the
  set's correctness became a compliance requirement rather than a
  reconstructability one — the shared-use-case approach would be the answer,
  and this ADR would need revisiting.

### Risks

| Risk | Mitigation |
|---|---|
| A caller passes a set it did not resolve, producing a permanently wrong event | The obligation is written into the technical design's cross-module contract and the interface's documentation. Stage 5 asserts the equality between the event's list and the rows that actually changed, so a regression in any firing path fails a test. A defect in the trail is detectable: a response that reached a terminal status with no recorded reason stands out in the trail. |
| A future developer changes the `UPDATE`'s predicate and forgets the contract | The contract names the `RETURNING` clause as the mechanism, so the two are the same statement and cannot drift apart. The obligation is about *not modifying* the returned set, not about keeping a second statement in agreement. |
| The audit module grows to read `recovery_responses` to "verify" the set | This ADR states that the audit module must not. The boundary review should catch it: the audit module reading a table it does not own is the symptom. |
| The pattern is copied to a place where it does not hold | The decision is specific to a set that only the updating module can know. Other handoffs — a scalar id, a single status — do not need it. The ADR's scope is the batch. |
| A reconciliation job is added later to "fix" wrong lists | ADR-6 makes the trail append-only; a job could only append a second, contradictory event. This ADR records why that is rejected, so the idea is not re-proposed without its reasons. |

## Related

- **Stories**: `002-lost-side-audit-events` — the "reason for each terminal
  resolution" criterion and the "closeout rolls back partway" edge case
- **Standards**: `memory-bank/standards/data-stack.md` (§ Concurrency rules —
  every multi-row lifecycle transition runs in one transaction; lock the parent
  row before deciding; § Where raw SQL is required),
  `memory-bank/standards/system-architecture.md` (§ Module map — the
  `recovery` / `audit` split; § Architecture style — the two recovery flows
  must not share a transition function, which is why the shared-use-case
  alternative is rejected),
  `memory-bank/standards/coding-standards.md` (§ Error handling — illegal
  transitions are a defect, not a graceful degradation)
- **Previous ADRs**: ADR-6 (append-only enforcement — why a wrong list is
  permanent and why reconciliation is rejected), ADR-9 (the FR-48 catalog's
  home, which establishes the module boundary this handoff crosses)
- **Artifacts**: `memory-bank/bolts/003-audit-lost-side-events/ddd-01-domain-model.md`
  (§ The pairing rules that make events 26/27/30 coherent; § Open items 2 and 3
  — the question this ADR settles),
  `memory-bank/bolts/003-audit-lost-side-events/ddd-02-technical-design.md`
  (§ Decision 3; § The cross-module contract; § Open item 1 — which named this
  as the ADR candidate)
- **Requirements**: FR-48 (events 26, 27, 30 — the batch catalog),
  FR-41 (every transition recorded with source/target status; the canonical
  eight statuses), FR-42 (the Lost report's lifecycle and auto-transitions),
  FR-45 (the atomic Lost-side Returned closeout), FR-21 (administrator close —
  the other path to event 27), FR-11 (reporter withdrawal — the third path to
  event 27)
