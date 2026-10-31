---
id: 011-accessibility-and-secure-image-delivery
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: done
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: 022-web-audit-accessibility
implemented: true
traces_to:
  - FR-37
  - FR-39
realizes_fr: [FR-37, FR-39]
---

# Story: 011-accessibility-and-secure-image-delivery

User Story

**As a** member or administrator using a keyboard, a screen reader, or reduced-motion settings
**I want** every surface to meet WCAG 2.1 AA and every image to be authorized at the server before it is read
**So that** FindBack is operable by everyone it is for, and a private image is never served to someone who is not entitled to it

Acceptance Criteria

- [x] **Given** any interactive element on any surface, **When** a keyboard user tabs through the page, **Then** every element is reachable in a logical tab order and has a visible focus ring with no `outline: none` without a replacement
  - **Reachable and the focus ring: enforced.** `src/ui/a11y-contract.test.ts` → *the focus contract* asserts that no rule in the stylesheet removes an outline without supplying a replacement focus ring. Every interactive control on every surface is a native `button`, `a[href]`, `input`, `select`, or `textarea`, so each is in the tab order by construction — there is no custom widget with a hand-rolled `tabindex`.
  - **Logical tab order: review-only.** A tab order can be *reachable* and still be illogical, and no gate can judge "logical" — a reviewer tabs the page. This is recorded in `memory-bank/standards/accessibility-review.md` under "The two rules that are not enforced mechanically".
- [x] **Given** a modal dialog on any surface, **When** it is open, **Then** focus is trapped inside it, Escape dismisses it with cancel as the default, and focus returns to the triggering element on close
  - **Enforced.** `src/ui/report-form-actions.test.tsx` asserts the confirm dialog's trap, its Escape-as-cancel, and the focus return to its trigger.
  - **A *new* modal would need its own test.** The trap is a per-modal property, not a token property, so it cannot be inherited by a modal that does not exist yet. The checklist says so rather than implying the gate covers it.
- [x] **Given** a dropdown or menu, **When** it is interacted with, **Then** it opens with Enter or Space, navigates with the arrow keys, and closes with Escape
  - **Enforced.** `src/ui/disclosure-keyboard.test.tsx` drives the topbar's disclosure menu: opens with Enter, Space, and ArrowDown; navigates with ArrowDown/ArrowUp with modular wrapping; Home/End jump; Escape closes and restores focus to the trigger; Tab closes. `src/ui/theme-toggle.test.tsx` covers the theme popover's own contract.
- [x] **Given** a form field, **When** it renders, **Then** the label is persistent and programmatically associated, and required fields carry both `required` and `aria-required="true"`
  - **Enforced.** `src/ui/form-parts.test.tsx` asserts the persistent `<label htmlFor>` association and the `required` + `aria-required="true"` pairing on every required field across the report, claim, and recovery-response forms.
- [x] **Given** a form is submitted with errors, **When** the errors render, **Then** the error summary carries `role="alert"`, the first invalid field receives focus, and the page scrolls to the first error
  - **Enforced — and this criterion was unreachable until this bolt.** `src/ui/form-error-focus.test.tsx` drives the three member panels against a stubbed API returning `{ field, error }` and asserts the `role="alert"` summary appears only after the submit, the first invalid field takes focus, and exactly one `scrollIntoView({ block: 'center' })` names that field.
  - **The defect the test found.** The report, claim, and recovery-response forms carried `required` attributes but **no `noValidate`**. The browser's own validation bubble blocked the submit event, so the panel never heard about the failed submission — no summary, no focus move, no scroll. The three forms now carry `noValidate`, matching the auth forms which already did. The `required` attributes stay: they are the programmatic meaning, and `noValidate` only silences the browser's bubble.
- [x] **Given** a form is rendered but not yet submitted, **When** it first loads, **Then** no error, icon, red border, or `aria-invalid` state is present
  - **Enforced.** `src/ui/form-parts.test.tsx` and `src/ui/form-error-focus.test.tsx` both assert the pre-submit state: no `aria-invalid`, no error element, no error summary. The `aria-invalid` attribute is rendered from `errors[field] ? true : undefined`, so it is absent — not merely false — before the first submit.
- [x] **Given** a field's error text, **When** it renders, **Then** it replaces the helper text beneath the same element id so the `aria-describedby` association is preserved
  - **Enforced.** `src/ui/surface-review.test.ts` → *the describedby rule* asserts that every `aria-describedby` names an id the document contains, and that every `field__helper` id has a matching `field__error` id under the same field.
  - **The defect the gate found.** The image and candidate-image file fields had a helper `<p id="…-describedby">` but **no error element**, so a refused upload had nowhere to render and `aria-describedby` would have kept pointing at the helper. Both fields now render the error in place of the helper under the same id.
- [x] **Given** a field becomes valid again, **When** the user edits it, **Then** its error state, icon, `aria-invalid`, and `aria-describedby` clear immediately
  - **Enforced.** `src/ui/form-error-focus.test.tsx` asserts that editing a field after a failed submit clears its error state.
- [x] **Given** a character counter or other live value, **When** it updates, **Then** it is wrapped in `aria-live="polite"` so the change is announced
  - **Enforced.** `src/ui/character-counter.tsx` carries `aria-live="polite"`; `src/ui/surface-review.test.ts` → *the live-region rule* asserts every live region on every surface declares one.
- [x] **Given** a form field group that becomes newly visible as a result of a legitimate form-level condition, **When** it appears, **Then** the newly revealed group is announced once via `aria-live="polite"`
  - **Vacuous as written — no surface reveals a field group conditionally.** Every form in the product renders its fields unconditionally: the report form's required/optional cards are always present, the claim form's reason field is always present, and the recovery-response form's candidate image is always present (it is optional, not conditionally revealed). There is no "show more", no conditional section, and no stepper that adds a group.
  - **The rule is nonetheless encoded for the next surface that does.** The shared live-region convention is `aria-live="polite"` (`src/ui/character-counter.tsx`), and `src/ui/surface-review.test.ts` → *the live-region rule* asserts it on every surface that has one. A future conditional group inherits the convention; the criterion is met by having nothing to reveal.
- [x] **Given** a status badge, **When** it renders, **Then** it has an `aria-label` containing the status name and always pairs color with a text label and an icon
  - **Enforced.** `src/ui/status-badge.tsx` is the **single** badge component: it renders the icon (`aria-hidden`), the status text, and an `aria-label` naming the kind and the status. `src/ui/status-badge.test.tsx` asserts the label, the visible text, the icon's presence and `aria-hidden`, the colour class, and that a rejected status never paints in a positive tone.
  - **And the badge rule is enforced across every surface.** `src/ui/surface-review.test.ts` → *the badge rule* fails the build if any surface hand-writes a `badge` class instead of going through the shared component. Nine call sites were consolidated onto it during this bolt, so the icon and the `aria-label` cannot disagree with the text.
- [x] **Given** a modal, **When** it renders, **Then** it uses `role="dialog"` with `aria-modal="true"` and an `aria-labelledby` pointing at the modal title
  - **Enforced.** `src/ui/surface-review.test.ts` → *the dialog rule* asserts every `role="dialog"` carries `aria-modal="true"` and an `aria-labelledby`, and a companion test asserts that the `aria-labelledby` resolves to an id the document actually contains.
- [x] **Given** a successful non-blocking action, **When** its toast renders, **Then** it uses `role="status"` (polite)
  - **Enforced.** `src/ui/surface-review.test.ts` → *the live-region rule* asserts every error-summary element carries `role="alert"` **or** `role="status"`; the success path uses `role="status"`.
- [x] **Given** a validation or session error, **When** its toast renders, **Then** it uses `role="alert"` (assertive)
  - **Enforced.** `src/ui/surface-review.test.ts` → *the live-region rule* (as above) and `src/ui/form-error-focus.test.tsx`, which asserts the summary's `role="alert"` appears only after a failed submit and is absent before it.
- [x] **Given** any detail-expansion disclosure, **When** it renders, **Then** it carries `aria-expanded` and `aria-controls` referencing the hidden region by id, and its state updates on toggle
  - **Enforced.** `src/ui/surface-review.test.ts` → *the disclosure rule* asserts every `aria-expanded` control also carries `aria-controls`. `src/ui/disclosure-keyboard.test.tsx` resolves the panel **through** `aria-controls` — so a wrong association fails the test — and asserts the state updates on toggle.
  - **The theme popover's `aria-controls` was added by this bolt.** The toggle had `aria-expanded` with nothing pointing at the panel.
- [x] **Given** any table, **When** it renders, **Then** header cells use `th scope="col"` and sortable headers are buttons carrying `aria-sort`
  - **Enforced.** `src/ui/surface-review.test.ts` → *the table rule* asserts every `<table>` has header cells and that every `<th>` carries `scope="col"`. **No table in the product is sortable** — the listings table offers no column ordering — so the `aria-sort` half of the criterion has nothing to apply to, and the gate has no sortable header to fail.
- [x] **Given** any interactive element, **When** its bounding box is measured, **Then** it is at least 44 x 44 px with at least 8 px spacing between adjacent targets
  - **Enforced.** `src/ui/a11y-contract.test.ts` → *the touch-target contract* reads the stylesheet and asserts every interactive selector's minimum block and inline size is at least 44 px, and that adjacent targets are separated by at least 8 px.
- [x] **Given** the operating system requests reduced motion, **When** any surface renders, **Then** non-essential motion is disabled and status changes remain instant
  - **Enforced.** `src/ui/a11y-contract.test.ts` → *the reduced-motion contract* asserts that under `prefers-reduced-motion: reduce` the stylesheet neutralises every transition and animation, and that the status-change rules have no duration to hide behind.
- [x] **Given** body text on a background, **When** contrast is measured, **Then** it is at least 4.5:1, and large text is at least 3:1, in both the light and dark themes
  - **Enforced, and it caught a shipped defect.** `src/ui/a11y-contract.test.ts` → *the contrast contract* computes the relative luminance of every token pair **in both themes** and asserts the floors. The dark theme had shipped the light theme's semantic soft fills — body text on a soft fill rendered `on-background` against near-white and measured **1.04:1**. The contract suite checks both themes for exactly this reason.
- [x] **Given** an image request, **When** the request reaches the image route, **Then** the server resolves the requester and applies the FR-39 matrix for the owning entity immediately before the blob read
  - **Enforced.** `src/application/listings/report-image-delivery-service.test.ts` and `src/application/listings/candidate-image-delivery-service.test.ts` assert the ordering: the requester is resolved, the matrix is applied, and only then is the blob read called. The two deliveries are deliberately **not** parameterised — the report image and the candidate image have different entities and different viewers, and a shared authorisation is one whose two branches can drift apart.
- [x] **Given** an unauthorized viewer requests an image, **When** the authorization runs, **Then** the blob read is never called and the response is a refusal rather than an image
  - **Enforced.** The two delivery-service suites assert the blob reader is **never** invoked for an unauthorised viewer, and the two route suites assert the response is a refusal.
- [x] **Given** an anonymous viewer, an unrelated member, a claimant on that Found report, or a Recovery responder, **When** each requests a report image, **Then** none of them receives it
  - **Enforced.** `src/domain/listings/image-delivery.ts` → `IMAGE_DELIVERY_COLUMNS = ['foundReportOwner', 'lostReportOwner', 'administrator']` encodes the FR-39 matrix: participation is never permission. The report delivery suites cover all four refused viewers explicitly.
- [x] **Given** a report owner, the Lost-report owner of that Lost report, or an administrator, **When** each requests an image they are entitled to, **Then** the blob is read and streamed
  - **Enforced.** The same suites cover all three entitled viewers and assert the blob is read and streamed.
- [x] **Given** an image response, **When** headers are inspected, **Then** it carries `Cache-Control: private, no-cache` and does not carry `s-maxage`
  - **Enforced.** `src/domain/listings/image-delivery.ts` → `IMAGE_CACHE_CONTROL = 'private, no-cache'`. The two route suites assert the header is present and that **`s-maxage` appears nowhere** in the response.
- [x] **Given** an image response, **When** headers are inspected, **Then** it carries `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`, and its `Content-Type` comes from a server-side allowlist rather than user input or stored blob metadata
  - **Enforced.** `IMAGE_CONTENT_TYPE_OPTIONS = 'nosniff'` and `IMAGE_CONTENT_DISPOSITION = 'inline'`; `src/domain/listings/image-content-type.ts` holds the server-side allowlist. The route suites assert a stored blob declaring a different content type does not change what is served.
- [x] **Given** an image request, **When** authorization and the blob read happen, **Then** authorization runs on every request rather than being satisfied by a cached shared response
  - **Enforced.** The `Cache-Control: private, no-cache` pair with the absence of `s-maxage` is what forces revalidation, and the delivery-service suites assert the authorisation call happens on every request — including the second, identical one.
- [x] **Given** a new surface is added, **When** it is reviewed, **Then** it is checked against every criterion in this story before it is considered complete
  - **Enforced as two machine gates plus a checklist.** This criterion was a convention until this bolt; it is now backed by:
    - **`src/ui/a11y-contract.test.ts`** — the **design-system gate**. The properties of the *tokens*: contrast ratios (both themes), the touch-target floor, the reduced-motion coverage, the focus ring. These hold however many surfaces there are.
    - **`src/ui/surface-review.test.ts`** — the **surface gate**. The properties of *each surface*: the badge, the `aria-describedby` association, the live regions, the table semantics, the disclosures, the dialog, and the native-validation rule. No stylesheet assertion can see these.
    - **`memory-bank/standards/accessibility-review.md`** — the human-facing checklist. Twenty-four rows, each naming the criterion, the rule, and the suite that enforces it, and naming the two rows that are review-only (logical tab order; a *new* modal's focus trap) rather than pretending a gate covers them.
  - **The surface gate reads the `.tsx` sources from disk rather than rendering them.** The trade-off is explicit: a surface written in a way the gate cannot see would pass. The mitigation is that each rule has exactly one way to satisfy it — one shared badge, one `noValidate`, one `<th scope="col">`.

Technical Notes

- WCAG 2.1 AA is a build requirement on every surface, not a QA gate applied at the end. Architecture and QA own the enforcement surface; this story owns the contract.
- Image authorization must live in the route handler immediately adjacent to the blob read. Relying on middleware or the CDN is explicitly unsafe: a cached private response served to the wrong viewer is a data leak, and a shared cache hit would bypass the check entirely.
- `Cache-Control: private, no-cache` is deliberate. It forces browser revalidation so authorization runs on every request, while still permitting cheap `304` responses via `If-None-Match`.
- **Never set `s-maxage` on a private image response.** That directive is what allows an intermediary to serve one viewer a response another viewer triggered.
- Blob access mode is `private` and immutable after store creation. The blob URL is not publicly fetchable; a bare URL hit returns 403.
- A claimant does not see the Found report's image as ownership evidence, and a Recovery responder never sees another candidate's image.
- Validate-after-submit is the shipped behavior: no error state exists before the first submit attempt, the first invalid field takes focus, error text replaces helper text under the same id, and a field's error clears on correction.
- Copy authority: §4.9 error copy, §20.1 keyboard, §20.2 contrast, §20.3 screen readers, §20.4 touch targets, §20.5 forms, §20.6 motion, §20.7 tables, plus the Pass-3 validation report §1 and §2.
- Disabled text is exempt under WCAG 1.4.3 but still meets the 3:1 non-text floor, and a disabled control explains why on focus.
- The prototype under `_bmad-output/.../mockups/` is a visual reference only and is never modified; its manual acceptance is deferred and is never claimed as passed by this workflow.
- **PRD §10's ≤ 2 s p95 initial-HTML budget is a deployment measurement, not a unit-test measurement.** A unit test could only measure the machine it ran on, on a network that is not 4G. `src/app/initial-html-budget.test.ts` therefore asserts the **preconditions** the budget depends on — every route server-rendered, the client bundle limited to the interactive surfaces, no third-party script, one stylesheet, and the theme script inlined rather than fetched — and the actual p95 remains an Operations measurement against the deployed application on a 4G profile. See `memory-bank/standards/accessibility-review.md`, criterion 24.

Dependencies

Requires
- 001-design-foundations-and-theme
- 002-public-and-authentication-surfaces
- 003-member-view-shell-and-navigation
- 004-item-detail-by-relationship
- 005-report-forms-and-member-actions
- 006-claim-and-recovery-threads
- 007-administrator-dashboard
- 008-administrator-queues
- 010-contextual-audit-views

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Shared cache attempts to store a private image response | `Cache-Control: private, no-cache` and no `s-maxage` prevent it |
| Second request arrives with a valid `If-None-Match` | Authorization still runs; a cheap 304 is returned only after the check |
| Viewer is the report owner but on a different browser session | Entitlement is evaluated per request, never per session |
| Stored blob metadata declares a content type | The served `Content-Type` comes from the server-side allowlist, not the metadata |
| Anonymous user requests an image URL directly | Refused; the blob read is never called |
| Keyboard user opens the theme popover and presses Escape | Popover closes and focus returns to the trigger |
| Screen reader user submits an invalid form | The `role="alert"` summary is announced and focus lands on the first invalid field |
| User with reduced motion opens a confirmation modal | Modal appears instantly with no entry or exit transition |

Out of Scope

- Image validation rules, quota enforcement, and storage layout — `image-handling.md` §1 and §4
- The FR-39 matrix itself — Unit 002
- Image upload and replacement flows — Unit 002
- Automated image moderation — explicitly prohibited by the frozen PRD
- Any accessibility change to `DESIGN.md` tokens — the tokens are the constraint
- Prototype manual acceptance — deferred and never claimed by this workflow
