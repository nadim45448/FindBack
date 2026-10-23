---
id: 007-lost-side-notification-events
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:50:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-46]
---

# Story: 007-lost-side-notification-events

User Story

**As a** participant in a Lost-side recovery
**I want** to be told what happens to my response
**So that** I know whether the item was found and what I should do next

Acceptance Criteria

- [ ] **Given** Lost-side email events 4, 5, and 6, **When** they fire, **Then** each reaches its defined recipient according to the PRD notification table
- [ ] **Given** a Lost report confirmed `Returned`, **When** event 7 fires, **Then** it is delivered to the Lost-report owner
- [ ] **Given** a matched response that reached `Completed — Report Returned` and a report that reached `Returned`, **When** event 8 fires, **Then** it is delivered to the matched responder
- [ ] **Given** a response at `Match Confirmed` while the report is still `Verification Pending`, **When** notifications are evaluated, **Then** event 8 does **not** fire
- [ ] **Given** standby and resolved responders, **When** event 8 is dispatched, **Then** they do not receive it
- [ ] **Given** events 7 and 8, **When** the Lost Returned transition commits, **Then** they fire atomically with it
- [ ] **Given** any notification send failure, **When** it occurs, **Then** the underlying transition still stands and the failure is logged without sensitive values
- [ ] **Given** the frozen product's notification rules, **When** any surface is designed, **Then** no unsupported channel and no event beyond those enumerated in FR-46 is introduced

Technical Notes

- Events 4–8 are the Lost-side set. The Found-side events (new claim, claim decision) belong to Unit 003 (FR-28, FR-29).
- Event 8's gate is deliberately narrow: `Completed — Report Returned` **and** report `Returned`. Firing it earlier would tell a responder the item was returned before it actually was.
- FR-30 forbids unsupported channels and events; this story must not become a place to add one. There is no in-app notification stream in this product.

Dependencies

Requires
- 004-complete-lost-verification-closeout

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Matched responder's address bounces | Transition stands; failure logged |
| Owner and matched responder are the same person | Both events evaluate; duplication is acceptable and correct |
| Send attempted before commit | Never occurs; sends are strictly post-commit |

Out of Scope

- Found-side notification events (Unit 003)
- Any SMS, push, or in-app notification channel (FR-30)
- Rendering the email body copy, which is specified in the frozen PRD