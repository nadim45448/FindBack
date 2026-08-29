---
title: "Product Brief: FindBack"
status: final
created: 2026-08-28
updated: 2026-08-28
---

# Product Brief: FindBack

## Executive Summary

FindBack is a single-tenant Lost & Found management system. One organization runs it at a time — a school, an office, a public venue, or any community that loses things and finds them back.

It centralizes the lost-and-found workflow that today lives across notice boards, group chats, and security desks. Members report items, search what others have reported, and claim what is theirs.

Automatic match suggestions and cross-organization features are intentionally outside the MVP scope so the initial workflow stays focused. See §Scope for what the MVP covers, what it does not, and which decisions are deferred to the PRD. FindBack's value is in being simple, trustworthy, and clear.

## The Problem

Inside schools, offices, and similar communities, lost items typically end up in one of three places: a lost-and-found box, a chat thread, or nowhere at all. People who lose something search one channel, then another, then give up. People who find something want to do the right thing but have no reliable way to reach the owner. Administrators who run the lost-and-found juggle paper logs and screenshots.

The cost of this is small per item and large in aggregate: things that could be returned aren't, trust in the community erodes a little, and the people responsible for the process spend more time triaging than resolving. There is no shared, durable, searchable record of what has been lost, what has been found, and what has been returned.

## The Solution

FindBack gives a single organization one place to record lost and found items, search across both, and process claims with administrators in the loop. Members register, get approved, and can report or search. Claimants describe why they believe a found item is theirs; administrators review claims and approve or reject them, then mark items returned. Administrators are also responsible for approving new accounts and closing reports where appropriate.

Because FindBack runs as one deployment per organization, listings stay inside a single organization. Administrators are people associated with that organization. The product supports the workflow step by step: it tracks each item's lifecycle, while administrators provide the final decision that moves an approved claim toward return.

## Who This Serves

### Members (the people who lose and find things)

A student, employee, or other participant of the host organization who has either lost an item or found one that belongs to someone else. They register, get approved, and use FindBack to either search for something they have lost or post something they have found. Their success looks like this: they post a lost item once, browse a small number of relevant listings, recognize a match, submit a short claim, and hear back from an administrator.

### Administrators (the host organization's staff)

Designated staff of the host organization — for example, a security desk officer, facilities coordinator, or HR contact — who keep FindBack running for the community. Administrators are responsible for approving accounts, reviewing claims, marking items as returned, and closing reports where appropriate. They may also remove inappropriate content.

## How It Works

### Account lifecycle

A new user registers with basic information and enters a **Pending** state. They cannot use lost-and-found features until an administrator approves them. Once approved, the account is **Active** and the member can report, search, and claim. Administrators may deactivate an account; the record is preserved but the member can no longer use the system.

### Reporting

Active members can create two kinds of reports:

- **Lost item report** — for something the member has lost.
- **Found item report** — for something the member has found and is willing to return.

Each report carries a name, category, description, date, location, optional identifying details, and an optional image. The reporter can edit or delete their own report under the rules in *Editing and removing reports* below.

### Discovering matches

The MVP uses user-driven search and filtering rather than automatic match suggestions. Members discover potential matches by **browsing and searching** the combined pool of active lost and found reports. Search supports keyword, category, location, date, type (lost / found), and status. Anonymous users can see summary listings; full item details require login.

### Claiming

When an active member believes a found item is theirs, they submit a claim: a written reason, identifying details only the owner would know, and the date the item was lost. The system creates a **Pending** claim and notifies the finder by email. Administrators review the claim and decide on its outcome; the claimant is notified by email. Multiple claims on the same item are permitted; the detailed handling of competing claims will be defined in the PRD.

### Item lifecycle

Every lost- and found-item report carries a status that the system and administrators maintain:

- **Open** — the report is active and visible. No claim has been submitted.
- **Claim Requested** — at least one claim is pending review.
- **Claim Approved** — an administrator has approved a claim; awaiting physical hand-off.
- **Returned** — an administrator has confirmed the item was physically returned to the claimant. Terminal for normal flow.
- **Closed** — the report is no longer in active circulation. Used when the item is unclaimed and the organization removes it, when the reporter withdraws their report, or when an administrator removes inappropriate content. Terminal.

Each important transition in an item's lifecycle records **who** performed the action and **when** it occurred, so the full journey of the item is reconstructable. This includes:

- who reported the lost or found item,
- who submitted a claim on the item,
- which administrator(s) reviewed and decided on each claim (approved or rejected),
- which administrator confirmed the item as Returned,
- who ultimately received the item, and
- the relevant date and time for each of the above.

For the Returned action specifically, the claimant is recorded as the receiver by default. If the actual receiver is different from the claimant, the administrator records the substitute receiver's name or identity, confirms that the claimant authorized this person to collect the item on their behalf, and records the relationship between the claimant and the receiver (Friend, Family Member, Colleague, Classmate, or Other). If the claimant and the receiver are the same person, authorization and relationship are not applicable. MVP does not include identity verification or additional handoff features.

The full item history is an internal administrative record: only administrators can view it. Members continue to see the current status of their own reports and claims as already defined in this brief. The item history is kept as long as the report itself is kept, with no separate deletion mechanism.

### Editing and removing reports

- The reporter can **edit** their own report until it reaches **Returned** status.
- The reporter can **delete** their own report only while it is **Open** and has no claim.
- Once a claim exists, the reporter can **withdraw** the report, which transitions it to **Closed**. The report is preserved in history but no longer appears in active listings.
- Administrators can edit or remove any report at any time, for moderation purposes.

### Notifications

The MVP sends **email only**, for exactly three events:

1. A new account has been approved.
2. A new claim has been submitted on a found item the member reported.
3. A claim the member submitted has been approved or rejected.

In-app notifications, "claim under review" reminders, and stale-report reminders are not part of MVP.

### Brand and visual identity

FindBack's brand, logo, color palette, and visual identity are a related concern and will be defined separately as part of the design phase. This brief intentionally stops at the product level.

## Scope

### In scope for MVP

- Self-registration with administrator approval
- Login, logout, and member profile (limited to what the system needs to identify the member)
- Lost-item reporting (create, view, edit, delete / withdraw by owner; administrator moderation)
- Found-item reporting (same)
- Combined lost-and-found listings, anonymous-viewable in summary form
- Search and filter across keyword, category, location, date, type, and status
- Item detail view (login required)
- Claim submission with required reason, identifying details, and date lost
- Claim review and decision by administrators
- Item status lifecycle (Open, Claim Requested, Claim Approved, Returned, Closed)
- Item history / audit trail recording who performed each important lifecycle action and when, including the receiver and confirming administrator at Returned (administrator-only view; no separate deletion mechanism for the trail)
- Three email notifications (account approved, new claim, claim decision)
- Administrator functions: approve / deactivate users, review claims, mark items returned, close reports, remove inappropriate content

### Explicitly out of scope for MVP

- Automatic match suggestions or proactive notifications of potential matches
- In-app notifications or in-app messaging
- Proof-of-ownership uploads (photos of receipts, serial numbers, etc.)
- Cross-organization item sharing
- A global public marketplace
- Mobile native applications (the MVP is web-based)
- Multi-tenant administration of multiple organizations from one console
- Bulk import of historical lost-and-found records
- Analytics, dashboards, or reporting beyond what administrators need to operate the system
- Integration with external identity providers (SSO, LDAP, etc.)
- Internationalization beyond English

### Decisions deferred to PRD

These are product decisions that need product-level design but were intentionally not resolved in this brief. The PRD should resolve them and surface them in stories:

- The process for facilitating contact between claimants, finders, and administrators when needed, including whether any contact information or external communication method is exposed.
- The precise definition of "sensitive" information that is hidden from public listings (e.g., reporter's full name, exact location, contact details), and the precise set of summary fields visible to anonymous users.
- The detailed handling of competing claims on the same found item — administrators decide, but the UX of how they review and choose between pending claims is a PRD design call.
- The detailed process administrators follow to review and approve registration requests.

## Product Principles

Three principles guide product decisions in MVP:

- **Simple.** Members should report and search without a learning curve; administrators should run the system without training.
- **Trustworthy.** Members should feel their information and claims are handled responsibly; administrators should have the visibility they need to decide and act.
- **Clear.** Item status, claim status, and account status should be obvious at a glance.

Detailed UX requirements — including accessibility and action-oriented interaction patterns — are handled in the PRD and UX design phase.

## Success Criteria

The MVP is successful when:

1. A new user can register, and an administrator can approve their account.
2. An active member can report a lost item and a found item.
3. Active members can search and filter the combined listing pool using keyword, category, location, date, type, and status.
4. An active member can submit a claim on a found item, providing reason, identifying details, and date lost.
5. Administrators can review pending claims and approve or reject them.
6. Administrators can mark an approved item as returned and close the report.
7. Email notifications are delivered for the three MVP events (account approved, new claim, claim decision).
8. Members see the current status of their reports and claims whenever they log in.
9. Trying to edit or delete a report outside the permitted rules is prevented with a clear message.
10. Anonymous users can browse summary listings without logging in, but cannot view item details.

## Vision

FindBack's vision is to be the place each organization uses to return things to its members — a single, durable record of what has been lost, what has been found, and what has been returned. The product is designed for the current single-organization use case and stays focused on that scope.