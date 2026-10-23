---
standard: data-stack
status: approved
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
depends_on: tech-stack
---

# Data Stack

## Overview

All FindBack state lives in one PostgreSQL database. The domain is strongly
relational and, more importantly, **transaction-heavy**: the PRD requires atomic
Claim approval (FR-17) and multi-entity lifecycle transitions (FR-41, FR-42, FR-45)
that must either complete fully or not at all. Relational integrity and real
transactions are the reason this choice is not negotiable.

## Database

**PostgreSQL**, free tier, single-region, accessed through a pooled connection.

| Property | Value |
|---|---|
| Engine | PostgreSQL (Neon free tier or equivalent) |
| Storage | 1 GB per project |
| Compute | 100 CU-hours/month, scales to zero after 5 minutes idle |
| Access | Pooled connection string (serverless driver) — **not** a direct connection |
| Multi-region | No — Hobby plan is single-region |

### Why PostgreSQL

1. **Transactions are a product requirement.** FR-17 requires that approving one
   Claim atomically rejects competing Pending Claims and moves the report status.
   FR-45 requires that Confirm Returned atomically transitions the Lost report,
   the selected Recovery Response, and every other non-terminal Recovery Response.
   These must not partially apply.
2. **The audit trail is relational and append-only.** FR-31/FR-48 events attach to
   parent entities and are retained for the parent's lifetime. Foreign keys with
   appropriate cascade rules express the retention policy directly.
3. **FR-14 search** over 10,000 active reports with keyword, category, location,
   date, type, and status filters is well served by indexed relational queries.
4. **FR-49's four disjoint views** (My Reports / Browse / My Claims / My Recovery
   Responses) are set operations over indexed foreign keys.

### Connection handling

Serverless Functions open connections constantly, and the Vercel Functions limit
caps file descriptors at **1,024 shared across concurrent executions**. Therefore:

- **Always** use the pooled connection string. A direct connection will exhaust
  descriptors under concurrency.
- Set a conservative per-request connection timeout.
- Keep transactions short — especially the audit-write transactions, which must not
  hold locks while an email send is attempted (PRD §10: email failure must never
  block the action).

## ORM / Database Client

**Prisma**, schema-first, with raw SQL where Prisma's abstraction would be wrong.

### Why Prisma

- Type-safe schema that keeps database status unions in sync with the TypeScript
  unions used in the FR-41/FR-42 state machines.
- First-class Next.js integration and migration tooling.
- `@prisma/adapter-*` / driver adapters work against a pooled serverless connection.

### Where raw SQL is required

Not everything should go through the ORM:

- **`SELECT ... FOR UPDATE`** on a Found report before Claim approval, and on a Lost
  report before a verification transition. This is the mechanism that makes FR-17
  and FR-45 atomic under concurrent administrators. Prisma's interactive
  transactions plus raw SQL locking statements are used together.
- **Audit queries** for the trail view (FR-31) — reverse-chronological pagination,
  25 rows per page per `EXPERIENCE.md` §17.
- **FR-14 search** with filters combined — index-backed SQL, not an ORM abstraction.

### Concurrency rules

| Rule | Reason |
|---|---|
| Every multi-row lifecycle transition runs in **one transaction** | FR-17, FR-45 |
| Lock the parent report row before deciding | Prevents two administrators deciding the same Claim concurrently |
| Audit rows are written **inside** the same transaction as the state change | An audit entry for a transition that did not happen is a defect |
| Status is constrained at the database level (`CHECK` / enum) | Defence in depth for FR-41's canonical statuses |
| `Standby` is **never** persisted | FR-41, D7 — it is derived at render time only |

## Schema outline

The full model is authored in the first DDD construction bolt (`ddd-01-domain-model`).
The shape is fixed by the frozen PRD and its glossary:

- **Account** — lifecycle state (`Pending` / `Active` / `Rejected` / `Deactivated`),
  administrator flag, password hash, display name, self-declared role
- **Session** — revocable row keyed to an Account, with inactivity expiry (A2)
- **PasswordResetToken** — single-use, time-limited, hashed (FR-51)
- **Report** — Lost or Found, FR-8 field set, lifecycle status, reporter
- **Claim** — status (`Pending` / `Approved` / `Rejected`), parent Found report
- **RecoveryResponse** — one of the 8 canonical FR-41 statuses, parent Lost report
- **ThreadMessage** — polymorphic parent: either a Claim (FR-26) or a Recovery
  Response (FR-47). **One thread per Recovery Response, never per Lost report.**
- **AuditEvent** — append-only; FR-31 events 1–14 and FR-48 events 15–30, plus
  non-numbered FR-52 profile-edit and FR-53 report-edit records
- **AuditReadLog** — PRD §10: audit-trail reads are themselves logged
- **CampusArea** — the fixed per-deployment enum (FR-8, OQ-1)

## Retention (PRD §10 — fixed, not negotiable)

| Data | Rule |
|---|---|
| Reports, Claims, Recovery Responses, threads, audit entries | Retained for the parent report's lifetime |
| Hard delete | **Only** interaction-free `Open` reports — Found with no Claim, Lost with no Recovery Response (FR-10) |
| Withdrawal | Transitions to `Closed`; responses resolve; **nothing** is hard-deleted |
| `Returned` / `Closed` | Nothing is ever hard-deleted; history preserved indefinitely |
| Accounts | Retained indefinitely, including after deactivation (FR-5) |

Cascade behaviour must be implemented as **explicit deletes inside the FR-10
transaction**, not as an unqualified `ON DELETE CASCADE`, so that image blobs are
released at the same moment (see `image-handling.md` §4).

## Decision relationships

- PostgreSQL because FR-17 and FR-45 demand real atomicity, not because of scale.
- Prisma because the status unions are the core domain invariant and must be
  type-checked end to end.
- Pooled connections because serverless file descriptors are capped at 1,024.
- Audit inside the transaction because PRD §10 makes the trail reconstructable.
- Single-region because Hobby is single-region and FindBack is single-tenant.