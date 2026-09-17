# Validation Report — FindBack

- **DESIGN.md:** `./DESIGN.md`
- **EXPERIENCE.md:** `./EXPERIENCE.md`
- **Run at:** 2026-08-29
- **Last updated:** 2026-09-16 (targeted correction pass — see addendum at end)

## Overall verdict

**Strong.** The spine pair is fit to ship as the contract for downstream Architecture and Story-Dev consumers. Every PRD requirement (FR-1..FR-39), user journey (UJ-1..UJ-4), and PRD-author decision (D1..D4) is realized in the spines with named protagonists, numbered steps, climax beats, and the load-bearing failure paths. The accessibility reviewer's AA-confidence rating ("Adequate, trending Strong") has been resolved to **Strong** by the application of both HIGH-severity fixes (semantic soft-fill toast text rule, pagination/icon-only buttons height) and the medium-severity ARIA wiring commitments (audit-trail row labels, toast role rule, message-thread live region, character-counter aria-live, field aria-describedby, audit-trail table structure with aria-expanded disclosures, grid pattern on admin tables, skip-to-content destination). Inheritance is disciplined: PRD identifiers are reused verbatim, status labels are locked identically across both files and the PRD glossary, and there is no source restatement.

## Category verdicts

- Flow coverage — **strong**
- Token completeness — **strong** (low-severity path normalization resolved)
- Component coverage — **strong**
- State coverage — **strong**
- Visual reference coverage — **adequate** (empty mockups/ and wireframes/; spines are the contract, mocks optional)
- Bloat & overspecification — **strong**
- Inheritance discipline — **strong**
- Shape fit — **strong**

## AA conformance confidence

**Strong.** Both load-bearing AA failures identified by the accessibility lens (semantic soft-fill text contrast, 36 px pagination chip) have been resolved in the spine. The remaining contrast "failures" (focus-ring on `surface-dim`, disabled-text on `disabled-bg`) are explicitly exempt under WCAG 1.4.3 or meet the non-text 3:1 floor under 1.4.11. All keyboard, screen-reader ARIA, reduced-motion, and form-pattern commitments are now anchored to specific ARIA attributes and DOM structures — not gestured at — so downstream implementation can build AA-conformant code without guessing.

## Findings by severity

### Critical (0)

None.

### High (0 — resolved)

- **Finding A3 — semantic soft-fill text contrast.** Resolved by adding the "Soft-fill alert body text rule (load-bearing)" paragraph to `DESIGN.md → Color contrast & safety` and restating it in `EXPERIENCE.md §5.7`. Toast and alert body text now commits to `colors.{theme}.on-background` on the soft fill, keeping AA on every semantic variant regardless of which fg token drives the icon and heading.
- **Finding C1 — pagination 36 px touch target.** Resolved by raising pagination to 44 px bounding-box height (visible pill remains 36 px; the button's interactive bounding box extends via padding to clear the PRD NFR). Added explicit `Icon-only button` section in `DESIGN.md → Components` committing 44 × 44 with a 20 px centered icon, covering close, theme toggle, and pagination chevrons.

### Medium (0 — resolved)

- **Finding B2 — status icon redundant cue.** Resolved: `EXPERIENCE.md §5.7` and `DESIGN.md → Status colors → Color-blind safety note` now state that status icons render in the icon-color token and that color-blind users distinguish by icon **shape** and text label.
- **Finding D2 — skip-to-content destination.** Resolved: `EXPERIENCE.md §20.1` commits `<main id="main" tabindex="-1">` as the destination.
- **Finding D3 — admin queue table keyboard pattern.** Resolved: `EXPERIENCE.md §20.1` commits the ARIA grid pattern (`role="grid"` / `row` / `gridcell`) with roving `tabindex` and arrow-key row navigation.
- **Finding E2 — audit-trail row aria-label template.** Resolved: `EXPERIENCE.md §20.3` and `§17.4` commit the row-level `aria-label` template.
- **Finding E3 — toast role decision rule.** Resolved: `EXPERIENCE.md §20.3` commits "successful non-blocking actions → `role="status"` (polite); validation or session errors → `role="alert"` (assertive)."
- **Finding E4 — message thread live region.** Resolved: `EXPERIENCE.md §20.3` commits `aria-live="polite"` on the message list.
- **Finding F2 — drag-active under reduced motion.** Resolved: `EXPERIENCE.md §20.6` lists drag-active in the non-essential transitions list and commits an instant state swap under reduced motion.
- **Finding G2 — character counter aria-live.** Resolved: `EXPERIENCE.md §5.2` and `§20.3` commit `aria-live="polite"` on the counter.
- **Finding G3 — field aria-describedby binding.** Resolved: `EXPERIENCE.md §20.3` commits that helper text and error text share the same `id` so the association is preserved on validation failure.
- **Finding H2 — sensitive-field transition announcement.** Resolved: `EXPERIENCE.md §20.3` commits a one-time `aria-live="polite"` on the affected section.
- **Finding I1 — audit trail table structure.** Resolved: `EXPERIENCE.md §20.7` commits `<table>` with `<th scope="col">` and per-row `aria-label`.
- **Finding I2 — audit detail-expansion aria-expanded.** Resolved: `EXPERIENCE.md §20.7` commits `<button aria-expanded="false" aria-controls="audit-event-{id}">` pattern.

### Low (applied where cheap)

- Token path normalization (rubric 2.1, 2.2) — resolved: EXPERIENCE.md's non-canonical `{color.surface.card}`, `{radius.lg}`, `{color.status.report.open}`, etc. updated to canonical YAML-key paths.
- Status label reconciliation (rubric 7) — resolved: `DESIGN.md → Status colors` now cites "Verbatim from PRD §3" with the explicit status set.
- Headline mobile variants (rubric 2.4) — resolved: `headline-lg-mobile` and `headline-md-mobile` added to `DESIGN.md → Typography`.
- Touch target inconsistency (C2) — resolved: button `height-md` raised to 44 px (also resolves C1's sister finding).
- Title-case inconsistency (rubric mechanical notes) — resolved: both files now use `title: "DESIGN.md — FindBack"` / `EXPERIENCE.md — FindBack"`.
- §24 traceability rubric-walker preamble — resolved: section opens with "This section is also the rubric walker Pass 1 reference."
- Font-weight mapping (low rubric finding) — left as inline on each token (acceptable; no fix needed).
- Mockups folder acknowledgment (low rubric finding) — already explicit in DESIGN.md Cross-reference and EXPERIENCE.md §26.4.

## Reviewer files

- `review-rubric.md` — rubric walker Pass 1 + Pass 2 (Flow, Token, Component, State, Visual reference, Bloat, Inheritance, Shape fit).
- `review-accessibility.md` — accessibility lens (Color contrast, Non-color state, Touch targets, Keyboard, Screen readers, Reduced motion, Forms, Sensitive UX, Audit trail).

---

## Addendum — Targeted correction pass, 2026-09-16

**Scope.** EXPERIENCE.md and the prototype were re-reconciled against the final PRD. Spines preserved (visual direction, branding, color system, dark mode, accessibility commitments). EXPERIENCE.md `status` reverted to `revision` pending manual prototype review.

**Resolved (43 numbered corrections).**

- **UJ-1 ending corrected.** Maya's Lost report cleanup is now an explicit manual reporter Withdraw action. There is no automatic Lost↔Found linking; Claim success does not auto-close Maya's separate Lost report. `My Reports` contains only reports Maya authored; `My Claims` contains Claims against others' Found reports.
- **UJ-2 Claim privacy corrected.** The finder / Found-report owner no longer sees claimant reason or identifying details. The finder knows that a Claim exists and can use the per-Claim thread, but the claimant's private evidence is visible only to the claimant and Administrators.
- **UJ-3 registration-rejection email removed.** Account approval still emails (FR-27); rejected registrations do not email — the user surfaces via the neutral login-screen inactive-account message. §9.3 / §16.2 / §16.4 reflect this.
- **UJ-4 corrected to four Administrator queues** (Pending Registrations, Pending Claims, Items Awaiting Return, Items in Verification) including Lost-side Items in Verification. Audit is cross-cutting, not a fifth queue.
- **UJ-5 replaced with canonical Maya / Sam / Pat / Riley flow.** Maya (owner) selects the Recovery Response via `My Reports → Review Responses`; the Lost report moves to `Verification Pending`. Riley (Administrator) records `Match Confirmed` or `Not a Match` (Administrator-records). Quinn is preserved as Edge Case G only.
- **Lost-side email events** (§13.7) now explicitly enumerate FR-46 Events 4–8. Event 4 fires on every RR submission (not "no email yet"); Event 5 fires only to the selected responder; Event 6 fires only to the rejected responder; Event 7 fires to the Lost-report owner on Returned; Event 8 fires to the matched responder on `Completed — Report Returned`.
- **Visibility matrix** (§11.1) keeps the FR-39 7-column model. §11.4 removes the misleading "+ now visible to you" affordance — submitting a Claim or RR does not leak Sensitive Fields.
- **Per-Claim thread read-only** (§13.5) remains at Approved / Rejected / Returned / Closed (canonical).
- **Per-RR thread read-only** (§13.5b) added: thread is read-only when the RR reaches a terminal canonical status OR the parent Lost report is `Returned`/`Closed`.
- **§14.5 Lost-side Returned now fires FR-46 Events 7 + 8** (previously described as no-email).
- **§22.3 OQ-4, OQ-5, OQ-6 retired** as adopted UX recommendations. OQ-1 / OQ-2 / OQ-3 remain forwarded.
- **`mockups/assets/state.js`** corrections:
  - `selectRecoveryResponse` is **owner-only**; passing an admin id returns `null`. Audit action uses FR-48 Event 17.
  - `recordMatchDetermination` audit actions reference FR-48 Events 18 (Match Confirmed) / 19 (Not a Match) with `determinedBy` + `recordedBy`.
  - `confirmLostReturned` writes four audit events: FR-48 Event 30 (selected RR → Completed), Event 26 (standby RRs → Resolved), Event 21 (default receiver) / Event 22 (substitute receiver) for the Lost report Returned.
  - `withdrawRecoveryResponse` accepts both `Submitted` and `Selected for Verification`; releasing selection returns the parent Lost report to `Open`. Audit action references FR-48 Event 20.
- **`mockups/assets/admin-renderer.js`** corrections:
  - The administrator verification-review screen **no longer shows a `Select for verification` button**. That action is owner-only and lives in `21-review-responses.html`.
  - Wording tightened to `Record Match Confirmed (owner says it's theirs)` / `Record Not a Match (owner says it's not theirs)`.
- **`mockups/assets/detail-renderer.js`** corrections:
  - Lost-report owner sees a "Recovery Responses ({N})" section with a `Review responses` button when any RR exists, in any Lost-report status. Replaces the prior "Recovery Response in progress" notice.
- **New prototype page** `mockups/member/21-review-responses.html` — Lost-report owner's RR-review surface (UJ-5 step 5). Calls `selectRecoveryResponse(rrId, owner.id)`; state-layer guards reject non-owner actors.

**Counts.** 1 new HTML page added (21-review-responses.html). 4 prototype script edits. 1 EXPERIENCE.md frontmatter status revert + 1 large narrative replacement (UJ-1..UJ-5) + 1 new section (§13.7) + 1 new sub-section (§13.5b) + multiple targeted corrections (§9.4, §11.4, §12.2, §14.5, §22.3, §24.2, §24.4, §24.7).

**Status.** UX remains in `revision`. Architecture was **NOT** started in this pass; the next-step routing is held for the user's manual prototype review.