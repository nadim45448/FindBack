# Pass-3 Final UX Correction Report — FindBack

- **DESIGN.md:** `./DESIGN.md`
- **EXPERIENCE.md:** `./EXPERIENCE.md`
- **Run at:** 2026-09-06
- **Scope:** Final UX correction pass covering form validation behavior, color contrast / readability, and claim-thread read-only lifecycle.

## Overall verdict

**Strong.** All three Pass-3 areas are resolved. Form validation is consistent and accessible across the prototype (errors only after submit, errors clear on valid correction, ARIA wired correctly). Contrast meets WCAG 2.1 AA across light and dark themes for every combination the prototype actually renders. The claim thread locks immediately on Approved (not waiting for physical return), matching the user's Pass-3 directive. The prototype is ready for Architecture handoff.

---

## 1. Form Validation Behavior

### Behavior shipped

- **Initial render:** Every form's error-summary container starts with `hidden` attribute. No error message, icon, red border, or `aria-invalid="true"` is present before the user has interacted. Screen readers do not receive validation-error announcements on page load.
- **Submit-triggered display:** Validation messages appear only after the user attempts to submit. The first invalid field receives focus on failed submission.
- **Clear on correction:** When the user fixes a field's value, its error state is removed (border, icon, message, `aria-invalid`, `aria-describedby`).
- **Accessibility:** Every error has supporting text + icon (not color alone). The error summary uses `role="alert"`. ARIA attributes are toggled in lockstep with the visual state.

### Implementation

- New helper `window.FB.attachFormValidation(form, opts)` in `mockups/assets/app.js`:
  - `liveMode` flag activates error display only after the first submit attempt.
  - `validateAll()` runs all field validators, sets inline error UI, sets `aria-invalid`, focuses first invalid field.
  - `clearIfValid()` runs per field on input — removes the error state the moment the value becomes valid.
  - Returns control to caller via `onSubmit()` only when all fields pass.
- Applied to every form-bearing HTML page in the prototype:
  - `mockups/public/02-login.html`
  - `mockups/public/03-register.html`
  - `mockups/member/09-edit-report.html`
  - `mockups/member/11-submit-claim.html`
  - `mockups/member/14-report-lost.html`
  - `mockups/member/15-report-found.html`
  - `mockups/admin/04-registration-reject.html`
  - `mockups/admin/08-claim-reject.html`
  - `mockups/admin/11-confirm-returned-substitute.html`
  - Inline error elements added to reject/substitute forms.

### Documented rules preserved

Per Pass-3 spec §6 ("Preserve Documented Validation Rules Only"), the following limits remain — all traceable to EXPERIENCE.md:

| Field | Min | Max | Source |
|---|---|---|---|
| Item name | 1 | 80 | EXPERIENCE.md |
| Description | 10 | 2000 | EXPERIENCE.md |
| exactPlace | — | 200 (optional) | EXPERIENCE.md |
| identifyingDetails (lost/found) | — | 500 (optional) | EXPERIENCE.md |
| Claim reason | 20 | 1000 | EXPERIENCE.md |
| Claim identifyingDetails | 10 | 500 | EXPERIENCE.md |
| Registration reject reason | 5 | — | EXPERIENCE.md §15.2 |
| Claim reject reason | 10 | 500 | EXPERIENCE.md |
| Substitute receiver name | 1 | 80 | EXPERIENCE.md |
| Substitute authorization confirmation | required | — | EXPERIENCE.md |

Arbitrary limits such as `maxlength=500` on the claim thread composer (Pass-3 spec §6 violation) were **removed**.

### Regression coverage

`journey-tests.js` includes three new tests:

- **`validationInitialState`** — scans all 9 form HTML files, asserts every `.fb-form-error` container has the `hidden` attribute at initial render.
- **`validationRules`** — scans the same 9 form HTML files for the documented `minlength` / `required` attributes (verifies the form layer enforces documented rules; state layer remains permissive per spec).
- **`validationLimits`** — verifies each form uses only documented `maxlength` / `minlength` values per EXPERIENCE.md; flags any new arbitrary limit introduced.

Result: **all three tests PASS** as part of the 15-test harness.

---

## 2. Color Contrast & Readability

### Audit method

`contrast-audit.js` computes WCAG 2.1 contrast ratios for **every foreground/background pair the prototype actually renders**, in both light and dark themes. Approximates `color-mix(in srgb, X 30%, transparent)` for dark-theme status badges by alpha-blending the brand color over the dark surface.

### Verdict

**ALL PASS for normal and large text; one LARGE-ONLY finding for disabled text in each theme (exempt under WCAG 1.4.3).** All UI components (borders, icons) meet the 3:1 floor.

### Token adjustments made during Pass-3

| Token | Before | After | Reason |
|---|---|---|---|
| LIGHT `--border-default` | `#D1C5B0` (1.70:1) | `#9A8E78` (3.30:1) | Borders must hit 3:1 |
| LIGHT `--border-strong` | — | `#7A6F5A` (4.78:1) | Strengthen strong border |
| LIGHT `--disabled-text` | — | `#7A6F5A` (4.24:1 large-only) | Disabled meets 3:1 floor |
| LIGHT `--success` | `#2D7A4F` (4.34 large-only) | `#1F6A42` (5.62:1) | Normal text passes 4.5:1 |
| LIGHT `--warning` | `#B45309` (4.22 large-only) | `#92400E` (5.96:1) | Normal text passes 4.5:1 |
| DARK `--border-default` | `#3D352C` (1.40:1) | `#9A8E78` (5.24:1) | Borders must hit 3:1 |
| DARK `--border-strong` | `#5C5246` (2.21:1) | `#C4B8A4` (8.63:1) | Strengthen strong border |
| DARK `--disabled-text` | — | `#8E8270` (4.32:1 large-only) | Disabled meets 3:1 floor |
| DARK `--success` | `#2D7A4F` (2.69:1 FAIL) | `#4ADE80` (8.09:1) | Normal text passes 4.5:1 |

Brand recognition preserved: terracotta `#7C2907` (light) and `#FB923C` (dark) both used as the primary CTA in their respective themes; evergreen `#1E5A4E` (light) and `#7BC9B5` (dark) used for secondary brand surfaces.

### Audited combinations (highlights)

- Body text on all surface variants: **PASS** (both themes)
- Muted text (`--on-surface-variant`) on all surface variants: **PASS** (both themes)
- Primary button label on terracotta: **PASS** (both themes)
- Brand text on soft-fill surfaces (e.g., nav-current indicator): **PASS** (both themes)
- Status messages (success/warning/error/info) on their soft-fill backgrounds: **PASS** (both themes)
- Status badges (lost/found): **PASS** (both themes, including color-mix approximation in dark)
- Borders (subtle/default/strong): **PASS** 3:1 floor (both themes)
- Disabled text on disabled background: **LARGE-ONLY** (exempt — disabled controls are explicitly out of scope for WCAG 1.4.3)

### Status badge readability (Pass-3 §12)

All ten status labels across both themes:
- Use color + text label + iconography.
- Text-on-background ratio meets WCAG AA.
- Verified for: open, claimRequested, claimApproved, returned, closed, pending, approved, rejected, active, deactivated.

---

## 3. Claim-Thread Read-Only Lifecycle

### Behavior shipped

Per Pass-3 spec §"Claim-thread read-only lifecycle":

| Claim state | Thread | Lock reason (UI copy) |
|---|---|---|
| pending | writable | (none) |
| approved | **read-only immediately** | "This thread is read-only because this claim has been approved. An administrator will arrange the handoff." |
| rejected | read-only | "This thread is read-only because this claim has been rejected." |
| returned | read-only (escalates from approved) | "This thread is read-only because the item has been returned." |
| closed | read-only | "This thread is read-only because this report has been closed." |

### Implementation

- **State layer** (`mockups/assets/state.js`):
  - `isThreadReadOnly(claimId)` returns `true` when claim.status ∈ {approved, rejected} OR when report.status ∈ {returned, closed}.
  - `getThreadLockReason(claimId)` returns `'approved' | 'rejected' | 'returned' | 'closed' | 'not_found' | null`. Report-level reasons take priority over claim-level reasons so the message escalates accurately as the item moves through the lifecycle.
  - `postMessage(claimId, ...)` returns `null` if the thread is read-only (bypass-resistant).
- **Renderer** (`mockups/member/13-claim-detail.html`):
  - Renders the appropriate four-variant lock notice based on `getThreadLockReason()`.
  - Composer is hidden / disabled when read-only; message list remains visible.

### Regression coverage

`journey-tests.js` includes the **threadReadOnly** test:

- Writable while pending → first postMessage succeeds.
- Read-only on rejected → postMessage returns null; lockReason = 'rejected'.
- **Read-only immediately on approved** (before any return) → postMessage returns null; lockReason = 'approved'.
- Read-only after return → postMessage returns null; lockReason escalates to 'returned'.

Result: **PASS**.

---

## Regression test harness summary

```
=== JOURNEY TEST RESULTS ===

✓ UJ-1 Maya — lost→claim→approve→returned
✓ UJ-2 Sam — found→claim→thread→approve→returned
✓ UJ-3 Approval — Alex pending→active
✓ UJ-3 Rejection — pending applicant blocked
✓ UJ-4 Riley — admin journey + competing claims + substitute
✓ Visibility — reporter/return fields gated by relationship
✓ Persistence — state survives reload
✓ Cross-persona state — visible across personas
✓ Reset — restored to seed
✓ Role protection — gates enforced
✓ Thread read-only lifecycle — enforced at state layer (Pass-3)
✓ Claim eligibility — admins / Lost items / self-claims refused
✓ Validation initial state — every form error summary starts hidden
✓ Validation rules — reason ≥20, identifyingDetails ≥10, dateLost required
✓ Validation limits — documented maxlength/minlength match EXPERIENCE.md

Total: 15 | Passed: 15 | Failed: 0
```

---

## Files changed in Pass-3

### State layer

- `mockups/assets/state.js` — `isThreadReadOnly`, `getThreadLockReason` (priority order fixed so returned/closed supersede approved).

### Forms

- All 9 form-bearing HTML pages now use `window.FB.attachFormValidation` (initial-state-clean, errors-after-submit, clear-on-correction, ARIA wired).
- `mockups/member/13-claim-detail.html` — composer locked when read-only; four-variant lock notice.

### CSS

- `mockups/assets/tokens.css` — token adjustments for AA contrast in both themes; error modifier classes (`.fb-input--error`, `.fb-textarea--error`, `.fb-select--error`, `.fb-field__error`).

### Spines

- `EXPERIENCE.md` §13.5 updated to "Read-only logic (OQ-4) — final" documenting the immediate-on-approved lock and the four notice variants.

### Tests / audits

- `journey-tests.js` — three new tests (`validationInitialState`, `validationRules`, `validationLimits`) and one updated test (`threadReadOnly`).
- `contrast-audit.js` — comprehensive foreground/background coverage with WCAG thresholds; result: **ALL PASS** (one LARGE-ONLY on disabled text, which is exempt).

---

## Sign-off

Pass-3 corrections are complete. The prototype is approved for Architecture handoff.

- **Form validation behavior:** Accessible, predictable, consistent.
- **Color contrast:** WCAG 2.1 AA across light and dark for all rendered combinations.
- **Claim-thread read-only lifecycle:** Locks immediately on Approved; escalates correctly on Returned/Closed; mirrors at state layer to prevent bypass.

**Ready for `bmad-architecture`.**
