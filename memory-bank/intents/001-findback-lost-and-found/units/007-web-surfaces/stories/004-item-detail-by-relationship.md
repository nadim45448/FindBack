---
id: 004-item-detail-by-relationship
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: []
realizes_fr: [FR-39, FR-13, FR-37]
---

# Story: 004-item-detail-by-relationship

User Story

**As a** viewer of an item
**I want** the detail page rendered for exactly my relationship to that item
**So that** I see what I am entitled to see and nothing more, with the guarantee that hiding is done by the server before the data reaches my browser

Acceptance Criteria

- [ ] **Given** an item detail page, **When** it renders, **Then** the sections appear in the documented order: header (item name, type badge, status badge), summary (category, date, campus area), description, image, location, identifying details, reporter, member-facing status history, administrator-only audit trail, and role-dependent actions
- [ ] **Given** the server has applied the FR-39 projection, **When** the detail page renders, **Then** the page renders the projected field set and performs no second visibility evaluation of its own
- [ ] **Given** a hidden field, **When** the page renders, **Then** a `Hidden from other members` label appears next to the section heading and the field's value is absent from the delivered HTML rather than merely concealed
- [ ] **Given** a sensitive field that is hidden, **When** the reporter fills the report form, **Then** the field is marked `Sensitive` inline with the helper `This is hidden from other members.`
- [ ] **Given** an anonymous visitor, **When** they reach an item, **Then** only public summary fields are available and there is no detail page, no image, no description, no reporter name, no Claim content, and no Recovery Response content
- [ ] **Given** an authenticated member with no relationship to the item, **When** they open the detail page, **Then** they see name, category, date, campus area, type, public lifecycle status, description, image, reporter display name, and member-facing status history, and no exact place, no identifying details, no Claim content, and no Recovery Response content
- [ ] **Given** a Found-report owner, **When** they open their own Found report, **Then** they see their own report's exact place and identifying details plus a `your Found report` toolbar, and they do not see claimant reason or claimant identifying details
- [ ] **Given** a claimant on a Found report, **When** they open that item's detail page, **Then** they see their own Claim detail and the per-Claim thread entry point, and they do not see the Found report's exact place or identifying details
- [ ] **Given** a Recovery responder on a Lost report, **When** they open that item's detail page, **Then** they see their own Recovery Response fields and their own per-Response thread entry point, and they do not see the Lost report's exact place, its identifying details, other responders' responses, or other responders' threads
- [ ] **Given** a Lost-report owner, **When** they open their own Lost report, **Then** they see full visibility including every Recovery Response on it and a per-Response thread entry point for each
- [ ] **Given** an administrator, **When** they open an item detail page, **Then** they see everything including the audit trail entry point
- [ ] **Given** a member submits a Claim on a Found report, **When** the detail page is re-rendered for that member, **Then** the Found report's Sensitive Fields remain hidden and no new field appears
- [ ] **Given** a member submits a Recovery Response on a Lost report, **When** the detail page is re-rendered for that member, **Then** the Lost report's Sensitive Fields remain hidden and no new field appears
- [ ] **Given** any viewer, **When** the member-facing status history renders, **Then** it is a short list of at most 3 most-recent entries showing timestamp, status label, and `by {actor}`, with no audit verb and no additional fields
- [ ] **Given** a member viewing their own item, **When** they look for the full audit trail, **Then** no control or disclosure exposes it
- [ ] **Given** an `Active` member viewing a Found item in `Open` or `Claim Requested` with no Pending Claim from them, **When** actions render, **Then** `Submit claim` is offered
- [ ] **Given** an `Active` member viewing a Lost item that is `Open` or `Verification Pending` before `Match Confirmed` and who is not the Lost-report owner, **When** actions render, **Then** `I may have found this item` is offered and never `Submit claim`
- [ ] **Given** a member who is ineligible to act, **When** an action control renders, **Then** it is disabled and explains why on focus
- [ ] **Given** an item detail page, **When** it renders in both themes, **Then** the type badge and status badge pair their color with a text label and an icon so color is never the sole carrier of meaning

Technical Notes

- **This unit must not re-implement the FR-39 matrix as a display filter.** The server already filtered the data before delivery. A client-side filter would hide a data leak rather than fix one: the value would still be in the payload, the DOM, or the network tab. If the projected payload ever contains a field the viewer must not see, that is a server defect and must be raised, not masked here.
- FR-39 is owned by Unit 002 (story `010-visibility-matrix-by-actor`). This story consumes the projection and renders it.
- Visibility never dynamically unlocks. Submitting a Claim or a Recovery Response confers no new visibility on the report itself. This is the single most consequential rule on this page.
- Reporter and claimant are never merged as audiences. A claimant on a Found report gains nothing about the report's exact place or identifying details; a responder on a Lost report gains nothing about that Lost report's exact place or identifying details.
- The Lost-report owner is the only non-administrator with cross-response visibility.
- Copy authority: §4.2 status labels, §4.3 and §4.5 lifecycle microcopy, §4.6 Recovery Response microcopy, §4.9 error copy, §11.1 visibility matrix and critical notes, §11.3 detail-page composition, §11.4 permissions are intentional.
- Match Confirmed is a Recovery Response status, never a Lost report status. The Lost report stays `Verification Pending` throughout the Match Confirmed to physical-handoff window and must not be displayed as `Returned`.
- Member-facing status history is distinct from the administrator audit trail and is capped at three entries.

Dependencies

Requires
- 001-design-foundations-and-theme
- 003-member-view-shell-and-navigation

Enables
- 006-claim-and-recovery-threads
- 010-contextual-audit-views

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Claimant also happens to be the Found-report owner | Ownership wins; full own-report visibility applies and no audience merge is needed |
| Anonymous viewer requests the item detail URL directly | No anonymous detail page exists; access screen or redirect per §6.2 |
| Viewer is a responder on one Lost report and unrelated to another | Each page is evaluated independently against that item |
| Report is `Returned` or `Closed` | Actions are view-only; status and closing action remain annotated |
| Hidden field is present in the payload but not rendered | Treated as a server defect and raised, never hidden client-side |
| Item has no image | The image section is omitted; the layout does not reserve an empty frame |

Out of Scope

- The FR-39 matrix and its enforcement — Unit 002
- Claim and Recovery Response forms — story 006
- Per-Claim and per-Recovery-Response threads — story 006
- The administrator audit trail view — story 010
- Image authorization and streaming — story 011
