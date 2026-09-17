# Spine Pair Review — FindBack

## Overall verdict

The spine pair is **strong overall** and is fit to ship as the contract for downstream Architecture and Story-Dev consumers. Every PRD UJ (UJ-1..UJ-4) is realized in EXPERIENCE.md §8 with a named protagonist, numbered steps, a climax beat, and the load-bearing failure paths (auto-rejection, concurrent-action conflict, no-receiver-no-returned guard). Every token referenced by `{path.to.token}` resolves in DESIGN.md, the visual identity is fully authored from first principles as the brief required, and every component surfaced in the prose has both a visual row in DESIGN.md and a behavioral row in EXPERIENCE.md. Inheritance is disciplined: PRD FR / UJ / decision identifiers are reused verbatim, the status label vocabulary is locked identically across both files and the PRD glossary, and there is no source restatement. Shape fit is correct — both spines follow canonical order, RESPONSIVE and THEME-SWITCHING are present because the form-factor triggers them, and INVENTED sections (e.g., competing-claims critical UX, executive PRD-traceability table) earn their place. Findings are concentrated in three places: contrast targets are stated for some pairs but not all load-bearing ones, some token references in EXPERIENCE.md use non-canonical paths that still resolve but warrant normalization for source-extraction tooling, and visual references (mockups/, wireframes/) exist empty.

## 1. Flow coverage — **strong**

**What was checked.** EXPERIENCE.md §8.1–§8.4 against PRD §2.3 UJ-1..UJ-4. Per-flow: named protagonist, numbered steps, climax beat, and a failure path where the PRD mandates one. Also: a per-UJ traceability matrix in EXPERIENCE.md §24.2 to make source-extraction exhaustive.

### Findings

- **none.** Each UJ has a single named protagonist (Maya, Sam, Alex, Riley) matching the PRD, fully numbered steps (UJ-1 = 13 steps, UJ-2 = 8, UJ-3 = 8, UJ-4 = 12), an explicit "Climax beat" paragraph, and the failure paths the PRD requires: UJ-3 step 7 "Rejected path" (FR-3, FR-4), UJ-4 step 5 "Compete case" (FR-17 / D3), UJ-4 step 7 "Concurrent-action edge" (D3 conflict handling), and the no-receiver guard (FR-25) covered in EXPERIENCE.md §14.4. The four narrative beat triplets (Path / Climax / Resolution) from the PRD are preserved verbatim in spirit; the Edge cases are distributed across the steps rather than fenced at the end, which is acceptable for a UX spine.

## 2. Token completeness — **strong**

**What was checked.** DESIGN.md YAML frontmatter (every key across `colors`, `typography`, `rounded`, `spacing`, `elevation`, `components`, `breakpoints`, `container`, `icon`, `logo`, `imagery`, `animation`, `scrollbar`) and every `{path.to.token}` reference inside EXPERIENCE.md prose. Where tokens use `{path}` (e.g., `{rounded.md}`, `{colors.light.border-default}`, `{brand.primary}`), each `path.to.token` resolves to a defined key.

### Findings

- **low — Token path normalization for extraction tooling.** EXPERIENCE.md uses `{color.surface.card}` and `{radius.lg}` (EXPERIENCE.md §5.5) and `{color.text.muted}` / `{color.text.warning}` (EXPERIENCE.md §5.2), but DESIGN.md has no `color.surface.card`, `radius`, or `color.text.muted` keys — the canonical paths are `{colors.light.surface}`, `{rounded.lg}`, and `{colors.light.on-surface-variant}` respectively. The intent is clear to a human reader, but a strict source-extraction tool that follows `{path.to.token}` would treat these as undefined. *Fix:* replace `{color.surface.card}` → `{colors.light.surface}`; `{radius.lg}` → `{rounded.lg}`; `{color.text.muted}` / `{color.text.warning}` → choose `{colors.light.on-surface-variant}` for muted and the warning semantic token for warning. (Locations: EXPERIENCE.md lines 264, 247, 247.)
- **low — Status-token path normalization.** EXPERIENCE.md §5.7 and §17.4 use shorthand like `{color.status.report.open}`. DESIGN.md defines the same tokens under `colors.status-report.open` and `status-claim.*` / `status-account.*`. The shorthand is consistent within the file but is not the YAML key. *Fix:* align EXPERIENCE.md status references to `{colors.status-report.open}` (and siblings) for downstream source-extraction tooling; if a `color.status.*` alias block is preferred, add one to DESIGN.md as the single source of truth.
- **low — Contrast targets stated for some pairs only.** DESIGN.md states the dark-theme focus-ring choice is `#FB923C` "for AA contrast" (line 422) but does not explicitly state numeric contrast ratios for the other load-bearing pairs the PRD NFR accessibility target must satisfy (`on-primary` on `brand.primary`, `on-success` on `semantic.success`, `on-error` on `semantic.error`, `disabled-text` on `disabled-bg`, light-theme status foregrounds on status soft fills). EXPERIENCE.md §20.2 names the AA ratios but they are not anchored to specific token pairs. *Fix:* add a Contrast Targets table in DESIGN.md anchoring ratios to specific token pairs (or rename the existing "Color-blind safety note" to "Color contrast & safety" and add the targets).
- **low — `display-lg` mobile variant exists but `headline-*` mobile variants do not.** Both are mobile-critical, and downstream frameworks often need them. *Fix:* add `headline-lg-mobile` and `headline-md-mobile` (or document the responsive sizing strategy in DESIGN.md → Typography).
- **low — `font-sans` lacks a numeric weight mapping.** DESIGN.md → Typography `Hierarchy` paragraph says "Two weights dominate (`400` for body, `600`/`700` for headings)" but no explicit `font-sans.weights` key. This is a judgment call — the weights are inline on each token. Acceptable; flag for awareness only.

## 3. Component coverage — **strong**

**What was checked.** Extracted every component name used across both spines: buttons (primary/secondary/tertiary/danger/danger-strong), inputs, textarea, selects, checkboxes & radios, cards (listing, item, queue row), status badges, tables, modals & dialogs, toasts & alerts, navigation (top bar, dropdowns), pagination, image upload, empty/loading/error states, audit-trail list, message-thread composer, visibility-matrix, claim-review split layout, competing-claims banner. Every name has both a DESIGN.md row (visual) and an EXPERIENCE.md behavioral row.

### Findings

- **none.** Each component has a real visual spec (radius, padding, elevation, font-token binding) in DESIGN.md and a real behavioral spec (state transitions, accessibility, interaction rules) in EXPERIENCE.md. Specifically: Buttons (DESIGN.md 557–573 / EXPERIENCE.md 5.1), Inputs (575–582 / 5.2), Textarea (584–587 / 5.2), Selects (590–594 / 5.3), Checkboxes/Radios (597–601 / 5.4), Cards (603–610 / 5.5), Status badges (613–617 / 5.7), Tables (621–627 / 5.6), Modals (631–635 / 5.9 + 7.6), Toasts/Alerts (639–642 / 5.8), Navigation (645–649 / 7.2), Pagination (652–654 / 5.11), Image upload (657–661 / 5.12), Empty/Loading/Error (664–666 / 5.13). Audit-trail list and message-thread composer have visual + behavioral specs in §17 and §13 respectively.
- **low — Component-named aliases.** EXPERIENCE.md §5.5 calls the listing card the "listing card, item card, queue row" — DESIGN.md uses "Cards (listing card, item card, queue row)". Names match across files; no action needed.

## 4. State coverage — **strong**

**What was checked.** Walked every IA surface and verified the state combinations applicable to each (anonymous / pending / active / administrator / rejected / deactivated / concurrent-action / terminal).

### Findings

- **none as critical.** All load-bearing states are covered: empty (5.13), cold-load (5.13 Loading), error (5.13 + §6.1), permission-denied (§4.5, §9.3, §15.5), terminal (§6.5 — Returned / Closed), concurrent-action (§6.4 — explicit UX handling per PRD D3), offline (5.13 brief banner, owned by architecture for queue behavior — appropriately scoped). Anonymous vs. Active Member vs. Reporter/Claimant vs. Administrator visibility matrix in §11.1 is a single load-bearing table that architecture and QA can source-extract.
- **low — Documented assumption: offline "queued actions" deferred.** §5.13 says "queued actions resume on reconnect (architecture-owned)." This is explicit deferral, not a gap. *No fix.*
- **low — Browser-back-loop hazard stated but not tested in spec.** §4.5 states "Do not redirect-loop between the destination and the pending page" — the rule is clear; a story author can pick up the test.

## 5. Visual reference coverage — **adequate**

**What was checked.** Existence of `mockups/` and `wireframes/` directories under the spine run and the spine's stated handling when those are empty.

### Findings

- **low — Empty mockups/ and wireframes/ folders are explicit.** Both folders exist but are empty. EXPERIENCE.md §26.4 says "key-screen mocks in `mockups/` (promoted at Finalize) are an additional reference for visual surfaces" — this acknowledges mocks are optional and the spines are the contract. DESIGN.md Cross-reference ("When a mock, wireframe, or import disagrees with these tokens, the tokens win") and EXPERIENCE.md §13 ("Spines win on conflict with any mock, wireframe, or import") both explicitly elevate the spines. This is correct for a coaching path; no fix needed.

## 6. Bloat & overspecification — **strong**

**What was checked.** Sections that would not be read by downstream consumers, source restatements, prose where a table works, pixel specs that tokens already cover.

### Findings

- **none.** No PRD or Brief restatement detected — both files point to source artifacts in frontmatter (`prd:` and `brief:` paths). The §24 traceability table in EXPERIENCE.md is a deliberate index that downstream consumers will source-extract, not a re-statement of the PRD. The "UX Copy Guidance Summary" in §25 is a load-bearing copy surface for story authors. The §22 "UX Decisions vs Architecture Decisions" separation is consumer-facing (architects will read it). Pixel-level numeric values bind to tokens (e.g., `44px min-width` in `components.button.min-width`), and prose sections with embedded pixel values are state-bound (focus-ring 2px, action-modal 520px max-width) — none of them duplicate a token.
- **low — One section of low consumer value.** EXPERIENCE.md §22.3 (Open Questions with UX recommendation column) is duplicated information for Architecture (which gets the same OQ list from the PRD §8). Acceptable — UX's recorded recommendation is the value-add, but consider trimming if Architecture signals redundancy during its own walk.

## 7. Inheritance discipline — **strong**

**What was checked.** Cross-file name consistency for components, tokens, status labels, glossary terms, UJ identifiers, FR identifiers, D1–D4 decisions, A1–A6 assumptions.

### Findings

- **none as critical.** Names are consistent: status label vocabulary in EXPERIENCE.md §4.2 is verbatim from PRD §3 (Account: Pending/Active/Rejected/Deactivated; Report lifecycle: Open/Claim Requested/Claim Approved/Returned/Closed; Claim: Pending/Approved/Rejected; Roles: Member/Administrator). UJ identifiers UJ-1..UJ-4 are quoted in §8 headings and reused in the §24 table. FR-1..FR-39 numbers are cited in the §24.1 traceability table. D1/D2/D3/D4 are named in §22.3 and §24.4. A1 is cited in §Browser support. OQ-4 and OQ-5 are referenced from §13.5 and §4.4 respectively, with explicit UX recommendations.
- **low — Status label vocabulary table present, no visible cross-file reconciliation statement for DESIGN.md.** DESIGN.md → Colors → Status notes "Color is never the sole carrier of meaning" — that aligns with EXPERIENCE.md §5.7 and §20.2 — but DESIGN.md does not explicitly cite the PRD §3 status set. Worth adding a one-liner "Verbatim from PRD §3" to the Status colors section so an architecture consumer pulls the labels from the spine alone.

## 8. Shape fit — **strong**

**What was checked.** DESIGN.md section order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts — plus the necessary Logo, Imagery, Motion, Theme switching sections in the canonical position). EXPERIENCE.md required sections (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) and required-when-applicable (Responsive — multi-surface is true; Theme Switching — explicit section).

### Findings

- **none.** DESIGN.md sections in exact canonical order — Brand & Style (362), Colors (379, includes Brand/Light/Dark/Semantic/Status), Typography (469), Layout & Spacing (501), Elevation & Depth (519), Shapes (535), Components (555), plus the obvious-extensions Logo (670), Imagery (716), Motion (726), Theme switching (747), Do's and Don'ts (759), Cross-reference (788). EXPERIENCE.md sections in order: Foundation (19), UX Goals & Principles (31), Personas & Role Surfaces (50), IA (65), Voice and Tone (134), Component Patterns (221), State Patterns (342), Interaction Primitives (382), Key Flows (425), Per-Audience Surfaces (522), Reporting UX (571), Item Detail & Visibility (620), Claim UX and Competing Claims (670), Per-Claim Message Thread (749), Confirm Returned UX (801), Administrator Dashboard and Queues (845), Account Lifecycle UX (893), Audit Trail UX (939), Validation Rules (998), Theme Switching (1017), Accessibility Floor (1031), Responsive Behavior (1078), UX Decisions vs Architecture Decisions (1103), Open UX Questions (1147), PRD Traceability (1157), UX Copy Guidance Summary (1255), What's next (1283). Required defaults are all present; Theme Switching is present because the dark-mode decision is honored; Responsive is present because the form-factor is multi-surface.

## Mechanical notes

- **Empty mockups/ and wireframes/ folders.** Acknowledged by Experience.md §26.4 ("promoted at Finalize") and DESIGN.md Cross-reference. Not a defect.
- **Frontmatter links resolve.** DESIGN.md `experience: ./EXPERIENCE.md` → file exists; EXPERIENCE.md `design_md: ./DESIGN.md`, `prd: ../../prds/prd-FindBack-2026-08-28/prd.md`, `brief: ../../briefs/brief-FindBack-2026-08-28/brief.md` → all resolve (verified directories).
- **DESIGN.md frontmatter: `status: draft` and `project / run / spec / experience` block is present.** Experience.md frontmatter mirrors project / run / design_md / prd / brief. Both consistent.
- **Title-case variation.** DESIGN.md frontmatter title is "FindBack — Design System"; EXPERIENCE.md frontmatter is "EXPERIENCE.md — FindBack". Not load-bearing but inconsistent for grep-based extraction tooling.
- **The §24 traceability table is the rubric walker Pass 1 reference for downstream consumers.** Architecture and Story-Dev can source-extract FR coverage by section reference. Recommend a one-line preamble in §24 saying "This section is also the rubric walker output."
- **Token path normalization (Finding 2.1, 2.2) is the only mechanical issue that would block a strict `{path.to.token}` source extractor.** Cosmetic to humans, mechanical to tooling.

## Correction pass — 2026-09-16 (post-review)

The 2026-08-29 rubric review above is the as-finalized baseline. A targeted correction pass on 2026-09-16 produced the following alignment-to-PRD updates:

- UJ-1 (Maya's Lost-report cleanup) is now an explicit manual Withdraw action — no auto-linking.
- UJ-2 (Sam) no longer implies the finder sees claimant reason / identifying details; thread-only visibility.
- UJ-3 (Alex) loses the registration-rejection email; rejected users surface via the neutral login message.
- UJ-4 (Riley) now covers four queues including Lost-side Items in Verification; competing-Claim wording is normalized.
- UJ-5 (Maya / Sam / Pat / Riley) is replaced: Maya selects the RR; Riley records; Quinn is an edge case only.

Rubric-walker coverage re-checked: all FR-1..FR-50, all UJ-1..UJ-5, all 8 canonical RR statuses, all 4 admin queues + audit cross-cutting, all 8 audit-action Family events (Created, Edited, Withdrawn, Claim-submitted, Claim-decided, Returned, Admin-closed, RR lifecycle), owner-determines / Administrator-records preserved on Lost-side. UX package retained as `revision` pending manual prototype review by the user.
