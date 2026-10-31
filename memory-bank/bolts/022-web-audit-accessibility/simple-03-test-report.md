---
id: 022-web-audit-accessibility
stage: 3
stage_name: test
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
created: 2026-10-30T18:30:00Z
completed: 2026-10-30T18:30:00Z
verification_command: "npx vitest run src/ui/a11y-contract.test.ts src/ui/surface-review.test.ts src/ui/status-badge.test.tsx src/ui/disclosure-keyboard.test.tsx src/ui/form-error-focus.test.tsx src/app/initial-html-budget.test.ts src/application/listings/report-image-delivery-service.test.ts src/application/listings/candidate-image-delivery-service.test.ts src/app/api/reports/image-route.test.ts src/app/api/reports/[id]/recovery-responses/[responseId]/image/route.test.ts src/domain/listings/image-delivery.test.ts src/domain/recovery/candidate-image-delivery.test.ts src/domain/listings/image-content-type.test.ts"
---

# Bolt 022 — Stage 3: Test Report

## Overview

The verification of the `022-web-audit-accessibility` bolt: the cross-cutting
WCAG 2.1 AA contract over every surface built so far, and the secure
delivery of every image the product serves.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The design-system contract — contrast, touch targets, reduced motion, focus | `src/ui/a11y-contract.test.ts`, `src/app/globals.css` | 011 | FR-37 |
| The per-surface contract — badge, `aria-describedby`, live regions, tables, disclosures, dialogs, native validation | `src/ui/surface-review.test.ts` | 011 | FR-37 |
| The shared badge | `src/ui/status-badge.tsx` | 011 | FR-37 |
| The keyboard contract of the disclosure menus | `src/ui/member-topbar.tsx`, `src/ui/theme-toggle.tsx` | 011 | FR-37 |
| Validate-after-submit — summary, first-field focus, scroll | `src/ui/report-form-surface.tsx`, `src/ui/claim-form-surface.tsx`, `src/ui/recovery-response-surface.tsx` | 011 | FR-37 |
| PRD §10's initial-HTML budget, by its preconditions | `src/app/initial-html-budget.test.ts` | 011 | FR-37 |
| The report image's FR-39 matrix | `src/domain/listings/image-delivery.ts` | 011 | FR-39 |
| The candidate image's FR-39 matrix | `src/domain/recovery/candidate-image-delivery.ts` | 011 | FR-39 |
| The served content type | `src/domain/listings/image-content-type.ts` | 011 | FR-39 |
| The two image delivery services | `src/application/listings/*-image-delivery-service.ts` | 011 | FR-39 |
| The two image routes | `src/app/api/reports/.../image/route.ts` | 011 | FR-39 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stage 1 (design) was skipped by owner direction, so there is no
technical-design artifact for this bolt. The design decisions it would have
carried are stated in the code's own doc comments and in
`memory-bank/standards/accessibility-review.md`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## Two real defects were found and fixed by the suites

### The browser's validation bubble blocked the error summary on three of the five forms

**This is the story's headline criterion, and it was unreachable.**

The report form, the claim form, and the recovery-response form all carried
`required` attributes — and **none of them carried `noValidate`**. The
browser's own validation bubble therefore intercepted the submit event, so
the panel's submit handler **never ran**:

```tsx
<form className="report-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
```

The `role="alert"` summary, the focus move to the first invalid field, and the
scroll to the first error are all downstream of that handler — so **none of the
three happened**. A screen reader user submitting an invalid form heard the
browser's bubble, if they heard anything at all; the focus stayed where it
was; the page did not scroll. The story's edge case — *"Screen reader user
submits an invalid form → the `role="alert"` summary is announced and focus
lands on the first invalid field"* — was false on three of the five forms.

The auth forms already carried `noValidate`; these three did not, because
they were built by different bolts and nobody compared them.

**The fix turns the browser's bubble off and keeps the programmatic meaning:**

```tsx
<form
  className="report-form"
  // **`noValidate`.** The browser's own validation bubble would
  // block the submit before the server ever saw it — and then the
  // `role="alert"` summary, the focus on the first invalid field,
  // and the scroll to the first error would never happen. The
  // criterion is about *our* error presentation, so the browser's
  // silent blocking is exactly what has to be turned off. The
  // `required` attributes stay: they are the programmatic meaning,
  // and they still stop an assistive technology from letting the
  // member leave a field empty without knowing it is required.
  noValidate
  onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
>
```

**The `required` attributes were deliberately not removed.** `noValidate`
silences the browser's *bubble*; it does not remove the *semantics*. An
assistive technology still announces the field as required, and the
`aria-required="true"` that every required field carries is what the screen
reader reads. Removing `required` would have made the product quieter and
wrong.

**The suite that found it** is `src/ui/form-error-focus.test.tsx`, which drives
the three member panels against a stubbed API returning `{ field, error }` and
asserts the summary appears, the focus lands, and the scroll is requested.
Eleven of its thirteen tests failed before the fix.

**The native-validation rule now guards it structurally**, so the defect
cannot come back on the next form:

```ts
if (/<form\b/.test(surface.source) && !surface.source.includes('noValidate')) {
  offenders.push(surface.path.replace(`${process.cwd()}/`, ''));
}
```

A form with `required` fields and no `noValidate` **fails the build**. That
rule was added to `surface-review.test.ts` *because* the gate would otherwise
have been silent about the one thing the bubble broke.

### The image and candidate-image fields had nowhere to render an error

**The file fields had a helper and no error slot.** The report form's image
field and the recovery-response form's candidate-image field each rendered:

```tsx
<p className="field__helper" id="image-describedby">{'JPEG, PNG, or WebP, up to 5 MB.'}</p>
<input id="image" … aria-describedby="image-describedby" />
```

There was **no error element** under that id. So when the server refused an
upload, the surface had nowhere to put the refusal — and `aria-describedby`
would have kept pointing at the *helper*, meaning a screen reader would have
announced *"JPEG, PNG, or WebP, up to 5 MB"* to a member whose file had just
been rejected.

**The fix makes the error replace the helper under the same id**, exactly as
every other field in the product already did:

```tsx
{errors['image'] ? (
  <p className="field__error" id="image-describedby">{errors['image']}</p>
) : (
  <p className="field__helper" id="image-describedby">{'JPEG, PNG, or WebP, up to 5 MB.'}</p>
)}

<input id="image" … aria-invalid={errors['image'] ? true : undefined} aria-describedby="image-describedby" />
```

**The suite that found it** is `src/ui/surface-review.test.ts` → *the
describedby rule*, whose second test compares the set of `field__helper` ids
against the set of `field__error` ids, field by field. A helper without a
matching error id is an error that has nowhere to land.

## The dark theme had shipped the light theme's semantic soft fills

**`DESIGN.md` calls the semantic palette "theme-independent" and states that
body text on a soft fill renders in `colors.{theme}.on-background`.** That is
true in the light theme — and **false in the dark theme**, where
`on-background` is light ink on the same light pastel. The pair measured
**1.04:1**: light ink on near-white.

The theme's soft fills were being resolved to the light theme's values, so a
dark-theme member reading a "verification pending" notice was reading light
ink on a near-white background, at a contrast ratio that is **more than four
times worse than the 4.5:1 floor allows**.

**The fix gave the dark theme its own soft-fill pair**, with the ink chosen
for the dark surface rather than inherited from the light theme.

**The suite that found it** is `src/ui/a11y-contract.test.ts` → *the contrast
contract*, which computes the relative luminance of every token pair and
asserts the floors. **It checks both themes**, because a contrast rule that
only ever ran against the light theme is exactly how this failure shipped in
the first place.

## The story's last criterion is now a machine gate, not a convention

**Story 011's last acceptance criterion says:**

> *"Given a new surface is added, **When** it is reviewed, **Then** it is
> checked against every criterion in this story before it is considered
> complete."*

Until this bolt that was a **convention** — a reviewer remembering to walk a
checklist. It is now backed by **two gates** and a written standard:

| Gate | What it checks | Where it lives |
|---|---|---|
| **The design-system gate** | The properties of the *tokens* — contrast ratios, the touch-target floor, the reduced-motion coverage, the focus ring. These hold however many surfaces there are. | `src/ui/a11y-contract.test.ts` |
| **The surface gate** | The properties of *each surface* — the badge, the `aria-describedby` association, the live regions, the table semantics, the disclosures, the dialog, the native validation. These are per-surface, and no stylesheet assertion can see them. | `src/ui/surface-review.test.ts` |

**Neither gate replaces a human reading a screen. They replace the
*forgetting*.** A criterion that can be checked mechanically is checked
mechanically; the ones that cannot are called out by name in
`memory-bank/standards/accessibility-review.md`.

**The standard is a 24-row checklist** mapping each rule to the suite that
enforces it, and — importantly — **naming the two rules that no gate
enforces**: the *logical* tab order (a tab order can be reachable and still
be illogical; only a reviewer can judge "logical"), and the focus trap for a
*new* modal (a per-modal property cannot be inherited by a modal that does
not exist yet).

### Why the surface gate reads the source rather than rendering it

**The trade-off is explicit and deliberate: a surface written in a way the
gate cannot see would pass.** The mitigation is that **each rule has exactly
one way to satisfy it** — one shared badge component, one `noValidate`, one
`<th scope="col">` — so a surface that satisfies the rules is a surface that
meets the contract.

The gate parses **whole opening tags**, not lines, because an element's
attributes can span several lines and a line-based rule would see a
`className` on one line and its `role` on the next — and report a false
failure. That was a real defect in the gate's first draft, caught by the
gate's own tests.

### Why the p95 criterion is not measured here

**PRD §10: *"Page render (initial HTML): ≤ 2 seconds at p95 on a 4G
connection."* A p95 is a property of a deployment on a member's phone.** A
unit test could only measure this machine on this network, and the number
would change every time the suite ran. **A timing test that cannot fail for
the reason it names is a test that lies.**

So `src/app/initial-html-budget.test.ts` asserts the **preconditions** the
budget depends on — the ones this codebase controls:

| Precondition | Why it decides the budget |
|---|---|
| Every route is **server-rendered** | The initial HTML is complete on the first byte |
| The **client bundle** is limited to the interactive surfaces | On 4G the transferred bytes dominate |
| **No third-party script** | A third-party script on 4G is an unbounded wait |
| **One stylesheet** | A second round trip on 4G is a second RTT |
| The theme script is **inlined**, not fetched | It must run before the first paint, and inlining costs zero round trips |

**The actual p95 remains an Operations measurement** against the deployed
application on a 4G profile. The suite makes the number *plausible*; it does
not claim it. This is stated in the standard as well as here — criterion 24
is the one criterion in the checklist that is not measured by a suite.

## The badge is one component, so the icon and the label cannot disagree

**Nine call sites hand-wrote a badge** — a `<span className="badge">` with
colour and text and no icon, no `aria-label`. The story's criterion requires
**all three**: colour paired with a text label *and* an icon, plus an
`aria-label` naming the status.

**The fix is `src/ui/status-badge.tsx`** — a single component that renders
the icon (`aria-hidden`), the status text, and the label:

```tsx
<span className={`badge badge--${resolved}`} aria-label={`${kind}: ${status}`}>
  <BadgeIcon tone={resolved} />
  {status}
</span>
```

**The status text is last in the label** because it is what the user came to
read; the kind comes first so a screen reader announces "Response status:
Match Confirmed" rather than "Match Confirmed".

**The badge rule now fails the build** if any surface hand-writes a `badge`
class instead of going through the component — so the nine sites cannot
drift apart again. `src/ui/status-badge.test.tsx` additionally asserts that
**a rejected status never paints in a positive tone**, which is the one
mistake colour alone would hide.

## The menu keyboard contract was one key, not four

**The topbar's disclosure menu opened with Enter and Space but had no arrow
navigation and no Escape.** The story's criterion requires all four:
open with Enter or Space, navigate with the arrow keys, close with Escape.

**The fix added the arrow keys with modular wrapping, Home/End, and Escape
with focus restoration**, and the theme popover gained the `aria-controls`
its `aria-expanded` had been pointing at nothing.

**The suite resolves the panel *through* `aria-controls`** — so a menu whose
`aria-expanded` points at the wrong element fails the test rather than
passing it. That includes reaching the `Log out` button with the arrow keys,
which is the item a naive `a[href]`-only focusable query would have skipped.

## The two image deliveries are separate, deliberately

**The report image and the candidate image have different entities and
different viewers.** A claimant does not see the Found report's image as
ownership evidence; a Recovery responder never sees another candidate's
image.

The two deliveries are therefore **not parameterised into one authorised
function**. A shared, parameterised authorisation is one whose two branches
can drift apart — and the FR-39 matrix has exactly the shape where a
drifted branch leaks a private image. The suites assert the ordering
separately for each: the requester is resolved, the matrix is applied, and
**only then** is the blob read called.

**`IMAGE_DELIVERY_COLUMNS = ['foundReportOwner', 'lostReportOwner', 'administrator']`**
encodes the matrix for the report image, and participation is never
permission — a claimant and a responder are participants on the report, and
neither is entitled to the image.

## The private image response carries exactly the headers it should

| Header | Value | Why |
|---|---|---|
| `Cache-Control` | `private, no-cache` | Forces revalidation so authorisation runs on every request |
| `s-maxage` | **absent** | The directive that lets an intermediary serve one viewer a response another viewer triggered |
| `X-Content-Type-Options` | `nosniff` | The served type is the allowlisted one, whatever the blob metadata claims |
| `Content-Disposition` | `inline` | The image is displayed, not downloaded |
| `Content-Type` | from `image-content-type.ts`'s allowlist | Never from user input, never from stored blob metadata |

**Every refusal is the same body**, and the route answers **404 rather than
403** for a refused viewer — a 403 would tell a stranger that the image
exists.

## Verification

### Command

```
npx vitest run \
  src/ui/a11y-contract.test.ts \
  src/ui/surface-review.test.ts \
  src/ui/status-badge.test.tsx \
  src/ui/disclosure-keyboard.test.tsx \
  src/ui/form-error-focus.test.tsx \
  src/app/initial-html-budget.test.ts \
  src/application/listings/report-image-delivery-service.test.ts \
  src/application/listings/candidate-image-delivery-service.test.ts \
  src/app/api/reports/image-route.test.ts \
  "src/app/api/reports/[id]/recovery-responses/[responseId]/image/route.test.ts" \
  src/domain/listings/image-delivery.test.ts \
  src/domain/recovery/candidate-image-delivery.test.ts \
  src/domain/listings/image-content-type.test.ts
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Design system — `a11y-contract.test.ts` | 1 | 32 | ✅ pass |
| Surface — `surface-review.test.ts` | 1 | 11 | ✅ pass |
| UI — `status-badge.test.tsx` | 1 | 17 | ✅ pass |
| UI — `disclosure-keyboard.test.tsx` | 1 | 17 | ✅ pass |
| UI — `form-error-focus.test.tsx` | 1 | 13 | ✅ pass |
| Budget — `initial-html-budget.test.ts` | 1 | 6 | ✅ pass |
| Application — `report-image-delivery-service.test.ts` | 1 | 17 | ✅ pass |
| Application — `candidate-image-delivery-service.test.ts` | 1 | 18 | ✅ pass |
| Transport — `reports/image-route.test.ts` | 1 | 14 | ✅ pass |
| Transport — `recovery-responses/…/image/route.test.ts` | 1 | 17 | ✅ pass |
| Domain — `listings/image-delivery.test.ts` | 1 | 13 | ✅ pass |
| Domain — `recovery/candidate-image-delivery.test.ts` | 1 | 12 | ✅ pass |
| Domain — `listings/image-content-type.test.ts` | 1 | 16 | ✅ pass |
| **Total** | **13** | **203** | ✅ **203 pass, 0 fail** |

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `application/listings/report-image-delivery-service.ts` | 100% | 100% | 100% | 100% |
| `application/listings/candidate-image-delivery-service.ts` | 100% | 100% | 100% | 100% |
| `domain/listings/image-delivery.ts` | 100% | 100% | 100% | 100% |
| `domain/listings/image-content-type.ts` | 100% | 100% | 100% | 100% |
| `domain/recovery/candidate-image-delivery.ts` | 83.33% | 100% | 33.33% | 90.9% |
| `ui/status-badge.tsx` | 92.3% | 92.3% | 100% | 92.3% |
| `ui/member-topbar.tsx` | 93.22% | 77.77% | 100% | 93.1% |
| `ui/character-counter.tsx` | 100% | 50% | 100% | 100% |
| **All** | **95.23%** | **90.47%** | **93.93%** | **95.83%** |

**The route layer is excluded from coverage by `vitest.config.ts`**
(`src/app/**`) and is verified by its own suites — the two image-route suites
— the same arrangement every earlier bolt used.

**`a11y-contract.test.ts` and `surface-review.test.ts` carry no coverage
figure, and that is the point.** They assert on the **stylesheet's** tokens
and on the **`.tsx` sources'** markup, not on a module's execution — a
contrast ratio is a fact about two tokens, and a `th scope="col"` is a fact
about a source file. Neither has lines to cover.

## What was verified

### The design-system gate (32 tests)

- Every token pair's contrast is computed from the stylesheet's own hex
  values — **not from a mock of the CSS**.
- Body text meets **4.5:1**; large text and non-text UI components meet
  **3:1**.
- **Both themes are checked.** The dark theme's soft fills are the pair that
  failed at 1.04:1; a light-only contract would never have seen it.
- Every interactive target is at least **44 × 44 px**, and adjacent targets
  are separated by at least **8 px**.
- Under `prefers-reduced-motion: reduce`, every transition and animation is
  neutralised, and the status-change rules have no duration to hide behind.
- **No rule removes an outline without supplying a replacement focus ring** —
  the `outline: none` prohibition, checked as a whole stylesheet.

### The surface gate (11 tests)

- **The gate checks something.** The surface count is asserted to be greater
  than 20 — a glob that stopped matching would otherwise turn every rule
  into a no-op that still passed.
- **The badge rule**: no surface hand-writes a `badge` class.
- **The describedby rule**: every `aria-describedby` names an id the
  document contains; every `field__helper` id has a matching
  `field__error` id under the same field.
- **The native-validation rule**: a form with `required` fields carries
  `noValidate`.
- **The table rule**: every `<table>` has header cells, and every `<th>`
  carries `scope="col"`.
- **The disclosure rule**: every `aria-expanded` also carries
  `aria-controls`.
- **The dialog rule**: every `role="dialog"` carries `aria-modal="true"` and
  an `aria-labelledby`; and that `aria-labelledby` resolves to an id the
  document contains.
- **The live-region rule**: every `error-summary` element carries
  `role="alert"` or `role="status"`.

### The shared badge (17 tests)

- The `aria-label` names the kind and the status.
- The status text is visible, not only announced.
- The icon is present and is `aria-hidden` — an icon a screen reader reads
  aloud would be noise.
- The colour class is derived from the status.
- The four tones have distinct icon shapes.
- The whole status vocabulary maps to a tone, with a neutral fallback.
- **A rejected status never paints in a positive tone.**
- The optional class name is appended without breaking the badge classes.

### The disclosure keyboard (17 tests)

- `aria-expanded` is `"false"` while closed and flips on toggle.
- `aria-controls` names the panel the menu actually renders.
- Enter, Space, and ArrowDown each open the menu.
- ArrowDown and ArrowUp move the focus, **wrapping at both ends**.
- Home and End jump to the first and last item.
- **The `Log out` button is reachable with the arrow keys.**
- The arrow keys call `preventDefault`.
- Escape closes the menu and **restores focus to the trigger**.
- Tab closes the menu.
- One menu's Escape does not close another.

### Validate-after-submit (13 tests)

- The `role="alert"` summary appears **after** a failed submit and is
  **absent before it**.
- The first invalid field **receives focus**.
- The scroll request **names the field** and uses `block: 'center'`, and
  **exactly one** scroll is requested.
- The focus survives a missing `scrollIntoView` — a browser without it must
  not lose the focus move.
- The summary **precedes the fields in the DOM**, so a screen reader reads
  the summary before the field it refers to.
- A field's error clears when the field is edited.
- All three panels — report, claim, recovery response — behave identically.

### The initial-HTML budget's preconditions (6 tests)

- The route list is non-empty — a precondition suite that checked nothing
  would pass forever.
- **Every route is server-rendered.** This is the precondition ADR-1's
  claim rests on: a route that became a client component would invalidate
  the architecture decision, and this suite is where that shows up.
- The client bundle is limited to the interactive surfaces — a client
  component that is not a form, panel, topbar, toggle, or menu is shipping
  JavaScript it does not need.
- **No route loads a third-party script.**
- **At most one stylesheet link** in the layout.
- **The theme script is inlined** — `<ThemeScript />` in the layout,
  `dangerouslySetInnerHTML` in the script itself, and **no `<script src>`**
  anywhere in the layout. Inlining is stronger than `async`: it costs zero
  round trips.

### The image deliveries (107 tests across the six image suites)

- The FR-39 matrix is **exactly three columns** for the report image.
- An anonymous viewer, an unrelated member, a claimant, and a Recovery
  responder are each **refused**.
- A report owner, the Lost-report owner, and an administrator are each
  **served**.
- **The blob read is never called for a refused viewer.**
- The authorisation runs **immediately before** the blob read, on every
  request — including a second, identical one.
- The candidate image's matrix is separately enforced: a responder sees
  their own candidate image and **no one else's**.
- `Cache-Control: private, no-cache`; **`s-maxage` appears nowhere**.
- `X-Content-Type-Options: nosniff`; `Content-Disposition: inline`.
- The `Content-Type` comes from the allowlist — a stored blob declaring a
  different type does not change what is served.
- Every refusal carries the **same body**, and the route answers **404, not
  403** — a 403 would tell a stranger the image exists.
- A store failure answers 500 **without leaking the store's detail**.

## Success Criteria

The bolt's eight success criteria, each against a named backing test:

| # | Criterion | Where verified |
|---|---|---|
| 1 | Every interactive target is at least 44×44 CSS pixels | design-system gate → *the touch-target contract* (32-test suite) |
| 2 | Every surface is fully reachable and operable by keyboard | disclosure-keyboard (17), form-error-focus (13), form-parts, report-form-actions; the **logical tab order** is review-only, and the standard says so |
| 3 | Reduced motion is honoured on every animated surface | design-system gate → *the reduced-motion contract* |
| 4 | Data tables are semantic and disclosures use `aria-expanded` | surface gate → *the table rule* and *the disclosure rule*; the disclosure-keyboard suite asserts the state updates on toggle |
| 5 | Validation errors are shown after submit with a `role="alert"` summary | form-error-focus (13), surface gate → *the native-validation rule* and *the live-region rule* |
| 6 | Image reads authorize server-side immediately before the blob fetch | the two delivery-service suites (17 + 18), asserting the ordering and that the blob read is never called for a refused viewer |
| 7 | No `s-maxage` header appears on a private image response | the two route suites (14 + 17), asserting the header's **absence** |
| 8 | Initial HTML meets the 2s p95 budget on a 4G connection | **the preconditions are asserted** (`initial-html-budget.test.ts`, 6 tests); the p95 itself is an Operations measurement against the deployed application on a 4G profile — see criterion 24 of the standard |

## Owner Items

1. **The ≤ 2 s p95 is not measured, and is not claimed.** The suite asserts
   the preconditions the budget depends on; the actual p95 remains an
   Operations measurement against the deployed application on a 4G profile.
   This is stated in the story's criterion 24 and in the standard, so the
   gap is visible rather than absorbed.
2. **The logical tab order is review-only.** No gate can judge "logical" — a
   reviewer tabs the page. The standard names this row explicitly.
3. **A *new* modal needs its own focus-trap test.** The confirm dialog's trap
   is asserted by `report-form-actions.test.tsx`; a modal that does not exist
   yet cannot inherit that assertion. The standard names this row explicitly.
4. **The surface gate reads source, not DOM.** A surface written in a way the
   gate cannot see would pass. The mitigation is that each rule has exactly
   one way to satisfy it; the trade-off is documented in the standard rather
   than hidden.
5. **The prototype's manual acceptance remains deferred** and is never
   claimed as passed by this workflow.
6. **The blast radius was not measured.** The full suite was not run, by
   owner direction. The bolt's own thirteen suites are green, and the
   typecheck is clean.
7. **One pre-existing lint error remains, in a file this bolt did not
   touch.** `src/infrastructure/listings/prisma-lost-report-closeout-adapters.test.ts:41`
   reports `'PrismaContentRemovalRepository' is defined but never used`. The
   file is untracked and belongs to bolt `019-returns-closeout`. It was
   deliberately left alone rather than silently absorbed into this bolt's
   diff.
