---
id: 010-visibility-matrix-by-actor
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-39, FR-37]
---

# Story: 010-visibility-matrix-by-actor

User Story

**As a** member or administrator viewing a report
**I want** to see exactly the fields my relationship to that item permits
**So that** other people's private information is never disclosed to me

Acceptance Criteria

- [ ] **Given** a viewer who is not authorized for a Sensitive Field, **When** the report is loaded for that viewer, **Then** the Sensitive Field is never loaded at all, because filtering an already-loaded value after the fact is not sufficient
- [ ] **Given** an anonymous viewer, **When** a report is returned to them, **Then** only the FR-38 public summary fields are returned and there is no detail page
- [ ] **Given** an authenticated member with no role on the report, **When** the report is returned to them, **Then** they receive the FR-38 summary fields plus description, image, and reporter display name, and no Sensitive Fields, no Claim content, no Recovery Response content, and no thread content
- [ ] **Given** a member viewing a Found report they authored, **When** the report is returned, **Then** exact place, identifying details, and reporter email/phone are returned for their own Found report
- [ ] **Given** a member viewing a Lost report they authored, **When** the report is returned, **Then** exact place, identifying details, and reporter email/phone are returned for their own Lost report, and every Recovery Response and every per-Recovery-Response thread on that Lost report is returned
- [ ] **Given** a member viewing a Lost report they authored, **When** the report is returned, **Then** the Lost-report owner column governs all owner-level visibility, including normal owner fields and Recovery Response-specific fields
- [ ] **Given** a claimant viewing a Found report they claimed, **When** the report is returned, **Then** they receive their own Claim with reason, identifying details, date lost, current status, and audit-light history, and the per-Claim thread scoped to their own Claim
- [ ] **Given** a claimant, **When** they view a Found report, **Then** the report's exact place, the report's identifying details, and the reporter's email/phone are not returned to them
- [ ] **Given** a Found-report owner viewing a Claim against their own Found report, **When** the Claim is returned, **Then** they can see that a Claim exists, the Found-report status, and the per-Claim thread scoped to Claims on their own Found report, but not the claimant's reason and not the claimant's identifying details
- [ ] **Given** a claimant viewing another claimant's Claim, **When** the Claim list is returned, **Then** other claimants' identifying details, reasons, and threads are not returned to them
- [ ] **Given** a recovery responder viewing a Lost report, **When** the report is returned, **Then** they receive only their own Recovery Response with where-found, observed identifying details, date found, candidate image, current status, and the thread scoped to their own response
- [ ] **Given** a recovery responder, **When** they view the same Lost report, **Then** other responders' responses, responder-supplied fields, and threads are not returned to them
- [ ] **Given** an administrator viewing any report, **When** the report is returned, **Then** the administrator receives the full set, including all Claim content, all Recovery Response content, all thread content, and the full audit trail with all actors and timestamps
- [ ] **Given** an administrator, **When** they view per-Recovery-Response threads on a Lost report they do not own, **Then** those threads are returned to them
- [ ] **Given** any viewer who is a party to a report, **When** the report is returned, **Then** the viewer's member-facing status and last-action timestamp are returned for the related report
- [ ] **Given** a member who is a reporter, claimant, responder, or Lost-report owner, **When** they request the full audit trail, **Then** it is not returned to them, because only administrators may view the full audit trail
- [ ] **Given** a member who submits a Claim on a Found report, **When** the projection is evaluated for that member on that report afterward, **Then** no visibility unlocked as a side effect of submitting the Claim beyond the Claimant column
- [ ] **Given** a member who submits a Recovery Response on a Lost report, **When** the projection is evaluated for that member on that report afterward, **Then** no visibility unlocked as a side effect of submitting the response beyond the Recovery responder column
- [ ] **Given** an owner who participates in a per-Claim thread, **When** the projection is evaluated, **Then** thread participation does not grant access to the claimant's reason, the claimant's identifying details, or any private ownership evidence
- [ ] **Given** the two owner roles, **When** the projection resolves the owning column, **Then** it uses the Found-report owner column for a Found report and the Lost-report owner column for a Lost report
- [ ] **Given** any report type, **When** the projection is evaluated, **Then** no single member is simultaneously the Found-report owner and the Lost-report owner of the same report
- [ ] **Given** the matrix, **When** it is enforced, **Then** authorization is enforced at the API layer and client-side hiding is not sufficient

Technical Notes

- This is the core story of the unit. FR-39 is a 7-column relationship model: Anonymous, Unrelated member, Found-report owner, Claimant, Recovery responder, Lost-report owner, Administrator. This unit is the single implementation point.
- FR-37 defines the authoritative Sensitive Field set that this matrix protects: report exact location free text, reporter email, reporter phone (if collected), report identifying details, claim-level identifying details and reason, receiver-substitution fields, and the image. Claim and Recovery Response thread content is also Sensitive.
- The two enforcement rules most easily got wrong: (1) Sensitive data is never loaded for an actor who may not see it — loading then filtering is not compliant; (2) visibility never unlocks as a side effect of submitting a Claim or Recovery Response.
- The owner columns are explicitly split because scope semantics differ. The Found-report owner column governs owner-level visibility on Found reports including per-Claim thread access; the Lost-report owner column governs owner-level visibility on Lost reports including full cross-response and cross-thread visibility.
- The Lost-report owner is the only non-administrator party with cross-response visibility on a Lost report. This is required so they can evaluate and select among candidates.
- Claimant participation in a per-Claim thread does not grant access to private Claim evidence. The administrator evaluates private ownership evidence; the finder does not.
- Member-facing status history is not the same as the full audit trail. Participating in a report never confers audit trail access (FR-32).
- This projection is consumed by stories 007, 008, 009, 011, and 013, and by every surface in Unit 007.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report

Enables
- 008-authenticated-detail-view
- 009-search-and-filter
- 011-member-facing-view-partition
- 013-attach-image-to-report

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Viewer is both unrelated member and administrator | Administrator column applies |
| Viewer authored a Lost report and also submitted a Claim on a different Found report | Each report is projected under its own relationship |
| Report has both Claims and Recovery Responses | Only valid combinations exist per type; the projection keys off the report type |
| Viewer is a claimant and the Found-report owner is a different member | Claimant's reason and identifying details remain hidden from the owner |
| Deactivated account that still holds a role on a report | Re-evaluated against current account status |
| Multiple roles held on one report simultaneously | Union of the granted columns, never a wider union than the matrix grants |
| Image requested by a recovery responder | Denied; a responder must not see another candidate's image |

Out of Scope

- Which fields exist on a Report (FR-8, story 003)
- The anonymous field set definition (FR-38, story 007)
- Image byte delivery and blob authorization (story 013)
- Claim and Recovery Response submission and lifecycle (Units 003 and 004)
- Audit trail storage and the numbered event catalog (Unit 006)
- Rendering the detail page (Unit 007)
