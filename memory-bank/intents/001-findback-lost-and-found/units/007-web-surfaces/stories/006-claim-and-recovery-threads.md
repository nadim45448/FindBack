---
id: 006-claim-and-recovery-threads
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: []
realizes_fr: [FR-47, FR-26, FR-15, FR-40]
---

# Story: 006-claim-and-recovery-threads

User Story

**As a** claimant, finder, responder, Lost-report owner, or administrator
**I want** Claim and Recovery Response forms and their message threads
**So that** I can coordinate the handover, and the conversation closes by itself the moment the matter is decided

Acceptance Criteria

- [ ] **Given** an `Active` member opens `/listings/:id/claim` on a Found item that is `Open` or `Claim Requested`, **When** the form renders, **Then** it exposes Reason (20 to 1000 characters), Identifying details (10 to 500 characters), and Date lost (last 365 days, not future)
- [ ] **Given** Claim eligibility fails, **When** the CTA renders, **Then** `Submit claim` is disabled with explanatory text, and re-enabling happens only when the underlying state changes
- [ ] **Given** a Claim is submitted successfully, **When** the response renders, **Then** the browser navigates to `/my/claims/:id`, a toast reads `Claim submitted.`, and the body reads `An administrator will review your claim and email you with the decision.`
- [ ] **Given** `/my/claims/:id`, **When** it renders, **Then** it shows claim ID, item name linking to the Found report, status badge, claim reason, identifying details, date lost, submission timestamp, and the per-Claim thread below
- [ ] **Given** a Claim status of `Pending`, `Approved`, `Rejected`, or auto-rejected, **When** the badge renders, **Then** the text is exactly one of `Pending`, `Approved`, `Rejected`, or `Rejected — auto`, with the matching icon and status token
- [ ] **Given** a Claim is auto-rejected, **When** the claim detail screen renders, **Then** it shows the neutral banner `Your claim was not approved because another claim on this item was approved. If you think this is a mistake, contact your administrator.`
- [ ] **Given** a per-Claim thread, **When** it renders, **Then** messages appear oldest at top and newest at bottom, each showing author display name with a role tag, a timestamp, and plain-text body preserving line breaks
- [ ] **Given** a per-Claim thread, **When** the composer renders, **Then** it is a single plain-text textarea with a 2000-character limit and live counter, with no attachments, no rich text, no markdown, no typing indicators, and no read receipts
- [ ] **Given** a per-Claim thread with no messages, **When** it renders, **Then** it shows `No messages yet. Be the first to ask a question.`
- [ ] **Given** a member who is neither claimant, finder, nor administrator, **When** they reach a per-Claim thread, **Then** they see `Only the claimant, finder, and administrators can see this thread.`
- [ ] **Given** a message send fails, **When** the composer re-renders, **Then** it shows `We couldn't send your message. Try again.` and retains the typed input
- [ ] **Given** the thread history fetch fails, **When** the surface renders, **Then** it shows `We couldn't load the conversation. Try again.`
- [ ] **Given** a Claim is `pending` and its Found report is neither `returned` nor `closed`, **When** the thread renders, **Then** it is writable for the claimant, the finder, and administrators
- [ ] **Given** the Claim is `approved`, **When** the thread renders, **Then** it is read-only with `This thread is read-only because this claim has been approved. An administrator will arrange the handoff.`
- [ ] **Given** the Claim is `rejected`, **When** the thread renders, **Then** it is read-only with `This thread is read-only because this claim has been rejected.`
- [ ] **Given** the Found report is `returned`, **When** the thread renders, **Then** it is read-only with `This thread is read-only because the item has been returned.`
- [ ] **Given** the Found report is `closed`, **When** the thread renders, **Then** it is read-only with `This thread is read-only because this report has been closed.`
- [ ] **Given** any read-only variant, **When** the notice renders, **Then** it ends with `Existing messages remain available for reference, but no new messages can be posted.` and the message history stays visible
- [ ] **Given** an `Active` member who is not the Lost-report owner opens `/listings/:id/submit-recovery-response` on a Lost item that is `Open` or `Verification Pending` before `Match Confirmed`, **When** the form renders, **Then** it collects where-found area and exact place, observed identifying details, date found, and an optional candidate image
- [ ] **Given** `/my/recovery-responses/:id`, **When** it renders, **Then** it shows the Lost report summary, the Recovery Response fields, the canonical status badge with `Submitted — Standby` derived where applicable, the per-Response thread, and a `Withdraw` action
- [ ] **Given** a Recovery Response is `Submitted` and not currently `Selected for Verification`, **When** the responder views it, **Then** `Withdraw` is offered
- [ ] **Given** a Recovery Response is `Selected for Verification`, `Match Confirmed`, or any terminal status, **When** the responder views it, **Then** no enabled `Withdraw` action is offered
- [ ] **Given** a per-Recovery-Response thread, **When** it renders, **Then** its participants are the Lost-report owner, the responder who submitted that response, and all Administrators, and no other responder can see it
- [ ] **Given** a per-Recovery-Response thread whose response is `Not a Match`, **When** it renders, **Then** it is read-only with `This thread is read-only because this response was not a match.`
- [ ] **Given** a per-Recovery-Response thread whose response is `Withdrawn`, **When** it renders, **Then** it is read-only with `This thread is read-only because you withdrew this response.`
- [ ] **Given** a per-Recovery-Response thread whose parent Lost report is `Returned` or `Closed`, **When** it renders, **Then** it is read-only with `This thread is read-only because the parent Lost report has been resolved.`
- [ ] **Given** a per-Recovery-Response thread whose response is `Completed — Report Returned`, `Resolved — Report Returned`, or `Resolved — Report Closed`, **When** it renders, **Then** it is read-only with `This thread is read-only because the recovery response is in a terminal state.`
- [ ] **Given** a per-Recovery-Response thread whose response is `Selected for Verification` or `Match Confirmed`, **When** it renders, **Then** the thread is still writable and no read-only notice is shown
- [ ] **Given** a per-Recovery-Response thread in `Match Confirmed`, **When** an informational message is rendered, **Then** it may say `Owner confirmed this is a match. Physical handoff is pending. You can continue using this thread to coordinate the return.` and must not imply the thread is locked
- [ ] **Given** either thread type, **When** a message is sent, **Then** the newest message receives `tabindex="-1"` and is scrolled into view, and the message list carries `aria-live="polite"`
- [ ] **Given** a thread in either family, **When** a new message is posted, **Then** no email is generated and no in-app notification appears

Technical Notes

- Claim rules are owned by Unit 003; Recovery Response and thread rules by Unit 004. This story renders their surfaces, statuses, and read-only states.
- One thread exists per Claim and one per Recovery Response. Threads are not global and never mix participants across entities.
- `Match Confirmed` is non-terminal and therefore does not lock the per-Recovery-Response thread. This is the deliberate mirror of the per-Claim rule, and getting it wrong would freeze coordination exactly when the physical handoff still needs arranging.
- A read-only thread must remain fully readable. Locking removes the composer, never the history.
- Each read-only condition has its own named notice. A single generic read-only message would fail to tell the user why the conversation stopped.
- Copy authority: §4.3 Claim microcopy, §4.4 auto-rejection copy, §4.6 Recovery Response microcopy, §4.9 error copy, §12.1 Claim form, §12.2 Claim detail, §12.7 Claim status badges, §13.1 to §13.5 per-Claim thread, §13.5b per-Recovery-Response thread lifecycle, §9.6 Lost-side surfaces, §25 copy guidance.
- `Submitted — Standby` is a display derivation only. The canonical persisted status remains `Submitted`, and the badge must not imply a ninth status exists.
- Threads are visible from claim or response creation onward, with an empty state, rather than being created lazily on the first message.
- There are no typing indicators, no read receipts, and no real-time updates. A thread refreshes on page load and on send.
- Sending a message generates no email and no notification surface at all (FR-30).

Dependencies

Requires
- 001-design-foundations-and-theme
- 003-member-view-shell-and-navigation
- 004-item-detail-by-relationship

Enables
- 008-administrator-queues

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Finder opens an approved Claim's thread | Read-only with the approved notice; history remains visible |
| Claimant already has a Pending Claim on this item | `Submit claim` is disabled with an explanation |
| Claimant opens the Found report detail after claiming | Sensitive Fields remain hidden; no unlock |
| Responder in `Match Confirmed` opens the thread | Still writable; no locked notice |
| Third responder Quinn opens another responder's thread | Thread is not visible to them at all |
| Lost-report owner opens every per-Response thread on their own Lost report | All are visible, and only those |
| `Not a Match` recorded by an administrator | Responder's thread becomes read-only with the not-a-match notice |
| Member's Claim is auto-rejected after a competing Claim is approved | Claim shows `Rejected — auto` and the neutral auto-rejection banner |

Out of Scope

- Claim submission, review, approval, rejection, and auto-rejection rules — Unit 003
- Recovery Response submission, selection, and determination rules — Unit 004
- Administrator claim review and verification screens — Unit 003 and Unit 004
- Confirm Returned surfaces — Unit 005
- Notification absence verification — story 009
