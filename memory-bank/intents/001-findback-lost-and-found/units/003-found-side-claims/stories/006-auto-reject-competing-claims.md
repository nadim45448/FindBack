---
id: 006-auto-reject-competing-claims
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-17]
---

# Story: 006-auto-reject-competing-claims

User Story

**As an** administrator auditing a decision
**I want** every automatic claim rejection to record which of the three workflow triggers caused it
**So that** the audit trail explains each rejection precisely while members see softened copy that does not blame or confuse

Acceptance Criteria

- [ ] **Given** an approval of one `Pending` claim on an item that has other `Pending` claims, **When** the approval commits, **Then** every other `Pending` claim on that report becomes `Rejected` with audit reason "another claim was approved for this item"
- [ ] **Given** a reporter withdrawal of a Found report while it is in `Claim Requested`, **When** the withdrawal commits, **Then** every `Pending` claim on that report becomes `Rejected` with audit reason "report withdrawn by reporter"
- [ ] **Given** an administrator close of a Found report while `Pending` claims exist, **When** the close commits, **Then** every `Pending` claim on that report becomes `Rejected` with audit reason "report closed by administrator"
- [ ] **Given** an administrator close of a Found report whose status is `Claim Approved`, **When** the close commits, **Then** no claims are auto-rejected because none are `Pending`
- [ ] **Given** an auto-rejection by any of the three triggers, **When** the transaction commits, **Then** the claim's history is preserved and nothing is deleted
- [ ] **Given** an auto-rejection by any of the three triggers, **When** the transaction commits, **Then** a separate audit event is recorded for each auto-rejected claim with `actor` set to system, `triggered_by` set to the administrator or reporter whose action caused it, `triggering_action`, the claim ID, the Found report ID, the trigger reason, and the timestamp
- [ ] **Given** two claims auto-rejected by the same trigger in one action, **When** the audit trail is read, **Then** each auto-rejection is a distinct separate event rather than a single combined entry
- [ ] **Given** an auto-rejection by another claim approval, **When** the rejected claimant's email body is generated, **Then** the visible copy states that another claim on the same item was approved without the wording "another claim was approved for this item" appearing verbatim
- [ ] **Given** an auto-rejection by another claim approval, **When** the rejected claimant views the claim, **Then** the visible copy is a neutral explanation with a contact-your-administrator path and does not name the winning claimant
- [ ] **Given** any of the three auto-rejection triggers, **When** the audit trail is read by an administrator, **Then** the trigger reason is stored verbatim exactly as "another claim was approved for this item", "report withdrawn by reporter", or "report closed by administrator" as applicable
- [ ] **Given** softened user-facing copy has been used for a rejection, **When** the audit trail is inspected, **Then** the verbatim trigger reason is unchanged by the softening
- [ ] **Given** an auto-rejected claim, **When** the transaction commits, **Then** a claim rejection email is sent to that claimant only

Technical Notes

- The three triggers are distinct and are not all caused by another claim: another claim approved (FR-17/D3), reporter withdrew (FR-11), administrator closed (FR-21/FR-36). Each carries its own reason and its own audit event
- The audit reason is administrator-facing and stored verbatim. The softening rule applies only to user-facing copy (OQ-5, `EXPERIENCE.md` §4.4). Softening must never be implemented by rewriting the stored reason
- `actor` is the system performing the transition; `triggered_by` names the human whose action caused it, so a decision is always traceable to a person
- There is no `Closed` Claim status and no `Rejected` to `Pending` transition; softened copy must not promise a reopen or restoration action
- Trigger 2 and Trigger 3 are triggered from Unit 002 and Unit 006 actions respectively, but this unit owns the Found-side Claim transitions and their audit reasons

Dependencies

Requires
- 003-approve-a-claim
- 001-submit-a-claim

Enables
- 005-auto-status-transitions
- 008-claim-notification-emails

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two different triggers affect the same claim in sequence | The first committed transition wins; the claim is already `Rejected` and the second is a no-op with no duplicate event |
| Auto-rejection list is empty at trigger time | The trigger still occurs; no auto-rejection events are written |
| Report closed by an administrator for content removal | Reason is "report closed by administrator", the same as an ordinary administrator close |
| Audit viewer compares stored reason to user-facing copy | Stored reason is verbatim; the two are intentionally different |

Out of Scope

- Administrator rejection on the administrator's initiative (story 004)
- The softened copy text and visual design itself (Unit 007)
- The Withdraw and Close actions that raise the triggers (Units 002 and 006)
---
