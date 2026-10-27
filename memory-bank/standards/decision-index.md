---
last_updated: 2026-10-27T07:20:00Z
total_decisions: 11
---

# Decision Index

Architecture decisions recorded during **Inception / project-init**, before any
Construction bolt exists. Construction ADRs append below these, newest first.

The entries with no `Path` are decisions locked by `standards/tech-stack.md` and
approved by the project owner on 2026-10-23. Bolt-scoped ADRs will be written to
`bolts/{bolt-id}/adr-{n}-{slug}.md` as Construction proceeds.

## How to Use

**For Agents:** scan the "Read when" fields before implementing. ADR-2 in
particular constrains every read path and every image delivery. If a proposed
implementation contradicts one of these, stop and raise an ADR rather than
deviating silently.

**For humans:** these four decisions encode the $0 budget constraint and the
Vercel Hobby free-tier ceiling. Changing any of them has cost or privacy
consequences that must be re-approved by the project owner.

---

## Decisions

### ADR-1: TypeScript + Next.js App Router on Vercel Hobby
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/tech-stack.md`
- **Summary**: FindBack is a single-tenant server-rendered web application, so it runs on TypeScript with Next.js App Router, hosted on Vercel Hobby at a $0 ceiling. Server rendering satisfies the ≤ 2 s p95 initial-HTML NFR, and Vercel's docs confirm Next.js bundles dynamic code into the fewest Functions, so the 12-function Hobby limit is not binding.
- **Read when**: choosing runtime, rendering strategy, deployment target, or assessing Hobby-plan headroom.

### ADR-2: Vercel Blob private storage with server-side authorization on every read
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/image-handling.md`
- **Summary**: Report and candidate images are Sensitive Fields under FR-37/FR-39, so they are stored in a private Blob store and served only through an authenticated route handler that applies the FR-39 matrix immediately before the blob read. The store's access mode is immutable after creation, so this decision is one-way; caching a private response (`s-maxage`) or relying on middleware for authorization is forbidden.
- **Read when**: implementing any read of an image, upload path, FR-53 image replacement, FR-10 deletion, or cache headers.

### ADR-3: PostgreSQL with Prisma, pooled connections, transactional lifecycle changes
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/data-stack.md`
- **Summary**: FindBack needs real atomicity — FR-17 Claim approval and FR-45 verification completion each mutate several rows and must not partially apply — so state lives in PostgreSQL behind Prisma, with parent-row locking inside a single transaction and audit rows written in that same transaction. Pooled connections are mandatory because Vercel Functions cap file descriptors at 1,024.
- **Read when**: implementing any lifecycle transition, Claim approval, verification outcome, audit write, or data access.

### ADR-4: Free-tier quota enforcement with refusal, never silent acceptance or upgrade
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/tech-stack.md`, `memory-bank/standards/image-handling.md`
- **Summary**: Because the budget is a hard $0 ceiling, exceeding a verified free-tier limit must fail loudly and visibly rather than degrade silently. Uploads are refused before exceeding the Blob storage quota, warnings fire at 70% and 90%, no paid service or plan upgrade may occur without explicit owner approval, and Vercel's over-limit behavior is a project pause rather than a charge.
- **Read when**: implementing quota checks, upload rejection, monitoring, alerting, or any code path that would trigger a Vercel resource limit.

ADR-5: One construction step per turn, verified locally before the next step
- **Status**: accepted
- **Date**: 2026-10-25
- **Bolt**: n/a — owner protocol, applies to all bolts
- **Path**: `memory-bank/standards/construction-protocol.md`, `puku.md`
- **Summary**: The owner reviews and clicks through every increment of FindBack before the next one is built, so each bolt stage is completed, verified locally (lint, test, build, and a live `npm run dev` smoke test of the behaviour that step added), reported, and then held for explicit owner confirmation. Local verification runs against a Docker PostgreSQL container rather than the host cluster, which is not accessible to this user. The dev server is intentionally left running after Implement and Test steps. Vercel Blob and email paths are verified by automated test only and are always reported as not manually click-tested. The step granularity adds to, and never relaxes, the SpecsMD bolt stage checkpoints.
- **Read when**: starting any bolt, implementing any stage, running any verification, or deciding whether a step may be reported as complete.

ADR-6: Enforce append-only audit in the database, with a transaction-scoped flag for the single FR-10 deletion path
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 001-audit-core (audit-and-observability)
- **Path**: `memory-bank/bolts/001-audit-core/adr-6-fr10-audit-deletion-flag.md`
- **Summary**: FR-31 requires an append-only trail with no deletion mechanism, while FR-10 requires the trail to be removed with an interaction-free `Open` report. Append-only is enforced by a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `audit_events` (plus an insert-only repository interface and a single writer at the application layer), and the single permitted deletion is gated by a transaction-scoped `SET LOCAL findback.allow_audit_delete = 'on'` flag that only the FR-10 hard-delete path sets, after the FR-10 eligibility check passes. `SET LOCAL` is used rather than `SET` because pooled connections must carry no residue between requests. No soft-delete column, retention job, or pruning path exists.
- **Read when**: writing or reviewing any code that inserts, updates, or deletes audit rows, implementing the FR-10 hard delete, changing the audit schema or its migrations, adding a cleanup or retention job, or reviewing database-level access controls on the audit tables.

ADR-7: Record the audit-trail read in its own transaction, and treat a failed read record as a logged observability gap rather than a failed read
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 002-audit-reads (audit-and-observability)
- **Path**: `memory-bank/bolts/002-audit-reads/adr-7-audit-read-record-durability.md`
- **Summary**: PRD §10 requires a trail read to be recorded so the access pattern is reviewable, and Vercel Hobby retains runtime logs for only 1 hour, so the record goes to the `audit_read_logs` table. The record is written **after** the trail query succeeds, in **its own short transaction** — never before the query (a record of an access that did not happen is worse than a missing one) and never inside the query's transaction (a read has no transaction to join). A failed record write **does not fail the read** — the administrator asked to see the trail and can see it, mirroring PRD §10's email rule — and is retried inline up to 3 attempts, only for transient failures (P2034 deadlock, connection loss); the retry is idempotent because the record's id is generated once and the primary key rejects the duplicate. There is no durable queue, because Hobby cron fires once per day with ±59 min drift, so a queued read would be unreviewable for up to ~24 hours.
- **Read when**: implementing the audit read path, writing the read record, adding any retry or queue mechanism to a background write, changing the read-log schema, or deciding what happens when a secondary record of a successful action fails.

ADR-8: Enforce the administrator check before the trail query, and keep the trail read contextual
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 002-audit-reads (audit-and-observability)
- **Path**: `memory-bank/bolts/002-audit-reads/adr-8-audit-read-authorization-and-scope.md`
- **Summary**: FR-32's administrator check runs in the application layer **before** the query, as a pre-query gate rather than a query filter, because a filter returns an empty result and would make "forbidden" indistinguishable from "empty" while leaking existence through the result count. The gate is the administrator flag **alone** — never relationship, since FR-32 forbids a reporter, claimant, responder, or owner gaining access by participation — and the role is server-derived, never client-asserted. A whole-trail read is **retained as a backend capability with no route, tile, link, or export**: the frozen constraints forbid a global audit *surface*, while the operational review the read log exists to support is real, so the capability is kept and the surface stays absent. If a whole-trail read is ever exposed through any surface, this ADR must be revisited and the capability is likely to be removed. Filters are exactly UX §17.3's three — action type, date range, actor — with no free-text filter and no sort control, and a refused read is logged to the operational log only, never to `audit_read_logs`.
- **Read when**: implementing or reviewing any audit read path, creating a route that reads the audit trail, changing the trail's filters or ordering, deciding who may see the trail, or adding a whole-trail or export capability.

ADR-9: Keep the FR-48 event catalog in the audit module, and let the firing modules call it
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-9-fr48-catalog-ownership.md`
- **Summary**: `system-architecture.md` assigns FR-48 to two modules — `recovery/` (FR-40..FR-48) and `audit/` (FR-31, FR-32, FR-48) — and the overlap is load-bearing, because three modules fire into the catalog: unit 004 fires events 15–20, 28, 29; unit 005 fires 21, 22, 24, 25, 26, 30; and unit 002 fires 23 and 27, since FR-11 (reporter withdrawal) is assigned to unit 002, not unit 004. Event 27 therefore has **two** firing units. The catalog lives in the `audit` module; the firing modules own the transitions and call it through a typed factory in `src/domain/audit/`. The factory owns each event's number, type, required field set, and the per-event rules (the determination pair on 18/19, the system-actor rule on 26–30, the batch completeness on 26/27); the firing module owns the business values and decides whether the transition happened. The dependency stays one-way — `recovery → audit`, `returns → audit`, `listings → audit` — and the `audit` module never evaluates FR-41's status machine. The guarantee is structural rather than conventional: a firing module cannot invent an event number, omit a required field, or write a determination without both halves of the pair.
- **Read when**: writing or reviewing any code that emits an FR-48 event (15–30), adding a new audit event type, changing the audit module's boundaries or its imports, deciding which module owns a catalog entry, or reviewing why event 27 is not defined twice.
ADR-10: Resolve the batch child-response set inside the transaction that performs the resolution, and treat the cross-module handoff as an explicit contract
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-10-batch-resolution-contract.md`
- **Summary**: FR-48 events 26 and 27 record, in one row, that many Recovery Responses reached a terminal status because their parent Lost report reached `Returned` or `Closed` — and that list **is** the trail's record of the reason for each terminal resolution. The set is knowable only by the module that performs the batch update, so it crosses a module boundary. The set is obtained from the batch update's own `UPDATE … RETURNING id, previous_status` clause, inside the same transaction as the audit inserts, so the list is a product of the write and cannot diverge from it, and each response's source status is captured atomically with the after-state. The `audit` module validates the set's **shape** (non-empty; every entry carrying an id and a prior status) and records it verbatim; it cannot verify correspondence, because the `recovery_responses` table belongs to unit 004. The guarantee is therefore stated as an **explicit contract** — the firing module owes that the set passed is the set the update returned, unmodified — and asserted in tests, rather than claimed as an enforced invariant. The alternative that would make it enforceable, a shared application-layer use case owning the update, the `RETURNING`, and the event together, is rejected and recorded: it would put a Recovery Response write in the audit module's application layer, making it a second implementation of FR-41's state machine, which `system-architecture.md` names as the single largest correctness risk in the system.
- **Read when**: implementing the Lost-side batch resolution (events 26, 27, 30), writing any code that resolves multiple Recovery Responses at once, changing how the `recovery_responses` table is updated, or reviewing why a wrong batch list could not be corrected after the fact.
ADR-11: Validate the determination pair against the report's actual owner, and refuse an event whose maker is not the owner
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-11-determination-owner-check.md`
- **Summary**: FR-48 events 18 and 19 carry two fields — `determined_by` (the Lost-report owner) and `recorded_by` (the acting administrator) — and FR-43 is emphatic that "the administrator does not independently decide that the item belongs to the owner". Two populated fields are not a mechanism on their own: a determination attributed to someone other than the owner is well-formed and would pass any presence or distinctness check, and it would be **permanently** wrong, because ADR-6's append-only trail has no correction path. The determination pair is therefore validated against the Lost report's own owner at event-build time, and an event whose maker is not the owner is refused with a fatal error that rolls back the transaction. The owner id is a server-side fact supplied by the firing module, never a request field, per the standard that roles are derived and never client-asserted. The check is about **roles**, not identity: `administrator` is a flag on an Account, so the same person may legitimately fill both halves in two capacities — the rule is that the maker is the report's owner, not that the two ids differ. The check is a shape check on the record's truth, not a workflow rule, so it does not import FR-41 or FR-42 and the module boundary ADR-9 establishes is preserved.
- **Read when**: writing or reviewing any determination path (events 18/19), changing how the determination-maker or recording-administrator is supplied, adding a way for an administrator to record a determination, or reviewing why a false determination cannot be corrected after the fact.
