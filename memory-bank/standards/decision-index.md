---
last_updated: 2026-10-23T12:05:00Z
total_decisions: 4
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