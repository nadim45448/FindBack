---
standard: system-architecture
status: approved
created: 2026-10-23T12:05:00Z
updated: 2026-10-23T12:25:00Z
depends_on: [tech-stack, data-stack, coding-standards, ux-guide]
intent: 001-findback-lost-and-found
approved_by: owner
---

# System Architecture

> **Approved 2026-10-23.** This standard records the architectural decisions
> SpecsMD requires at `project-init`. Detailed domain modelling (aggregates,
> entities, invariants) is authored in the first DDD construction bolt as
> `ddd-01-domain-model.md`; this document fixes the **structure** those artifacts
> must conform to.
>
> The frozen PRD governs product behavior. Nothing here changes it.

## Architecture style

**Monolith, layered, domain-driven, deployed as a single Next.js application.**

| Decision | Rationale |
|---|---|
| Modular monolith, not microservices | Single-tenant, one organization per deployment, $0 ceiling. Microservices on Hobby are not viable and would add cost with no benefit. |
| Hexagonal inside each module | `domain/` stays pure and testable; ports separate the lifecycle rules from Prisma, Blob, and email. |
| Two recovery flows modelled separately | FR-17 and FR-45 are different state machines over different entities. Sharing one is the single largest correctness risk in the system. |

### Module map

```text
src/domain/
├── accounts/     Account lifecycle, session, password reset   FR-1..FR-5, FR-51, FR-52
├── listings/     Report CRUD, search, visibility projection   FR-6..FR-14, FR-37..FR-39, FR-49, FR-53
├── claims/       Found-side Claim lifecycle                    FR-15..FR-18, FR-26, FR-28, FR-29
├── recovery/     Lost-side Recovery Response lifecycle        FR-40..FR-48
├── returns/      Returned confirmation, receiver substitution FR-23..FR-25
├── audit/        Append-only trail and audit-read logging      FR-31, FR-32, FR-48
├── moderation/   Close, remove content, administrator queues   FR-21, FR-33..FR-36, FR-50
└── notifications/ Eight workflow emails + reset message        FR-27..FR-30, FR-46
```

`claims` and `recovery` share no state machine. They share only the `returns` and
`audit` modules, and communicate through domain events, never by mutating each
other's entities.

## State machines

The PRD defines these exhaustively. They are pure functions in `domain/`; any
transition not listed is a defect that throws.

### Report status

```text
Found:  Open → Claim Requested → Claim Approved → Returned (terminal)
        Open | Claim Requested | Claim Approved → Closed (terminal)

Lost:   Open → Verification Pending → Returned (terminal)
        Open | Verification Pending → Closed (terminal)
```

### Recovery Response status (FR-41, canonical eight)

```text
Submitted ──select──► Selected for Verification ──not match──► Not a Match (terminal)
                            │
                     match confirmed  (non-terminal)
                            ▼
                     Match Confirmed ──report Returned──► Completed — Report Returned (terminal)

Any non-terminal ──report Returned (not the matched one)──► Resolved — Report Returned (terminal)
Any non-terminal ──report Closed──► Resolved — Report Closed (terminal)
Submitted (not selected) ──responder withdraws──► Withdrawn (terminal)
```

`Standby` is **never persisted**. It is derived at render time when a sibling is
`Selected for Verification` (FR-41, D7).

## API design

| | |
|---|---|
| Style | Route Handlers + Server Actions |
| Versioning | None — single consumer, single deployable |
| Response format | JSON for machine reads; server-rendered HTML for member surfaces |
| Error format | RFC 9457 problem details, with user-facing copy from `EXPERIENCE.md` §4.9 |
| Pagination | Cursor-based; audit trail loads 25 per page, reverse-chronological |

**API-layer enforcement is mandatory.** FR-39 visibility is applied in the
application layer on every read path. The UI is never the enforcement point.

## Authorization model

Roles are derived, never client-asserted: `Anonymous` → `Pending` / `Rejected` /
`Deactivated` → `Active Member`, with `administrator` as a flag on an Account
(PRD §3, not a separate role type).

Every use case resolves an **actor-scoped projection** of the entity before
returning it. The projection is built from the FR-39 matrix, so the sensitive set
(FR-37) is never loaded for an actor who may not see it — not filtered after the
fact, not hidden by CSS.

## Security and privacy

| Concern | Mechanism |
|---|---|
| Passwords | Adaptive hashing (Argon2id); work factors set in `infrastructure/auth` |
| Sessions | Revocable server-side rows; `__Host-` cookie, `HttpOnly`, `Secure`, `SameSite=Lax`; inactivity expiry |
| CSRF | Token on every state-changing request |
| Rate limits | Registration, login, Claim submit, RR submit, thread posting, password reset |
| Password reset | Single-use, time-limited, hashed token; anti-enumeration on response, timing, and screen state (FR-51) |
| Images | See `image-handling.md` — private store, auth adjacent to the read |
| Injection | Parameterized queries only |
| Audit | Append-only; no update or delete path exists in the code |
| Email | Failures logged, never block the triggering action (PRD §10) |

## Data model and persistence

Owned by `data-stack.md`. Key invariants enforced at the database layer:
`Standby` has no column; `Match Confirmed` is not terminal; terminal reports reject
all edits.

## Testing architecture

| Layer | Tool | Scope |
|---|---|---|
| Domain | Vitest | Pure state machines, exhaustive over every status transition |
| Application | Vitest | Use cases with port fakes |
| Infrastructure | Vitest | Prisma against a disposable database |
| Component | Vitest + Testing Library | Surfaces from `EXPERIENCE.md` |
| End-to-end | Playwright | UJ-1…UJ-5 as written in the PRD |

Floor: 80% lines, enforced in CI. The binding measure is FR coverage — every
FR-1…FR-53 has a test that fails if the requirement breaks.

## Deployment and CI/CD

| | |
|---|---|
| Branches | `main` is trunk; PRs get a Vercel preview |
| Gate | `tsc --noEmit`, ESLint, unit + integration tests, coverage floor — all before merge |
| Production | Merge to `main` deploys; production deploy is manually approved |
| Database | Pooled connection; migrations run in the deploy pipeline |
| Region | Blob region must match the database region; both are set once and cannot change |

**Cost guard:** no paid service or plan upgrade without explicit owner approval.
Over-limit behavior on Hobby is a project pause, not a charge.

## Observability

Structured logs with `requestId`, `actorId`, `action`, `targetId` (PRD §10). Audit
reads are logged **to the database**, because Vercel Hobby retains runtime logs for
only 1 hour and the PRD requires the pattern to be reviewable.

Quota monitoring reports Blob bytes, Blob operations, function invocations, and
database size against verified free-tier limits; warnings at 70% and 90%.

## Decisions carried into Construction

| # | Decision | Rationale |
|---|---|---|
| 1 | Two separate recovery state machines | FR-17 and FR-45 differ; merging them would break atomicity |
| 2 | Actor-scoped projections, not post-filtering | Keeps FR-37 data from being loaded at all |
| 3 | Audit written inside the state-change transaction | An audit entry for a transition that did not happen is a defect |
| 4 | Email sent after commit, never inside the transaction | PRD §10: email failure must not block the action |
| 5 | Terminal statuses immutable at the database layer | FR-9 and FR-53 both block edits |

## Open items for the first DDD bolt

- Aggregate boundaries and which entity owns each invariant
- The concurrency strategy for two administrators deciding the same Claim (UX-OQ-B)
- Audit query shape for 10,000 reports × 50 events within 1 s p95