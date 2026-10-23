---
id: 008-administrator-queues
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-34, FR-35, FR-50]
---

# Story: 008-administrator-queues

User Story

**As an** administrator
**I want** four working queues that each list exactly their own work and link into it
**So that** I can move from "something needs me" to "I have handled it" without hunting across the product

Acceptance Criteria

- [ ] **Given** an administrator opens `/admin/registrations`, **When** the queue renders, **Then** it is a table of name, email, self-declared role, registration timestamp, and action, with `Approve` as a primary action and `Reject` as a danger action that opens a reason modal requiring at least 5 characters
- [ ] **Given** the Pending Registrations queue is empty, **When** it renders, **Then** it shows `No pending registrations.` and the note `When someone new registers, they appear here.`
- [ ] **Given** the Pending Registrations queue has rows, **When** it renders, **Then** rows are sorted oldest first by default
- [ ] **Given** an administrator opens `/admin/claims`, **When** the queue renders, **Then** it is a table of claim ID, item name linking to the item, claimant display name, submission time, and action, with `Review` linking to the claim review screen
- [ ] **Given** the Pending Claims queue is empty, **When** it renders, **Then** it shows `No pending claims.`
- [ ] **Given** a Claim queue row, **When** the queue is filtered or sorted, **Then** rows are sorted oldest first by default
- [ ] **Given** the Pending Claims queue, **When** its contents are evaluated, **Then** it contains Found-side Claims only and no Lost-side rows ever appear in it
- [ ] **Given** an administrator opens `/admin/awaiting-return`, **When** the queue renders, **Then** it is a table of item name, claimant name, approval time, and action, with `Confirm Returned` linking to the Found-side Confirm Returned surface
- [ ] **Given** the Items Awaiting Return queue is empty, **When** it renders, **Then** it shows `No items are awaiting return.`
- [ ] **Given** the Items Awaiting Return queue, **When** its contents are evaluated, **Then** it contains Found reports in `Claim Approved` only and no Lost report ever appears in it
- [ ] **Given** an administrator opens `/admin/verifications`, **When** the queue renders, **Then** it is a table of Lost report name, Lost-report owner, currently selected responder, verification started at, and action, with `Manage verification` linking to `/admin/lost/:id`
- [ ] **Given** the Items in Verification queue is empty, **When** it renders, **Then** it shows `No items are in verification.`
- [ ] **Given** the Items in Verification queue, **When** its contents are evaluated, **Then** it contains Lost reports in `Verification Pending` only and no Found report ever appears in it
- [ ] **Given** any of the four queues, **When** rows are inspected, **Then** audit is not a fifth queue and no queue links to `/admin/audit`
- [ ] **Given** any queue, **When** it renders, **Then** every row action is a link or button that reaches the specific work item, not a generic detail page
- [ ] **Given** any queue, **When** it renders as a semantic table, **Then** header cells use `th scope="col"` and sortable headers are buttons carrying `aria-sort` of `ascending`, `descending`, or `none`
- [ ] **Given** any of the four administrator queues, **When** it is navigated by keyboard, **Then** it implements the ARIA grid pattern with `role="grid"`, `role="row"`, `role="gridcell"`, roving `tabindex` on the focused row, and arrow-key navigation between rows
- [ ] **Given** any queue is loading, **When** it renders, **Then** a skeleton table renders using theme tokens
- [ ] **Given** any queue fails to load, **When** the error renders, **Then** a calm message appears with a retry button and diagnostics are logged server-side
- [ ] **Given** a non-administrator requests any `/admin/*` route, **When** the response renders, **Then** the access screen shows `This area is for administrators only.`
- [ ] **Given** a queue table on a viewport below 640 px, **When** it renders, **Then** rows collapse to stacked cards and remain readable and keyboard-reachable
- [ ] **Given** a queue row and its action control, **When** measured, **Then** the control presents an interactive bounding box of at least 44 x 44 px
- [ ] **Given** a Claim is approved while the Pending Claims queue is open, **When** the next server interaction occurs, **Then** the queue reflects the new state and no toast or bell announces the change
- [ ] **Given** any queue, **When** a row's action is activated, **Then** the resulting surface uses the owner-determines / administrator-records wording and never the forbidden phrasings

Technical Notes

- FR-34 (Pending Claims) and FR-35 (Items Awaiting Return) are Found-side. FR-50 (Items in Verification) is Lost-side. Keeping the sides in separate queues is deliberate; mixing them would lose the operational distinction.
- Pending Registrations is owned by FR-3 and is included here because it is the fourth administrator queue and shares the queue shell.
- The dashboard tile counts and the queue contents are served from the same query so they cannot disagree.
- The ARIA grid pattern with roving `tabindex` is required for all four operational queues, not just this story's three. Cells inside the focused row are reached with Tab.
- Empty-state copy is fixed per queue and is not shared boilerplate.
- Sort is oldest-first by default for Pending Registrations and Pending Claims, matching the queue's oldest-work-first operational intent.
- Copy authority: §15.2, §15.3, §15.4, §15.5 queue composition and empty states, §15.6 loading/error/permission, §5.7 tables, §5.8 badges, §20.1 keyboard and ARIA grid, §20.7 tables, §21 responsive behavior.
- On the Lost-side verification surface reached from this queue, the actions read `Record owner's Match Confirmed`, `Record owner's Not a Match`, `Confirm Returned`, `Administrator Close`, and `Exceptional Administrator cancellation`. The forbidden phrasings are `Administrator confirms ownership`, `Administrator decides match`, and `Verify ownership`.
- Queue rows never link to a global audit route; audit is contextual — story 010.
- No queue emits a notification when its contents change — story 009.

Dependencies

Requires
- 001-design-foundations-and-theme
- 003-member-view-shell-and-navigation
- 007-administrator-dashboard

Enables
- 010-contextual-audit-views

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A Found item has three competing Pending Claims | Three rows in `/admin/claims`, oldest first |
| A Found report reaches `Claim Approved` | It leaves `/admin/claims` and appears in `/admin/awaiting-return` |
| A Lost report's selected response reaches `Match Confirmed` | The report remains in `/admin/verifications` until `Returned` or `Closed` |
| A Claim is rejected and no other Pending Claims remain | The item returns to `Open` and leaves the queue |
| Two administrators act on the same row | The losing action surfaces the concurrent-action conflict state calmly |
| Registration reject reason is 4 characters | Modal rejects it; at least 5 characters are required |
| Queue is empty on first load | The queue's own empty-state copy renders, not a blank table |
| Non-administrator requests `/admin/verifications` | Access screen with `This area is for administrators only.` |

Out of Scope

- The Claim approval, rejection, and auto-rejection mechanics — Unit 003
- The Lost-side verification record actions — Unit 004
- Confirm Returned mechanics — Unit 005
- The claim review screen's competing-claim bottom strip — Unit 003
- Account management `/admin/accounts` — Unit 001
- The contextual audit views — story 010
- Any notification for a queue change — story 009
