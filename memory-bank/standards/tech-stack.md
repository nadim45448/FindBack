---
standard: tech-stack
status: approved
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
decided_by: user
budget: $0 hard ceiling
---

# Tech Stack

## Overview

FindBack is a single-tenant, server-rendered Next.js application on Vercel Hobby,
backed by a free-tier PostgreSQL and private object storage. The stack is chosen so
that the entire system runs inside verified free-tier allowances at expected load,
with no paid service and no automatic upgrade.

## Languages

| | |
|---|---|
| **TypeScript** (strict) | Application, API routes, tests, tooling |

Type safety matters more here than usual: the FR-41/FR-42/FR-45 lifecycle transitions
and the FR-17 atomic approval are state-machine-heavy, and exhaustiveness checks on
status unions catch illegal transitions at compile time.

## Framework

| | |
|---|---|
| **Next.js App Router** | React Server Components + Server Actions / Route Handlers |

Server rendering satisfies PRD §10's ≤ 2 s p95 initial-HTML NFR. One deployable
unit. Runtime: Node.js (Fluid Compute).

**Compatibility check against Hobby:** Next.js is explicitly named in Vercel docs as
the framework that bundles dynamic code into "the fewest number of Vercel Functions
possible," so the 12-function Hobby ceiling is **not** a constraint here. Verified.

## Authentication

| | |
|---|---|
| **Self-hosted email + password**, revocable **server-side sessions** in PostgreSQL | No external IdP (Brief: out of scope) |

- Adaptive password hashing (algorithm + work factors = Architecture decision, PRD §10)
- Sessions are rows, not JWTs, so deactivation (FR-5), logout (FR-4), and password
  reset (FR-51) can revoke server-side. This is what PRD A2 requires.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`; CSRF token on every
  state-changing request (PRD §10).
- `__Host-` cookie prefix to bind the cookie to the deployment origin.

## Infrastructure & Deployment

| Concern | Choice |
|---|---|
| Hosting | **Vercel Hobby** |
| Database | **PostgreSQL** (free tier, pooled connection) |
| Object storage | **Vercel Blob — Private store** |
| Email | SMTP relay on a free tier; provider = Architecture (PRD A6) |
| CI/CD | Vercel Git integration — PR → Preview, merge to `main` → Production |
| Regions | Blob region must match the database region (one region; cannot change later) |

## Package Manager

**npm** (user-decided).

> Note: the SpecsMD `tech-stack.guide.md` default-recommends pnpm. npm is used
> because it was explicitly chosen. This is a deliberate deviation from the
> framework's suggestion, not an oversight.

## Verified free-tier limits

| Resource | Hobby allowance | FindBack headroom |
|---|---|---|
| Vercel Functions invocations | 1M / month | Single-tenant org traffic fits |
| Active CPU | 4 hrs / month | Low — server-rendered, mostly I/O wait |
| Provisioned memory | 360 GB-hrs / month | Low |
| Fast Data Transfer | 100 GB / month | Low for image-light product |
| Fast Origin Transfer | 10 GB / month | **Tightest constraint — see below** |
| Blob storage | **1 GB / month** | **Binding — see quota section** |
| Blob Simple Operations | 10K / month | Metadata + cache-miss reads |
| Blob Advanced Operations | 2K / month | Uploads, copies, lists |
| Blob Data Transfer | 10 GB / month | Image delivery |
| Deployments | 100 / day | Fine |
| Build time | 45 min | Fine |
| Cron jobs | **100 jobs, once per day, ±59 min** | **Restricts scheduled work — see below** |
| Runtime logs | **1 hour** | **Requires external log shipping — see below** |
| Neon (free) storage | 1 GB per project | Adequate for one org |
| Neon (free) compute | 100 CU-hrs / month, scales to zero after 5 min idle | Adequate |

## Blockers and adaptations these limits force

### B1 — Blob free tier is 1 GB, so images must be budgeted

**The PRD's 5 MB × unlimited-reports image allowance cannot be met within $0.**
There is no product change here — the PRD field stays JPEG/PNG/WebP ≤ 5 MB. What
changes is that **storage must be actively managed**:

- Blob usage is metered as a monthly **average** of 15-minute snapshots, so the
  plan is: enforce a per-deployment quota, monitor it, and delete blobs on hard
  delete (FR-10), which the PRD already requires.
- Approvals that would cross the quota must be **refused and surfaced**, never
  silently accepted. This is an operational guard, not a product rule.
- OQ-2 (image budget and cleanup policy) is therefore **answered in part here**:
  cleanup happens synchronously with FR-10 hard delete, and the remaining question
  — the per-deployment byte budget — is an Operations configuration value.

### B2 — Fast Origin Transfer is 10 GB/month and private images are expensive to serve

Serving a private blob streams it **through a Function**, which draws Fast Origin
Transfer on cache miss **plus** Fast Data Transfer on the response. Mitigation is
architectural, not configurational:

- Upload images with a **long CDN cache max-age** (default 1 month) so repeat views
  are cache hits and draw neither charge.
- Use **immutable pathnames** (`addRandomSuffix`) so an image is never overwritten;
  FR-53 image replacement uploads a new blob rather than mutating one. This also
  sidesteps the documented 60-second cache-propagation window.
- Set `Cache-Control: private, no-cache` on the serving route so the browser
  revalidates and auth runs on every request. **Never** set `s-maxage` on a private
  image response — a CDN-cached private response is a data leak.

### B3 — Runtime logs live for 1 hour on Hobby

PRD §10 requires that application logs carry request ID, actor ID, action, and
target ID, and that **audit-trail reads are themselves logged**. A 1-hour window
cannot satisfy "reviewable". Resolution: **the audit trail itself is the durable
record in PostgreSQL** (FR-31/FR-32, append-only); platform runtime logs are
diagnostic only and are not the compliance artifact. Log any request that reads the
audit trail so it lands in the database, not only in stdout.

### B4 — Hobby cron runs once per day with ±59 minutes of drift

Any scheduled FindBack work (reset-token expiry sweep, stale-token cleanup) must
tolerate a ±1-hour fire window and must be **idempotent**. No workflow may depend on
cron precision — email is sent on the user action, never on a schedule (FR-27/28/29,
FR-46 events fire synchronously).

### B5 — Hobby is non-commercial

Vercel's Hobby plan is restricted to **personal, non-commercial use**. FindBack is
production-intended and is deployed **per organization**. This is a licensing
constraint on the hosting choice, not a code constraint. Deployment to a
multi-tenant public instance on Hobby is not permitted; Hobby is appropriate only
for single-organization, non-commercial deployments.

## Cost guardrails (non-negotiable, $0 ceiling)

- **No paid service may be added without explicit user approval.**
- No automatic plan upgrades. Vercel Hobby **pauses** a project when free-tier
  limits are exceeded — it does not bill — so the failure mode is downtime, not cost.
  This is the desired behavior for a $0 ceiling and must be confirmed with the user.
- Quota monitoring is a required deliverable, not an optimization: storage bytes,
  Blob operations, function invocations, and database size all report against
  documented thresholds before they are hit.

## Decision relationships

- **Transactional correctness** (FR-17 atomic approval; FR-42/FR-45 verification
  transitions) is why PostgreSQL is non-negotiable and why multi-step transitions run
  inside explicit transactions with row-level locking.
- **Revocable sessions** (PRD A2) are why sessions are database rows, not JWTs.
- **$0 ceiling** is why images are private-blob-streamed rather than public, and why
  the CDN cache is used aggressively.
- **Single-tenant** is why a pooled connection and a single region suffice.

## Out of scope for this standard

Provider selection for SMTP, the exact hashing algorithm and work factors, the audit
storage topology, and the campus-area enum configuration mechanism are Architecture
decisions recorded in `system-architecture.md` when that standard is written.