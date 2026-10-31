---
id: 008-claim-notification-emails
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 023-claim-threads-notifications
implemented: true
traces_to: [FR-28, FR-29]
---

# Story: 008-claim-notification-emails

User Story

**As a** finder or claimant on a Found item
**I want** an email when a claim arrives on my item and when my own claim is decided
**So that** I learn what happened without watching the site, and the finder is never pulled into another member's claim decision

Acceptance Criteria

- [x] **Given** a `Pending` claim is created on a Found report, **When** the submission transaction commits, **Then** a new-claim email is sent to the reporter (finder) of that Found report
- [x] **Given** the new-claim email, **When** the recipient follows the link in it, **Then** the link requires login and resolves to that claim's detail page
- [x] **Given** a claim is approved, **When** the approval transaction commits, **Then** a claim decision email is sent to the approved claimant
- [x] **Given** the approval email, **When** it is read, **Then** it contains a link to the item detail page and a note that the item is awaiting physical hand-off
- [x] **Given** a claim is rejected by an administrator, **When** the rejection transaction commits, **Then** a claim decision email carrying the administrator-supplied reason is sent to the rejected claimant
- [x] **Given** a claim is auto-rejected by another claim being approved, **When** the approval transaction commits, **Then** a claim decision email is sent to that auto-rejected claimant
- [x] **Given** a claim is auto-rejected because the reporter withdrew the report, **When** the withdrawal transaction commits, **Then** a claim decision email carrying the reason "report withdrawn by reporter" is sent to that auto-rejected claimant
- [x] **Given** a claim is auto-rejected because an administrator closed the report, **When** the close transaction commits, **Then** a claim decision email carrying the reason "report closed by administrator" is sent to that auto-rejected claimant
- [x] **Given** an auto-rejection by another claim being approved, **When** the claimant reads the email, **Then** the visible copy is the softened wording and does not display "another claim was approved for this item" verbatim
- [x] **Given** any claim decision on an item, **When** the emails are dispatched, **Then** no claim decision email is sent to the finder (reporter) of that Found report
- [x] **Given** a claim approval with competing claims auto-rejected, **When** the emails are dispatched, **Then** exactly one decision email is sent per claim, one to each decided claimant, and no email naming the winning claimant is sent to a losing claimant
- [x] **Given** a committed claim or decision, **When** the email provider rejects or drops the send, **Then** the claim and the report status remain as committed and are neither rolled back nor blocked
- [x] **Given** a committed claim or decision, **When** the emails are dispatched, **Then** every email is dispatched only after the transaction has committed and never from inside it

Technical Notes

- Email is the only out-of-platform notification channel for these two events; there is no in-app notification stream, push, or SMS for them
- Emails are dispatched after commit, never inside the transaction (PRD §10). A send failure is a delivery problem, not a state problem, and must never undo a decision
- The claim decision email is the only Claim notification a finder does not receive. The finder learns of the outcome through My Reports, and the claim detail link in the new-claim email requires login
- Softening the visible copy of an auto-rejection is a presentation concern only; the audit reason stays verbatim (story 006)
- Delivery mechanics, retry policy, bounce handling, and suppression rules are owned by Units 005/007; this story defines the trigger, the recipient, and the content
- Email content must not expose the other claimant's reason or identifying details

Dependencies

Requires
- 001-submit-a-claim
- 003-approve-a-claim
- 004-reject-a-claim
- 006-auto-reject-competing-claims

Enables
- None directly; completes the Found-side notification set (events 2 and 3)

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Email provider is down at the moment of commit | State is already committed; the send failure is logged and does not roll back the claim or decision |
| Competing claims are auto-rejected by one approval | Each auto-rejected claimant receives their own decision email; no aggregate email and no winner naming |
| Claimant who is also an administrator receives their own decision | The decision email still goes to the claimant role; no duplication as an administrator copy |
| Finder is the only other party to the item | Finder receives the new-claim email only, never a decision email |
| Rejection reason contains markup-like characters | Stored and delivered as plain text; never rendered as markup |

Out of Scope

- Lost-side Recovery Response emails, FR-46 events 4-8 (Unit 004)
- Account Approved email, FR-27 (Unit 001)
- Authentication and password-reset emails, FR-51
- Delivery transport, retries, bounce detection, and suppression lists (Units 005/007)
---
