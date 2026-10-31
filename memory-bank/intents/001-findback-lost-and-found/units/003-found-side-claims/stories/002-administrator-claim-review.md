---
id: 002-administrator-claim-review
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 016-claim-decisions
implemented: true
traces_to: [FR-16]
---

# Story: 002-administrator-claim-review

User Story

**As an** administrator
**I want** a review screen that shows a pending claim beside the item details and any competing pending claims
**So that** I can judge ownership evidence and know whether this claim is contested

Acceptance Criteria

- [x] **Given** an administrator and a `Pending` claim, **When** they open the claim review screen, **Then** the screen shows the claim's reason, identifying details, and date lost
- [x] **Given** an administrator and a `Pending` claim, **When** they open the claim review screen, **Then** the screen shows the Found item details for the report the claim targets
- [x] **Given** a `Pending` claim, **When** the review screen is assembled, **Then** the count of other `Pending` claims on the same item is displayed
- [x] **Given** a `Pending` claim with other `Pending` claims on the same item, **When** the review screen is assembled, **Then** those other claims are listed by reference so the administrator can see whether this is the only claim
- [x] **Given** other claims on the same item that are `Approved` or `Rejected`, **When** the review screen is assembled, **Then** those claims are not counted in or listed as competing pending claims
- [x] **Given** a non-administrator actor, **When** they request the claim review screen, **Then** access is refused and the claim's reason and identifying details are not returned
- [x] **Given** a claim that is no longer `Pending`, **When** an administrator opens the review screen for a decision, **Then** the decision action is unavailable and the recorded decision is shown instead

Technical Notes

- The review screen is a read-only assembly of Claim, item, and competing-Claim data; it performs no state transition
- Competing claims are shown by reference and are not editable or decidable from this screen
- Claim reason and identifying details are Sensitive Fields rendered here under administrator authorization only (FR-37, FR-39); this screen is the one place the finder is not a viewer of them
- Claim-state freshness under concurrent review is Architecture-owned (UX-OQ-B); this story defines the data returned, not the refresh mechanism
- Rendering of this screen is owned by Unit 007; this story defines the assembled data

Dependencies

Requires
- 001-submit-a-claim

Enables
- 003-approve-a-claim
- 004-reject-a-claim

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Claim is the only claim on the item | Competing count is zero and no competing claims are listed |
| Many competing claims | All competing `Pending` claims are listed by reference with the count matching the list length |
| Two administrators open the same claim for review | Both may read the screen; a later decision on a non-`Pending` claim is a conflict, not an overwrite (UX-OQ-B) |
| Non-administrator crafts a direct request for claim evidence | Refused; no reason or identifying details in the response |

Out of Scope

- The Pending Claims Queue across all items (FR-34, Unit 006)
- The Approve and Reject actions (stories 003 and 004)
- Screen rendering and styling (Unit 007)
---
