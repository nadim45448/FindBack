---
id: 001-submit-a-recovery-response
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:47:00Z
assigned_bolt: 015-lost-response-submit
implemented: true
traces_to: [FR-40, FR-44]
---

# Story: 001-submit-a-recovery-response

User Story

**As a** member who may have found someone's lost item
**I want** to respond to a Lost report describing where I found it
**So that** the owner can find out what happened to their item

Acceptance Criteria

- [x] **Given** an `Open` Lost report that is not the responder's own, **When** the responder submits a response with where found, observed identifying details, and date found, **Then** a Recovery Response is created with status `Submitted` and appears in My Recovery Responses
- [x] **Given** a Lost report in `Verification Pending`, **When** the selected response has NOT reached `Match Confirmed`, **Then** a new response is still accepted and created as `Submitted`
- [x] **Given** a Lost report in `Verification Pending`, **When** the selected response HAS reached `Match Confirmed`, **Then** no further response can be accepted or selected
- [x] **Given** a response missing where found, observed identifying details, or date found, **When** it is submitted, **Then** validation fails and no response is created
- [x] **Given** a responder viewing a Lost report they are responding to, **When** the response form is rendered, **Then** the Lost report's exact place and the owner's identifying details are not present in the response payload
- [x] **Given** a responder submitting a response to their own Lost report, **When** the action is attempted, **Then** it is refused with an authorization error
- [x] **Given** repeated response submissions from one member, **When** the request count exceeds the configured limit, **Then** the submission is rate-limited
- [x] **Given** a response is created, **When** the transition is audited, **Then** the audit record contains actor and timestamp but no thread body, no exact place, and no observed identifying details

Technical Notes

- FR-44 is the authoritative field set: where found, observed identifying details, date found, plus an optional candidate image handled per `image-handling.md`
- A responder is not a special role — any `Active` member may respond, except the Lost-report owner
- The accept-during-`Verification Pending` rule is the FR-40 nuance; the `Match Confirmed` cutoff is what stops an unbounded race after the match is settled

Dependencies

Requires
- 002-reporting-and-listings (the Lost report and its status)

Enables
- 002-recovery-response-status-model
- 003-owner-provisional-selection

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Date found in the future or beyond the bound | Validation failure; no response created |
| Responder has already responded to this report | Allowed — multiple responses per report are expected; the thread model is per response |
| Lost report closed while the form is open | Submission refused; report is terminal |
| Response submitted to a Found report | Refused; Found-side uses Claims, not Recovery Responses |

Out of Scope

- Provisional selection (story 003)
- Verification outcomes (story 004)
- Messaging (story 006)