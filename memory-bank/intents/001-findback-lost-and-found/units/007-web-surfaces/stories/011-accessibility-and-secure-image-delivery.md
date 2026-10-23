---
id: 011-accessibility-and-secure-image-delivery
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: []
realizes_fr: [FR-37, FR-39]
---

# Story: 011-accessibility-and-secure-image-delivery

User Story

**As a** member or administrator using a keyboard, a screen reader, or reduced-motion settings
**I want** every surface to meet WCAG 2.1 AA and every image to be authorized at the server before it is read
**So that** FindBack is operable by everyone it is for, and a private image is never served to someone who is not entitled to it

Acceptance Criteria

- [ ] **Given** any interactive element on any surface, **When** a keyboard user tabs through the page, **Then** every element is reachable in a logical tab order and has a visible focus ring with no `outline: none` without a replacement
- [ ] **Given** a modal dialog on any surface, **When** it is open, **Then** focus is trapped inside it, Escape dismisses it with cancel as the default, and focus returns to the triggering element on close
- [ ] **Given** a dropdown or menu, **When** it is interacted with, **Then** it opens with Enter or Space, navigates with the arrow keys, and closes with Escape
- [ ] **Given** a form field, **When** it renders, **Then** the label is persistent and programmatically associated, and required fields carry both `required` and `aria-required="true"`
- [ ] **Given** a form is submitted with errors, **When** the errors render, **Then** the error summary carries `role="alert"`, the first invalid field receives focus, and the page scrolls to the first error
- [ ] **Given** a form is rendered but not yet submitted, **When** it first loads, **Then** no error, icon, red border, or `aria-invalid` state is present
- [ ] **Given** a field's error text, **When** it renders, **Then** it replaces the helper text beneath the same element id so the `aria-describedby` association is preserved
- [ ] **Given** a field becomes valid again, **When** the user edits it, **Then** its error state, icon, `aria-invalid`, and `aria-describedby` clear immediately
- [ ] **Given** a character counter or other live value, **When** it updates, **Then** it is wrapped in `aria-live="polite"` so the change is announced
- [ ] **Given** a form field group that becomes newly visible as a result of a legitimate form-level condition, **When** it appears, **Then** the newly revealed group is announced once via `aria-live="polite"`
- [ ] **Given** a status badge, **When** it renders, **Then** it has an `aria-label` containing the status name and always pairs color with a text label and an icon
- [ ] **Given** a modal, **When** it renders, **Then** it uses `role="dialog"` with `aria-modal="true"` and an `aria-labelledby` pointing at the modal title
- [ ] **Given** a successful non-blocking action, **When** its toast renders, **Then** it uses `role="status"` (polite)
- [ ] **Given** a validation or session error, **When** its toast renders, **Then** it uses `role="alert"` (assertive)
- [ ] **Given** any detail-expansion disclosure, **When** it renders, **Then** it carries `aria-expanded` and `aria-controls` referencing the hidden region by id, and its state updates on toggle
- [ ] **Given** any table, **When** it renders, **Then** header cells use `th scope="col"` and sortable headers are buttons carrying `aria-sort`
- [ ] **Given** any interactive element, **When** its bounding box is measured, **Then** it is at least 44 x 44 px with at least 8 px spacing between adjacent targets
- [ ] **Given** the operating system requests reduced motion, **When** any surface renders, **Then** non-essential motion is disabled and status changes remain instant
- [ ] **Given** body text on a background, **When** contrast is measured, **Then** it is at least 4.5:1, and large text is at least 3:1, in both the light and dark themes
- [ ] **Given** an image request, **When** the request reaches the image route, **Then** the server resolves the requester and applies the FR-39 matrix for the owning entity immediately before the blob read
- [ ] **Given** an unauthorized viewer requests an image, **When** the authorization runs, **Then** the blob read is never called and the response is a refusal rather than an image
- [ ] **Given** an anonymous viewer, an unrelated member, a claimant on that Found report, or a Recovery responder, **When** each requests a report image, **Then** none of them receives it
- [ ] **Given** a report owner, the Lost-report owner of that Lost report, or an administrator, **When** each requests an image they are entitled to, **Then** the blob is read and streamed
- [ ] **Given** an image response, **When** headers are inspected, **Then** it carries `Cache-Control: private, no-cache` and does not carry `s-maxage`
- [ ] **Given** an image response, **When** headers are inspected, **Then** it carries `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`, and its `Content-Type` comes from a server-side allowlist rather than user input or stored blob metadata
- [ ] **Given** an image request, **When** authorization and the blob read happen, **Then** authorization runs on every request rather than being satisfied by a cached shared response
- [ ] **Given** a new surface is added, **When** it is reviewed, **Then** it is checked against every criterion in this story before it is considered complete

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
