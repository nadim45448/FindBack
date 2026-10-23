---
id: 009-no-other-notifications
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-30]
---

# Story: 009-no-other-notifications

User Story

**As the** FindBack product
**I want** to prove that no in-app notification stream exists anywhere in the interface
**So that** FR-30 is enforced as a verified absence rather than trusted as an intention, because a notification stream is a promise the product has deliberately chosen not to keep

Acceptance Criteria

- [ ] **Given** every rendered route in the application, **When** its DOM is inspected, **Then** there is no notification bell, no badge counter on any icon, and no unread indicator
- [ ] **Given** every rendered route, **When** its DOM is inspected, **Then** there is no notification centre, no notification drawer, and no notification inbox
- [ ] **Given** every rendered route, **When** its DOM is inspected, **Then** there is no `Notifications` nav item, no notification settings, and no notification preferences control
- [ ] **Given** a background event occurs, **When** the affected user is online, **Then** no toast, snackbar, banner, or in-page notification is raised for it
- [ ] **Given** a background event occurs, **When** the affected user returns to any surface, **Then** no unread marker, dot, count, or `new` label is present on any element
- [ ] **Given** the administrator dashboard, **When** it renders, **Then** it contains no activity feed, no `Recent activity` aggregation, and no timeline of background events
- [ ] **Given** the member dashboard, **When** it renders, **Then** it contains no activity feed and no aggregate list of events across reports, Claims, and Recovery Responses
- [ ] **Given** any administrator queue, **When** its contents change, **Then** no element announces the change to the user
- [ ] **Given** any page, **When** it renders, **Then** the set of user-facing events it surfaces is limited to the actions the user just took in that page, and each of those is an inline confirmation, a `role="status"` toast, or a page-level success state
- [ ] **Given** the notification channels the product supports, **When** they are enumerated, **Then** the set is exactly the eight FR-46 business email events plus the FR-51 authentication email, and no other channel exists
- [ ] **Given** the notification events the product supports, **When** they are enumerated, **Then** no event exists beyond those enumerated in the frozen PRD, and no ninth FR-46 event is introduced
- [ ] **Given** a notification-adjacent concept, **When** it is proposed as a new feature, **Then** it is rejected unless it is added to the frozen PRD first
- [ ] **Given** a password reset request, **When** it completes, **Then** the only product surface is `/forgot-sent` and no in-app notification exists for password-reset status
- [ ] **Given** a member profile edit, **When** it is saved, **Then** the only confirmation is the success toast `Profile updated.` and no notification is recorded or surfaced
- [ ] **Given** a per-Claim or per-Recovery-Response message, **When** it is sent, **Then** the recipient receives no email and no in-app notification and learns of it only on returning to the thread
- [ ] **Given** a Lost report reaches `Returned`, **When** the transition occurs, **Then** no in-app notification is raised for either party
- [ ] **Given** the absence is verified, **When** the verification is written up, **Then** it lists every route inspected and states explicitly that each was found to contain no notification surface

Technical Notes

- FR-30 is a **negative** requirement. It is satisfied by an absence, so it cannot be verified by a positive feature test. The acceptance criteria above are written as inspectable assertions so that the absence is proven, not assumed.
- This story builds nothing. Its deliverable is the verification and the architectural constraint that keeps the absence true.
- The `Recent activity` aggregation on the administrator dashboard was deliberately removed in the 2026-09-17 reconciliation. Any reappearance is a regression.
- The eight FR-46 events are the complete business email catalogue. The FR-51 password-reset email is an authentication message and is not a ninth FR-46 event.
- Standby responders receive Event 5 only if selected; auto-resolving responders receive nothing and discover their terminal status by visiting `My Recovery Responses`.
- Returned is explicitly not an email event on the Found side.
- Copy authority: §13.6 notifications, §13.7 Lost-side email events and their critical rules, §15.1 dashboard, §9.4 member dashboard, §4.9 error copy.
- A verification that reports "no notification surface found" must be falsifiable. Route-by-route inspection with recorded results is the minimum bar; an assertion that the absence "should hold" is not evidence.

Dependencies

Requires
- 001-design-foundations-and-theme
- 007-administrator-dashboard
- 008-administrator-queues

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A Claim is approved on an item the administrator has open | The screen reflects the change on the next server interaction; no toast, bell, or badge |
| A new Pending Claim arrives while an administrator is on the dashboard | The Pending Claims tile count updates on reload; no notification appears |
| A responder's response is auto-resolved to `Resolved — Report Returned` | No email and no in-app notification; the responder learns on next visit |
| Two accounts exist, one with events and one without | Neither surface distinguishes itself in the UI |
| A developer proposes adding a bell for convenience | Rejected; the PR is not frozen for this change |

Out of Scope

- Sending the eight FR-46 email events — Units 003, 004, and 005
- The FR-51 password-reset email — Unit 001
- Toasts for the user's own just-completed action — story 005
- Any product change to `EXPERIENCE.md` or the frozen PRD
