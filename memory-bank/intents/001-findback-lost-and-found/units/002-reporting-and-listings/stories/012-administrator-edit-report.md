---
id: 012-administrator-edit-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00.000Z
assigned_bolt: null
implemented: true
traces_to:
  - FR-53
---

# Story: 012-administrator-edit-report

User Story

**As an** administrator
**I want** to correct a report's content and metadata on a non-terminal report
**So that** moderation and operational corrections are possible and fully recorded

Acceptance Criteria

- [ ] **Given** an administrator and a report in status `Open`, `Claim Requested`, `Verification Pending`, or `Claim Approved`, **When** the administrator edits an allowed field, **Then** the change persists
- [ ] **Given** a report in status `Returned`, **When** an administrator attempts to edit it, **Then** the edit is blocked, because `Returned` is terminal
- [ ] **Given** a report in status `Closed`, **When** an administrator attempts to edit it, **Then** the edit is blocked, because `Closed` is terminal
- [ ] **Given** an administrator editing a report, **When** they change name, category, description, date, campus area, exact place, identifying details, or replace the image, **Then** each of those fields is updated
- [ ] **Given** an administrator editing a report, **When** they attempt to change the reporter identity, **Then** the change is refused
- [ ] **Given** an administrator editing a report, **When** they attempt to change the report type, **Then** the change is refused
- [ ] **Given** an administrator editing a report, **When** they attempt to change the report lifecycle status, **Then** the change is refused, because lifecycle transitions belong to FR-21 close paths and FR-22/FR-42 auto-transitions
- [ ] **Given** an administrator editing a report, **When** they attempt to change Claim content, Recovery Response content, an audit-trail entry, a Returned-confirmation field, or a substitute-receiver field, **Then** the change is refused
- [ ] **Given** any administrator report edit, **When** it is recorded in the audit trail, **Then** a record is written with the acting administrator, timestamp, report ID, the changed fields, and the previous values
- [ ] **Given** an administrator report edit, **When** the audit record is written, **Then** it is an append-only non-numbered record that introduces no new FR-31 or FR-48 event number
- [ ] **Given** an existing audit entry, **When** an administrator performs a report edit, **Then** no previous audit entry is edited or deleted
- [ ] **Given** any administrator report edit, **When** the edit completes, **Then** the report's lifecycle status is unchanged and no workflow timer, claim-decision state, recovery-response state, or selection state is reset or restarted
- [ ] **Given** any administrator report edit, **When** the edit completes, **Then** no Claim, Recovery Response, thread, audit event, or lifecycle transition is introduced or removed by the edit itself
- [ ] **Given** a member viewing a report after an administrator edit, **When** the member-facing view re-renders, **Then** the edited values are shown and no email is sent to the member about the edit
- [ ] **Given** an administrator who performs a report edit, **When** the edit is completed, **Then** the edit appears in the administrator-visible audit trail immediately
- [ ] **Given** a member who is not an administrator, **When** they attempt to perform an administrator report edit, **Then** the request is refused

Technical Notes

- FR-53 is a narrow operational capability for moderation, content correction, and metadata correction. It is not unrestricted database editing, and mass data migration is out of scope.
- The editable set is exactly: report name, category, description, date, location (campus area enum value and exact-place free text), identifying details, and image replacement.
- The blocked set is exactly: reporter identity, report type, report lifecycle status, Claim content, Recovery Response content, audit-trail entries, Returned-confirmation fields, and substitute-receiver fields.
- This FR does not authorize rewriting historical workflow facts: Claim decisions, Recovery Response determinations, Returned confirmations, audit events, receivers, and historical lifecycle transitions remain immutable.
- Administrator report edit does not bypass the FR-9 edit blocklist; `Returned` and `Closed` remain uneditable through this path either.
- The audit record is a non-numbered append-only record per FR-31. FR-52 member-profile edits and FR-53 administrator report edits are the two such additional records; neither receives a numbered workflow-event identifier.
- Image replacement uploads a new blob and deletes the old one; blobs are never overwritten (image-handling §4).
- Direct database-level edits that bypass the application-layer audit, and restoring a hard-deleted report, are out of scope.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report
- 010-visibility-matrix-by-actor

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Edit submitted while the report is `Returned` | Blocked; the terminal-status check is re-evaluated at write time |
| Administrator edits a report with an existing Claim or Recovery Response | Allowed within the editable set; the Claim and Recovery Response content is untouched |
| Administrator attempts to edit a prior audit entry | Refused; the trail is append-only |
| Image replaced on a report with no prior image | Allowed; a new blob is written |
| Edit made with no field changed | No-op; no change snapshot is recorded |
| Administrator edits exact place or identifying details | Allowed; both are in the editable set even though they are Sensitive Fields under FR-37 |
| Attempt to change reporter by reassigning `reporterId` | Refused; reporter identity is not editable |

Out of Scope

- Reporter edit of their own report (story 004)
- Administrator close action (FR-21)
- Removing inappropriate content (FR-36)
- Restoring a hard-deleted report
- Direct database-level edits bypassing the application audit
- Mass data migration
