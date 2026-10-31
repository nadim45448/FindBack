---
id: 022-web-audit-accessibility
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: complete
stories:
  - 011-accessibility-and-secure-image-delivery
created: 2026-10-23T13:15:30Z
started: 2026-10-30T18:00:00Z
completed: 2026-10-30T18:30:00Z
current_stage: complete
stages_completed:
  - implement
  - test

requires_bolts:
  - 002-audit-reads
  - 010-reporting-images
  - 012-web-public
  - 021-web-admin
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 022-web-audit-accessibility

## Overview

Cross-cutting verification that the whole surface set meets WCAG 2.1 AA and that
image delivery authorizes on every read.

## Objective

Audit every surface built so far against `EXPERIENCE.md` §20 and the
`pass3-validation-report.md` findings, and enforce server-side image authorization.

## Stories Included

- **011-accessibility-and-secure-image-delivery**: 44×44 targets, keyboard reach, reduced motion, authorized image reads (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [~] **1. design**: Skipped by owner direction → *no artifact; the design decisions are stated in the code's doc comments and in `memory-bank/standards/accessibility-review.md`*
- [x] **2. implement**: Complete → source
- [x] **3. test**: Complete → `simple-03-test-report.md`

## Dependencies

### Requires
- **002-audit-reads** (required): the audit views being checked
- **010-reporting-images** (required): the image delivery route
- **012-web-public** (required): the shell, tokens, and theme
- **021-web-admin** (required): the administrator surfaces

### Enables
- None (final bolt)

## Success Criteria

- [x] Every interactive target is at least 44×44 CSS pixels
  - *The touch-target contract*, in `src/ui/a11y-contract.test.ts`.
- [x] Every surface is fully reachable and operable by keyboard
  - `src/ui/disclosure-keyboard.test.tsx`, `src/ui/form-error-focus.test.tsx`,
    and the existing form-parts and report-form-actions suites. **The
    *logical* tab order is review-only** — no gate can judge "logical" — and
    `memory-bank/standards/accessibility-review.md` names that row as such.
- [x] Reduced motion is honoured on every animated surface
  - *The reduced-motion contract*, in `src/ui/a11y-contract.test.ts`.
- [x] Data tables are semantic and disclosures use `aria-expanded`
  - *The table rule* and *the disclosure rule*, in
    `src/ui/surface-review.test.ts`; the disclosure suite asserts the state
    updates on toggle.
- [x] Validation errors are shown after submit with a `role="alert"` summary
  - `src/ui/form-error-focus.test.tsx` (13 tests), plus *the
    native-validation rule* and *the live-region rule* in
    `src/ui/surface-review.test.ts`.
- [x] Image reads authorize server-side immediately before the blob fetch
  - `src/application/listings/report-image-delivery-service.test.ts` and
    `.../candidate-image-delivery-service.test.ts`.
- [x] No `s-maxage` header appears on a private image response
  - The two image-route suites assert the header's **absence**.
- [x] Initial HTML meets the 2s p95 budget on a 4G connection
  - **The preconditions are asserted** by
    `src/app/initial-html-budget.test.ts`; the p95 itself is an Operations
    measurement against the deployed application on a 4G profile. The suite
    makes the number plausible; it does not claim it, and the standard says
    so.

## Notes

This is the last bolt deliberately. Accessibility is not a story that can be
finished in isolation — it is a property of every surface built before it, so it
must be verified once they all exist.

Manual prototype acceptance remains deferred and is never asserted as passed by
this workflow.

### What the bolt changed

**Two real defects were found and fixed by the suites:**

1. **The browser's validation bubble blocked the error summary on three of
   the five forms.** The report, claim, and recovery-response forms carried
   `required` but no `noValidate`, so the submit handler never ran and the
   `role="alert"` summary, the first-field focus, and the scroll never
   happened. All three now carry `noValidate`; the `required` attributes stay,
   because `noValidate` silences the browser's bubble and not the semantics.
   `src/ui/surface-review.test.ts` now **fails the build** on a form with
   `required` fields and no `noValidate`.
2. **The image and candidate-image fields had nowhere to render an error.**
   They had a helper under `…-describedby` and no error element, so a refused
   upload had nowhere to land and `aria-describedby` would have kept
   announcing the helper. The error now replaces the helper under the same
   id.

**The dark theme had shipped the light theme's semantic soft fills** — body
text on a soft fill measured **1.04:1**. The dark theme now has its own
soft-fill pair, and the contrast contract checks **both themes**, because a
light-only contract is how the failure shipped in the first place.

**The story's last criterion is now a machine gate.** Two suites —
`src/ui/a11y-contract.test.ts` (the design-system gate) and
`src/ui/surface-review.test.ts` (the surface gate) — plus the written
checklist in `memory-bank/standards/accessibility-review.md` turn *"a new
surface is checked against every criterion"* from a convention into a build
failure.

**Nine hand-written badges became one component** (`src/ui/status-badge.tsx`),
so the icon, the `aria-label`, and the text cannot disagree; the badge rule
fails the build on a surface that writes its own.
