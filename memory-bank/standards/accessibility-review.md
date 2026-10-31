---
standard: accessibility-review
status: active
created: 2026-10-30T18:30:00Z
updated: 2026-10-30T18:30:00Z
source_of_truth:
  behavior: _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md
  visual: _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md
  criteria: memory-bank/intents/001-findback-lost-and-found/units/007-web-surfaces/stories/011-accessibility-and-secure-image-delivery.md
---

# Accessibility Review (pointer standard)

**Story 011's last criterion is a process, not a property:** *"Given a new
surface is added, **When** it is reviewed, **Then** it is checked against every
criterion in this story before it is considered complete."*

Until bolt `022`, that was a convention. This standard makes it a **checklist
with a machine gate behind it**: the checklist below is what a reviewer reads,
and the suites below are what fails the build when a surface misses a rule.

## The two gates

| Gate | What it checks | Where it lives |
|---|---|---|
| **The design-system gate** | The properties of the *tokens* — contrast ratios, the touch-target floor, the reduced-motion coverage, the focus ring. These hold however many surfaces there are. | `src/ui/a11y-contract.test.ts` |
| **The surface gate** | The properties of *each surface* — the badge, the `aria-describedby` association, the live regions, the table semantics, the disclosures. These are per-surface and no stylesheet assertion can see them. | `src/ui/surface-review.test.ts` |

**Neither gate replaces a human reading a screen.** They replace the *forgetting*.
A criterion that can be checked mechanically is checked mechanically; the ones
that cannot are called out below.

## The checklist

Walk this list for **every new surface**. Each row names the criterion, the
rule, and where it is enforced.

### Keyboard

| # | The rule | Enforced by |
|---|---|---|
| 1 | Every interactive element is reachable in a logical tab order. | Review — no mechanical gate |
| 2 | Every interactive element has a visible focus ring, and no `outline: none` without a replacement. | `a11y-contract.test.ts` → *the focus contract* |
| 3 | Every dropdown or menu opens with Enter or Space, navigates with the arrow keys, and closes with Escape. | `disclosure-keyboard.test.tsx`; `theme-toggle.test.tsx` |
| 4 | A modal traps the focus, dismisses on Escape as a cancel, and returns the focus to its trigger. | `report-form-actions.test.tsx` (the confirm dialog) |

### Forms

| # | The rule | Enforced by |
|---|---|---|
| 5 | The label is persistent and programmatically associated; required fields carry `required` **and** `aria-required="true"`. | `form-parts.test.tsx`; `report-form-actions.test.tsx` |
| 6 | No error, icon, red border, or `aria-invalid` state exists before the first submit. | `form-parts.test.tsx`; `form-error-focus.test.tsx` |
| 7 | The error summary carries `role="alert"`, the first invalid field receives focus, and the page scrolls to the first error. | `form-error-focus.test.tsx` |
| 8 | The error text replaces the helper text **under the same element id**, so the `aria-describedby` association survives. | `surface-review.test.ts` → *the describedby rule* |
| 9 | A field's error state, icon, `aria-invalid`, and `aria-describedby` clear the moment the field is edited. | `form-error-focus.test.tsx` |
| 10 | The browser's own validation bubble must not block the submit — otherwise criteria 6–9 never run. | `surface-review.test.ts` → *the native-validation rule* |
| 11 | A live value — a character counter — is wrapped in `aria-live="polite"`. | `character-counter.tsx`; `surface-review.test.ts` → *the live-region rule* |

### Structure and semantics

| # | The rule | Enforced by |
|---|---|---|
| 12 | Every status badge carries an `aria-label` naming the status, and pairs colour with a text label **and** an icon. | `status-badge.test.tsx`; `surface-review.test.ts` → *the badge rule* |
| 13 | Every table's header cells use `th scope="col"`; a sortable header is a button carrying `aria-sort`. | `surface-review.test.ts` → *the table rule* |
| 14 | Every detail-expansion disclosure carries `aria-expanded` **and** `aria-controls` naming the hidden region, and the state updates on toggle. | `surface-review.test.ts` → *the disclosure rule* |
| 15 | Every error summary is a live region — `role="alert"` for a failure, `role="status"` for a success. | `surface-review.test.ts` → *the live-region rule* |
| 16 | Every modal carries `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` that resolves to its title. | `surface-review.test.ts` → *the dialog rule* |

### Visual

| # | The rule | Enforced by |
|---|---|---|
| 17 | Every interactive target is at least 44 × 44 CSS pixels, with at least 8 px between adjacent targets. | `a11y-contract.test.ts` → *the touch-target contract* |
| 18 | Body text measures at least 4.5:1 and large text at least 3:1 against its background, **in both themes**. | `a11y-contract.test.ts` → *the contrast contract* |
| 19 | Under `prefers-reduced-motion: reduce`, non-essential motion is disabled and status changes remain instant. | `a11y-contract.test.ts` → *the reduced-motion contract* |

### Images

| # | The rule | Enforced by |
|---|---|---|
| 20 | The server resolves the requester and applies the FR-39 matrix **immediately before** the blob read. | `src/application/listings/report-image-delivery-service.test.ts`; `.../candidate-image-delivery-service.test.ts` |
| 21 | An unauthorized viewer's request never calls the blob read, and is answered with a refusal rather than an image. | The two delivery-service suites |
| 22 | The response carries `Cache-Control: private, no-cache`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: inline`, and **never** `s-maxage`. | The two route suites |
| 23 | The served `Content-Type` comes from a server-side allowlist, never from user input or stored blob metadata. | `src/domain/listings/image-content-type.ts` |

### Performance

| # | The rule | Enforced by |
|---|---|---|
| 24 | The initial HTML meets PRD §10's ≤ 2 s p95 budget on a 4G connection. | `src/app/initial-html-budget.test.ts` — the **preconditions**, not the p95 |

**Criterion 24 is the one that is not measured here, and the reason is
deliberate.** A p95 is a property of a deployment on a member's phone; a
unit test could only measure this machine on this network, and the number
would change every time the suite ran. So the suite asserts the
**preconditions** the budget depends on — every route server-rendered, the
client bundle limited to the interactive surfaces, no third-party script,
one stylesheet, and the theme script inlined rather than fetched — and the
**actual p95 remains an Operations measurement** against the deployed
application on a 4G profile.

## The two rules that are not enforced mechanically

**These need a human, and the checklist says so rather than pretending
otherwise.**

- **Criterion 1 — the logical tab order.** A tab order can be *reachable* and
  still be illogical. No gate can judge "logical"; a reviewer tabs the page.
- **Criterion 4 — the focus trap.** The confirm dialog's trap is asserted by
  `report-form-actions.test.tsx`, but a *new* modal would need its own test.

## What a reviewer does

1. **Add the surface.** Write the surface and its route.
2. **Run the two gates.** `npx vitest run src/ui/a11y-contract.test.ts src/ui/surface-review.test.ts`.
   A failure names the file and the line.
3. **Walk the checklist above.** Focus on the rows marked *Review* — the tab
   order, and any new modal.
4. **Add the surface's own test.** The gates check the *rules*; the surface's
   own test checks that the surface *uses* them correctly.

## Why the gates read the source

**The surface gate reads the `.tsx` files from disk rather than rendering
them.** The trade-off is explicit: a surface written in a way the gate cannot
see would pass. The mitigation is that each rule has **exactly one way to
satisfy it** — one shared badge component, one `noValidate`, one
`<th scope="col">` — so a surface that satisfies the rules is a surface that
meets the contract.

**The design-system gate reads the stylesheet** for the same reason: a
contrast ratio is a fact about two tokens, and a component test would be
asserting on a mock of the CSS rather than on the CSS.

## The failure this gate was written for

**The dark theme shipped the light theme's semantic soft fills.** DESIGN.md
calls the semantic palette "theme-independent" and states that body text on a
soft fill renders in `colors.{theme}.on-background` — true in the light theme,
and **false in the dark theme**, where `on-background` is light ink on the same
light pastel. The pair measured **1.04:1**: light ink on near-white.

**The contract suite checks both themes**, because a contrast rule that only
ever ran against the light theme is how the failure shipped in the first
place.

**`scripts/contrast-check.mjs` is the design aid that chose the replacement
values** — a scratch script, not a test. It measures candidate token pairs
before they are written into `globals.css`; the enforced check is the
contract suite, which reads the real stylesheet. Run it with
`node scripts/contrast-check.mjs`.
