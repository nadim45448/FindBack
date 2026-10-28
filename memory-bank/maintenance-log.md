# Maintenance Log

Records automated changes applied to memory-bank artifacts (status syncs,
validation fixes, migrations) so the workflow state has an audit trail of its own.

---

## 2026-10-23T11:28:55Z — BMAD → SpecsMD AI-DLC migration

**Triggered by**: `/specsmd-master-agent` analyze-context, then migration assessment

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/project.yaml` | created | SpecsMD project config absent; SpecsMD routes uninitialized projects to `project-init` |
| `memory-bank/migration-assessment.md` | created | BMAD→SpecsMD stage map required before any new work |
| `memory-bank/preserved-artifacts.md` | created | Index of reused BMAD work with reuse decisions and UX finalization assessment |
| `memory-bank/intents/001-findback-lost-and-found/requirements.md` | created | SpecsMD-native requirements **index** over the frozen PRD; PRD stays normative |
| `memory-bank/intents/001-findback-lost-and-found/system-context.md` | created | Derived from frozen PRD §1/§2.2/§3; no new product facts |
| `memory-bank/intents/001-findback-lost-and-found/inception-log.md` | created | Inception progress + migration decision log |
| `memory-bank/standards/ux-guide.md` | created | Reuses DESIGN.md + EXPERIENCE.md by pointer instead of duplicating them |

**Artifacts deliberately not modified:** anything under `_bmad-output/` — the frozen
Brief, the frozen PRD, all UX spines, all validation reports, the memlogs, and the
prototype. Git history preserved; the working tree was clean before and after apart
from these new files.

**Blocked pending user input:** `standards/tech-stack.md` (and everything depending
on it: data-stack, coding-standards, system-architecture, unit decomposition). No
technology choice exists anywhere in the repository, and PRD §9 reserves these
decisions for Architecture.

---

## 2026-10-23T12:05:00Z — Project standards authored from owner-approved stack

**Triggered by**: owner supplied constraints at the project-init checkpoint
(npm · Vercel Hobby · Vercel Blob Private · $0 hard ceiling · keep TypeScript,
Next.js App Router, PostgreSQL, Prisma)

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/standards/tech-stack.md` | created | Owner-approved stack with verified free-tier limits and the adaptations they force |
| `memory-bank/standards/image-handling.md` | created | Owner asked for secure image validation, authorization, private access, quota monitoring, and failure handling |
| `memory-bank/standards/data-stack.md` | created | PostgreSQL + Prisma; transaction rules for FR-17 and FR-45 |
| `memory-bank/standards/coding-standards.md` | created | Formatting, linting, naming, structure, testing posture, error handling, logging |
| `memory-bank/standards/system-architecture.md` | created (**draft**) | Architecture structure; awaits owner review |
| `memory-bank/standards/decision-index.md` | created | ADR-1..ADR-4 record the stack, image, persistence, and quota decisions |
| `memory-bank/intents/.../inception-log.md` | updated | Checkpoint 0 complete; decision log and metrics updated |

**Verified against vendor docs (2026-10-23):** Vercel Hobby included usage, Blob
limits (1 GB storage / 10K simple ops / 2K advanced ops / 10 GB transfer), private
storage delivery model and cache guidance, cron daily-only limit, runtime log
1-hour retention, Functions file-descriptor and duration limits, Neon free tier.

**Flagged to owner, not silently resolved:**
1. Vercel Hobby is licensed for **personal, non-commercial use**. FindBack is
   production-intended. This is a licensing constraint on the hosting choice.
2. Blob free tier is **1 GB**, so the PRD's unbounded-image model needs enforced
   quotas. No product change was made; the quota is an operational guard.
3. Hobby runtime logs persist **1 hour**, so the durable audit-read record must be
   written to the database rather than stdout.
4. Hobby cron runs **once per day with ±59 min drift**; scheduled work must be
   idempotent and must not gate any workflow.
5. Vercel Hobby **pauses** a project on limit breach rather than billing — desired
   for a $0 ceiling, pending owner confirmation.

**Artifacts still unmodified:** everything under `_bmad-output/`, including the
frozen Brief, frozen PRD, UX spines, and the prototype.

---

## 2026-10-23T12:58:00Z — Stories authored for all seven units

**Triggered by**: owner approved the unit decomposition and selected option A
(write 004/005 directly, delegate 006/007)

| Artifact | Action | Reason |
|---|---|---|
| `units/001-identity-and-access/stories/*.md` (10) | created | Root unit — `ActorContext`, account lifecycle |
| `units/002-reporting-and-listings/stories/*.md` (13) | created | FR-39 visibility projection is this unit's core |
| `units/003-found-side-claims/stories/*.md` (8) | created | Found-side state machine |
| `units/004-lost-side-recovery/stories/*.md` (8) | created | Lost-side 8-status machine, written directly |
| `units/005-returns-and-handover/stories/*.md` (7) | created | The single Confirm Returned implementation |
| `units/006-audit-and-observability/stories/*.md` (6) | created | Written directly after the delegated attempt failed |
| `units/007-web-surfaces/stories/*.md` (11) | created | Frontend realization of the frozen UX spines |
| `memory-bank/story-index.md` | created | Single-file global index, per `memory-bank.yaml` `story-index.mode` |
| `units/*/unit-brief.md` | Story Summary appended | Required by the `story-create` skill |
| `inception-log.md` | updated | Stories complete; Bolt Plan is next |

**Verification performed (programmatic):** 63 story files; 53 of 53 FRs traced;
zero ownership violations; zero malformed frontmatter; every story traces to at
least one FR either as owner or as realizer.

**Defects found and corrected during this stage:**

1. **Unit 007 claimed 9 FRs it does not own.** The delegated writer put a
   *representative* FR into `traces_to` on frontend stories, which broke the
   no-double-ownership rule established at decomposition. Seven frontend stories
   now carry `traces_to: []` with a new `realizes_fr:` key, so ownership stays
   with the domain unit while the link to what the story implements is preserved.
2. **Unit 006 produced no files.** The delegated worker reported research complete
   but wrote nothing; its directory was empty. The six stories were written
   directly instead.
3. **Three delegated workers for Units 004/005 timed out twice** at 15 minutes
   without producing output. Unit 004 and 005 were then written directly.

**Judgment call recorded for owner review:** `realizes_fr` is a new frontmatter
key introduced in Unit 007. It is not in the SpecsMD story template. It exists
because a frontend unit legitimately implements requirements owned by a backend
unit, and forcing those into `traces_to` would have created duplicate ownership.
If the owner prefers, these can be folded back into `traces_to` with a convention
that only the five genuinely-owned FRs appear there.

**Not claimed:** manual prototype acceptance. It remains deferred and is never
asserted as passed by this workflow.

---

## 2026-10-23T13:18:00Z — Bolt plan authored

**Triggered by**: owner approved the stories stage and selected option A

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/bolts/001-audit-core/bolt.md` | created | Audit substrate first — every unit writes through it |
| `002-audit-reads/`, `003-audit-lost-side-events/` | created | Trail read path; FR-48 event catalog |
| `004-identity-core/`, `005-identity-security/` | created | Account lifecycle; security and profile |
| `006-reporting-visibility/` | created | FR-39 projection before any read path exists |
| `007-reporting-core/`, `008-reporting-lifecycle/`, `009-reporting-search/`, `010-reporting-images/` | created | Report aggregate, lifecycle, search, images |
| `011-lost-status-model/` | created | 8-status machine before anything transitions it |
| `012-web-public/`, `014-web-threads/`, `021-web-admin/`, `022-web-audit-accessibility/` | created | Four frontend bolts |
| `013-claim-submit/`, `016-claim-decisions/`, `023-claim-threads-notifications/` | created | Found-side workflow |
| `015-lost-response-submit/`, `017-lost-lifecycle-determination/`, `018-lost-threads/` | created | Lost-side workflow |
| `019-returns-closeout/`, `020-returns-moderation/` | created | The single Confirm Returned implementation |
| `inception-log.md` | updated | Bolt plan section, waves, ordering rationale |

**Verification performed (programmatic):** 23 bolts; 63 of 63 stories assigned to
exactly one bolt; every bolt's stories belong to its own unit; bolt type matches
the unit's `default_bolt_type`; all required frontmatter present; dependency
references resolve; `enables` links are reciprocal with `requires`; no cycles;
11 execution waves computed.

**Defects found and corrected:**

1. **Two Unit 003 stories had no bolt.** `007-per-claim-message-thread` and
   `008-claim-notification-emails` were omitted. Both derive from claim status,
   so they were placed in a new bolt 023 requiring 016-claim-decisions rather than
   being forced into an existing one.
2. **Two invented bolt IDs.** `020-web-profile` and `013-web-member` were referenced
   as `enables` targets but never created. Removed.
3. **Two broken dependency links.** Bolt 003 enabled 018 without 018 requiring it;
   bolt 018 enabled 021 without 021 requiring it. Both repaired.

**Judgment calls recorded for owner review:**

1. **Bolt 001 is the audit substrate, not identity.** The build starts with a unit
   that depends on nothing, because retrofitting audit after six other units are
   written would mean every state change in the system was built without it.
2. **Bolt 006 (visibility) precedes report creation (bolt 007).** The projection is
   a pure function of actor and report, so it can be built and verified against
   fixtures, and every later read path inherits it.
3. **Bolt 011 (Lost status model) precedes response submission (bolt 015).** The
   8-status machine constrains the four bolts that transition it rather than each
   inventing its own transitions.
4. **Four single-story bolts** (002, 010, 011 paired, 022). Each isolates either a
   privacy boundary, a performance budget, or a cross-cutting property that cannot
   be verified in isolation from its neighbours.

**Not claimed:** no bolt has started. Every story remains `status: draft`, and no
bolt has been executed, tested, or verified.

---

## 2026-10-23T12:35:00Z — Unit decomposition authored

**Triggered by**: owner approved the architecture standard and selected option A
(proceed to unit decomposition)

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/standards/system-architecture.md` | status → approved | Owner review passed |
| `memory-bank/intents/.../units.md` | created | 7 units; FR→unit mapping; dependency graph |
| `.../units/001-identity-and-access/unit-brief.md` | created | 8 FRs — root unit, produces `ActorContext` |
| `.../units/002-reporting-and-listings/unit-brief.md` | created | 16 FRs — owns the FR-39 visibility projection |
| `.../units/003-found-side-claims/unit-brief.md` | created | 8 FRs — Found-side state machine |
| `.../units/004-lost-side-recovery/unit-brief.md` | created | 7 FRs — Lost-side state machine, deliberately separate |
| `.../units/005-returns-and-handover/unit-brief.md` | created | 7 FRs — the single Confirm Returned implementation |
| `.../units/006-audit-and-observability/unit-brief.md` | created | 2 FRs — depends on nothing; all units write to it |
| `.../units/007-web-surfaces/unit-brief.md` | created | 5 owned FRs; realizes all remaining user-facing FRs |
| `.../inception-log.md` | updated | Checkpoint 0 complete; unit breakdown recorded |

**Verification performed:** FR coverage checked programmatically — 53 of 53 FRs
assigned, no gaps, no duplicates, and the per-unit summary lists were corrected to
match the mapping table (four discrepancies found and fixed: FR-5 duplicated in
Unit 1, FR-50 misplaced between Units 4 and 7, FR-45 and FR-50 missing from the
Unit 5 and Unit 7 summaries, and dependency lines referencing non-existent units
`007`/`008`).

**Judgment calls recorded for owner review:**
1. **FR-45 split across Units 4 and 5** — Unit 4 owns the verification *determination*;
   Unit 5 owns the *return*. Confirm Returned must have exactly one implementation.
2. **Unit 7 owns only 5 FRs** but realizes every user-facing FR. Requirements are
   owned by their domain unit; the frontend renders them. No FR has two owners.
3. **Units are not independently deployable.** They are one modular monolith, a
   deliberate consequence of the $0 Vercel Hobby constraint. They remain
   independently buildable and testable.
4. **Unit 6 is built early** even though it depends on nothing, because every other
   unit writes through it — retrofitting audit afterwards would mean every state
   change in the system was built without it.

---

## 2026-10-28T14:45:00Z — Bolt `004-identity-core` closed

**Triggered by**: `/specsmd-master-agent` — owner approval of the Stage 5 checkpoint

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/004-identity-core/bolt.md` | `in-progress` | `complete` | All 5 stages complete, all 7 success criteria ticked, all 6 stories `implemented` |
| `.../units/001-identity-and-access/unit-brief.md` | `ready` | `in-progress` | Unit has a bolt in progress (`005-identity-security`) |
| `.../units/006-audit-and-observability/unit-brief.md` | `ready` | `complete` | All 3 of its bolts (001, 002, 003) are complete and all 6 of its stories are `implemented` — a pre-existing inconsistency surfaced by this close |

**Verification re-run at close time** against the working tree, not read from the
test report: typecheck exit 0 · lint exit 0 · **605/605 tests across 47 files** ·
production build exit 0 with all six identity routes registered.

**The suite is 605 rather than the report's 604** because of the `rejectAccount()`
defect fixed during bolt `005`'s Stage 1 (`deactivatedAt` was set on a
*rejected* account). The fix landed before this bolt closed, so the closed bolt
contains no known defect.

**Items carried forward** (none blocks the close): the story 003 criterion 2 /
PRD FR-4 conflict remains the owner's to amend; ADR-16's deferred-failure refresh
branch is untested and belongs to bolt `005`; the Vercel runtime must be set to
Node 24 (ADR-12) and cannot be set from the repository. Two owner follow-ups
remain owed in `system-architecture.md` (FR-27 module map, per ADR-14) and the
unit brief's Integration Points row (per ADR-15).

---
## 2026-10-28T08:49:36.396Z - Status Sync

**Triggered by**: status-integrity script

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/001-append-only-audit-writes.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/003-non-numbered-audit-records.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/004-append-only-enforcement.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/006-operational-logging-and-quota.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/005-audit-visibility-and-read-logging.md | implemented | complete, implemented: true | Bolt 002-audit-reads is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/002-lost-side-audit-events.md | implemented | complete, implemented: true | Bolt 003-audit-lost-side-events is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/001-self-registration.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/002-administrator-review-of-registrations.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/003-login-with-active-account.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/005-logout-revokes-session.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/006-pending-member-restricted-access.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/007-owner-rejects-registration.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/unit-brief.md | ready | stories-defined | Unit has 5 bolts (0/5 complete) |
| intents/001-findback-lost-and-found/units/003-found-side-claims/unit-brief.md | ready | stories-defined | Unit has 3 bolts (0/3 complete) |
| intents/001-findback-lost-and-found/units/004-lost-side-recovery/unit-brief.md | ready | stories-defined | Unit has 4 bolts (0/4 complete) |
| intents/001-findback-lost-and-found/units/005-returns-and-handover/unit-brief.md | ready | stories-defined | Unit has 2 bolts (0/2 complete) |
| intents/001-findback-lost-and-found/units/007-web-surfaces/unit-brief.md | ready | stories-defined | Unit has 4 bolts (0/4 complete) |
| intents/001-findback-lost-and-found/requirements.md | inception-complete | construction | Intent has 7 units (1/7 complete) |

---
