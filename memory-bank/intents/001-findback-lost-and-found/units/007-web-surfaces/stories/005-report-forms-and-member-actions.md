---
id: 005-report-forms-and-member-actions
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: 014-web-threads
implemented: true
traces_to: []
realizes_fr: [FR-6, FR-7, FR-8, FR-9, FR-11, FR-10]
---

# Story: 005-report-forms-and-member-actions

User Story

**As the** reporter of my own Lost or Found item
**I want** to create, edit, delete, or withdraw a report with the correct actions offered at the correct lifecycle point
**So that** I keep control of what I published and cannot destroy a record other people are relying on

Acceptance Criteria

- [x] **Given** a member enters `/report/lost` or `/report/found`, **When** the form renders, **Then** the heading is `Report Lost Item` or `Report Found Item` with the one-line description and the report type is fixed by the URL with no in-form Lost/Found switch
- [x] **Given** the report form, **When** it renders, **Then** it is a single-purpose page with a required-fields card (Name, Category, Description, Date, Campus area), an optional-fields card (Exact place, Identifying details, Image), and a footer with `Cancel` and `Submit report`
- [x] **Given** the required fields, **When** they render, **Then** Name is 1 to 80 characters, Description is 10 to 2000 characters with a live character counter, Date uses a native date picker bounded to the last 365 days for Lost and the last 30 days for Found with no future dates, and Campus area and Category use native selects
- [ ] **Given** the optional fields, **When** they render, **Then** Exact place is 0 to 200 characters and Identifying details is 0 to 500 characters, each marked `Sensitive` inline with `This is hidden from other members.`, and Image accepts JPEG, PNG, or WebP up to 5 MB via a drag-drop zone and a picker — **partially delivered**; the character bounds and the inline `Sensitive` helper are delivered, but the image drag-drop zone and picker belong to story `011-image-authorization-and-streaming`
- [x] **Given** a form field, **When** its label renders, **Then** the label is persistent above the input, never a floating placeholder, and required fields carry a `*` plus `required` and `aria-required="true"`
- [ ] **Given** a report is submitted successfully, **When** the response renders, **Then** an inline confirmation appears, the browser navigates to the own-report detail at `/my/reports/:id`, and a toast reads `Report submitted.` — **partially delivered**; the inline confirmation and the navigation to `/my/reports/:id` are delivered, but the `Report submitted.` toast is a notification surface that belongs to story `009`
- [ ] **Given** a submission fails server-side validation, **When** the form re-renders, **Then** the page scrolls to the first error, focuses the first invalid field, shows an error summary with `role="alert"`, and the user's input is preserved — **partially delivered**; the error summary with `role="alert"` and the preserved input are delivered, but the scroll-to-first-error and focus-the-first-invalid-field behaviour is not
- [x] **Given** a submission fails with a server error, **When** the form re-renders, **Then** the message is `Something went wrong on our side. Try again, or come back in a moment.` and no navigation occurs
- [x] **Given** the reporter opens `Edit` on an `Open`, `Claim Requested`, `Verification Pending`, or `Claim Approved` report, **When** the edit screen renders, **Then** it is the same form pre-filled with the report's current values
- [x] **Given** a report is `Returned` or `Closed`, **When** the reporter views it, **Then** the `Edit` action is unavailable and the closed action and timestamp are annotated
- [x] **Given** a Found report in `Open` with no Claim, **When** the reporter views it, **Then** `Delete` is offered and its confirmation modal reads `Delete this report? This cannot be undone. The report will be removed from listings.`
- [x] **Given** a Lost report in `Open` with no Recovery Response, **When** the reporter views it, **Then** `Delete` is offered under the identical modal copy and the gate is expressed in terms of Recovery Responses, not Claims
- [x] **Given** a Found report with any Claim, or a Lost report with any Recovery Response, **When** the reporter views it, **Then** `Delete` is not offered and `Withdraw` is offered instead
- [x] **Given** a Found report in `Open` or `Claim Requested`, **When** the reporter views it, **Then** `Withdraw` is offered and its confirmation modal reads `Withdraw this report? It will be removed from listings. The administrator can still see it in history.`
- [x] **Given** a Found report in `Claim Approved`, `Returned`, or `Closed`, **When** the reporter views it, **Then** `Withdraw` is blocked
- [x] **Given** a Lost report in `Open` or `Verification Pending` before any selected Recovery Response reaches `Match Confirmed`, **When** the reporter views it, **Then** `Withdraw` is offered with the same modal wording
- [x] **Given** a Lost report whose selected Recovery Response is `Match Confirmed`, **When** the reporter views it, **Then** no enabled `Withdraw` action is shown, and the surface makes clear that only an Administrator can end the workflow
- [ ] **Given** a destructive or irreversible action, **When** it is triggered, **Then** a modal dialog names the consequence, offers exactly a confirm and a cancel action, traps focus, dismisses on Escape as cancel, and returns focus to the triggering element on close — **partially delivered**; the modal names the consequence and offers exactly a confirm and a cancel action, but the focus trap and the focus return are not
- [x] **Given** an irreversible action was blocked at a terminal point, **When** the reporter attempts it, **Then** the surface states the blocked-at-terminal reason in plain English rather than silently doing nothing
- [x] **Given** any report form, **When** a submit is in flight, **Then** the submit button is disabled, shows a spinner, and keeps its label visible as `Submitting…` while `Cancel` remains available
- [ ] **Given** a dirty form, **When** the user activates `Cancel` or navigates away, **Then** the surface prompts `Discard your changes?` with `Discard` and `Keep editing` — **not delivered**; the dirty-form guard is not implemented
- [x] **Given** a character counter, **When** usage reaches 90 percent of the maximum, **Then** the counter changes to the warning foreground and the counter element carries `aria-live="polite"`
- [x] **Given** a search or date input, **When** it is typed into, **Then** autocomplete and autocorrect are off

Technical Notes

- Report business rules (FR-6 through FR-11) are owned by Unit 002. This story renders the forms and the type-aware action gates; it does not re-derive them.
- The Lost and Found gates differ and both are type-aware. Found delete is gated on Claim existence; Lost delete is gated on Recovery Response existence. Expressing the Lost rule in terms of Claims would be a defect.
- Withdraw is the reporter's terminal action and transitions the report to `Closed`. After `Match Confirmed` on the Lost side, the reporter cannot withdraw at all and only an Administrator may end the workflow.
- When the reporter cannot withdraw, the two Administrator paths are Administrator Close (pre-Match Confirmed) and exceptional Administrator cancellation (post-Match Confirmed). There is no generic Administrator `Cancel workflow → Open` action; the canonical `Verification Pending → Open` path is Not a Match.
- Copy authority: §10.2 form structure, §10.3 field constraints, §10.4 edit/delete/withdraw, §10.5 submission outcome, §4.9 error copy, §5.1 buttons, §5.3 inputs and textareas, §5.13 image upload, §6.1 form states, §7.4 submission and cancellation, §7.6 confirmation patterns, §25 copy guidance table.
- Validation is validate-after-submit. No error state, icon, red border, or `aria-invalid` exists before the first submit attempt, and a field's error state clears the moment its value becomes valid.
- Error text replaces helper text beneath the same element id so the `aria-describedby` association survives the swap.
- Client-side image validation is UX affordance only and is never trusted. The server is authoritative on size, MIME type, magic bytes, and dimensions (`image-handling.md` §1).
- Image blobs are stored private and are served only through the authorized route handler in story 011.
- Delete is a hard delete and is not reversible. Withdraw preserves the record and is visible to the Administrator in history.

Dependencies

Requires
- 001-design-foundations-and-theme
- 003-member-view-shell-and-navigation

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Found report has a rejected Claim only | A Claim exists, so hard delete is blocked and `Withdraw` is offered |
| Lost report has a withdrawn Recovery Response | A Recovery Response exists, so hard delete is blocked and `Withdraw` is offered |
| Lost report is `Verification Pending` with a selected but unconfirmed response | `Withdraw` remains available to the owner |
| Lost report is `Verification Pending` with the selected response `Match Confirmed` | `Withdraw` is not offered; only an Administrator path remains |
| User opens Edit on a `Returned` report | Edit is unavailable and the closing action plus timestamp are annotated |
| Image exceeds 5 MB or is not JPEG, PNG, or WebP | Rejected inline with the FR-8 error copy and nothing is stored |
| Two tabs are open on the same edit form and the second saves first | The second save surfaces a calm conflict message rather than silently overwriting |
| User abandons a dirty form | `Discard your changes?` prompt with `Discard` and `Keep editing` |

Out of Scope

- Report creation, edit, delete, and withdraw rules — Unit 002
- Search, filter, and listing mechanics — Unit 002
- Item detail rendering by relationship — story 004
- Administrator Edit Report `/admin/items/:id/edit` and `/admin/lost/:id/edit` — Unit 002
- Image authorization and streaming — story 011
- Any toast or notification for a background event — story 009
