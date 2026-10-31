---
id: 008-authenticated-detail-view
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 009-reporting-search
implemented: true
traces_to: [FR-13]
---

# Story: 008-authenticated-detail-view

User Story

**As an** `Active` member
**I want** to open a report's detail page from a listing
**So that** I can see the information relevant to my relationship with the item

Acceptance Criteria

- [ ] **Given** an `Active` member, **When** they click through from a listing to a report detail, **Then** the detail view renders for that report
- [ ] **Given** an `Active` member who is the report owner, **When** they open the detail, **Then** the owner field set is returned for their own report
- [ ] **Given** an `Active` member with no role on the report, **When** they open the detail, **Then** the unrelated-member field set is returned, which is the FR-38 summary fields plus description, image, and reporter display name, and no Sensitive Fields
- [ ] **Given** an `Active` member who submitted a Claim on this Found report, **When** they open the detail, **Then** the Claimant field set is returned, scoped to their own Claim
- [ ] **Given** an `Active` member who submitted a Recovery Response on this Lost report, **When** they open the detail, **Then** the Recovery responder field set is returned, scoped to their own response
- [ ] **Given** an administrator, **When** they open the detail, **Then** the administrator field set is returned
- [ ] **Given** two different authenticated members opening the same report detail, **When** their responses are compared, **Then** the field sets differ by viewer role and relationship to the item, because the detail page is not uniform across authenticated viewers
- [ ] **Given** a viewer who is not authorized for a field, **When** the detail response is produced, **Then** that field is absent from the response rather than returned and hidden by the client
- [ ] **Given** an anonymous visitor, **When** they attempt to reach the detail view, **Then** they are routed to login and no detail fields are returned, because FR-13 does not extend anonymous visibility

Technical Notes

- This story owns the detail read path; the authoritative field sets per viewer role are defined in story 010 (FR-39) and are invoked here.
- FR-13 explicitly does not extend anonymous visibility; anonymous is governed solely by FR-38 (story 007).
- The detail page is not uniform across authenticated viewers. The projection is resolved per request from the actor's relationship to the report.
- The two owner roles are split because scope semantics differ: the Found-report owner has ownership only on Found reports they authored, and the Lost-report owner has ownership only on Lost reports they authored. The report type is known at render time and the request is authenticated, so the two columns resolve unambiguously.
- Field selection happens at the API layer. Loading a Sensitive Field and filtering it out afterwards is not sufficient (PRD §10 Security).
- Image bytes are served through a separate authorized route, never as a listable blob URL; see story 013.

Dependencies

Requires
- 007-public-summary-listing
- 010-visibility-matrix-by-actor

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Viewer is both the Lost-report owner and a recovery responder on another report | The owner column governs their own Lost report |
| Report does not exist or was hard-deleted | A not-found response; no field leakage |
| Viewer requests a report outside their partition | Still projected by FR-39; the partition governs listings, not detail access |
| Viewer loses `Active` status mid-session | Re-evaluated per request against current account status |
| Report type changes between render and refresh | Not possible; type is immutable (FR-53) |

Out of Scope

- The FR-39 matrix definition (story 010)
- Anonymous listing (story 007)
- Search and filtering (story 009)
- Claim and Recovery Response submission (Units 003 and 004)
- Rendering decisions and visual design (Unit 007)
