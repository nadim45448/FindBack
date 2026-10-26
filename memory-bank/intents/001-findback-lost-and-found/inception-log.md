---
intent: 001-findback-lost-and-found
phase: inception
status: complete
created: 2026-10-23T11:28:55Z
completed: 2026-10-23T13:25:00Z
---

# Inception Log: 001-findback-lost-and-found

## Overview

**Intent**: Build FindBack, a production single-tenant Lost & Found management
system, through SpecsMD AI-DLC.
**Type**: brown-field *methodology* migration (green-field code, frozen product
definition). No application source exists in the repository.
**Created**: 2026-10-23
**Origin**: BMAD-MMM 6.11.0 project carried over intact; see
`memory-bank/migration-assessment.md`.

## Inception checkpoints

| Checkpoint | Purpose | Status |
|---|---|---|
| 0 | Project init (standards) | ✅ **complete** — 6 standards owner-approved, 4 ADRs recorded |
| 1 | Clarifying questions | ✅ **satisfied by frozen PRD** — not re-asked |
| 2 | Requirements review | ✅ **satisfied at Checkpoint 3** |
| 3 | Artifacts review (context + units + stories + bolts) | ✅ **owner-approved 2026-10-23** |
| 4 | Ready for Construction | ✅ **owner-approved 2026-10-26** |

## Artifacts

| Artifact | Status | File |
|---|---|---|
| Project config | ✅ | `memory-bank/project.yaml` |
| Migration assessment | ✅ | `memory-bank/migration-assessment.md` |
| Preserved-artifact index | ✅ | `memory-bank/preserved-artifacts.md` |
| Requirements (adapter) | ✅ | `memory-bank/intents/001-findback-lost-and-found/requirements.md` |
| System Context | ✅ | `memory-bank/intents/001-findback-lost-and-found/system-context.md` |
| UX Guide standard | ✅ | `memory-bank/standards/ux-guide.md` |
| Tech Stack standard | ✅ **owner-approved** | `memory-bank/standards/tech-stack.md` |
| Image Handling standard | ✅ **owner-approved** | `memory-bank/standards/image-handling.md` |
| Data Stack standard | ✅ **owner-approved** | `memory-bank/standards/data-stack.md` |
| Coding Standards | ✅ **owner-approved** | `memory-bank/standards/coding-standards.md` |
| System Architecture | ✅ **owner-approved** | `memory-bank/standards/system-architecture.md` |
| Decision Index | ✅ 4 ADRs | `memory-bank/standards/decision-index.md` |
| Units | ✅ **7 units · 53/53 FRs assigned** | `units.md` + `units/*/unit-brief.md` |
| Stories | ✅ **63 stories · 53/53 FRs traced** | `units/*/stories/*.md` + `memory-bank/story-index.md` |
| Bolt Plan | ✅ **23 bolts · 11 waves** | `memory-bank/bolts/*/bolt.md` |
| Construction Protocol | ✅ **owner-mandated 2026-10-25** | `memory-bank/standards/construction-protocol.md` + `puku.md` |

## Summary so far

| Metric | Count |
|---|---|
| Functional requirements indexed | 53 (FR-1..FR-53) |
| Non-functional requirement classes | 6 (PRD §10) |
| Product invariants carried | 8 |
| Actors identified | 9 (6 human, 3 external) |
| Project standards approved | 6 of 6 |
| Architecture decisions recorded | 4 (ADR-1..ADR-4) |
| Units defined | 7 |
| Stories created | 63 |
| Bolts planned | 23 |

## Decision log

| Date | Decision | Rationale | Approved |
|---|---|---|---|
| 2026-10-23 | Reuse the frozen PRD as the normative requirements source; `requirements.md` becomes an index, not a restatement | Restating 53 frozen FRs creates a second source of truth that will drift | Pending user review |
| 2026-10-23 | Reuse PRD FR identifiers verbatim; no SpecsMD-local renumbering | FR IDs are cross-referenced by `EXPERIENCE.md` §24.1, PRD memlog, and audit events | Pending user review |
| 2026-10-23 | Locate the memory bank at repo root (`memory-bank/`) | `.specsmd/` is gitignored; the workflow record must be versioned | Pending user review |
| 2026-10-23 | Treat Checkpoint 1 as already satisfied by the frozen PRD | Re-asking settled product decisions would reopen frozen scope | Pending user review |
| 2026-10-23 | Exclude the prototype from all migration edits; never claim manual acceptance | Per project constraint; prototype acceptance is deferred | Pending user review |
| 2026-10-23 | Hold all implementation, deployment, and construction work behind explicit approval | Per project constraint | Pending user review |
| 2026-10-23 | Block `tech-stack` on user input rather than inferring a stack | No technology choice appears anywhere in the repository; PRD §9 reserves these for Architecture | Superseded by the decisions below |
| 2026-10-23 | **TypeScript + Next.js App Router + PostgreSQL + Prisma, on Vercel Hobby, npm** | Owner-selected stack. Server rendering meets the ≤ 2 s p95 NFR; Vercel docs confirm Next.js bundles into the fewest Functions, so Hobby's 12-function limit does not bind | ✅ **Yes** |
| 2026-10-23 | **Budget is a hard $0 ceiling** — no paid service, no automatic upgrade | Owner constraint | ✅ **Yes** |
| 2026-10-23 | **Vercel Blob Private Storage** for images, with FR-39 authorization enforced server-side on every read | FR-37/FR-39 mark images Sensitive Fields; private store access mode is immutable after creation | ✅ **Yes** |
| 2026-10-23 | **Quota enforcement refuses rather than degrades**; Vercel's over-limit behavior is a pause, not a charge | Correct failure mode for a $0 ceiling | ✅ **Yes** — *pause behavior to be confirmed by owner* |
| 2026-10-23 | Record Vercel Hobby's **non-commercial restriction** as a licensing constraint | Hobby is licensed for personal, non-commercial use; FindBack is production-intended | ✅ **Yes** — flagged, not blocking |
| 2026-10-23 | Image validation is server-side with magic-byte sniffing; no automated moderation | PRD A3 states image moderation is administrator review only; automated scanning would expand frozen scope | ✅ **Yes** |

## Scope changes

None. The frozen PRD is the scope. No feature has been added, removed, or altered
by this migration.

## Ready for construction

- [x] Frozen product definition located and confirmed authoritative
- [x] Requirements index created over the frozen PRD
- [x] System context derived
- [x] Project standards complete (tech-stack, data-stack, coding-standards, system-architecture, ux-guide, image-handling)
- [x] System architecture standard reviewed and approved by owner
- [ ] System context approved by user
- [x] Units decomposed — 7 units, 53/53 FRs assigned, dependency graph has no cycles
- [x] Stories created for all units — 63 stories, all `draft`, 53/53 FRs traced
- [x] Bolts planned — 23 bolts, 63/63 stories assigned, 11 execution waves, no cycles
- [x] Human review complete — Checkpoint 3 approved 2026-10-23; Checkpoint 4 approved 2026-10-26

## Next steps

1. **Bolt `001-audit-core`, Stage 2 — Technical Design.** Stage 1 (Domain Model) completed 2026-10-26; awaiting owner confirmation to proceed.
2. `/specsmd-construction-agent --bolt-id="001-audit-core" --stage="design"`


Construction runs **one bolt stage per turn** under
`memory-bank/standards/construction-protocol.md`: complete the stage, verify it
locally, report, then stop and wait for owner confirmation before the next
stage.

### Construction protocol decisions

| ID | Decision |
|---|---|
| CP-1 | One bolt stage per turn, with owner confirmation between stages |
| CP-2 | Local verification uses a Docker PostgreSQL container, not the host cluster |
| CP-3 | The dev server is left running after Implement/Test steps for owner inspection |
| CP-4 | Blob and email paths are verified by automated test only, and reported as such |

## Bolt plan

23 bolts in a **global** sequence, 11 execution waves. Unit order is enforced by
bolt dependencies, not convention.

| Wave | Bolts |
|---|---|
| 1 | 001-audit-core |
| 2 | 002-audit-reads, 003-audit-lost-side-events, 004-identity-core |
| 3 | 005-identity-security, 006-reporting-visibility |
| 4 | 007-reporting-core |
| 5 | 008-reporting-lifecycle, 009-reporting-search, 010-reporting-images, 011-lost-status-model, 013-claim-submit |
| 6 | 012-web-public, 015-lost-response-submit, 016-claim-decisions |
| 7 | 014-web-threads, 017-lost-lifecycle-determination, 023-claim-threads-notifications |
| 8 | 018-lost-threads, 019-returns-closeout |
| 9 | 020-returns-moderation |
| 10 | 021-web-admin |
| 11 | 022-web-audit-accessibility |

**Ordering decisions recorded for owner review:**
1. **Bolt 001 is audit, not identity.** Every unit writes through the audit trail, so
   building it first is what makes completeness structural rather than retrospective.
2. **Bolt 006 (visibility) precedes report creation.** The projection is a pure
   function of actor and report, so it can be built against fixtures and inherited
   by every later read path.
3. **Bolt 011 (Lost status model) precedes response submission.** The 8-status
   machine constrains the submit, selection, determination, and closeout bolts
   rather than each inventing a transition.
4. **Accessibility is the final bolt, not a parallel one.** It is a property of
   every surface built before it.

## Unit breakdown

| Unit | FRs owned | Stories | Bolt type |
|---|---|---|---|
| `001-identity-and-access` | 8 | 10 | DDD |
| `002-reporting-and-listings` | 16 | 13 | DDD |
| `003-found-side-claims` | 8 | 8 | DDD |
| `004-lost-side-recovery` | 7 | 8 | DDD |
| `005-returns-and-handover` | 7 | 7 | DDD |
| `006-audit-and-observability` | 2 | 6 | DDD |
| `007-web-surfaces` | 5 | 11 | Simple |

Dependency order: `001 → 002 → {003, 004} → 005`, with `006` written to by all of
them, and `007` built last.

## Deferred, not blocked

| Item | Owner | Note |
|---|---|---|
| OQ-1 campus-area enum configuration | Architecture | Blocks the deployment-configuration story only |
| OQ-2 image budget + cleanup on hard delete | **Partly resolved** | Cleanup-on-hard-delete is now specified in `image-handling.md` §4; the per-deployment byte quota remains an Operations config value |
| UX-OQ-B claim-state freshness under concurrent review | Architecture | |
| UX-OQ-C audit pagination shape | Architecture | `EXPERIENCE.md` §23 uses "load 25 + Load older" |
| `EXPERIENCE.md` `status: revision` → `final` | User | Documentation finalization only; **not** prototype acceptance |
| Manual prototype acceptance | User | Deferred; never claimed by this workflow |