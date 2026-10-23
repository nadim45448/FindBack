---
standard: ux-guide
status: active
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
source_of_truth:
  behavior: _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md
  visual: _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md
---

# UX Guide (pointer standard)

**FindBack's UX is already specified and frozen.** This standard does not restate
it. It tells Construction where the contract lives and which parts bind.

## Binding sources

| Concern | Source | Status |
|---|---|---|
| Information architecture, behavior, states, interaction, accessibility, journeys | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md` | `status: revision` — content reconciled to frozen Brief + PRD; see finalization note below |
| Visual identity: color, type, spacing, elevation, shapes, components, logo, motion | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md` | `status: final` |
| Accessibility judgment (WCAG 2.1 AA confidence: **Strong**) | `.../review-accessibility.md` | final |
| UX quality gates | `.../validation-report.md`, `.../pass3-validation-report.md`, `.../review-rubric.md` | final |
| UX decision history | `.../.memlog.md` | 9 dated correction passes |

**Spine precedence:** `EXPERIENCE.md` and `DESIGN.md` win over any mockup,
wireframe, or import. Tokens referenced from `EXPERIENCE.md` use
`{path.to.token}` syntax resolved against `DESIGN.md`.

## Surfaces Construction must implement

| Audience | Surfaces | Source |
|---|---|---|
| Anonymous / auth flow | Landing, login, register (+ errors), register confirmation, pending / rejected / deactivated, forgot-password (+ sent) | `EXPERIENCE.md` §16, §9.1, §9.3, §9.3a; 10 pages under `mockups/public/` |
| Active Member | 4 disjoint views: **My Reports**, **Browse**, **My Claims**, **My Recovery Responses** | `EXPERIENCE.md` §3.1, §9.4, §9.4a; `mockups/member/` |
| Administrator | 4 operational queues: **Pending Registrations**, **Pending Claims**, **Items Awaiting Return**, **Items in Verification** | `EXPERIENCE.md` §15; `mockups/admin/` |
| Cross-cutting | Audit trail, **contextual only** (`/admin/items/:id/audit`, `/admin/lost/:id/audit`) — there is **no** global `/admin/audit` route and audit is not a fifth queue | `EXPERIENCE.md` §9.5, §15.1, §17 |

## Rules that bind generated code

1. **FR-39 visibility is a 7-column relationship model** — Anonymous, Unrelated
   member, Found-report owner, Claimant, Recovery responder, Lost-report owner,
   Administrator (`EXPERIENCE.md` §11.1). Visibility never unlocks as a side
   effect of submitting a Claim or Recovery Response (§11.4).
2. **Status vocabulary is canonical.** 8 Recovery Response statuses with `Standby`
   as a **derived display condition only** (§4.6). Report and Claim status labels
   are locked identically to the PRD glossary (§4.2).
3. **Per-Recovery-Response threads are separate threads**, never one per Lost
   report; competing responders cannot see each other's threads (§13.4, FR-47, D6).
4. **Owner-determines / Administrator-records wording** has approved and forbidden
   phrasings; do not paraphrase (§4.7).
5. **Forms validate after submit, not on first render**; errors carry text + icon,
   never color alone; `role="alert"` summaries; `aria-invalid` / `aria-describedby`
   toggled in lockstep (§5.3, §5.4, `pass3-validation-report.md` §1).
6. **Accessibility floor (§20):** WCAG 2.1 AA — 44×44 touch targets, keyboard
   reach, reduced motion, semantic table structure, `aria-expanded` disclosures.
7. **Theme:** light + dark, token-driven, resolvable to System/Light/Dark
   (`DESIGN.md` → Theme switching; `EXPERIENCE.md` §19).

## Prototype status

`_bmad-output/.../mockups/` is a **reference**, not an acceptance gate.

- Manual prototype acceptance is **deferred**. This workflow never claims it passed.
- The prototype is **not modified** by this workflow.

## Finalization note

`EXPERIENCE.md` carries `status: revision`, held during the 2026-09-16 correction
pass pending manual prototype review. All 43 PRD corrections and the 2026-09-17
Brief/PRD reconciliation are complete (`.memlog.md`; `EXPERIENCE.md` §24.7); FR-1..FR-53
are all covered (§24.1). Flipping to `status: final` is a **documentation**
finalization and requires explicit user approval — it does not constitute, imply, or
substitute for prototype acceptance.