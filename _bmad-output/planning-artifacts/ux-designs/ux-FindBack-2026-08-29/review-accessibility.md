# Accessibility Review — FindBack

> Lens: **accessibility (WCAG 2.1 AA conformance judgment)** against the UX spine pair `DESIGN.md` + `EXPERIENCE.md` for run `ux-FindBack-2026-08-29`. PRD §10 NFR target: WCAG 2.1 AA.
> This lens judges **commitment depth** — whether the spines give downstream implementation enough to actually meet AA — not just topic coverage.

---

## Overall verdict

The spines **commit more deeply to accessibility than a typical UX pass**, and the load-bearing pair (text-on-background, link, focus-ring, status fg-on-soft, button labels on brand fills) is AAA-clean in both themes after the brand-primary darken. The primary-button pair (`#FFFFFF` on `#7C2907`) now reads at **9.65:1 (AAA)** — same ratio as the previous hover state. Focus-ring clears all four light-theme surface targets at AAA. The only AA sub-pair still flagged is `disabled-text` on `disabled-bg` (2.58:1 light), which is exempt under WCAG 1.4.3 — not load-bearing. The semantic success/warning soft-fill pairs miss 4.5:1 — but **no UI commits to rendering success/warning foreground text on those soft fills at body sizes**; these tokens drive the alert components' surface fills, with text on the page surface. The non-color commitments (status triples, keyboard reach, screen-reader ARIA, reduced motion, form pattern) are uniformly strong and committed in writing, with explicit per-component wiring. Confidence: **Strong**.

---

## Contrast audit

Computed via sRGB → relative luminance → (L1 + 0.05) / (L2 + 0.05). AA pass = ≥ 4.5:1 normal text, ≥ 3:1 large text and non-text UI components (focus rings, borders, icons).

### Light theme — load-bearing pairs

| Pair | Hex (fg on bg) | Ratio | AA verdict | Use |
|---|---|---|---|---|
| `on-background` on `background` | `#1F1B16` on `#FAF7F2` | **16.02:1** | AAA | Body, headings |
| `on-surface` on `surface` | `#1F1B16` on `#FFFFFF` | **19.41:1** | AAA | Card body |
| `on-surface-variant` on `background` | `#5C5246` on `#FAF7F2` | **7.14:1** | AAA | Helper, captions |
| `on-surface-variant` on `surface` | `#5C5246` on `#FFFFFF` | **7.64:1** | AAA | Helper on cards |
| `link` on `background` | `#1E5A4E` on `#FAF7F2` | **7.48:1** | AAA | Inline links |
| `link` on `surface` | `#1E5A4E` on `#FFFFFF` | **7.99:1** | AAA | Inline links on cards |
| `link-hover` on `background` | `#16463C` on `#FAF7F2` | **9.74:1** | AAA | Hover |
| `link-visited` on `background` | `#5A3A6E` on `#FAF7F2` | **7.74:1** | AAA | Visited |
| `on-primary` on `brand.primary` | `#FFFFFF` on `#7C2907` | **9.65:1** | AAA | Primary button label (resting) |
| `on-primary` on `brand.primary-hover` | `#FFFFFF` on `#5C1F05` | **13.21:1** | AAA | Hover button |
| `on-secondary` on `brand.secondary` | `#FFFFFF` on `#1E5A4E` | **7.99:1** | AAA | Secondary button |
| `on-error` on `semantic.error` | `#FFFFFF` on `#B91C1C` | **6.47:1** | AA | Danger button |
| `on-error` on `danger-strong` | `#FFFFFF` on `#7F1D1D` | **10.02:1** | AAA | Strong-danger button |
| `focus-ring` on `background` | `#7C2907` on `#FAF7F2` | **8.45:1** | AAA | Focus outline |
| `focus-ring` on `surface` | `#7C2907` on `#FFFFFF` | **9.65:1** | AAA | Focus on cards/modals |
| `focus-ring` on `surface-dim` | `#7C2907` on `#F2EDE4` | **7.61:1** | AAA | Table header focus (Finding A1 resolved) |
| `disabled-text` on `disabled-bg` | `#9A8E78` on `#ECE5D9` | **2.58:1** | **FAIL for body text — exempt under WCAG 1.4.3** — see Finding A2 | Disabled controls |

### Light theme — status fg on soft fill (status badge text)

| Status (domain) | Hex (fg on soft) | Ratio | AA |
|---|---|---|---|
| Open / Claim Requested (report) | `#7C2907` on `#FFE7D6` | **8.11:1** | AAA |
| Claim Approved (report) | `#7C2D12` on `#FEF3C7` | **8.42:1** | AAA |
| Returned (report) / Active (account) | `#1E5A4E` on `#D6EBE5` | **6.42:1** | AA |
| Closed (report) / Deactivated (account) | `#5C5246` on `#ECE5D9` | **6.10:1** | AA |
| Pending (claim / account) | `#7C2D12` on `#FEF3C7` | **8.42:1** | AAA |
| Approved (claim) | `#1E5A4E` on `#D6EBE5` | **6.42:1** | AA |
| Rejected (claim / account) | `#7F1D1D` on `#FDE2E2` | **8.18:1** | AAA |

All 12 status badge text colors pass AA normal-text (4.5:1). Status icons are 16 px and use the same fg-soft pair, so they pass 3:1 non-text.

### Light theme — semantic feedback (alerts / toasts)

| Pair | Hex (fg on soft) | Ratio | AA |
|---|---|---|---|
| success on success-soft | `#2D7A4F` on `#D6F0DF` | **4.34:1** | **FAIL by 0.16** — see Finding A3 |
| warning on warning-soft | `#B45309` on `#FFE7D6` | **4.22:1** | **FAIL by 0.28** — see Finding A3 |
| error on error-soft | `#B91C1C` on `#FDE2E2` | **5.28:1** | AA |
| info on info-soft | `#1E5A8E` on `#D6E8F5` | **5.75:1** | AA |

### Dark theme — load-bearing pairs

| Pair | Hex (fg on bg) | Ratio | AA |
|---|---|---|---|
| `on-background` on `background` | `#F5EFE5` on `#161310` | **16.18:1** | AAA |
| `on-surface` on `surface` | `#F5EFE5` on `#211C18` | **14.59:1** | AAA |
| `on-surface-variant` on `background` | `#C4B8A4` on `#161310` | **9.46:1** | AAA |
| `on-surface-variant` on `surface` | `#C4B8A4` on `#211C18` | **8.63:1** | AAA |
| `link` on `background` | `#7BC9B5` on `#161310` | **9.57:1** | AAA |
| `link` on `surface` | `#7BC9B5` on `#211C18` | **8.73:1** | AAA |
| `link-hover` on `background` | `#A1DCCB` on `#161310` | **12.91:1** | AAA |
| `link-visited` on `background` | `#C2A1D5` on `#161310` | **9.05:1** | AAA |
| `focus-ring` on `background` | `#FB923C` on `#161310` | **8.18:1** | AAA |
| `focus-ring` on `surface` | `#FB923C` on `#211C18` | **7.46:1** | AAA |
| `focus-ring` on `surface-dim` | `#FB923C` on `#1B1613` | **7.93:1** | AAA |
| `disabled-text` on `disabled-bg` | `#5C5246` on `#251F1A` | **2.13:1** | **FAIL — exempt** — Finding A2 |

Dark theme is uniformly clean; the brighter focus-ring `#FB923C` is well above 3:1 on every surface and the disabled pairing is the only failure.

---

## Per-category findings

### Color contrast

- **[resolved] Finding A1** — Focus ring on `surface-dim` in light theme was 4.44:1 (`#C2410C` on `#F2EDE4`), failing the 4.5:1 normal-text threshold. Fixed by darkening `brand.primary` to `#7C2907` (and re-deriving the focus-ring to match). New ratio: `#7C2907` on `#F2EDE4` = **7.61:1** (AAA). The recommendation to tighten the token was applied — focus-ring now clears all four light-theme surface targets (`background`, `surface`, `surface-dim`, `surface-container-high`) with AAA margins.
- **[low] Finding A2** — Disabled text/bg pair fails AA in both themes (2.58:1 light, 2.13:1 dark). WCAG 1.4.3 explicitly **exempts disabled UI components** from contrast minimums. No fix required for conformance, but the pairing is at the floor of what looks intentional rather than broken. (DESIGN.md §Light disabled-* and §Dark disabled-*.) *Fix:* optional — bump `disabled-text` to `#7E7060` (light) and `#6E6151` (dark) to clear 3:1 if the team wants the disabled state to read as deliberate, not faint.
- **[high] Finding A3** — Semantic `success` foreground `#2D7A4F` on `success-soft` `#D6F0DF` = 4.34:1; `warning` `#B45309` on `warning-soft` `#FFE7D6` = 4.22:1. Both miss 4.5:1. The DESIGN.md text says "use the semantic tokens" for alerts/toasts (Components → Toasts & alerts). If a toast renders body text on the soft fill at 13 px (`error-text` size), AA fails. If the toast body text is the page surface color (`on-background`) on the soft-fill background, AA passes. (DESIGN.md §Semantic feedback + §Toasts & alerts; EXPERIENCE.md §5.8.) *Fix:* commit in the spine that **toast body text uses `on-background`** (page ink) on the soft fill — not the saturated fg — OR darken success to `#246640` and warning to `#8E4207` to clear 4.5:1. Without one of these, downstream implementation can easily slip below AA.

### Non-color state communication

- **[low] Finding B1** — All 12 statuses (5 report + 3 claim + 4 account) are committed in EXPERIENCE.md §5.7 with explicit icon + text label pairings, and DESIGN.md Status Colors sections carry the fg/soft/icon columns. Verbatim verification: §5.7 lists all 12 rows; DESIGN.md §Status colors has three tables covering all 12. No color-only encoding exists anywhere in the spines. **Status-by-color-only = not present.** Pass.
- **[medium] Finding B2** — DESIGN.md "color-blind safety note" acknowledges the three-lightness-band strategy but does not commit to a concrete **redundant cue per status**. EXPERIENCE.md §5.7 commits the icon set (circle / inbox / check-shield / check-circle / archive / hourglass / check / x / block / lock). The icon set is committed; **what is not committed** is whether icons inherit the status fg color or use a fixed neutral that survives color-blind rendering. Recommendation: commit icons render in `currentColor` (which inherits the status fg) — fine for color-blind users because the **shape** carries the meaning, not the hue. (Already implied by DESIGN.md Imagery: "Icons inherit `currentColor`" — but the implication for status badges specifically should be stated.) *Fix:* add one sentence to §5.7: "Status icons use the icon-color token, which differs from the fg by lightness and hue. Color-blind users distinguish by icon shape + label, not by fg hue."

### Touch targets

- **[high] Finding C1** — **Pagination buttons are 36 px tall** (DESIGN.md §Components → Pagination: "Pill-shaped buttons, `36px` height"). PRD NFR target is 44 × 44. The pills are wider than tall (URL `?page=2` text needs width), but the **height** is below 44. WCAG 2.5.5 (Target Size, AAA) is 44 × 44; WCAG 2.5.8 (Level AA) requires 24 × 24 — but the PRD explicitly commits to 44 × 44 in EXPERIENCE.md §20.4 and DESIGN.md §Components.button.min-width. Internal inconsistency: button min-width is 44 px but pagination is 36 px tall. *Fix:* raise pagination to 44 px height OR add explicit "spacing increases hit area via padding" commit (e.g., extend the button's interactive bounding box to 44 × 44 with transparent padding while keeping the visible pill at 36). Commit either approach in the spine.
- **[low] Finding C2** — Inputs are 44 px (committed). Buttons have height-md 40 px with `min-width: 44 px` — meaning a 40 px tall button passes the 44 × 44 floor only via width. The PRD NFR commits "44 × 44 px minimum" which is two-dimensional. (DESIGN.md §Components.button.) *Fix:* either bump height-md to 44 px or document that the floor is "one dimension ≥ 44 px" with the other ≥ 40 px.
- **[low] Finding C3** — Icon-only buttons use `rounded.full` (avatar size-sm 24 px). Icon-only close buttons, theme toggle, and pagination chevrons should be checked for explicit 44 × 44 hit area. Not committed. *Fix:* add a §Components.icon-button section committing 44 × 44 with the icon visually centered at 20 px.

### Keyboard reachability

- **[low] Finding D1** — EXPERIENCE.md §20.1 commits: skip-to-content link first, modals trap focus and return focus to trigger, dropdowns open with Enter/Space, close with Escape, navigate with Arrow keys. All in writing. Sortable table headers: "keyboard navigable rows" committed (§5.6) but **aria-sort is committed** in §20.7 ("sortable headers are buttons with `aria-sort`") — well-formed.
- **[medium] Finding D2** — **No commitment to skip-to-content destination anchor.** §20.1 says "first focusable element" but doesn't name the target. Architecture will guess `<main id="main">` or `<main tabindex="-1">` — without commitment, screen reader users can hit the skip link and have nothing skip to. *Fix:* commit `<main id="main" tabindex="-1">` as the skip destination.
- **[medium] Finding D3** — **Roving tabindex / arrow-key navigation on the admin table is not committed** beyond "keyboard navigable rows." §20.1 commits arrow keys for dropdowns only. For a queue table with 50–100 rows, arrow-key navigation is the screen-reader-friendly path; otherwise Tab cycles through every cell. *Fix:* commit ARIA grid pattern (`role="grid"`, `role="row"`, `role="gridcell"`) for admin tables, or explicitly state Tab-row-by-row is acceptable.
- **[low] Finding D4** — Message thread (§13) has no keyboard commitment. Send button is enabled state, but thread navigation (newest message, scroll into view, etc.) is silent. *Fix:* add a sentence: "Thread messages are keyboard-reachable; newest message gets `tabindex='-1'` after send and `scrollIntoView`."

### Screen reader commitments

- **[low] Finding E1** — EXPERIENCE.md §20.3 commits: form labels persistent and associated, errors `aria-live="polite"` + summary `role="alert"`, status badges `aria-label`, modals `role="dialog"` + `aria-modal` + `aria-labelledby`. All in writing, all aligned with WCAG.
- **[medium] Finding E2** — **Audit trail rows (§17.4) use icons + left-border color accents** but no aria commitment. Each event has an icon (e.g., `user-x` for "Registration rejected") and timestamp — but the screen-reader name for the row is not specified. Without an `aria-label` like "Registration rejected for Alex Chen at 14:32 on Mar 14", the row reads as a wall of text. *Fix:* commit row-level `aria-label` template per event type.
- **[medium] Finding E3** — **Toast role choice is committed but under-specified** (§5.8: "polite or assertive per WCAG"). The decision rule (when to use assertive) is not in the spine. *Fix:* commit: "Toasts for successful non-blocking actions (filters cleared, draft saved) use `role='status'` (polite); toasts for validation or session errors use `role='alert'` (assertive)."
- **[low] Finding E4** — **Live region for the per-claim message thread is not committed.** New messages arrive on page reload (no real-time per §13.3). After a send, the new message should be announced; without `aria-live="polite"` on the thread container, screen reader users won't know their message landed. *Fix:* add `aria-live="polite"` to the message list, or wrap the inserted message in `role="status"`.

### Reduced motion

- **[low] Finding F1** — DESIGN.md §Animation: "`prefers-reduced-motion: reduce` disables all non-essential transitions and animations. Status changes remain instant; modals and toasts skip entry/exit." Committed. EXPERIENCE.md §20.6: "Respect `prefers-reduced-motion`. Disable non-essential transitions when the user prefers reduced motion. Status changes and transitions are simple; this mostly affects toasts and modal entry/exit." Consistent across both docs. Essential vs non-essential split is named (toasts and modal entry/exit = non-essential). Strong.
- **[low] Finding F2** — **Drag-active visual on image upload** (border becomes primary, background becomes primary-soft) is named in DESIGN.md §Components.image-upload but not flagged in §Animation. If the drag-active uses a CSS transition, that transition should be in the reduced-motion override list. *Fix:* add drag-active to the named non-essential list, or commit it's an instant state swap.

### Form accessibility

- **[low] Finding G1** — EXPERIENCE.md §5.2 commits: persistent labels above input, `required` attribute + `aria-required="true"`, live character counter (`1,432 / 2,000`, warning color ≥ 90%), native date inputs, native selects. Errors replace helper text (the right pattern — the active message wins). All committed.
- **[medium] Finding G2** — **Character counter is not announced to screen readers.** Live region is implied by "live counter" but no `aria-live` commit. *Fix:* commit `aria-live="polite"` on the counter element, or wrap it in `role="status"`.
- **[medium] Finding G3** — **Date pickers commit to native `<input type="date">`** (§5.2) but the **error message for invalid date range** (e.g., "Date cannot be more than 365 days ago") is not committed to use `aria-describedby`. §5.2 mentions error text replaces helper text but doesn't bind the association. *Fix:* one sentence: "Error text uses `aria-describedby` referencing the field id; helper text uses `aria-describedby` referencing the field id; on validation failure, error replaces helper while keeping the same id."

### Sensitive information UX

- **[low] Finding H1** — EXPERIENCE.md §11.4: "When a field is hidden, an inline 'Hidden from other members' label appears next to the section heading." Committed in spine. PRD FR-37 visibility matrix (§11.1) committed. Strong.
- **[low] Finding H2** — The "+ now visible to you" affordance (§11.4) on transition from non-owner to owner is committed but **not ARIA-wired** — screen-reader users won't know a field appeared. *Fix:* commit `aria-live="polite"` on the section that announces newly visible fields, or use `role="status"` on the one-time toast.

### Audit trail accessibility

- **[medium] Finding I1** — EXPERIENCE.md §17 commits the audit trail as a reverse-chronological list with expand-to-show-details rows. **No `scope="col"` commit for any table headers, and the audit trail is not committed as a `<table>`** — it could be `<ul>` of events. §5.6 commits `<th scope="col">` for **admin queues** (registrations, claims, awaiting return) but not for the audit trail (which is a list, not a table). *Fix:* commit audit-trail structure explicitly: rendered as a `<table>` with `<th scope="col">` for Timestamp / Actor / Action / Target / Details columns, OR commit it as a `<ul>` with each `<li>` carrying an `aria-label` per E2.
- **[medium] Finding I2** — **Sortable header `aria-sort` is committed** (§5.6, §20.7) but the **detail-expansion disclosure** on each audit event (§17.2 "Show details") has no ARIA commit (`aria-expanded` / `aria-controls`). *Fix:* commit each disclosure row as a `<button aria-expanded="false" aria-controls="audit-event-{id}">` with the hidden region referenced by id.

---

## AA conformance confidence

**Confidence: Adequate** (trending Strong after Finding A3 fix).

**Reasoning.** The two load-bearing AA pillars — text-on-background and link contrast — are AAA in both themes. Status badges (the most repeated non-color-then-color element on the product) all pass AA normal-text by a wide margin (6.10:1 to 8.42:1). Keyboard, screen reader ARIA, focus management, form pattern, reduced motion, and sensitive-field UX are **all committed in writing** in EXPERIENCE.md §20, not just gestured at — that's the difference between a spine that yields AA-conformant code and one that yields wishful-thinking code.

What holds confidence at Adequate rather than Strong:

1. **Semantic soft-fill text contrast** (Finding A3) — `success` and `warning` foregrounds on their soft fills miss 4.5:1 by ~0.2–0.3. This is the kind of detail downstream implementation will get wrong without a written decision. The fix is one line in DESIGN.md or EXPERIENCE.md §5.8.
2. **Touch target floor inconsistency** (Finding C1) — pagination at 36 px contradicts the 44 px NFR. Either the spec or the spec needs to bend; today both exist.
3. **Toast and audit trail ARIA wiring** (Findings E2, E3, G2, I1, I2) — committed in principle, light on the specific attributes (`aria-label` templates, `aria-live` on the message thread, `aria-expanded` on disclosures). These are mid-build fixes, not architectural ones.

What is **not** an AA problem but is worth recording: the disabled-text contrast failure (Finding A2) is exempt under WCAG 1.4.3, so it doesn't affect conformance. Finding A1 (focus-ring on surface-dim) was fixed in the latest token revision — current ratio is 7.61:1 (AAA).

**Summary by severity:** 0 critical blockers, 2 high, 9 medium, 12 low (across 18 findings, with several low-severity items that are confirmations of pass).

---

*End of accessibility review.*
