---
intent: 001-findback-lost-and-found
phase: inception
status: draft
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
---

# Migration Assessment: BMAD → SpecsMD AI-DLC (FindBack)

**Date:** 2026-10-23 · **Branch:** `main` @ `73c203b` · **Working tree:** clean
**Methodology change:** BMAD-MMM 6.11.0 → SpecsMD AI-DLC 0.1.74

---

## 1. Existing work discovered

| # | Artifact | Path | State |
|---|---|---|---|
| 1 | Product Brief | `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/brief.md` | `status: final` — frozen, 237 lines, updated 2026-09-16 |
| 2 | PRD | `_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/prd.md` | `status: final` — frozen, **1650 lines / 190 KB**, revision 2026-09-17 |
| 3 | UX spine — behavior | `.../ux-FindBack-2026-08-29/EXPERIENCE.md` | 1925 lines / 176 KB, `status: revision` |
| 4 | UX spine — visual | `.../ux-FindBack-2026-08-29/DESIGN.md` | 877 lines / 40 KB, `status: final` |
| 5 | UX validation ×2 | `validation-report.md`, `pass3-validation-report.md` | both "Strong" |
| 6 | UX accessibility review | `review-accessibility.md` | WCAG 2.1 AA confidence **Strong** |
| 7 | UX review rubric | `review-rubric.md` | lens definition |
| 8 | UX decision memlog | `.../ux-FindBack-2026-08-29/.memlog.md` | 501 lines, **9 dated correction passes** |
| 9 | Interactive prototype | `.../mockups/` | 42 HTML pages + 8 asset modules, journey-tests.js 12/12 PASS |
| 10 | Baseline brief | `docs/baseline-project-brief.md` | BMAD input seed, superseded by frozen Brief |
| 11 | Prototype change plan | `plans/theme-toggle-icon-popover.md` | implemented, no pending product work |

**Product definition inside the PRD:** FR-1…FR-53 (53 functional requirements), UJ-1…UJ-5
(5 user journeys), D1…D8 (PRD-author decisions), A1…A6 (assumptions), OQ-1…OQ-5 (open
questions), audit events 1–30 (FR-31 events 1–14 + FR-48 events 15–30), 5 non-goal /
scope sections, cross-cutting NFRs.

**Not present:** no application source code, no `package.json`, no database, no CI,
no `memory-bank/` directory. This is a **greenfield code surface** carrying a
**frozen product definition**.

---

## 2. BMAD → SpecsMD stage map

SpecsMD AI-DLC order: `project-init → inception (requirements → context → units →
stories → bolt-plan → review) → construction → operations`.

| SpecsMD stage | Required artifact | Existing BMAD evidence | Satisfies? | Action |
|---|---|---|---|---|
| **project-init** | `memory-bank/project.yaml` | BMAD config (`_bmad/bmm/config.yaml`), full-stack web app per Brief | **No** (SpecsMD-native file absent) | **Create** from frozen product definition |
| **project-init** | `standards/tech-stack.md` | — none — | **No** | **Genuine gap** → Architecture |
| **project-init** | `standards/coding-standards.md` | — none — | **No** | **Genuine gap** → Architecture |
| **project-init** | `standards/data-stack.md` | — none — | **No** | **Genuine gap** → Architecture |
| **project-init** | `standards/ux-guide.md` (optional) | **DESIGN.md + EXPERIENCE.md** + accessibility review | **Yes** | **Reuse** — pointer file, no duplication |
| **project-init** | `standards/system-architecture.md` (optional) | — none — | **No** | Target of the current stage |
| **inception / requirements** | `{intent}/requirements.md` | **PRD §4 (FR-1..FR-53) + §10 NFRs + §8 OQ + §9 A1–A6 + §11 principles** | **Content yes, format no** | **Adapter**: index that references the frozen PRD as normative; never restate requirements |
| **inception / context** | `{intent}/system-context.md` | PRD §2.2 non-users, §3 glossary, §1 vision; Brief §Who This Serves | **Partially** | **Derive** actors/external systems; no new product facts |
| **inception / units** | `{intent}/units.md` + `units/*/unit-brief.md` | — none — | **No** | **Genuine gap** → Architecture/Construction planning |
| **inception / stories** | `units/*/stories/*.md` | — none — (EXPERIENCE.md §8 holds journeys, not stories) | **No** | **Genuine gap** → after units |
| **inception / bolt-plan** | `memory-bank/bolts/*/bolt.md` | — none — | **No** | **Genuine gap** → after stories |
| **construction** | `ddd-01-domain-model.md`, `ddd-02-technical-design.md`, code, tests | — none — | **No** | Blocked; needs explicit user approval |
| **operations** | build/deploy/monitor | — none — | **No** | Out of scope per instruction |

---

## 3. Reuse vs. genuine gap

**Reused as-is (referenced, not copied):**
- Frozen Brief → product direction
- Frozen PRD → authoritative requirements (FR-1..FR-53) and all acceptance semantics
- `EXPERIENCE.md` → interaction/IA/accessibility contract + FR→surface traceability §24.1
- `DESIGN.md` → design system tokens
- UX validation + accessibility reports → NFR/accessibility evidence
- UX memlog + PRD memlog → decision rationale

**Genuine gaps (must be authored):**
1. `project.yaml` — project type + migration provenance
2. `requirements.md` — SpecsMD-native **adapter** (format only, zero product restatement)
3. `system-context.md` — actors, external systems, data flows
4. `standards/ux-guide.md` — pointer to the frozen UX spines
5. `standards/tech-stack.md` — languages, framework, auth, infrastructure, package manager
6. `standards/coding-standards.md` — formatting, linting, naming, structure, testing, errors, logging
7. `standards/data-stack.md` — database + ORM
8. `standards/system-architecture.md` — architecture style, API design, state, caching, security
9. `units.md` + unit briefs — bounded-context decomposition
10. Stories, bolt plan — after units

---

## 4. Incompatibilities resolved by adaptation

| SpecsMD expectation | Conflict | Resolution |
|---|---|---|
| `requirements.md` re-states FRs in template shape (`Description` / `Acceptance Criteria` / `Priority`) | Restating 53 frozen FRs risks silent drift and would create a second source of truth | `requirements.md` becomes a **reference index**: FR ID → PRD section anchor → UX surface → unit slot. PRD stays normative. |
| SpecsMD FR numbering restarts per intent | PRD FR-1..FR-53 is global and cross-referenced by UX §24.1 and memlogs | Reuse **PRD identifiers verbatim**; no renumbering. |
| SpecsMD `project-init` is a conversational standards interview | Tech-stack answers do not exist anywhere in the repo | Cannot be inferred → must be asked. |
| Inception `requirements` skill opens with Checkpoint 1 clarifying questions | Answers are already frozen in the PRD | **Checkpoint 1 satisfied by PRD.** Not re-asked. |
| Inception `review` skill ends with "Ready for Construction?" | Instruction forbids implementation without approval | Checkpoint 4 is a hard stop; approval is the user's alone. |
| Prototype is BMAD-owned under `_bmad-output/` | Construction prototype skill could touch it | Migration **excludes** the prototype from all edits; manual acceptance stays deferred. |
| `.specsmd/` is gitignored | Memory bank is the durable workflow record | `memory-bank/` sits at repo root, tracked, distinct from ignored `.specsmd/`. |

---

## 5. Proposed next stage and why

**Next stage: `project-init` → `tech-stack`, then `data-stack`, `coding-standards`,
`system-architecture`, `ux-guide`.**

Why this and not Architecture directly:

- SpecsMD routes an uninitialized project to `project-init`. `memory-bank/` did not
  exist; standards are the gate the master agent checks.
- The PRD's frozen NFRs (session revocation, rate-limit surface, API-layer field
  redaction, non-guessable image URLs, search p95, audit-read logging, retention)
  are **architecture-owned and explicitly unprescribed** by the PRD (§9 A2, A5, A6;
  FR-51 "Architecture-owned implementation details"). They cannot be derived.
- `units.md` decomposition depends on `project_type` and the tech stack; stories
  depend on units. Skipping standards breaks the documented dependency order
  (`tech-stack → coding-standards → system-architecture`).

**Tech-stack decisions genuinely requiring your input** (absent from the repo):
language, framework/runtime, database, auth/session mechanism, hosting/deployment,
package manager. Everything else — including all product behavior — is frozen and
will not be re-litigated.

---

## 6. Files created by this migration

| File | Purpose |
|---|---|
| `memory-bank/project.yaml` | SpecsMD project config + migration provenance |
| `memory-bank/preserved-artifacts.md` | Index of BMAD work reused, with links + UX finalization assessment |
| `memory-bank/migration-assessment.md` | This document |
| `memory-bank/intents/001-findback-lost-and-found/requirements.md` | SpecsMD requirements adapter over the frozen PRD |
| `memory-bank/intents/001-findback-lost-and-found/inception-log.md` | Inception progress + migration decision log |
| `memory-bank/standards/ux-guide.md` | Pointer standard reusing DESIGN.md + EXPERIENCE.md |

**Not created, by design:** no duplicate Brief, no duplicate PRD, no restated FRs,
no modified BMAD artifact, no prototype change, no application code.

---

## 7. Constraints carried forward

Frozen PRD is authoritative for product behavior. Preserved without modification:
Found Claim and Lost Recovery Response lifecycles · owner-controlled match/not-match
determinations · atomic Claim approval with rejection of competing pending Claims ·
Verification Pending behavior and permitted transitions · role permissions and privacy
boundaries · messaging and read-only rules · exactly eight workflow/business email
events (password-reset email is separate and is **not** a ninth) · audit history and
events 1–30 · account deactivation and session revocation · fixed retention rules ·
the four existing Admin queues · FR-52 profile-editing rules · FR-53 administrator
report-editing rules.

**Deferred and never claimed:** manual prototype acceptance.
**Not permitted without explicit approval:** implementing features, modifying
application source, deploying, entering construction or operations work.