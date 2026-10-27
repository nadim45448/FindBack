---
bolt: 003-audit-lost-side-events
created: 2026-10-27T06:05:52Z
status: accepted
accepted: 2026-10-27
superseded_by: null
---

# ADR-11: Validate the determination pair against the report's actual owner, and refuse an event whose maker is not the owner

## Context

FR-48 events 18 and 19 are the PRD's mechanism for keeping **owner-determines /
administrator-records** honest. The PRD is emphatic about the distinction, and
states it in three separate places.

FR-48 event 18:

> **Recovery Response determined Match Confirmed** — `determined_by` (Lost-report
> owner identity), `recorded_by` (acting administrator identity), Lost report
> ID, response ID, verification timestamp. (The acting administrator is recorded
> as the system actor performing the write; the Lost-report owner is recorded as
> the determination-maker.)

FR-43, on the business rule:

> The Lost-report owner physically inspects the candidate item and determines
> whether the candidate item is theirs; the acting administrator records the
> owner's determination in the system. **The administrator does not independently
> decide whether the item belongs to the owner.**

FR-43, on the worked example:

> **Maya** physically confirms that the wallet is hers. **Riley** records Maya's
> Match Confirmed determination in FindBack.

And FR-43, on what the audit must capture:

> The Administrator is recorded as the system actor performing the write; the
> Owner is recorded as the determination-maker (FR-48 events 18 and 19).

### Why the distinction needs enforcement rather than documentation

A single actor field would destroy the distinction — the story says so
directly. But two fields alone are not enough either, because **two fields
that hold arbitrary values are not a mechanism**. The question this ADR settles
is: what makes the pair *true*, rather than merely present?

Three states are distinguishable, and only the first is honest:

| State | `determined_by` | `recorded_by` | What it means |
|---|---|---|---|
| **Correct** | The Lost report's owner | The acting administrator | The PRD's model, recorded |
| **Malformed** | Present | Present, but the same person twice | One person both determined and recorded — which collapses the distinction the pair exists to preserve |
| **False** | Someone who is not the owner | The acting administrator | The administrator — or anyone else — determined the match, which FR-43 forbids outright |

The **False** state is the serious one. It is not a malformed record; it is a
well-formed record of something the PRD says cannot happen. The administrator
independently decided the item belongs to the owner, and the trail records it
as though the owner had determined it. Nothing else in the system would
surface it: the administrator is a legitimate actor, the timestamps are
correct, the event number is right. **The trail would be confidently wrong**,
and it would be wrong in exactly the way the PRD was most careful to prevent.

### The forces in play

| Force | Direction |
|---|---|
| FR-43: "The administrator does **not** independently decide that the item belongs to the owner" | The determination's maker must be the owner |
| FR-43: the determination is made **physically**, by the owner, and **recorded** by the administrator | Two different humans, in two different roles, at two different moments |
| Story `002`: "Events 18/19 are the PRD's mechanism for keeping owner-determines / administrator-records honest. **A single actor field would destroy that distinction**" | The pair must be structurally present, not optional |
| FR-48 events 18/19: "The acting administrator is recorded as the system actor performing the write" | The administrator is the *actor of the write*, not the maker of the determination |
| `system-architecture.md` § Authorization model: "Roles are derived, never client-asserted" | The owner id must come from server-side state, never from the request |
| `system-architecture.md` § Authorization model: `administrator` is "a flag on an Account" | An administrator may also be a member — the two are not disjoint roles |
| ADR-9: the audit module validates the **shape** of a record and never evaluates a workflow's legality | The check must not become FR-43's business rule re-implemented in `audit/` |
| ADR-6: the trail is append-only; no update or delete path | A wrongly-recorded determination is permanent |
| `coding-standards.md`: "Illegal state transitions are a defect, not a graceful degradation" | A false determination must fail loudly, not be recorded |
| The $0 ceiling | No external identity-verification service, no additional check infrastructure |

### The subtlety: "the owner" and "the administrator" are not disjoint roles

`administrator` is a **flag on an Account**, and an administrator is also an
Active Member. So a single person can be both an administrator and a member.
Three consequences follow, and each needs a decision:

1. **"Distinct values" cannot mean "different user ids".** A Lost report owned
   by an administrator, verified by that same administrator acting in their
   administrator capacity, would have the same id on both sides. FR-43 does not
   forbid this — it forbids the *administrator capacity* from being the
   determination-maker. The rule is about **roles**, not about identity.

2. **The check is against the report's owner, not against "some member".** If
   the check were merely "two different people", an administrator could record
   a determination attributed to any member, and the event would pass. The
   check must be *the report's actual owner*.

3. **The owner's identity must come from the report, not from the
   request.** If the caller supplied the owner's id, a caller could supply any
   id and the check would be vacuous.

## Decision

**The determination pair is validated against the Lost report's own owner at
event-build time. An event 18 or 19 whose `determinedByUserId` is not the
report's owner is refused, and the whole transaction rolls back. The owner id
is a server-side fact supplied by the firing module, never a request field.**

Concretely:

1. **Both halves are mandatory.** A draft missing `determinedByUserId` or
   `recordedByAdministratorId` is refused. The pair is a required shape, not
   two optional fields.

2. **The maker is checked against the report's owner.** The firing module
   supplies the Lost report's `reporterId` alongside the determination. The
   factory refuses a draft whose `determinedByUserId` differs from it.

3. **The two halves are distinct in role, not necessarily in identity.** A
   draft where the same id fills both halves is refused **only when that
   person's administrator capacity is the one doing the determining** — which
   is the normal case, because the `recorded_by` half is by definition the
   acting administrator. The check is: *the maker of the determination is the
   owner of the report*. Where the owner is themselves an administrator acting
   in their administrator capacity, the pair names the same person in two
   roles, and that is recorded faithfully rather than refused.

4. **The role distinction is recorded explicitly.** The event's `actor_id` and
   `actor_role` name the **acting administrator** — the system actor
   performing the write, as the PRD specifies. The determination-maker is
   recorded in `determined_by_user_id`. The two are different columns, so the
   distinction survives the record.

5. **The failure is loud and fatal.** A refused determination throws
   `DeterminationActorError`, the caller's transaction rolls back, and the
   failure is logged as a defect. The determination is **not** recorded with a
   corrected value, and it is **not** recorded as a "best effort" event. A
   false determination must never reach the trail.

6. **The check is a shape check, not a workflow rule.** The factory does not
   ask "may this report be in `Verification Pending`?", "is this response
   selected?", or "is the administrator allowed to act here?". Those are
   FR-41's and FR-43's rules, evaluated by the firing module. The factory
   asks one question: **does this event claim that the report's owner made
   the determination?** That is a question about the record's truth, and it is
   answerable from the values the record itself carries.

7. **The check is on the maker's identity against the report, and the role is
   checked separately.** The factory verifies that the two halves hold
   different *roles* — a determination-maker who is a member of the report,
   and a recorder who is an administrator. It does not require different
   people.

## Rationale

### Why check the maker against the report's owner at all

Without the check, the pair is decorative. Two populated columns say "someone
determined it and someone recorded it" — which is true of almost any
determination, including the ones FR-43 forbids. The check is what makes the
event carry the PRD's claim rather than merely its shape.

The alternative — checking that the two ids differ — was rejected because it
passes the **False** state, which is the state that matters. An administrator
recording a determination attributed to an uninvolved member has two distinct
ids and passes a distinctness check. Only comparing against the report's
actual owner catches it.

### Why the owner id must be a server-side fact

`system-architecture.md` § Authorization model is unambiguous: "Roles are
derived, never client-asserted". The determination-maker is a *role claim*, so
it cannot come from a request body.

The owner id is a property of the Lost report, which the firing module already
holds — it is performing a determination on that report. Passing it as a fact
costs nothing and makes the check non-vacuous. If the id came from the
request, an attacker could name any member as the maker and the check would
confirm the attacker's own claim.

**The administrator id is likewise server-derived**: it comes from the acting
administrator's session, per FR-45's acting-administrator model ("The acting
administrator on any verification action is determined by which administrator
actually performs it").

### Why the same person may legitimately fill both halves

FR-43 forbids the *administrator capacity* from being the determination-maker.
It does not forbid an administrator who is also the report's owner from
verifying their own item — and it does not forbid an administrator from
recording a determination the owner made, where the owner happens to be an
administrator.

So the rule is about roles. The same person in two roles is a fact about the
deployment, not a defect. Refusing it would make the system unable to record
a determination for an administrator-owned report, and would push operators
toward a workaround that fabricates a second identity — which is strictly
worse.

The implementation therefore compares the maker against the **report's owner**
and checks the **role** of each half, not the distinctness of the ids.

### Why the failure is fatal rather than recorded-with-a-correction

The alternative designs are all worse.

**Record it anyway and let an investigator notice.** The trail is read by
administrators investigating a verification. A determination whose maker is not
the owner is precisely the thing they would be looking for — and it would be
invisible, because every field is well-formed. The whole point of the
determination pair is that it can be checked; a record that fails the check
while looking sound defeats it.

**Correct the maker to the report's owner and record that.** This fabricates
history. The trail would assert a determination by an owner who may never have
made one, and the correction would itself be invisible. A trail that can be
quietly corrected is not a trail.

**Degrade gracefully, as `coding-standards.md` would have it for business
outcomes.** This is not a business outcome. It is a defect: the code that
built the event violated a frozen rule. `coding-standards.md` says exactly
this — "Illegal state transitions are a defect, not a graceful degradation" —
and the same reasoning applies here. The transaction rolls back, and the
operator sees a logged defect with a request id.

### Why the check is a shape check and not a workflow rule

This is the line that keeps ADR-9's module boundary intact.

A check like "is the report in `Verification Pending`?" would require the
factory to know FR-42's state machine. A check like "is this response
`Selected for Verification`?" would require it to know FR-41's. Either one
would make the `audit` module a second implementation of the workflow's rules
— and `system-architecture.md` names duplicated state machines as the single
largest correctness risk in the system.

The check this ADR proposes is different in kind. It asks: **does this event's
maker field name the report's owner?** That is a comparison between two values
the record itself carries, and it is answerable without knowing anything about
Recovery Response lifecycles. It is a **truth check on the record**, in the
same family as bolt 001's catalog checks (a numbered type must have a number;
a non-numbered type must not) — not a workflow rule.

### Why the maker is recorded in a separate column from the actor

ADR-6's schema already has `determined_by_user_id` and
`recorded_by_administrator_id` as distinct nullable columns, and the PRD
requires the distinction. Storing the maker in `metadata` and the actor in
`actor_id` would have kept the values but lost the structure: a reader
filtering on `actor_id` would see the administrator, and would have to know to
look in `metadata` for the maker.

With the maker in its own column, the distinction is **queryable**. An
investigation can ask "which determinations were made by someone other than
the report's owner?" — and because the trail is append-only, the answer is
complete.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Check only that the two ids differ** | Simple; catches the same-person-twice case | **Passes the False state** — an administrator's determination attributed to any uninvolved member has two distinct ids and passes. This is the case FR-43 forbids outright, and it is the one worth catching | A distinctness check does not establish that the maker is the owner; it only establishes that two people are named |
| **Check only that both fields are present** | Simplest; satisfies the story's literal criterion ("present as two distinct values") | Presence is not truth. A determination attributed to the wrong person is well-formed and passes | The story says the pair is "the PRD's mechanism for keeping owner-determines / administrator-records **honest**" — presence alone is not honesty |
| **No check; rely on the firing module to pass the right value** | Simplest; the audit module stays dumb | The guarantee becomes a convention at each call site, with no failure when it is violated. Two units fire determination events, so two places to get it wrong | The distinction is the mechanism; a convention does not fail loudly when the mechanism is defeated |
| **Check the maker against the report's owner, and refuse a same-id pair** | Simple to state; catches both malformed and false | Forbids an administrator from recording a determination on a report they own, which FR-43 does not forbid. `administrator` is a flag on an Account, not a disjoint role | Refusing a legitimate determination is worse than recording it: it pushes operators toward fabricating a second identity |
| **Record the maker's role explicitly in `metadata` (e.g. `determinedByRole: 'owner'`)** | Makes the role visible in the record | The role is implied by the check itself; a metadata key that duplicates a checked fact can disagree with it. The typed columns are clearer | The columns already carry it, and the check guarantees the meaning |
| **Verify the determination through a separate identity-confirmation step** (e.g. an email link to the owner) | Stronger evidence than a flag | A new user-facing flow the frozen PRD does not specify; a new email event, which FR-30 forbids ("unsupported notification channels"); adds state and failure modes; costs under the $0 ceiling | The PRD specifies the mechanism as the two-field pair. Adding a second mechanism is a product change, not an implementation choice |
| **Log a warning but record the event** | The trail stays complete; the anomaly is visible in the logs | A false determination reaches the permanent trail, and the operational log lives for **1 hour** on Vercel Hobby — the warning is gone long before anyone investigates. The trail is the artifact that is reviewed later | The diagnostic channel is the wrong channel for a defect that must be acted on during the request |
| **Defer the check to read time** (mark the event as suspect when the trail is assembled) | No write-time failure; the trail always contains the event | A permanently stored false event, with the suspicion recorded elsewhere. The trail would contain an event that did not happen, merely annotated | The trail's value is that it records what happened. A flagged-but-stored false event is still a false event, and the flag lives nowhere the investigator looks |

## Consequences

### Positive

- **A determination attributed to anyone but the report's owner is refused at
  write time**, before it can reach the permanent trail.
- **The refusal is loud** — a typed error, a rolled-back transaction, and a
  logged defect with a request id, rather than a silently wrong record.
- **The distinction is queryable.** The maker is in its own column, so an
  investigation can ask directly whether every determination on a report was
  made by its owner.
- **The mechanism is enforced, not documented.** The guarantee is structural:
  there is no way to write an event 18 or 19 that fails the check.
- **The module boundary is preserved.** The factory asks a question about the
  record's truth, not about the workflow's legality.
- **The same person in two roles is recorded faithfully**, because the rule is
  about roles and `administrator` is a flag on an Account.

### Negative

- **The check requires the report's owner id to be available to the factory.**
  The firing module must supply it. It already holds it, but it is a
  requirement on the caller — a real coupling, and a mistake here is a
  refused event rather than a wrong one, which is the safe direction.
- **A determination on an administrator-owned report has one person in two
  roles in the record.** A reader must understand that `determined_by` and
  `actor_id` may name the same person in different capacities. This is the
  PRD's model, but it is a subtlety a reader could get wrong.
- **The check can only be as good as the caller-supplied owner id.** It is a
  fact about the report, and the firing module reads it from the report — but
  the factory cannot confirm that independently without reading the report
  table, which it must not do.
- **A legitimate determination is refused if the firing module passes the
  wrong owner id.** The failure is safe (a rolled-back transaction, a visible
  defect) but it is still an interruption for the administrator mid-verification.

### Risks

| Risk | Mitigation |
|---|---|
| A future determination path omits the owner id | The draft type makes it a required field, and the factory refuses a draft missing either half. The refusal is loud, so the path fails in development rather than in production. |
| A future determination path passes a hard-coded or unrelated owner id | The check compares against the report's owner, so an unrelated id is refused. A hard-coded id would only pass for a report owned by that id — and the mismatch is caught in Stage 5 by asserting the check against several reports. |
| The check is later weakened to "warn" | ADR-6's append-only guarantee is the reason a weak check is not recoverable: a false event already stored cannot be corrected. This ADR is indexed in `decision-index.md` with that consequence stated. |
| The factory's check grows to evaluate workflow rules (report status, response status) | The check is scoped to one comparison and is stated in these terms. A check that needs FR-41 or FR-42 is doing the firing module's job, and the boundary review should catch it. Asserted in Stage 5: the factory's rules concern the record's fields only. |
| An administrator-owned report cannot be verified | It can. The rule is about roles, and the same person in two capacities is recorded faithfully. |

## Related

- **Stories**: `002-lost-side-audit-events` — "Events 18/19 store `determined_by`
  and `recorded_by` as two distinct values"; the note that "a single actor field
  would destroy that distinction"
- **Standards**: `memory-bank/standards/system-architecture.md` (§
  Authorization model — roles are derived, never client-asserted;
  `administrator` is a flag on an Account),
  `memory-bank/standards/coding-standards.md` (§ Error handling — illegal
  transitions are a defect, not a graceful degradation),
  `memory-bank/standards/data-stack.md` (§ Concurrency rules — audit rows are
  written inside the same transaction as the state change)
- **Previous ADRs**: ADR-6 (append-only enforcement — why a wrongly-recorded
  determination is permanent, and why "record it anyway" is not recoverable),
  ADR-9 (the FR-48 catalog's home — this check lives in the factory it
  establishes)
- **Artifacts**: `memory-bank/bolts/003-audit-lost-side-events/ddd-01-domain-model.md`
  (§ DeterminationActor; § Actor model for events 26–30; the "role, not
  identity" distinction),
  `memory-bank/bolts/003-audit-lost-side-events/ddd-02-technical-design.md`
  (§ Decision 8; § The determination actor model on the wire; § Security
  Design — the determination pair is not forgeable by a client)
- **Requirements**: FR-48 (events 18 and 19 — the two-field mechanism and the
  "system actor performing the write" clause), FR-43 (owner-determines /
  administrator-records; "the administrator does not independently decide";
  the worked example), FR-45 (the acting-administrator model)
