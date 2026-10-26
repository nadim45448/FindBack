---
bolt: 001-audit-core
created: 2026-10-26T09:41:00Z
status: accepted
superseded_by: null
---

# ADR-6: Enforce append-only audit in the database, with a transaction-scoped flag for the single FR-10 deletion path

## Context

Two frozen requirements pull in opposite directions, and both are normative.

**FR-31 requires an append-only trail with no deletion mechanism:**

> The trail is append-only: no entry can be edited or deleted.
> There is no separate deletion mechanism for the trail while the report exists.

Story `004-append-only-enforcement` reinforces this at the code level: "Given a
retention or cleanup job, when it attempts to prune audit records, then no such
pruning path exists", and "Given an existing audit record, when any update is
attempted, then the operation is refused" — for an administrator too, "with no
privilege that could succeed". Its edge case is explicit: "Direct database
update bypassing the application | Prevented by database-level constraints, not
by application convention alone."

**FR-10 requires the opposite, for one case:** "After hard deletion of an
interaction-free Open report, the report and its audit entries are removed from
the system." The PRD's Data Retention section repeats it: "When the report is
hard-deleted under FR-10, the related Claims / Recovery Responses / messages /
audit entries are removed with it." Story `004` names FR-10 as "the single
exception."

So the trail must be immutable, and yet there must be exactly one way to remove
a trail — the deletion of an interaction-free `Open` report, which by
definition has no Claim, no Recovery Response, and therefore no decision
history to protect.

The technical design (`ddd-02-technical-design.md`) proposes satisfying both
with three enforcement layers — an insert-only repository interface, a single
writer, and a PostgreSQL `BEFORE UPDATE OR DELETE` trigger — and having the
trigger permit a delete only when the current transaction has set a
transaction-scoped session flag.

This ADR exists because that flag is a genuine trade-off: it introduces a
capability that can delete audit rows, in a system whose central promise is
that audit rows cannot be deleted. The choice needs to be written down and
reviewed rather than buried in a migration.

**Forces in play:**

| Force | Direction |
|---|---|
| FR-31 append-only, story `004` "no privilege that could succeed" | Immutability must not depend on a permission check that could later be widened |
| Story `004` edge case: direct database write | Protection must exist below the application layer |
| FR-10 removes the trail with the report | Exactly one deletion path must exist, and it must be the FR-10 path |
| PRD §10 Data Retention | No separate retention or pruning mechanism |
| $0 ceiling (`tech-stack.md`) | The solution cannot require a second database role, a separate service, or a paid tier |
| Single pooled connection (`data-stack.md`) | A session-scoped setting could leak across requests on a reused connection — so the flag must be transaction-scoped, not session-scoped |

## Decision

**Append-only is enforced at the database layer by a trigger, and the single
permitted deletion is gated by a transaction-scoped `SET LOCAL` flag that only
the FR-10 hard-delete path sets.**

Specifically:

1. A `BEFORE UPDATE OR DELETE` trigger on `audit_events` raises an exception on
   any mutation attempt. `audit_read_logs` and `quota_snapshots` carry the same
   trigger, with no permitted exception at all — a read log that can be edited
   is not an access log.

2. The trigger permits a delete **only** when the current transaction has set
   `findback.allow_audit_delete = 'on'` via `SET LOCAL`. `SET LOCAL` scopes the
   setting to the current transaction; it is discarded at commit or rollback and
   cannot leak onto a reused pooled connection.

3. Only the FR-10 hard-delete path sets the flag. It does so inside the same
   transaction that deletes the report, immediately before deleting that
   report's audit rows.

4. The FR-10 eligibility check — status `Open`, and no Claim (Found) or no
   Recovery Response (Lost) — runs **before** the flag is set. The flag is never
   set for a report that fails the check.

5. The flag is set to `'on'`, never to any other value, and there is no
   parameterised, general-purpose "may delete audit rows" switch. The name
   names its single permitted caller.

6. The application layer keeps the everyday guarantee: `AuditEventRepository`
   exposes no `update`, `delete`, or `upsert` method, and `AuditWriter` is the
   only writer. The trigger is the backstop, not the primary mechanism.

```sql
CREATE OR REPLACE FUNCTION findback_forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('findback.allow_audit_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (FR-31, story 004)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation();
```

## Rationale

**Why a database trigger is the primary enforcement.** Story `004`'s edge case
demands protection against a direct database write. An application-level
convention cannot survive a buggy script, a migration, a seed file, or a
human with `psql`. A trigger is the only layer that covers all of them, and
shipping it in the Prisma migration means it cannot be forgotten.

**Why the trigger is not the only layer.** The application-level guarantee
(int insert-only port, single writer) is what makes ordinary operation safe and
reviewable. The trigger is what makes the guarantee *hold* when the application
is wrong. Both are needed; neither is sufficient alone.

**Why a transaction-scoped flag rather than a permanent exemption.** The two
requirements are genuinely in tension, and a rule that hard-refuses all deletes
would make FR-10 unimplementable while a rule that permits them freely would
defeat FR-31. The flag is the narrowest reconciliation available: it grants
the capability to exactly one transaction at a time, and only while that
transaction is the FR-10 delete.

**Why `SET LOCAL` and not `SET`.** Connections are pooled (`data-stack.md` —
Vercel Functions cap file descriptors at 1,024, so pooled connections are
mandatory). A session-scoped `SET` could persist on a reused connection and
silently authorise deletes in an unrelated later request. `SET LOCAL` is
transaction-scoped by PostgreSQL's own semantics, so the capability cannot
outlive the transaction that needed it. This is the single most important
property of the design.

**Why the flag is set last, after the eligibility check.** If the flag were set
before the FR-10 checks, a report that fails the eligibility check would still
have opened a deletion window in that transaction. Setting it last means the
window is opened only for a transaction already committed to the one legal
deletion.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| Application-level check only (no trigger) | Simple; no database objects; no session state | A direct `psql` update, a buggy script, or a migration bypasses it entirely | Story `004` explicitly requires protection by "database-level constraints, not by application convention alone" |
| Soft delete (`deleted_at` column) | Preserves the row for forensics; simple to query | It is still a deletion path; the row remains readable and mutable, so "no entry can be edited or deleted" is not true; it also leaves rows for a report that no longer exists | The PRD says entries are *removed*; and a column that can be set invites a code path that sets it |
| Trigger permits deletion whenever the parent report is gone (checked inside the trigger) | No session flag at all | Any code able to delete a report row can then delete arbitrary audit rows; the check is racy against concurrent transactions; the capability is implicit and therefore hard to audit | Too broad. The permitted action must be an explicit, identifiable act, not a side effect of another one |
| Deny all deletes; retain the trail with a "parent deleted" marker | Simplest, strongest immutability | Directly contradicts FR-10 ("the report and its audit entries are removed from the system") and the PRD's Data Retention rule | Would change a frozen requirement |
| Separate database role that alone may write/delete audit rows | Strong isolation; no session flag | The free-tier pooled deployment exposes a single application role; a second role is not available at $0 on the free tier, and a single role still permits deletion by any path | Budget constraint (`tech-stack.md`, hard $0 ceiling) and the pooled single-role model |
| Drop and recreate the trigger inside the FR-10 transaction | No session state at all | DDL inside a request transaction; widens the trigger's absence to anything concurrent in that transaction; defeats the purpose of having the trigger | Far too coarse; the trigger is absent exactly when it is needed |
| Store the audit trail in an append-only log/stream (e.g. object storage, WAL) | Natural immutability | Introduces a second store, breaks the single-transaction guarantee that FR-17 and FR-45 depend on, complicates the 1 s p95 read NFR, and costs money or adds operational surface | Violates the "all state in one PostgreSQL" decision in `data-stack.md` and the $0 ceiling |

## Consequences

### Positive

- The trail is immutable at every layer, including against a direct database
  write that bypasses the application entirely.
- Exactly one deletion path exists, it is the PRD's own FR-10 path, and it
  happens inside the same transaction as the report delete.
- The deletion capability cannot leak: `SET LOCAL` is discarded at commit or
  rollback, so a pooled connection carries no residue.
- The FR-10 exception is genuinely narrow — only interaction-free `Open`
  reports reach it, and by definition there is no Claim, no Recovery Response,
  and no decision history to hide.
- No soft-delete columns, no retention job, and no pruning path exist, so the
  "no separate deletion mechanism" rule holds without an ongoing job that
  could misbehave.
- The guarantee is verifiable by inspection: the interface has no such method,
  the writer has no such method, and the trigger raises.

### Negative

- The guarantee is "immutable **except** inside an FR-10 transaction", not
  absolute immutability. The PRD's own requirements make absolute immutability
  incompatible with FR-10, so this is the PRD's trade-off, not an invention
  here — but it should be stated plainly rather than glossed.
- A second mechanism that can delete audit rows now exists, and the application
  code must know about it. A developer who sets the flag carelessly has opened
  a deletion window in that transaction.
- Forgetting to set the flag inside a legitimate FR-10 delete produces a
  transaction error rather than a silent success. This is the intended failure
  direction, but it will surface as a defect in the FR-10 path until the code
  is written correctly.
- The trigger and the flag are database-level coupling that the application
  must stay in step with; a schema change to the trail must carry the trigger
  with it.

### Risks

| Risk | Mitigation |
|---|---|
| A bug sets the flag in a broader transaction, letting more than one report's trail be deleted | The flag is set immediately before the delete, in the same statement batch, in a transaction that deletes exactly one parent report. The FR-10 eligibility check runs before the flag is set. **The tightening recorded below was adopted at Stage 4** — see the note after this table. |
| A pooled connection leaks the setting into a later request | `SET LOCAL` is transaction-scoped by PostgreSQL semantics and is discarded at commit or rollback. Session-level `SET` is forbidden for this reason. |
| A future developer adds a "cleanup" or "retention" job that sets the flag | The flag name names its single permitted caller, the trigger function name states the rule, and this ADR is indexed in `decision-index.md` so an agent reads it before writing any delete path. The PRD forbids such a job outright ("no separate deletion mechanism for the trail"). |
| The trigger is dropped during a future migration | The trigger is created in the Prisma migration alongside the table. A migration that drops it must recreate it; the append-only test in the bolt's Test stage asserts the trigger exists and refuses an update, so a regression fails the suite rather than reaching production. |
| The exception is misread as a general delete permission | The flag is set to `'on'` only, the trigger has no other branch, and the permitted path is the only one in the codebase. Reviewers reading the migration see the full mechanism. |

### Stage 4 outcome — the tightening, and what it did not cover

The refinement this ADR left open was adopted at Stage 4. The decision is
now the one stated in the **Decision** section, implemented in
`prisma/migrations/20261026094500_audit_schema_reconciliation/migration.sql`
and `src/infrastructure/audit/fr10-audit-deletion.ts`:

- The trigger `findback_forbid_audit_mutation` refuses every mutation unless
  the transaction has set `findback.allow_audit_delete = 'on'`.
- The flag is set with `set_config(name, value, true)` — the parameterised
  equivalent of `SET LOCAL` — so the statement is a bind-parameter query like
  every other, and the setting is transaction-scoped by PostgreSQL's own
  semantics.
- The FR-10 helper sets the flag immediately before deleting one parent's
  rows, inside the caller's transaction.

**The tightening that was considered but not adopted.** The trigger could
additionally verify that the deleted audit row's parent report is itself being
deleted in the same transaction, which would close the "flag set in a broader
transaction" risk at the database level rather than by convention. It was not
adopted because the audit context has no knowledge of the reports context's
tables or its FR-10 rule — the boundary rule in the domain model puts that
knowledge in the reports context, which calls this helper. A trigger that
reached across into the reports tables would invert that boundary and couple
the audit schema to a table the audit context does not own.

The risk is therefore mitigated by **convention plus a single caller**, not by
a database-level constraint on the parent. That is a deliberate, recorded
trade-off: the alternative is a stronger guarantee bought with a worse
boundary. It is called out here so that the choice is visible to anyone
reading the ADR, and it should be revisited if a second caller ever needs the
flag.

**Verified at Stage 4.** The trigger refuses `UPDATE` and `DELETE` from a
direct `psql` session; it permits a delete only inside a transaction that set
the flag; and the flag does not survive its transaction — a later delete on
the same pooled connection is refused. These are asserted in
`src/infrastructure/audit/append-only-enforcement.test.ts` and exercised
end-to-end by `npm run smoke:audit`.

## Related

- **Stories**: `001-append-only-audit-writes`, `003-non-numbered-audit-records`,
  `004-append-only-enforcement` (this ADR serves the last two; the third
  follows from the same enforcement)
- **Standards**: `memory-bank/standards/data-stack.md` (transaction rules,
  retention table, raw-SQL audit queries), `memory-bank/standards/system-architecture.md`
  (append-only audit; "Decisions carried into Construction" #3),
  `memory-bank/standards/coding-standards.md` (no update/delete path)
- **Previous ADRs**: ADR-3 (PostgreSQL with Prisma, pooled connections,
  transactional lifecycle changes — its decision 3, "Audit written inside the
  state-change transaction", is the basis for the transaction-scoped flag);
  ADR-4 (free-tier quota enforcement with refusal, never silent acceptance) —
  same "refuse loudly rather than degrade" philosophy applied to mutation
- **Artifacts**: `memory-bank/bolts/001-audit-core/ddd-01-domain-model.md`
  (AuditTrail invariants 1, 4, 5), `memory-bank/bolts/001-audit-core/ddd-02-technical-design.md`
  (§ Append-only enforcement, § Transaction design)
- **Requirements**: FR-10 (hard delete removes the trail), FR-31 (append-only,
  no separate deletion mechanism), FR-32 (administrator-only visibility)
