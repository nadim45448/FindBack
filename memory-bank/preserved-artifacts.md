---
last_updated: 2026-10-23T11:28:55Z
total_decisions: 0
---

# Preserved Artifacts Index (BMAD → SpecsMD AI-DLC)

Pre-existing project work that SpecsMD AI-DLC **reuses** rather than regenerates.
Nothing listed here is modified by the migration. BMAD artifacts stay in their
original locations and their Git history is untouched.

## Frozen product definition

| Artifact | Path | Status | SpecsMD consumer |
|---|---|---|---|
| Product Brief | `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/brief.md` | `status: final` — frozen | Product direction. Never reopened. |
| PRD | `_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/prd.md` | `status: final` — frozen, authoritative for product behavior | Requirements source of truth (FR-1..FR-53). |
| Brief memlog | `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/.memlog.md` | decision history | Traceability / rationale lookup. |
| PRD memlog | `_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/.memlog.md` | decision history | Traceability / rationale lookup. |

## UX design package

| Artifact | Path | Status | SpecsMD consumer |
|---|---|---|---|
| EXPERIENCE.md | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md` | `status: revision` (see Finalization below) | `standards/ux-guide.md` reference; FR→surface traceability §24.1 |
| DESIGN.md | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md` | `status: final` | Design system; brand tokens referenced by `{path.to.token}` |
| UX memlog | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/.memlog.md` | 9 dated correction passes | Traceability of every UX change. |
| validation-report.md | same dir | pass 1 + 2026-09-16 addendum | UX quality gate evidence |
| pass3-validation-report.md | same dir | 2026-09-06 | UX quality gate evidence |
| review-accessibility.md | same dir | WCAG 2.1 AA confidence: Strong | Accessibility NFR evidence |
| review-rubric.md | same dir | review lens | UX quality gate evidence |
| Prototype | `_bmad-output/.../ux-FindBack-2026-08-29/mockups/` (42 HTML + assets) | interactive prototype | Visual reference only — **manual acceptance deferred**; not modified by migration |

## Project documentation

| Artifact | Path | Note |
|---|---|---|
| Baseline project brief | `docs/baseline-project-brief.md` | BMAD input seed, superseded by the frozen Brief |
| Design process placeholders | `design-process/{A,B,C,D}-*/.gitkeep` | Empty scaffolding, no work to migrate |
| Theme toggle plan | `plans/theme-toggle-icon-popover.md` | Implemented prototype change; no pending product work |

## Explicit non-migrations

- **Prototype** is never modified or accepted by this migration.
- **No application source exists** — the repository holds documentation and mockups
  only. Construction has a greenfield code surface, not a brownfield one.

---

## UX Finalization Assessment

`EXPERIENCE.md` carries `status: revision`, set during the 2026-09-16 correction pass
and deliberately held there pending **manual prototype review**.

**Finding:** the open item is not a documentation defect.

| Signal | Evidence |
|---|---|
| All 43 corrections vs. final PRD resolved | `.memlog.md` 2026-09-16 entry; EXPERIENCE.md §24.7 |
| Reconciliation against frozen Brief + PRD complete | `.memlog.md` 2026-09-17 entry |
| No open UX contradictions | EXPERIENCE.md §24.7 — "All other UX recommendations stay within the PRD's existing rules" |
| FR-1..FR-53 all covered | EXPERIENCE.md §24.1 (53 rows) |
| Validation gate passed | validation-report.md "Strong"; pass3 "ready for Architecture handoff"; accessibility "Strong" |
| Remaining blockers | Only UX-OQ-A/B/C — all explicitly non-blocking, all Architecture-owned or future-scope |

**Recommendation:** flip `EXPERIENCE.md` to `status: final` for **documentation
purposes only**, recorded as a documentation-finalization action, not as prototype
acceptance. The prototype's manual acceptance stays deferred and is never claimed.

**This requires explicit user approval** — it edits a BMAD artifact and is recorded
as a pending migration item, not performed silently.