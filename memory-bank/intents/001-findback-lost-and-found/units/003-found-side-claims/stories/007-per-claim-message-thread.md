---
id: 007-per-claim-message-thread
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 023-claim-threads-notifications
implemented: true
traces_to: [FR-26]
---

# Story: 007-per-claim-message-thread

User Story

**As a** claimant, finder, or administrator on a Found item
**I want** one message thread per claim that closes when the claim is decided
**So that** questions can be asked while a claim is live and the record stays intact afterwards

Acceptance Criteria

- [x] **Given** a claim, **When** the claim is created, **Then** exactly one message thread exists for that claim and is visible from claim creation onward
- [x] **Given** a thread with messages, **When** the thread is read, **Then** messages are shown oldest first with each message's author and timestamp
- [x] **Given** a `Pending` claim on a report that is not `Returned` or `Closed`, **When** the claimant, finder, or an administrator posts a message, **Then** the message is accepted and appended to the thread
- [x] **Given** a message body shorter than 1 character or longer than 2000 characters, **When** it is posted, **Then** the message is refused and the thread is unchanged
- [x] **Given** a message containing attachments, images, or rich text, **When** it is posted, **Then** only the plain text content is stored and no attachment is accepted
- [x] **Given** a message posted in the thread, **When** it commits, **Then** an audit event records the actor, claim ID, message text, and timestamp
- [x] **Given** a claim whose status is `Approved`, **When** any participant attempts to post, **Then** the thread is read-only and the post is refused
- [x] **Given** a claim whose status is `Rejected`, **When** any participant attempts to post, **Then** the thread is read-only and the post is refused
- [x] **Given** a Found report whose status is `Returned`, **When** any participant attempts to post, **Then** the thread is read-only and the post is refused
- [x] **Given** a Found report whose status is `Closed`, **When** any participant attempts to post, **Then** the thread is read-only and the post is refused
- [x] **Given** a read-only thread, **When** a participant reads it, **Then** the full message history remains readable and no message is deleted
- [x] **Given** a finder viewing the thread of a claim on their own Found report, **When** the thread loads, **Then** the claimant's reason and identifying details are not included
- [x] **Given** a member who is neither the claimant nor the finder of the report, **When** they request the thread, **Then** they cannot view or post in it
- [x] **Given** a claim, **When** two different claims on the same item both have threads, **Then** the messages of one claim are never visible in the other claim's thread

Technical Notes

- Read-only is entered when the claim is `Approved` or `Rejected`, or when the report is `Returned` or `Closed`. While the claim is `Pending` and the report is neither `Returned` nor `Closed`, the thread is writable for claimant, finder, and administrators (OQ-4 retired; FR-26 answers it)
- The thread is never deleted. Closing a thread changes writability only; history retention is for the parent report's lifetime
- This is the Found-side per-Claim thread. It is a different thread from the per-Recovery-Response thread in Unit 004 and must not share an aggregate or a visibility rule
- The finder participates in the thread but gains no access to the claimant's reason or identifying details. Per-Claim thread participation does not grant access to private Claim evidence (FR-37, FR-39, UJ-2)
- Read access is enforced at the API layer, not the UI
- Real-time updates, typing indicators, read receipts, and push notifications are explicitly excluded; the thread refreshes on load and on send

Dependencies

Requires
- 001-submit-a-claim
- 003-approve-a-claim
- 004-reject-a-claim

Enables
- None directly; the thread closes the coordination window opened by claim creation

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Thread has no messages yet | Thread is visible with an empty state; it is still writable |
| Message posted at the same moment the claim is approved | Exactly one outcome commits: the post is accepted and stored, or the thread is read-only and the post is refused |
| Finder posts the last message before approval | Message is retained and remains readable after the thread closes |
| Administrator posts after closure | Refused as read-only |
| Claim is auto-rejected | Thread becomes read-only; prior messages remain readable |
| Member posts 2001 characters | Refused; the 2000-character limit is enforced |

Out of Scope

- Attachments, images, and rich text (explicitly out of scope in FR-26)
- Real-time chat, typing indicators, read receipts, push notifications (FR-30)
- The per-Recovery-Response thread on the Lost side (Unit 004)
- Thread rendering and styling (Unit 007)
---
