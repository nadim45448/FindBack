---
id: 005-delete-own-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-10]
---

# Story: 005-delete-own-report

User Story

**As a** member who filed a report by mistake
**I want** to delete my own report
**So that** it stops appearing in listings

Acceptance Criteria

- [ ] **Given** an `Open` Found report with no Claim on it, **When** the owner deletes it, **Then** the report and its audit entries are hard-deleted from the system
- [ ] **Given** an `Open` Lost report with no Recovery Response on it, **When** the owner deletes it, **Then** the report and its audit entries are hard-deleted from the system
- [ ] **Given** a Found report with at least one Claim, **When** the owner attempts hard deletion, **Then** the request returns HTTP 409 with a message pointing to the Withdraw action (FR-11)
- [ ] **Given** a Lost report with at least one Recovery Response, **When** the owner attempts hard deletion, **Then** the request returns HTTP 409 with a message pointing to the Withdraw action (FR-11)
- [ ] **Given** a report in any non-`Open` status, **When** the owner attempts hard deletion, **Then** the request is refused, because hard deletion requires status `Open` in addition to being interaction-free
- [ ] **Given** a member who is not the reporter, **When** they attempt to delete the report, **Then** the request is refused
- [ ] **Given** an interaction-free `Open` report, **When** the interaction rule is evaluated, **Then** Found requires no Claim and Lost requires no Recovery Response, applied symmetrically across the two types
- [ ] **Given** a hard-deleted report, **When** the report no longer exists, **Then** no other FR provides an exception path that permits its deletion

Technical Notes

- Hard deletion is preserved exclusively for interaction-free `Open` reports. There is no exception path through any other FR; FR-10 is the canonical rule and FR-42 cross-references it.
- The interaction check is type-asymmetric by design: a Found report's interaction is a Claim, a Lost report's interaction is a Recovery Response. A Found report with a Recovery Response is not a valid combination, and a Lost report has no Claims.
- Claims and Recovery Responses on other reports do not affect this rule; only interactions on this report count.
- Hard deletion removes the report and its audit entries together, per FR-31 retention. Withdrawn, closed, and returned reports are retained; only this narrow case is removed.
- When an image is attached, the blob is deleted in the same operation as the row delete (image-handling §4). A blob delete failure is recorded in a retry queue rather than silently leaked.
- The 409 response is the product's signal that deletion has become unavailable and withdrawal is the remaining path.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `Open` Found report with a Claim that was already rejected | Still has an interaction; deletion is refused with HTTP 409 |
| `Open` Lost report with a terminal Recovery Response | Still has an interaction; deletion is refused with HTTP 409 |
| `Claim Requested` Found report with no Claims | Refused; status is not `Open` |
| `Verification Pending` Lost report with no Recovery Responses | Refused; status is not `Open` |
| Concurrent Claim submitted during the delete check | Deletion is refused because an interaction now exists |
| Interaction-free `Open` report with an attached image | Row and blob are removed in the same operation |

Out of Scope

- Withdrawal of an interacting report (story 006)
- Removing inappropriate content by an administrator (FR-36)
- Restoring a hard-deleted report (out of scope for FR-53)
- Audit trail retention beyond the parent report (Unit 006)
