---
title: "Product Brief: FindBack"
status: final
created: 2026-08-28
updated: 2026-09-16
---

# Product Brief: FindBack

## Executive Summary

FindBack is a single-tenant Lost & Found management system. One organization runs it at a time — a school, an office, a public venue, or any community that loses things and finds them back.

It centralizes the lost-and-found workflow that today lives across notice boards, group chats, and security desks. Members report items, search what others have reported, claim what is theirs, and respond to other members' lost reports when they believe they may have found the item.

Automatic match suggestions and cross-organization features are intentionally outside project scope so the workflow stays focused. See §Scope for what FindBack covers, what it does not, and which decisions are deferred to the PRD. FindBack's value is in being simple, trustworthy, and clear.

## The Problem

Inside schools, offices, and similar communities, lost items typically end up in one of three places: a lost-and-found box, a chat thread, or nowhere at all. People who lose something search one channel, then another, then give up. People who find something want to do the right thing but have no reliable way to reach the owner. Administrators who run the lost-and-found juggle paper logs and screenshots.

The cost of this is small per item and large in aggregate: things that could be returned aren't, trust in the community erodes a little, and the people responsible for the process spend more time triaging than resolving. There is no shared, durable, searchable record of what has been lost, what has been found, and what has been returned.

## The Solution

FindBack gives a single organization one place to record lost and found items, search across both, and recover lost items with administrators in the loop. Members register, get approved, and can report Lost and Found items, browse and search, claim a Found item they believe belongs to them, and submit a Recovery Response to another member's Lost report.

Recovery works in both directions. When an active member believes a **found** item is theirs, they submit a **Claim**; administrators review and approve or reject it, then mark the item returned. When an active member, while browsing another member's **lost** report, believes they may have found the lost item, they can submit a **Recovery Response** to that Lost report; the Lost-report owner reviews the Recovery Responses, can select one candidate for physical verification, and an administrator confirms the physical return. Administrators are also responsible for approving new accounts and closing reports where appropriate.

Because FindBack runs as one deployment per organization, listings stay inside a single organization. Administrators are people associated with that organization. The product supports the workflow step by step: it tracks each item's lifecycle, while administrators provide the final confirmation that moves an approved Found-item Claim or a successfully verified Lost-item Recovery Response toward Returned.

## Who This Serves

### Members (the people who lose and find things)

A student, employee, or other participant of the host organization who has either lost an item or found one that belongs to someone else. They register, get approved, and use FindBack to recover their own lost item, claim a Found item they believe belongs to them, and respond to another member's Lost report when they believe they may have found it. Their success looks like this: they post a Lost item and can review Recovery Responses from members who believe they may have found it; they browse a small number of relevant Found listings, recognize a match, and submit a short Claim; and when they find something that may be someone else's lost item, they can submit a Recovery Response to that Lost report.

### Administrators (the host organization's staff)

Designated staff of the host organization — for example, a security desk officer, facilities coordinator, or HR contact — who keep FindBack running for the community. Administrators are responsible for approving accounts, reviewing Found-item Claims, managing Lost-item physical verification (with visibility into all Recovery Responses relevant to that verification) and recording the outcome that the Lost-report owner determines, recording Not a Match where applicable, confirming Returned on the Found side and on the Lost side after the owner confirms the match, and closing or moderating reports where appropriate. They may also remove inappropriate content.

## How It Works

### Account lifecycle

A new user registers with basic information and enters a **Pending** state. They cannot use lost-and-found features until an administrator approves them. Once approved, the account is **Active** and the member can report Lost and Found items, browse and search, claim a Found item they believe belongs to them, and submit a Recovery Response to another member's Lost report. Administrators may deactivate an account; the record is preserved but the member can no longer use the system.

### Reporting

Active members can create two kinds of reports:

- **Lost item report** — for something the member has lost.
- **Found item report** — for something the member has found and is willing to return.

Each report carries a name, category, description, date, location, optional identifying details, and an optional image. The reporter can edit or delete their own report under the rules in *Editing and removing reports* below.

### Discovering matches

FindBack uses user-driven search and filtering rather than automatic match suggestions. Members discover potential matches by **browsing and searching** the combined pool of active lost and found reports. Search supports keyword, category, location, date, type (lost / found), and status. Anonymous users can see summary listings; full item details require login.

A logged-in member's view is split into two distinct listings: **My Reports** contains that member's own Lost and Found reports; **Browse** contains other members' Lost and Found reports. A member's own reports never appear in their own Browse results. This separation applies to both Lost and Found reports and is independent of whether the member is searching for a match or responding to a Lost report.

### Claiming

When an active member believes a found item is theirs, they submit a **Claim**: a written reason, identifying details only the owner would know, and the date the item was lost. The system creates a **Pending** Claim and notifies the finder by email. Administrators review the Claim and decide on its outcome; the claimant is notified by email. Multiple Claims on the same item are permitted; the detailed handling of competing Claims will be defined in the PRD.

### Responding to a Lost report (Recovery Response)

When an active member, while browsing another member's Lost report, believes they may have found the lost item, they can submit a **Recovery Response** to that Lost report. Multiple members may submit Recovery Responses to the same Lost report; each Recovery Response is a separate, independently reviewable record attached to the Lost report.

The Lost-report owner reviews the Recovery Responses on their Lost report and can select one candidate for physical verification with the original item. Selecting a Recovery Response is provisional — it means "verify this one first" and does not permanently close or reject the other Recovery Responses. If the selected item turns out not to be the owner's item, the owner can return to the remaining Recovery Responses and select a different candidate.

When a Lost report reaches **Returned** through one Recovery Response, any other unresolved Recovery Responses on that Lost report are no longer actionable but remain preserved as part of the report's history. The same high-level principle applies when a Lost report transitions to **Closed** (for example, because the reporter withdraws the report while Recovery Responses still exist): any unresolved Recovery Responses are no longer actionable but remain preserved as part of the report's history. The exact terminal status or closure reason for those Recovery Responses will be defined in the PRD.

#### Verification responsibility on the Lost side

During Lost-item physical verification, the **Lost-report owner** is the one who physically reviews the candidate item and is the one who determines whether the item is actually theirs. The **administrator** manages the verification and handover process, records the verification outcome, and — on a successful match — confirms the physical return and marks the Lost report **Returned**. The administrator does not independently decide whether the item belongs to the owner; the owner's confirmation drives the outcome.

The two verification outcomes are therefore:

- **Match confirmed and returned** — the Lost-report owner confirms the candidate item is theirs; the administrator confirms the physical return, and the Lost report transitions to **Returned**.
- **Not a match** — the Lost-report owner confirms the candidate item is not theirs; the administrator records Not a Match against the selected Recovery Response, and the Lost report remains active so the owner can review another Recovery Response.

During verification, the administrator must have visibility into all Recovery Responses associated with the Lost report — not only the selected one — so verification can be administered honestly and traceably.

The complete recovery process for a Lost report must remain traceable. The detailed Recovery Response statuses, response form fields, owner-side review behavior, selection-for-verification rules, verification workflow and outcomes, communication/thread behavior, and notification events for the Lost-side recovery flow are deferred to the PRD.

### Item lifecycle

Every lost- and found-item report carries a status that the system and administrators maintain. Recovery in both directions follows the same shape — a report moves from **Open** to a state where a candidate is being pursued, and finally to **Returned** or **Closed**. The middle states differ by report type because Found reports use Claims and Lost reports use Recovery Responses.

#### Found report lifecycle

- **Open** — the report is active and remains in circulation.
- **Claim Requested** — at least one Claim is pending administrator review.
- **Claim Approved** — an administrator has approved a Claim; awaiting physical hand-off.
- **Returned** — an administrator has confirmed the item was physically returned to the claimant. Terminal for normal flow.
- **Closed** — the report is no longer in active circulation. Used when the item is unclaimed and the organization removes it, when the reporter withdraws their report, or when an administrator removes inappropriate content. Terminal.

#### Lost report lifecycle

At the Product Brief level, the Lost report lifecycle is described conceptually:

```text
Open
→ Recovery Response and verification stage
→ Returned / Closed
```

Between **Open** and **Returned / Closed**, the Lost report passes through a **Recovery Response and verification stage** during which one or more Recovery Responses are submitted, the Lost-report owner selects a candidate for verification, physical verification takes place, and the outcome is either Match Confirmed and Returned or Not a Match (in which case the report remains active). The Lost-report states established at Product Brief level are **Open**, **Returned**, and **Closed**; the detailed intermediate Lost-report and Recovery Response statuses are deferred to the PRD and are not finalized at the Product Brief level.

Found and Lost reports share common states such as **Open**, **Returned**, and **Closed**, but they use different intermediate recovery stages because Found reports use Claims while Lost reports use Recovery Responses. Multiple Claims on a Found report and multiple Recovery Responses on a Lost report may exist concurrently.

On the Found side, Claim review and approval follow the Found-item Claim workflow: a Claim, once approved, is not provisional. The Found-item lifecycle reaches **Returned** when an administrator confirms the physical return.

On the Lost side, selecting one Recovery Response for physical verification is provisional — it means "verify this one first" and does not permanently close or reject the other Recovery Responses. If the Lost-report owner confirms the candidate is not theirs, the administrator records Not a Match against the selected Recovery Response and the Lost report remains active so the owner can return to the remaining Recovery Responses to select a different candidate. The Lost-item lifecycle reaches **Returned** only when the Lost-report owner confirms the candidate item is theirs and the administrator confirms the physical return. When the Lost report reaches **Returned**, any other unresolved Recovery Responses on that Lost report are no longer actionable but remain preserved as part of the report's history; the exact terminal status or closure reason for those Recovery Responses will be defined in the PRD. The same high-level principle applies when a Lost report transitions to **Closed** while Recovery Responses exist (for example, because the reporter withdraws the report): any unresolved Recovery Responses are no longer actionable but remain preserved as part of the report's history, and the exact terminal status or closure reason for those Recovery Responses will be defined in the PRD. While the Lost report is still active, other Recovery Responses remain actionable so the Lost-report owner can continue to review and select them.

Each important transition in an item's lifecycle records **who** performed the action and **when** it occurred, so the full journey of the item is reconstructable. For a Found report this includes:

- who reported the found item,
- who submitted a Claim on the item,
- which administrator(s) reviewed and decided on each Claim (approved or rejected),
- which administrator confirmed the item as Returned,
- who ultimately received the item, and
- the relevant date and time for each of the above.

For a Lost report the recorded trail additionally covers the Recovery Response path: who submitted each Recovery Response and when; which Recovery Responses the Lost-report owner reviewed and when; which Recovery Response the owner selected for verification and when; the owner's determination on the candidate item (Match Confirmed or Not a Match) and when; which administrator recorded that outcome and managed the handover; who ultimately received the item; and which administrator confirmed Returned.

For the Returned action specifically, the default receiver depends on the report type:

- **Found report** — the approved claimant is recorded as the default receiver.
- **Lost report** — the Lost-report owner is recorded as the default receiver.

If the actual receiver is different from the default, the administrator records the substitute receiver's name or identity, confirms that the default receiver (the approved claimant for a Found report, or the Lost-report owner for a Lost report) authorized this person to collect the item on their behalf, and records the relationship between the default receiver and the substitute receiver (Friend, Family Member, Colleague, Classmate, or Other). If the default receiver and the substitute receiver are the same person, authorization and relationship are not applicable. FindBack does not include identity verification or additional handoff features.

The full item history is an internal administrative record: only administrators can view it. Members continue to see the relevant current status of their Reports, Claims, and Recovery Responses. The exact member-visible details will be defined in the PRD. The item history is kept as long as the report itself is kept, with no separate deletion mechanism.

### Editing and removing reports

- The reporter can **edit** their own report only while the report remains active and has not reached **Returned** or **Closed**.
- The reporter can **delete** their own report only while it is **Open** and has no candidate against it:
  - For a **Found report**, the report may be deleted only while **Open** and has no Claim.
  - For a **Lost report**, the report may be deleted only while **Open** and has no Recovery Response.
- Once a Claim exists on a Found report, or a Recovery Response exists on a Lost report, the reporter can no longer delete the report; they may instead **withdraw** it, which transitions the report to **Closed**. The report is preserved in history but no longer appears in active listings.
- Administrators can moderate, edit, close, or remove reports where appropriate for moderation purposes; detailed rules and lifecycle constraints will be defined in the PRD.

### Notifications

FindBack sends **email only**. Three business/workflow notification email events are currently confirmed:

1. A new account has been approved.
2. A new Claim has been submitted on a Found report the member reported.
3. A Claim the member submitted has been approved or rejected.

Whether the Lost-report Recovery Response workflow requires additional email events — for example, a new Recovery Response on my Lost report; my Recovery Response was selected for verification; verification failed; successful return — is deferred to the PRD. In-app notifications, "claim under review" reminders, and stale-report reminders are not part of FindBack.

### Brand and visual identity

FindBack's brand, logo, color palette, and visual identity are a related concern and will be defined separately as part of the design phase. This brief intentionally stops at the product level.

## Scope

### In scope

- Self-registration with administrator approval
- Login, logout, and member profile (limited to what the system needs to identify the member)
- Lost-item reporting (create, view, edit, delete / withdraw by owner; administrator moderation)
- Lost-item recovery: members can submit Recovery Responses to other members' Lost reports; the Lost-report owner can review Recovery Responses and select one candidate for physical verification; during verification the Lost-report owner determines whether the candidate item is theirs; the administrator manages the verification and handover process, records the outcome that the owner determines, records Not a Match where applicable (leaving the Lost report active), and confirms Returned after the owner confirms the match
- Found-item reporting (same)
- Found-item recovery: members can submit Claims on Found reports; administrators review, approve or reject, and confirm Returned
- Combined lost-and-found listings, anonymous-viewable in summary form, with logged-in members viewing **Browse** as **other members'** Lost and Found reports and **My Reports** as their own Lost and Found reports (a member's own reports do not appear in their own Browse results)
- Search and filter across keyword, category, location, date, type, and status
- Item detail view (login required)
- Claim submission with required reason, identifying details, and date lost
- Claim review and decision by administrators
- Found report lifecycle (Open, Claim Requested, Claim Approved, Returned, Closed) and Lost report lifecycle with established states Open, Returned, and Closed, with Recovery Response and verification occurring between Open and resolution; detailed intermediate Lost-side statuses are deferred to the PRD
- Item history / audit trail recording who performed each important lifecycle action and when, including the receiver and confirming administrator at Returned (administrator-only view; no separate deletion mechanism for the trail)
- Email notifications for the currently confirmed business/workflow notification email events (account approved, new Claim on a Found report, Claim approved or rejected). Whether the Lost-report Recovery Response workflow requires additional email events is deferred to the PRD.
- Administrator functions: approve / deactivate users, review Found-item Claims, manage Lost-item physical verification with visibility into Recovery Responses and record the outcome the Lost-report owner determines, record Not a Match, confirm Returned on the Found side and on the Lost side after the owner confirms the match, close or moderate reports, remove inappropriate content

### Explicitly out of scope

- Automatic match suggestions or proactive notifications of potential matches
- In-app notifications
- General-purpose or real-time in-app chat/messaging (the Product Brief does not preclude a narrowly scoped, workflow-specific communication mechanism attached to a Claim or Recovery Response, but general chat is not part of FindBack)
- Proof-of-ownership uploads (photos of receipts, serial numbers, etc.)
- Cross-organization item sharing
- A global public marketplace
- Mobile native applications (FindBack is web-based)
- Multi-tenant administration of multiple organizations from one console
- Bulk import of historical lost-and-found records
- Analytics, dashboards, or reporting beyond what administrators need to operate the system
- Integration with external identity providers (SSO, LDAP, etc.)
- Internationalization beyond English

### Decisions deferred to PRD

These are product decisions that need product-level design but were intentionally not resolved in this brief. The PRD should resolve them and surface them in stories:

- The process for facilitating contact between claimants, finders, and administrators when needed, including whether any contact information or external communication method is exposed.
- The precise definition of "sensitive" information that is hidden from public listings (e.g., reporter's full name, exact location, contact details), and the precise set of summary fields visible to anonymous users.
- The detailed handling of competing Claims on the same found item — administrators decide, but the rules and behavior for how they review and choose between pending Claims is a PRD design call.
- The Recovery Response flow for Lost reports, including: the Recovery Response form fields; the owner-side behavior for reviewing multiple Recovery Responses; the selection-for-verification rules and interaction requirements (including the provisional, reversible nature of selection); the verification workflow, permissions, and outcomes (with administrator visibility into all Recovery Responses); the exact set of Recovery Response statuses; the exact terminal status or closure reason for unresolved Recovery Responses when a Lost report reaches Returned; the communication or thread behavior associated with Recovery Responses; detailed permissions and visibility extensions for the Lost-side flow; and the set of notification events associated with the Lost-side recovery flow (for example, a new Recovery Response on my Lost report; my Recovery Response was selected for verification; verification failed; successful return) — all of which are PRD design calls.
- The detailed process administrators follow to review and approve registration requests.

## Product Principles

Three principles guide product decisions in FindBack:

- **Simple.** Members should report and search without a learning curve; administrators should run the system without training.
- **Trustworthy.** Members should feel their information and claims are handled responsibly; administrators should have the visibility they need to decide and act.
- **Clear.** Item status, Claim status, Recovery Response status, and Account status should be obvious at a glance.

Detailed UX requirements — including accessibility and action-oriented interaction patterns — are handled in the PRD and UX design phase.

## Success Criteria

FindBack is successful when:

1. A new user can register, and an administrator can approve their account.
2. An active member can report a lost item and a found item.
3. Active members can search and filter the combined listing pool using keyword, category, location, date, type, and status.
4. An active member can submit a Claim on a found item, providing reason, identifying details, and date lost.
5. An active member can submit a Recovery Response to another member's Lost report when they believe they may have found the item.
6. A Lost-report owner can review Recovery Responses on their own Lost report and select one candidate for verification, without permanently closing the other Recovery Responses.
7. An administrator can view all Recovery Responses associated with a Lost report during verification, record the outcome that the Lost-report owner determines (Not a Match leaves the Lost report active), and confirm physical Returned after the owner confirms the match.
8. The full recovery path for a Lost report — Recovery Responses received, owner selection, verification outcome, Returned confirmation — is reconstructable from the item's history.
9. Administrators can review pending Claims and approve or reject them.
10. Administrators can confirm Returned after an approved Found-item Claim or successful Lost-item physical verification, and close reports where permitted.
11. Email notifications are delivered for the three currently confirmed business/workflow notification email events (account approved, new Claim on a Found report, Claim approved or rejected). Whether the Lost-report Recovery Response workflow requires additional email events is deferred to the PRD.
12. Members see the relevant current status of their Reports, Claims, and Recovery Responses whenever they log in.
13. Trying to edit or delete a report outside the permitted rules is prevented with a clear message.
14. Anonymous users can browse summary listings without logging in, but cannot view item details.
15. A logged-in member's Browse results contain only other members' Lost and Found reports; the member's own Lost and Found reports appear under My Reports and not under Browse.

## Vision

FindBack's vision is to be the place each organization uses to return things to its members — a single, durable record of what has been lost, what has been found, and what has been returned. The product is designed for a single-organization operating model and stays focused on that scope.