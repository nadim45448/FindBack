---
bolt: 002-audit-reads
created: 2026-10-26T12:32:12Z
status: accepted
superseded_by: null
---

# ADR-8: Enforce the administrator check before the trail query, and keep the trail read contextual

## Context

FR-32 governs who may see the trail:

> Only administrators can view the full audit trail.

Its consequences are testable and specific:

> - Non-administrator users do not receive access to the full audit trail.
> - Reporters, claimants, responders, and Lost-report owners do not gain access
>   to the administrator audit trail merely by virtue of participating in a
>   report, Claim, Recovery Response, or thread.
> - Anonymous users cannot see any audit entries.

`system-architecture.md` states the general rule for the whole system:

> **API-layer enforcement is mandatory.** FR-39 visibility is applied in the
> application layer on every read path. The UI is never the enforcement point.

And the authorization model says how the role is obtained:

> Roles are derived, never client-asserted: `Anonymous` → `Pending` /
> `Rejected` / `Deactivated` → `Active Member`, with `administrator` as a flag
> on an Account.

So the check has a fixed shape: it reads the administrator flag from the
server-side session and refuses everyone else.

### The question this ADR settles

The trail read has two halves that are easy to conflate:

1. **Who may read** — the authorization rule, which is already fixed by FR-32
   and by `AuditTrailReader.assertAdministrator`, which bolt `001-audit-core`
   already wrote and tested.
2. **What may be read** — the *scope* of a read: one parent entity's trail, or
   the whole trail.

Half 1 is settled by the standards. Half 2 is not, and it is the one with
real architectural consequence, because it decides whether the system has a
query that can read **every** audit event in the database.

### The tension

`AuditEventRepository.listAll` already exists, and `AuditTrailReader.listAll`
already exposes it. It was written in bolt `001-audit-core` as a read
primitive.

But three frozen artifacts point the other way:

**Story `010-contextual-audit-views` (`Unit 007`):**

> **So that** I can reconstruct exactly what happened to it, without a global
> audit page that would invite browsing other people's records

and its acceptance criteria:

> - **Given** any route request for `/admin/audit` or any other global audit
>   route, **When** it is resolved, **Then** no such route exists and the
>   request does not succeed
> - **Given** the dashboard, **When** it renders, **Then** there is no audit
>   tile, no audit link, and no fifth queue
> - **Given** the administrator topbar, **When** it renders, **Then** it
>   contains no audit link

**`EXPERIENCE.md` §3.1:**

> Note: There is no global `/admin/audit` route. Audit is **contextual** to the
> relevant entity (report / Claim / Recovery Response / thread) and is reached
> from `/admin/items/:id/audit` and `/admin/lost/:id/audit` — never from a
> dashboard tile or top-level menu.

**FR-33, in the PRD's own words:**

> The audit trail (FR-32) is **not** one of these four operational queues — it
> is an administrator-readable cross-cutting record visible from any report,
> Claim, Recovery Response, or thread detail.

Every one of these is about **routes and surfaces** — no global page, no
dashboard tile, no topbar link. None of them forbids a whole-trail *query*.

### The two readings

The distinction that decides this ADR is between a **surface** and a
**capability**.

- A **surface** is a route an administrator reaches. `EXPERIENCE.md` forbids a
  global audit surface. That is a UX and information-architecture decision,
  and it is about what the system *offers*.
- A **capability** is a query the system *can perform*. A whole-trail query is
  that capability.

Reading `listAll` as a forbidden surface would be a category error: the
constraint is on routes, and the route does not exist. But the *reason* behind
the constraint is not merely aesthetic. Story `010` gives it: a global audit
page "would invite browsing other people's records."

**That reason is about capability, not layout.** The risk is not that a page
looks global; it is that an administrator can read a trail they have no
relationship to. A capability that can return every audit event in the
database is the mechanism by which that risk materialises — a route would only
be its most visible delivery mechanism.

And a whole-trail read is not hypothetical. The `AuditReadLog` table records
who read the trail. An administrator reviewing the read log needs to answer
"what else did this administrator look at?" — and the trail of *other*
administrators' investigations is exactly the data that answers it. `EXPERIENCE.md`
§17.6 confirms the read log exists but is not surfaced:

> UX does not surface this log to administrators. Audit-trail-read access
> logging is a backend/observability concern and is not surfaced in the
> current UX.

So the read log is a **backend** concern, reviewed operationally, and the
capability to answer that question is a backend capability.

### The forces in play

| Force | Direction |
|---|---|
| FR-32: only administrators may view the full trail | The check is on the administrator flag, never on relationship |
| `system-architecture.md`: API-layer enforcement; the UI is never the enforcement point | The refusal happens in the application layer, before the query |
| `system-architecture.md`: roles are derived, never client-asserted | `isAdministrator` comes from the server-side session, never from a request body or header |
| Story `010`: "no global audit page that would invite browsing other people's records" | A whole-trail *surface* is forbidden; the reason concerns capability |
| `EXPERIENCE.md` §3.1: no global `/admin/audit` route | No route, no dashboard tile, no topbar link |
| FR-33: the trail is "visible from any report, Claim, Recovery Response, or thread detail" | The trail is reached **through** a parent entity |
| `coding-standards.md`: validate every input at the route boundary | A malformed parent id, date, or filter is a 400 |
| `coding-standards.md`: parameterized queries only | No filter value is ever interpolated |
| FR-39: the sensitive-field matrix | A non-administrator gets no trail content at all — not even a count |
| $0 ceiling (`tech-stack.md`) | No separate audit service, no export store |
| PRD §10: audit-trail reads are themselves logged | Every read of the trail, at any scope, is recorded |

## Decision

**The administrator check runs in the application layer, before the query, and
is the only gate. A whole-trail read is retained as a backend capability with
no route, and every read — contextual or whole-trail — is recorded.**

Specifically:

1. **Authorization is a pre-query gate, not a query filter.** The check is
   `assertAdministrator(viewer)`, and it runs before the repository is called.
   A non-administrator never reaches the database. This is already
   implemented in `AuditTrailReader` by bolt `001-audit-core` and is kept.

2. **The check is on the administrator flag alone — never on relationship.**
   FR-32 is explicit that participating in a report grants no access: not the
   reporter, not a claimant, not a responder, not the Lost-report owner. A
   member who is somehow a party to the audited entity is still refused.

3. **The role is server-derived, never client-asserted.** `isAdministrator`
   comes from the server-side session. A request that sets an
   `isAdministrator` header or body field is ignored; the server's own
   session is the only source. This is `system-architecture.md`'s rule and it
   is the reason the read path takes an `ActorContext` rather than a
   client-supplied flag.

4. **A refusal returns nothing that distinguishes "empty" from "forbidden".**
   A refused read is refused with `403` and the neutral permission-denied copy
   from `EXPERIENCE.md` §4.9. It does not reveal whether the entity exists,
   and it does not reveal a result count.

5. **The whole-trail read is retained, without a route.** `listAll` stays, and
   it is administrator-gated by the same pre-query check. **No route, no
   dashboard tile, no topbar link, and no export is created for it.** It is a
   backend capability for operational review — the question "what did this
   administrator read?" — and `EXPERIENCE.md` §17.6 already states that the
   read log is not surfaced in the UX.

6. **The contextual read stays the product surface.** The two audit routes
   (`/admin/items/:id/audit`, `/admin/lost/:id/audit`) read one parent at a
   time, and the account disclosure in `/admin/accounts` reads one account's
   records. These are the only ways an administrator sees the trail in the
   product.

7. **Every read of the trail is recorded, at any scope.** A contextual read, a
   whole-trail read, and a read of an empty trail all produce a read record.
   The record carries the administrator, the query, the filters, the result
   count, and the timestamp — and no trail content.

8. **A refused read is recorded to the operational log only.** It is not
   written to `audit_read_logs`, which records administrator reads. A member's
   failed attempt is not a trail read, and writing it to the table would make
   the read log a place where non-administrator activity accumulates.

9. **Filters are exactly UX §17.3's three — action type (multi-select), date
   range, and actor.** The trail's order is fixed (reverse-chronological) and
   is not client-selectable. There is no free-text filter and no sort control.

10. **Every filter value is a bound parameter, validated at the route
    boundary.** A malformed parent id, an unparseable date, an unknown
    `parentType`, or an out-of-range limit is a `400` with a field-level
    message, never a `500` and never a partially applied query.

### Why a refused read is not recorded in `audit_read_logs`

This is worth stating explicitly, because it is a distinction that is easy to
lose. `audit_read_logs` answers one question: **which administrator read
what, and when**. A refused read answers a different question: **did someone
try to get somewhere they were not allowed to go**.

Mixing them would put non-administrator access attempts into the same table
as administrator activity, which would make the table's answer to its own
question — the access pattern of administrators — noisier and less reliable. It
would also mean the table grows with traffic it has no business holding, on a
free-tier database with a 1 GB storage ceiling.

The refusal is still **observable**: it is written to the operational log with
`outcome: "denied"`, which is what PRD §10's operational logging is for. The
operational log is the right home for it — it is a diagnostic record, not a
compliance artifact, and it carries no sensitive value.

## Rationale

### Why the check is a pre-query gate

**Why not a query filter.** A filter like `WHERE actor_id = $viewer` produces
a different failure mode from a refusal. A filter returns an **empty result**,
and an empty result is indistinguishable from "this trail is empty". A
refusal must be distinguishable from a legitimately empty trail — the
administrator needs to know that their access was refused, not that the
trail happens to have no events. More importantly, a filter puts the
authorization decision in the SQL, where it is expressed as a *predicate over
data* rather than a *rule about a person*, and a rule about a person belongs in
the application layer.

`system-architecture.md` is unambiguous: "**API-layer enforcement is
mandatory.** FR-39 visibility is applied in the application layer on every
read path. The UI is never the enforcement point." A filter is not
application-layer enforcement of the *rule*; it is a narrowing of the data.

The cost of the pre-query gate is one call that does not hit the database, and
one `403` response. The benefit is that a non-administrator's request never
reaches `audit_events` at all, so there is nothing to leak — not a row, not a
count, not a timing signal that distinguishes an existing trail from a
missing one.

**Why the check is in the reader and repeated in the service.** `AuditTrailReader`
asserts the administrator flag, and the new `AuditTrailService` (ADR-7) asserts
it too. The duplication is deliberate: the reader is a public application
primitive that other modules will call, and a primitive that can be called
without a check is a primitive that will be called without a check. The
service's check is the use case's own guarantee. The check is cheap — it reads
a boolean — and the cost of one redundant check is far below the cost of one
forgotten one.

### Why the check is on the flag alone and never on relationship

FR-32's second consequence is the one that is easiest to get wrong:

> Reporters, claimants, responders, and Lost-report owners do not gain access
> to the administrator audit trail merely by virtue of participating in a
> report, Claim, Recovery Response, or thread.

A system that has a `parentId` and a `viewerId` can easily be written to
check "is this viewer the reporter of this report?" — and that check would
grant the reporter access to a trail the PRD forbids them from seeing. It is
also the check that would be *most* natural to write, because the report
entity is right there.

The rule is therefore stated negatively as well as positively: **no
relationship-based exception exists.** The only gate is the administrator
flag. This is stated here so that a future developer adding "well, the reporter
should be able to see their own report's trail" knows that this was
considered and refused by FR-32, and that member-facing visibility is
delivered by the *member-facing status history* (UX §17.5 — at most 3 entries,
no audit verbs, no additional fields) rather than by the trail.

### Why the role is server-derived

`system-architecture.md`: "Roles are derived, never client-asserted."

The consequence for this path is that `TrailViewer.isAdministrator` must come
from the session and nothing else. The domain model already states it:
"`isAdministrator` is **data carried in**, never derived from a client-supplied
header or body. It comes from the server-side session." and "A viewer with
`isAdministrator: false` is refused, whatever their `userId` says."

The second clause matters: a `userId` that *is* an administrator's is not
sufficient either, because the caller controls that value if it is read from
the request. The flag is the only input, and it is server-derived.

### Why the whole-trail read is retained rather than removed

**The constraint is on surfaces, and the surface is what the constraint
forbids.** `EXPERIENCE.md` §3.1, story `010`, and FR-33 all forbid a *route*,
a *tile*, and a *link*. Removing the capability as well would exceed the
constraint.

**But the reason behind the constraint is about capability.** Story `010`
gives it: a global audit page "would invite browsing other people's records."
If the capability to read every audit event does not exist, that invitation
cannot be extended later by a well-meaning future route. If it does exist, the
invitation is one route away.

The decision holds both of these together, and the resolution is
**capability without surface**:

- The capability stays, because the operational review it supports is real and
  named. `audit_read_logs` answers "which administrator read what, and when";
  the whole-trail read is how an operator answers "and what else did they
  read?" `EXPERIENCE.md` §17.6 explicitly classifies the read log as a
  backend concern.
- The surface stays absent, because no route is created, no tile is added, no
  link is rendered, and no export exists. The constraint is satisfied exactly
  as written.
- The capability is administrator-gated by the same pre-query check, so it is
  not a backdoor around FR-32.

**What would change this decision.** If a whole-trail read were ever exposed
through any surface — a route, an export, an admin page, a report, a support
tool — then the capability becomes a surface, and the "invite browsing other
people's records" reason applies directly to it. In that case this ADR must
be revisited, and the answer would probably be to remove the capability and
retain only the contextual read. **The capability is retained on the
understanding that it stays behind the application layer.**

### Why the read log records reads and not refusals

The table's purpose is to make the administrator access pattern reviewable.
Mixing in non-administrator attempts would dilute that signal and would put
unrelated activity into a table whose retention and review are governed by
that purpose.

There is a second reason, which is the free tier. `tech-stack.md` records a
**1 GB** database storage ceiling and a Blob ceiling of 1 GB per month. A table
that accumulates every access attempt, including ones from members who are
refused, grows for a purpose it was not designed for. The refusal still needs
to be observable, and the operational log — with `outcome: "denied"` — is the
right place for it, because it is diagnostic, is not the compliance artifact,
and carries no sensitive value.

### Why exactly three filters, and why no sort control

`EXPERIENCE.md` §17.3 names three: action type (multi-select), date range,
and actor. They are frozen UX, and the story `010` acceptance criterion
requires all three to be available.

**No free-text filter.** A free-text filter over the trail would search
`reason` and `metadata` — which carry audit-significant text and, for some
events, Sensitive Fields. A free-text filter is also an unbounded query
surface, and a filtering capability that reaches into free text is a place
where a sensitive value could be surfaced by an unexpected route.

**No sort control.** The trail's order is fixed by FR-32's reverse-chronological
requirement and by UX-OQ-C. A sort control would mean a second ordering
path, and therefore a second index, and a second chance for the cursor
pagination to be wrong. The cursor is a tuple on `(occurredAt, id)`; a
different sort would need a different cursor.

**Filters narrow; they do not reorder.** The three filters reduce the result
set and the order stays newest-first. The read record captures the filters
that were applied, so the record says what the administrator saw — the
*filtered* count, not the unfiltered total.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Remove `listAll` entirely** — the contextual read is the only read | The strongest possible reading of story `010`'s "no global audit page"; no query in the codebase can return every audit event | The operational review the read log exists to support becomes impossible; `listAll` is already implemented and tested; the frozen constraints forbid a *surface*, not a *capability* | Exceeds the constraint. The reasons for keeping it are recorded above, including the condition under which it must be revisited. |
| **Remove `listAll` and re-add it only when a surface needs it** | The capability never sits unused | YAGNI reasoning does not apply here — the read log's operational review is a live requirement from PRD §10 and `EXPERIENCE.md` §17.6, not a speculative one; it also creates pressure to add the surface later | The capability is not speculative. Removing it would make PRD §10's "so the access pattern is reviewable" partly unanswerable. |
| **Keep `listAll` and add a global `/admin/audit` route** | Administrators can review across reports | Directly contradicts `EXPERIENCE.md` §3.1, story `010`'s three acceptance criteria, and FR-33 | Forbidden by frozen UX and the PRD. Rejected outright. |
| **Make the administrator check a query filter** (`WHERE actor_id = $viewer`) | One mechanism; the database enforces it | Returns an empty result instead of a refusal, so "forbidden" is indistinguishable from "empty"; a member learns the trail's emptiness or existence from the result count; authorization expressed as a data predicate rather than a rule | Violates `system-architecture.md`'s API-layer enforcement rule and leaks existence. |
| **Enforce the check in the route handler or the page** | The nearest place to the request | `coding-standards.md` forbids business rules in `app/`; `system-architecture.md` says the UI is never the enforcement point; a direct request to a different handler would bypass it | Forbidden by the standards, and it is the classic "the UI hides it" failure the FR-39 matrix warns against. |
| **Grant the reporter, claimant, responder, or owner access to their own trail** | Members could see their own item's history | FR-32 forbids it explicitly; member-facing visibility is the 3-entry status history, not the trail | Would change a frozen requirement. |
| **Accept a client-supplied `isAdministrator` flag** | Simplest possible wiring | `system-architecture.md`: "Roles are derived, never client-asserted" | Would make FR-32 a client-side convention. |
| **Record refusals in `audit_read_logs` as well** | Every access attempt in one place | Dilutes the table's stated purpose; accumulates non-administrator activity in a table governed by the administrator-access-pattern review; the operational log already carries the refusal | The table answers a different question than the log. |
| **Add a free-text filter over the trail** | More flexible investigation | Searches `reason` and `metadata`, which can carry audit-significant text and Sensitive Fields; unbounded query surface; exceeds frozen UX §17.3 | Scope creep against frozen UX, with a sensitive-data path. |
| **Add a sort control** | Administrators could reorder | A second ordering path needs a second cursor and a second index; the order is fixed by FR-32 and UX-OQ-C | The order is a requirement, not a preference. |
| **Enforce the check at the database level** (row-level security) | Defence in depth below the application | PostgreSQL RLS would need a session variable carrying the role, which reintroduces a session-scoped setting on pooled connections — the exact hazard ADR-6's `SET LOCAL` decision exists to avoid; and it would not replace the application-layer check, only duplicate it | A second mechanism solving a problem the first already solves, at the cost of the pooled-connection hazard. |

## Consequences

### Positive

- FR-32 is enforced **before** the database is touched, so a non-administrator
  receives no trail content, no count, and no existence signal.
- The rule is **one boolean** — `isAdministrator` — with no
  relationship-based path that could be added by accident, and the negative
  form of the rule is written down so a future "the reporter should see their
  own trail" request meets the reason it was refused.
- The **whole-trail read stays available** for the operational review that
  PRD §10's "so the access pattern is reviewable" depends on, while **no
  surface exposes it** — no route, no tile, no link, no export.
- The read log keeps **exactly the signal it is for**: administrator reads.
- The filter set is **frozen and minimal**, so the query surface, the index
  requirements, and the cursor arithmetic all stay small and provable.
- Every read at any scope is **recorded**, so the read log is complete.
- Every filter value is a **bound parameter**, and every input is **validated
  at the route boundary** — a bad request is a `400`, never a `500`.

### Negative

- The `listAll` capability **remains in the codebase**, and a future developer
  could expose it. The ADR records the condition under which that must be
  revisited, but an ADR is guidance, not a guardrail.
- The check is **performed twice** — once in the service, once in the reader.
  The redundancy is deliberate, but it is redundancy, and a reader of the code
  may wonder why.
- The refusal is **not in the database**, so a review of *access attempts*
  (as opposed to *administrator reads*) has to come from the operational log,
  which is retained for 1 hour on Hobby. A member's repeated attempts beyond
  that window are not reconstructable.
- The read log's **result count is the filtered count**, not the trail's total
  size. An investigator asking "how big is this trail?" cannot answer it from
  the read record.
- The admin check is **not** enforced at the database level, so a direct
  `psql` read of `audit_events` is not refused by the database the way a
  mutation is refused by ADR-6's trigger. The trail's protection is access
  control, not encryption.

### Risks

| Risk | Mitigation |
|---|---|
| A future route exposes `listAll` and becomes a global audit page | This ADR states the condition explicitly: if a whole-trail read is exposed through any surface, the ADR must be revisited and the capability is likely to be removed. The ADR is indexed in `decision-index.md` with a "Read when" line that names route creation. |
| A developer adds a relationship-based exception ("the reporter may see their own trail") | FR-32's second consequence is quoted in this ADR's Context, and the negative form of the rule is stated in the Decision. A reviewer reading the ADR sees the request was considered and refused. |
| A member's repeated refused attempts are not visible after the 1-hour log window | The refusal is logged with `outcome: "denied"` and the request id, which is the available signal within the window. Making refusals durable would require a second table outside the read log's purpose, and no requirement asks for it. |
| The double check drifts — one path gains a new behaviour | Both checks are on the same `isAdministrator` flag and are asserted by the test stage. The reader's check is the one that protects the primitive; the service's is the use case's guarantee. |
| The read log's volume grows without bound and pressures the 1 GB database ceiling | The read log stores one small row per administrator read and no trail content. `tech-stack.md` requires quota monitoring against the database size, which bolt `001-audit-core`'s `DatabaseQuotaProvider` already reports. |
| A filter is added later that reaches into free text and surfaces a Sensitive Field | The filter set is frozen at three in this ADR and in `EXPERIENCE.md` §17.3; any new filter is a change to frozen UX and needs the same approval the UX changes require. The trail's Sensitive Fields are administrator-visible by PRD design, but the *read log* carries no trail data, so they cannot reach the table. |

## Related

- **Stories**: `005-audit-visibility-and-read-logging` (the refusal criterion,
  the "distinct record type" criterion, the "never deduplicated" rule),
  `010-contextual-audit-views` (the no-global-route criteria, and the reason
  quoted in this ADR's Context)
- **Standards**: `memory-bank/standards/system-architecture.md` (§ API design —
  RFC 9457 problem details; § Authorization model — roles are derived, never
  client-asserted; "The UI is never the enforcement point"),
  `memory-bank/standards/coding-standards.md` (§ Error handling — typed
  expected errors, `EXPERIENCE.md` §4.9 copy; § Security coding rules —
  validate at the route boundary, parameterized queries, enforce the
  visibility matrix in the application layer on every read path),
  `memory-bank/standards/tech-stack.md` (B3 — runtime logs are diagnostic
  only; the 1 GB database ceiling), `memory-bank/standards/data-stack.md`
  (cursor pagination for the trail)
- **Previous ADRs**: ADR-6 (append-only enforcement — the trail's protection
  is a database-level mutation guard; this ADR is about the *read* side, where
  the protection is access control), ADR-2 (private storage with
  server-side authorization on every read — the same "enforce at the
  application layer, immediately before the read" pattern, applied to images
  and now to the trail)
- **Artifacts**: `memory-bank/bolts/002-audit-reads/ddd-01-domain-model.md`
  (the `TrailViewer` value object and its three constraints; the
  `AuditTrailReadRefused` domain event; the "Boundary rules" section),
  `memory-bank/bolts/002-audit-reads/ddd-02-technical-design.md`
  (§ Security Design; § Decisions 3, 4, 5, 8; § API Design — the route
  ownership boundary with Unit 007)
- **Requirements**: FR-32 (administrator-only visibility and its three
  consequences), FR-33 (the trail is not a queue; it is visible from a parent
  entity's detail), FR-39 (the visibility matrix; the member-facing status
  history), PRD §10 (Observability — reads are logged separately so the access
  pattern is reviewable)
