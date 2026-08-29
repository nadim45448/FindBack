---
title: "PRD: FindBack"
status: final
created: 2026-08-28
updated: 2026-08-28
---

# PRD: FindBack

## 0. Document Purpose

This PRD is the authoritative specification for the FindBack MVP. It is for the product team, UX designer, architect, and downstream story authoring. It builds on the locked Product Brief at `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/brief.md`, which is the source of truth for product direction. The PRD does not contradict the brief; where the brief deferred a decision to the PRD, this PRD resolves it. Where the brief was silent on a product detail, this PRD adds the minimum needed for downstream work without expanding scope.

Glossary terms appear in §3 and are used verbatim throughout. Features are in §4 and functional requirements are numbered globally (FR-1 through FR-N) so stories and acceptance criteria can cross-reference them stably. User journeys in §2.3 are the named-persona narratives the product enables. Out-of-scope items are explicit in §5 and §6.2.

## 1. Vision

FindBack is the place each organization uses to return things to its members. One organization runs it at a time — a school, an office, a public venue — and members of that organization use it to report lost and found items, search what others have reported, and submit claims when they recognize something as theirs. Administrators of the host organization act as the human authority at the center: they approve accounts, review claims, mark items returned, and close reports that never resolve.

The MVP replaces the lost-and-found box and the chat thread with a single, durable, searchable record. It does not try to be clever. There is no automatic matching, no in-app notification stream, and no cross-organization sprawl. The product earns its place by being simple to use, trustworthy to depend on, and clear about what has happened to every item.

## 2. Target User

### 2.1 Jobs To Be Done

**Members** (the people who lose and find things):

- *Functional:* post a lost or found item; find what I have lost; submit a clear claim; know the status of my reports and claims without contacting anyone.
- *Emotional:* trust that the process is being handled responsibly and that my information will not be exposed.
- *Social:* do the right thing when I find something; reconnect with a lost item without depending on chance.

**Administrators** (the host organization's staff):

- *Functional:* approve new registrations; review claims with the evidence I need; confirm physical return; close reports that no longer belong in active circulation.
- *Operational:* run the system without training; see at a glance which items need action; keep a defensible audit trail of who did what and when.
- *Reputational:* protect the community from inappropriate content; provide a clear, accountable process when something goes wrong.

### 2.2 Non-Users (v1)

- **Other organizations.** FindBack runs one deployment per organization. There is no federation, no shared pool, no marketplace.
- **Anonymous actors.** Anonymous users can browse summary listings only. They cannot report, claim, or message.
- **Identity providers.** External SSO/LDAP integration is out of scope for MVP.
- **Mobile-only users.** The MVP is a web application. There is no native mobile app in MVP.

### 2.3 Key User Journeys

**UJ-1. Maya reports a lost wallet and is reunited with it.**

- *Persona + context:* Maya, a graduate student, has lost her wallet somewhere on campus. She is a registered, approved member.
- *Entry state:* authenticated via the web application; landing on the dashboard after seeing an "account approved" email the previous day.
- *Path:*
  1. Maya clicks **Report Lost Item**, fills in name (Wallet), category (Wallets & purses), description ("Brown leather, zip closure, contains student ID and a photo card"), date lost (today), location (campus — she selects "Main Library" from the campus area list), and an optional image.
  2. She submits. The system creates the report in **Open** status. The audit trail records Maya as the reporter with a timestamp.
  3. Two days later, she logs in, opens **My Reports**, sees the report is still **Open**, and browses **Found Items**.
  4. She filters by category and location, finds a wallet that looks like hers, opens the detail page (logged in), and clicks **Submit Claim**.
  5. She enters reason ("This is my wallet — brown leather, with a photo of my dog inside"), identifying details ("There is a small scratch on the back, and a folded metro card in the inner pocket"), and date lost (the same date).
  6. The system creates a **Pending** claim, sends an email to the finder, and updates Maya's claim status to **Pending**.
  7. An administrator reviews the claim and approves it. The item status moves to **Claim Approved**. Maya receives an email.
  8. Maya visits the desk. The administrator hands the wallet to her and records the **Returned** action: receiver is Maya (default claimant), confirming administrator and timestamp recorded.
  9. The item status moves to **Returned**, terminal. The audit trail now contains the complete journey.
- *Climax:* Maya walks away with her wallet and a clear email notification. The audit trail proves who returned it and when.
- *Resolution:* Maya's **My Reports** shows the wallet as **Returned**. The claim is closed.
- *Edge case:* if the wallet had not matched, Maya would have continued browsing and either submitted another claim or contacted the administrator via the per-claim message thread (FR-26).

**UJ-2. Sam finds a phone and wants to do the right thing.**

- *Persona + context:* Sam, an employee of the same organization, found a phone at the cafeteria. He is an approved member.
- *Entry state:* authenticated, landing on the dashboard.
- *Path:*
  1. Sam clicks **Report Found Item**, fills in the item fields including location (Cafeteria) and description, and submits.
  2. The report is created in **Open** status. Audit trail records Sam as the reporter and timestamp.
  3. Three days later, Sam receives an email: a new claim has been submitted on his found item. He opens the item and reads the claim's reason and identifying details (Maya's).
  4. Sam does not respond directly. He trusts the administrator's review.
  5. The administrator approves Maya's claim. Sam is not notified by email (only the three MVP events trigger emails). He sees the item status change to **Claim Approved** the next time he visits his reports.
  6. Sam brings the phone to the administrator. The administrator records Returned with Maya as the receiver.
- *Climax:* Sam sees the item status move to **Returned** with the audit trail intact. The system has done the right thing without Sam having to chase anyone.
- *Resolution:* Sam's report is closed.
- *Edge case:* if Sam edits his report before any claim exists, the edit is recorded with a timestamp in the audit trail (FR-19).

**UJ-3. Alex, a new intern, registers and is approved.**

- *Persona + context:* Alex has joined the organization. He has been told about FindBack by a colleague.
- *Entry state:* unauthenticated, on the public landing page.
- *Path:*
  1. Alex clicks **Register**, fills in name, email, and self-declared role (Employee), and submits.
  2. The account is created in **Pending** status. Alex sees a confirmation screen that says an administrator will review the request.
  3. The system notifies administrators (in-app, not email) that a new pending registration is in the queue.
  4. An administrator opens **Pending Registrations**, sees Alex's request, and clicks **Approve**.
  5. The system sends Alex an "account approved" email and changes Alex's status to **Active**.
  6. Alex logs in and sees the dashboard with **Report Lost Item** and **Report Found Item** actions enabled.
- *Climax:* Alex receives the approval email within minutes and can use the system.
- *Resolution:* Alex is now an active member.
- *Edge case:* if Alex's account is rejected, he receives a generic rejection email (no reason is exposed to him), and his account is set to **Rejected**. Alex's record is preserved for audit but he cannot log in. The rejection reason is visible only to administrators in the audit trail.

**UJ-4. Riley, an administrator, handles a busy morning.**

- *Persona + context:* Riley works at the organization's security desk and is the only administrator scheduled today. There are 6 pending claims, 2 pending registrations, and 1 approved claim awaiting physical return.
- *Entry state:* authenticated as administrator, on the administrator dashboard.
- *Path:*
  1. Riley opens **Pending Claims** and sees the queue ordered by submission time.
  2. For the first claim, Riley opens the review screen, sees the claimant's reason, identifying details, date lost, and the item details side by side. Riley reads both. The status of every other pending claim on the same item is shown, so Riley can see this is the only pending claim.
  3. Riley clicks **Approve**. The system updates this claim to **Approved**, auto-rejects any other pending claims on the same item with reason "another claim was approved for this item", and the item status moves to **Claim Approved**. Email notifications are sent to the claimant and to the finder (per FR-29).
  4. Riley moves to the second pending claim on a different item. There are two competing claims. Riley opens the review screen, sees both claims side by side, and reads the reasons and identifying details. Riley approves one; the other is auto-rejected.
  5. Riley works through the queue. Each decision records the administrator (Riley) and timestamp in the audit trail.
  6. The owner of the approved item arrives to collect it. Riley opens the item, sees the **Confirm Returned** action, and records the handoff. Maya (the claimant) is the default receiver. The action records Riley as confirming administrator, the receiver name, and the timestamp. The item status moves to **Returned**.
  7. Riley reviews the two pending registrations, approves one (which sends an approval email and activates the account), and rejects the other with a recorded reason.
- *Climax:* Riley processes 6 claims, 2 registrations, and 1 returned item without confusion. Every action is captured.
- *Resolution:* the queue is empty. Riley's audit trail records all 9 actions today.
- *Edge case:* if Riley accidentally tries to edit a report that is already **Returned**, the system blocks the edit and shows a clear message.

## 3. Glossary

- **Organization** — The single host (school, office, venue, etc.) that operates one FindBack deployment. Every account, report, and claim belongs to exactly one organization.
- **Member** — A user who has completed registration and is **Active**. Members can report, search, claim, and message on items they are involved in.
- **Anonymous User** — A visitor who is not authenticated. Can see summary listings only.
- **Pending User** — A registered user whose account has not yet been approved. Cannot use lost-and-found features. Receives a confirmation page after registration; no email is sent until approval or rejection.
- **Rejected User** — A registered user whose registration was declined. Cannot log in. Record is preserved for audit.
- **Active User** — A registered user whose account has been approved by an administrator. Full member capabilities.
- **Deactivated User** — A previously Active user whose account has been turned off by an administrator. Record preserved; cannot log in.
- **Administrator** — Designated staff of the host organization who approves registrations, reviews claims, marks items returned, closes reports, and may remove inappropriate content. Administrators are not a separate role type; an Administrator is a Member with the `administrator` flag set.
- **Report** — A Lost item report or a Found item report. Each report has a status (see Lifecycle) and an audit trail.
- **Lost Item Report** — A report created by a member who has lost something.
- **Found Item Report** — A report created by a member who has found something and is willing to return it.
- **Listing** — A row in the combined pool of Lost and Found reports. Anonymous users see a summary listing; members see the same summary plus access to full details.
- **Claim** — A submission by a member asserting that a specific Found item report is theirs. A claim has its own status (Pending / Approved / Rejected) and its own audit trail entries.
- **Pending Claim** — A claim awaiting administrator review.
- **Approved Claim** — A claim an administrator has approved. At most one approved claim exists per item at any time.
- **Rejected Claim** — A claim an administrator has rejected, or that has been auto-rejected because another claim on the same item was approved.
- **Lifecycle Status** — The status of a Report: Open, Claim Requested, Claim Approved, Returned, or Closed.
- **Open** — A report is active and visible. No claim has been submitted.
- **Claim Requested** — At least one claim is pending review on the report.
- **Claim Approved** — An administrator has approved a claim. The item is awaiting physical return.
- **Returned** — An administrator has confirmed the item was physically returned. Terminal for normal flow.
- **Closed** — The report is no longer in active circulation. Reached by reporter withdrawal, organization removal of an unclaimed item, or administrator removal of inappropriate content. Terminal.
- **Receiver** — The person recorded as having taken physical possession of the item. Defaults to the claimant on the approved claim. May be substituted by the administrator at the Returned action.
- **Substitute Receiver** — A person other than the claimant who received the item. Recorded with the administrator-confirmed authorization and the relationship between claimant and substitute.
- **Audit Trail** — The ordered, append-only record of who did what when on a Report or Claim. Visible only to administrators. Retained for the lifetime of the report. Includes administrative, member, and lifecycle events.
- **Audit Event** — One record in the audit trail. Always includes actor (who), action (what), target (which report or claim), and timestamp. Some events include additional fields (e.g., claim reason; substitute receiver authorization and relationship).
- **Per-claim Message Thread** — The MVP-only contact channel between the claimant, the finder of the item, and administrators, scoped to one specific claim. See PRD-author decision D1.
- **Sensitive Field** — A field hidden from non-owners and non-administrators on the item detail page. See PRD-author decision D2.
- **Public Summary Field** — A field visible in the listing shown to anonymous users. See PRD-author decision D2.

## 4. Features

### 4.1 Account Lifecycle and Approval

**Description:** A new user registers with name, email, password, and self-declared role (Student, Employee, Visitor, Other). The account enters **Pending** status. Administrators review and approve or reject. Approved users become Active members. Administrators can deactivate an active account later. Audit events record every status transition with actor and timestamp. Realizes UJ-3.

**Functional Requirements:**

#### FR-1: Self-Registration

A new visitor can register with name, email, password (meets complexity rules), and self-declared role.

**Consequences (testable):**
- Email must be unique within the organization.
- Password minimum 8 characters, must include at least one letter and one number.
- Self-declared role options are Student, Employee, Visitor, Other (single-select).
- On success, the account is created in **Pending** status and the user is shown a confirmation page stating that an administrator will review the request.
- No email is sent on registration. Email is sent only after approval or rejection.

#### FR-2: Pending State and Restricted Access

A Pending user can log in but cannot create reports, search beyond the public summary listing, view item details, submit claims, send messages, or use any lost-and-found feature.

**Consequences (testable):**
- Logging in as Pending shows a status banner reading "Your account is pending administrator approval."
- Every endpoint that creates a report, claim, or message returns HTTP 403 with a clear message when the actor is not Active.
- The audit trail records the registration event with the user's name, email, and self-declared role and timestamp.

#### FR-3: Administrator Review of Pending Registrations

Administrators see a queue of Pending registrations ordered by submission time. Each entry shows name, email, self-declared role, and registration timestamp.

**Consequences (testable):**
- The queue is accessible only to administrators.
- Each entry has **Approve** and **Reject** actions.
- Approve changes status to Active and sends the "account approved" email.
- Reject requires a short reason (free text, minimum 5 characters). The reason is recorded in the audit trail but is not exposed to the rejected user.

#### FR-4: Login and Logout

Active, Deactivated, and Rejected users can attempt login. Active users land on the member dashboard; Pending users land on a confirmation banner; Deactivated and Rejected users see a generic "your account is not active" message.

**Consequences (testable):**
- Sessions expire after 14 days of inactivity.
- Logout clears the session.

#### FR-5: Deactivation

An administrator can deactivate an Active account. Deactivated accounts cannot log in; their record is preserved.

**Consequences (testable):**
- The action records the administrator and timestamp in the user's audit trail.
- All reports and claims owned by the deactivated user remain visible to administrators.

**Feature-specific NFRs:** None beyond cross-cutting NFRs in §10.

### 4.2 Reporting Lost and Found Items

**Description:** Active members can create Lost item reports and Found item reports. Each report carries name, category, description, date, location, optional identifying details, and an optional image. Each report starts in **Open** status. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-6: Create Lost Item Report

An Active member can create a Lost item report with the required and optional fields defined below.

**Consequences (testable):**
- Required: name (1-80 chars), category (one of a fixed enum), description (10-2000 chars), date lost (within the last 365 days, not in the future), location (campus area from a fixed list + optional exact-place free text up to 200 chars).
- Optional: identifying details (free text, up to 500 chars), image (JPEG/PNG/WebP, up to 5 MB).
- On submit, status is **Open**, audit trail records the reporter and timestamp.

#### FR-7: Create Found Item Report

An Active member can create a Found item report with the same fields as FR-6, except the date field is "date found" and the location field is the place where the item was found.

**Consequences (testable):**
- Same validation rules as FR-6, except date must be today or earlier (no past-365-day bound; found items can be reported promptly so 30-day past bound is sufficient, configurable).
- On submit, status is **Open**, audit trail records the reporter and timestamp.

#### FR-8: Report Field Set (Authoritative)

| Field | Required | Type | Constraints |
|---|---|---|---|
| name | yes | string | 1-80 chars |
| category | yes | enum | Wallet, Bag, Electronics, Keys, Clothing, Books/Notebooks, Identification, Water Bottle, Other |
| description | yes | string | 10-2000 chars |
| date | yes | date | Lost: last 365 days, not future. Found: last 30 days, not future. |
| location campus area | yes | enum | Fixed list (set per deployment) |
| location exact place | optional | string | 0-200 chars (Sensitive Field per D2) |
| identifying details | optional | string | 0-500 chars (Sensitive Field per D2) |
| image | optional | image | JPEG/PNG/WebP, up to 5 MB |

#### FR-9: Edit Own Report

A member can edit their own report while it is in any status except **Returned**.

**Consequences (testable):**
- Editing a report does not change its status.
- Every edit is recorded in the audit trail with actor and timestamp and a snapshot of changed fields.
- Attempting to edit a **Returned** report is blocked with the message "Returned reports cannot be edited."

#### FR-10: Delete Own Report (Claim-Free)

A member can delete their own report only while it is **Open** and has no claims. Deletion is a hard delete.

**Consequences (testable):**
- After deletion, the report no longer appears in any listing.
- The audit trail entry for the report is also removed (no separate retention for deleted reports without claims).

#### FR-11: Withdraw Own Report

Once a claim exists on a report, the owner can withdraw it. Withdrawal transitions status to **Closed** and removes the report from active listings.

**Consequences (testable):**
- Withdraw is available from the moment any claim exists until status reaches **Returned**.
- The audit trail records the withdrawal with actor and timestamp. The withdrawn report remains in history for administrators.
- Members browsing listings do not see withdrawn reports.

**Feature-specific NFRs:** Image upload must complete within 3 seconds at p95 under normal conditions (cross-references §10).

### 4.3 Browsing, Search, and Detail

**Description:** Anyone can browse a combined pool of Lost and Found reports. Anonymous users see summary listings; members can view item details. Search and filter supports keyword, category, location, date, type, and status. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-12: Public Summary Listings (Anonymous)

Anonymous users can browse a paginated list of Lost and Found reports.

**Consequences (testable):**
- Default ordering is by date (most recent first).
- Each summary row shows: item name, category, date, campus area, status, type (lost / found). See D2 for the precise field set.
- No image, no exact location, no identifying details, no reporter identity are visible.
- Clicking a row when not logged in routes to the login page with a return-after-login affordance.

#### FR-13: Authenticated Detail View

Active members can view full item details by clicking through from a listing.

**Consequences (testable):**
- Detail page shows everything in the summary plus: description, image (if present), exact location text (Sensitive — visible to authenticated members per D2), reporter's display name, status history (member-facing — only their own items' status history is exposed).
- Members who are not the reporter and have no claim see the summary fields plus description and image. They do not see exact location text or identifying details.

#### FR-14: Search and Filter

Anyone can search and filter the combined pool using keyword, category, location, date range, type (lost / found), and status.

**Consequences (testable):**
- Keyword matches against item name and description (case-insensitive, partial match).
- Category is single-select from the enum in FR-8.
- Location filter uses the campus area enum, not exact-place text.
- Date range filters the report's date field.
- Type filter restricts to Lost, Found, or both (default both).
- Status filter restricts to Open, Claim Requested, Claim Approved, Returned, Closed (administrator-only sees all; members and anonymous see Open, Claim Requested, Claim Approved by default — Returned and Closed are filtered out of the default view).

**Feature-specific NFRs:** Search must return results within 500 ms at p95 against 10,000 active reports.

### 4.4 Claim Lifecycle

**Description:** Active members can submit claims on Found item reports. Claims carry reason, identifying details, and date lost. Multiple claims on the same item are permitted. Administrators review and approve or reject. Approval is exclusive — exactly one approved claim per item; other pending claims on the same item are auto-rejected when the first approval is recorded. Realizes UJ-1, UJ-2, UJ-4. Implements PRD-author decision D3.

**Functional Requirements:**

#### FR-15: Submit a Claim

An Active member can submit a claim on a Found item report.

**Consequences (testable):**
- Required: reason (free text, 20-1000 chars), identifying details (free text, 10-500 chars), date lost (within the last 365 days, not future).
- A member cannot submit more than one Pending claim on the same item at the same time. (If their previous claim was rejected, they may submit a new one.)
- On submit, the claim is created in **Pending** status. The system sends the "new claim on found item" email to the reporter of the Found item.
- The audit trail records the claim submission with actor and timestamp.
- The Found item report's lifecycle status transitions from **Open** to **Claim Requested** if it was Open.

#### FR-16: Administrator Review Screen

An administrator can open a review screen for a Pending claim. The screen shows, side by side: the item details, the claimant's reason, identifying details, date lost, and the count and identity of other pending claims on the same item.

**Consequences (testable):**
- The screen is accessible only to administrators.
- Other pending claims on the same item are listed (not editable) so the administrator knows whether this is the only claim.

#### FR-17: Approve a Claim

An administrator can approve a Pending claim.

**Consequences (testable):**
- Approve changes the claim status to **Approved**.
- If another Pending claim exists on the same item, all other Pending claims on the same item are auto-rejected with the audit reason "another claim was approved for this item" and the claimant of each is sent a "claim rejected" email.
- The Found item report's lifecycle status transitions to **Claim Approved**.
- The audit trail records the approval with the approving administrator and timestamp, plus the auto-rejection events with their timestamps.
- If two administrators attempt to approve two different claims on the same item simultaneously, the first decision wins; the second administrator sees a conflict message and must take no further action. Implementation is a database-level atomic write per item.

#### FR-18: Reject a Claim

An administrator can reject a Pending claim with a reason.

**Consequences (testable):**
- Reject changes the claim status to **Rejected**. The reason (free text, 10-500 chars) is recorded in the audit trail.
- The audit trail retains the rejected claim entry even when the item status does not change.
- The claimant is sent a "claim rejected" email.
- The item's lifecycle status returns to **Open** if no other Pending claims remain.

**Feature-specific NFRs:** None beyond cross-cutting NFRs in §10.

### 4.5 Edit / Withdraw / Close Behaviors

**Description:** Edits, deletions, withdrawals, and administrative closures are governed by the rules in the Product Brief and PRD-author decision D2. Realizes UJ-1, UJ-2, UJ-4.

**Functional Requirements:**

#### FR-19: Reporter Edits (Audit Trail)

Every edit of a report by its owner is recorded in the audit trail with actor, timestamp, and a snapshot of changed fields.

#### FR-20: Reporter Withdrawals (Audit Trail)

Every withdrawal of a report by its owner is recorded in the audit trail with actor and timestamp. The report's status becomes **Closed** and the report disappears from active listings. Administrators continue to see it in history.

#### FR-21: Administrator Close Action

An administrator can close any report that is not **Returned**. Closing transitions status to **Closed** and removes the report from active listings.

**Consequences (testable):**
- Close is used when an unclaimed item is removed from the lost-and-found, or when inappropriate content is taken down.
- The audit trail records the Close action with the administrator and timestamp.

#### FR-22: Auto-Status Transitions

The system transitions item status automatically when claims are submitted, decided, or auto-rejected.

**Consequences (testable):**
- First Pending claim on an Open item → **Claim Requested**.
- Pending claim approved → **Claim Approved**.
- All Pending claims rejected and no other Pending claims → **Open** again.
- **Returned** and **Closed** are terminal and only reached by administrator action.

**Feature-specific NFRs:** None.

### 4.6 Returned Action and Receiver Substitution

**Description:** An administrator confirms the physical return of an item. The default receiver is the claimant on the approved claim. If the actual receiver differs, the administrator records the substitute receiver's name, the claimant's authorization for that person, and the relationship between claimant and substitute. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-23: Confirm Returned (Default Receiver)

An administrator can confirm Returned on a report whose status is **Claim Approved**. The default receiver is the claimant on the approved claim.

**Consequences (testable):**
- The action records: confirming administrator, receiver (claimant), timestamp, and that no substitution occurred.
- The item status transitions to **Returned**, terminal.
- The audit trail records the action.

#### FR-24: Confirm Returned (Substitute Receiver)

When the actual receiver differs from the claimant, the administrator records the substitute receiver's name, confirms the claimant's authorization for that person, and records the relationship.

**Consequences (testable):**
- Required fields: substitute receiver's name (1-80 chars), authorization confirmation (a single checkbox or affirmation that the claimant authorized this person to collect on their behalf), relationship (single-select from the enum Friend, Family Member, Colleague, Classmate, Other).
- All three fields are required when the substitute is not the claimant.
- MVP does not perform identity verification; the administrator's recorded affirmation is the entire confirmation mechanism.
- The action records: confirming administrator, substitute receiver's name, authorization affirmation, relationship, timestamp.
- The item status transitions to **Returned**, terminal.

**Out of Scope:** Identity verification, photo proof of authorization, in-platform message to claimant asking for confirmation, push notifications related to the substitute confirmation.

#### FR-25: No-Receiver-No-Returned Guard

The system refuses to confirm Returned without a recorded receiver (default or substitute).

**Consequences (testable):**
- If the administrator attempts to confirm Returned without selecting default-or-substitute and without filling the substitute fields, the system blocks the action with a clear message.

**Feature-specific NFRs:** None.

### 4.7 Per-Claim Message Thread

**Description:** The MVP provides a per-claim message thread as the contact channel between claimant, finder of the item, and administrators. No email addresses, phone numbers, or external chat tools are exposed between members. Realizes UJ-1, UJ-4. Implements PRD-author decision D1.

**Functional Requirements:**

#### FR-26: Per-Claim Thread

Each claim has a single message thread. The thread is visible to the claimant, the finder of the Found item the claim targets, and all administrators.

**Consequences (testable):**
- Members who are neither the claimant nor the finder cannot view or post in the thread.
- The thread is created when the first message is posted (or when the claim is created — implementation choice, but the thread is visible from claim creation onward).
- Posts are plain text and limited to 2000 characters. No attachments, no rich text, no images.
- Posts record actor and timestamp in the audit trail.
- MVP does not include real-time chat, typing indicators, read receipts, or push notifications for messages.
- The thread is closed (read-only) once the claim is Approved, Rejected, or the item is Closed. The thread is not deleted; members and administrators can read history.

**Out of Scope:** Phone number or email exposure between members, in-app push notifications for new messages, third-party chat integrations, attachments.

### 4.8 Email Notifications

**Description:** Three email events are sent in MVP. No in-app notifications. No other emails. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-27: Account Approved Email

Sent when an administrator approves a Pending registration.

**Consequences (testable):**
- Sent to the user's registered email address.
- Contains a link to the application login page (no auto-login token).

#### FR-28: New Claim Email

Sent when a Pending claim is created on a Found item report.

**Consequences (testable):**
- Sent to the reporter of the Found item.
- Contains a link to the claim's detail page (login required).

#### FR-29: Claim Decision Email

Sent when a claim is approved or rejected (including auto-rejection under D3).

**Consequences (testable):**
- Sent to the claimant.
- For approval: contains a link to the item detail page and a note that the item is awaiting physical hand-off.
- For rejection: contains a brief reason (the administrator-supplied reason, or the auto-rejection reason "another claim was approved for this item").

#### FR-30: No Other Notifications

The MVP sends no other emails, in-app notifications, push notifications, or SMS.

**Consequences (testable):**
- New message in the per-claim thread does not generate an email.
- Reporter edit or withdrawal does not generate an email.
- Returned confirmation does not generate an email.
- Closed-by-administrator does not generate an email.

**Feature-specific NFRs:** Email delivery success rate target is 95% within 5 minutes; failure does not block the triggering action.

### 4.9 Audit Trail

**Description:** Every important action on a report or claim is recorded in an append-only audit trail visible only to administrators. Retained for the lifetime of the report. Realizes UJ-1, UJ-2, UJ-4. Implements PRD-author decisions from the brief's locked audit-trail list and PRD-author decision D4.

**Functional Requirements:**

#### FR-31: Audit Trail Scope (Authoritative)

The audit trail records every one of the following events. Each event includes actor, action, target (report or claim), timestamp, and any action-specific fields listed below.

**Events and required additional fields:**

1. **Report created** — actor (reporter), report ID, name, category, type (lost/found), date, location, optional fields, image presence, timestamp.
2. **Claim submitted** — actor (claimant), claim ID, item ID, reason, identifying details, date lost, timestamp.
3. **Claim approved** — actor (administrator), claim ID, item ID, timestamp. (Auto-rejection of competing claims is recorded as separate events.)
4. **Claim rejected by administrator** — actor (administrator), claim ID, item ID, reason, timestamp.
5. **Claim auto-rejected** — actor (the administrator whose approval triggered the auto-rejection), claim ID, item ID, auto-rejection reason ("another claim was approved for this item"), timestamp.
6. **Returned confirmed (default receiver)** — actor (administrator), item ID, receiver (claimant on approved claim), timestamp.
7. **Returned confirmed (substitute receiver)** — actor (administrator), item ID, substitute receiver name, authorization affirmation, relationship, timestamp.
8. **Report edited by reporter** — actor (reporter), item ID, snapshot of changed fields, timestamp.
9. **Report withdrawn by reporter** — actor (reporter), item ID, timestamp.
10. **Report closed by administrator** — actor (administrator), item ID, timestamp.
11. **Registration approved** — actor (administrator), user ID, timestamp.
12. **Registration rejected** — actor (administrator), user ID, reason, timestamp.
13. **Account deactivated** — actor (administrator), user ID, timestamp.
14. **Message posted in per-claim thread** — actor (claimant / finder / administrator), claim ID, message text (subject to retention), timestamp. (Treated as an audit record; messaging is operational rather than a core lifecycle event.)

**Consequences (testable):**
- The trail is append-only: no entry can be edited or deleted.
- The trail is visible only to administrators (FR-32).
- The trail is retained for the lifetime of the report or claim. If the report is deleted (claim-free Open only), the trail is removed with it. If the report is withdrawn, Closed, or Returned, the trail is retained.
- There is no separate deletion mechanism for the trail while the report exists.
- Rejected claims remain in the trail even when the item's status does not change.

#### FR-32: Audit Trail Visibility

Only administrators can view the full audit trail of any report or claim.

**Consequences (testable):**
- Members do not see audit entries when viewing their own reports.
- Anonymous users cannot see audit entries.
- Members who are neither the reporter nor the claimant cannot see audit entries.
- Members who are the reporter or claimant see only a member-facing status history for their own item (current status and last-action timestamp), not the full audit trail.

**Feature-specific NFRs:** Audit trail queries must complete within 1 second at p95 against 10,000 reports with 50 events each.

### 4.10 Administrator Functions

**Description:** Administrators perform all cross-cutting administrative actions: approve and reject registrations, deactivate accounts, review and decide claims, confirm returns, close reports, and remove inappropriate content. Realizes UJ-3, UJ-4.

**Functional Requirements:**

#### FR-33: Administrator Dashboard

Administrators see a dashboard with pending counts: Pending registrations, Pending claims, Items awaiting physical return.

**Consequences (testable):**
- Each count is a link to the corresponding queue.
- The dashboard is accessible only to administrators.

#### FR-34: Pending Claims Queue

Administrators see a queue of Pending claims across all items, ordered by submission time. The queue shows item ID, claimant display name, submission time, and a link to the review screen.

**Consequences (testable):**
- The queue is filtered to claims with status **Pending**.
- The queue is accessible only to administrators.

#### FR-35: Items Awaiting Return Queue

Administrators see a queue of items with status **Claim Approved**, ordered by approval time.

**Consequences (testable):**
- Each entry has a **Confirm Returned** action.

#### FR-36: Remove Inappropriate Content

An administrator can remove a report for inappropriate content. Removal transitions status to **Closed** and records the action in the audit trail.

**Consequences (testable):**
- The action records the administrator and timestamp.
- Removed reports disappear from active listings.
- The audit trail retains the entry.

**Feature-specific NFRs:** None.

### 4.11 Information Visibility Rules (Sensitive and Public Fields)

**Description:** Implements PRD-author decision D2. Defines which fields are visible to which audiences.

**Functional Requirements:**

#### FR-37: Sensitive Fields

The following fields are Sensitive Fields. They are hidden from non-owners and non-administrators on the item detail page:

- Exact location text (the free-text "exact place" portion of the location field).
- Reporter's email address.
- Reporter's phone number (if collected — MVP does not require phone).
- Identifying details free-text on the report.
- Claimant's identifying details free-text on a claim (visible only to administrators and to the claimant themselves).
- Image (until the viewer is authenticated, and only if the viewer has a legitimate need-to-know).
- Receiver-substitution fields (substitute receiver's name, authorization affirmation, relationship).

#### FR-38: Public Summary Fields

Anonymous users (and members who are not on the item) see, in summary listings and detail pages, exactly:

- Item name.
- Category.
- Date (lost or found).
- Campus area (the enum value, not exact place).
- Status (lifecycle status, restricted to Open / Claim Requested / Claim Approved for non-administrators).
- Type (lost / found).

#### FR-39: Member-Facing Visibility (Authenticated)

Authenticated members see additional fields when viewing a report detail:

- Description (full text).
- Image (if present).
- Status history (member-facing — current status and last-action timestamp).
- Reporter's display name.

Members who are neither the reporter nor the claimant do not see exact location text or identifying details.

**Consequences (testable):**
- The detail page renders different field sets based on viewer role and relationship to the item.
- API responses to listing endpoints expose only the public summary fields unless the caller is authenticated and has a role on the item.

**Feature-specific NFRs:** None.

## 5. Non-Goals (Explicit)

The following are non-goals for FindBack MVP. They are stated here because downstream readers (UX, architecture, story creation) may otherwise assume them.

- **[NON-GOAL for MVP]** Cross-organization item sharing or federation. FindBack runs one deployment per organization.
- **[NON-GOAL for MVP]** A global public marketplace where any user can browse items from any organization.
- **[NON-GOAL for MVP]** Automatic match suggestions or proactive notifications of potential matches between Lost and Found reports.
- **[NON-GOAL for MVP]** In-app notifications, push notifications, or in-app messaging other than the per-claim message thread.
- **[NON-GOAL for MVP]** SMS or third-party chat (Slack, WhatsApp, etc.) integration for member-to-member contact.
- **[NON-GOAL for MVP]** Real-time chat features in the per-claim thread: typing indicators, read receipts, presence, attachments.
- **[NON-GOAL for MVP]** Proof-of-ownership uploads. The MVP does not allow members to upload photos of receipts, serial numbers, or other proof.
- **[NON-GOAL for MVP]** Identity verification. The administrator's recorded affirmation is the entire confirmation mechanism for substitute receivers.
- **[NON-GOAL for MVP]** Native mobile applications. The MVP is a web application.
- **[NON-GOAL for MVP]** Multi-tenant administration of multiple organizations from one console.
- **[NON-GOAL for MVP]** Bulk import of historical lost-and-found records.
- **[NON-GOAL for MVP]** Analytics dashboards or reporting beyond what administrators need to operate the system.
- **[NON-GOAL for MVP]** Integration with external identity providers (SSO, LDAP, Google, Microsoft, etc.).
- **[NON-GOAL for MVP]** Internationalization beyond English.
- **[NON-GOAL for MVP]** Automatic expiry or auto-close of unclaimed reports.
- **[NON-GOAL for MVP]** Auto-close reminders or "stale report" emails.

## 6. MVP Scope

### 6.1 In Scope

The MVP delivers, end to end:

- Self-registration with administrator approval (FR-1, FR-2, FR-3, FR-4).
- Login, logout, and session management (FR-4).
- Lost item reporting with create, view, edit, delete / withdraw by owner (FR-6, FR-9, FR-10, FR-11).
- Found item reporting with the same behaviors (FR-7, FR-9, FR-10, FR-11).
- Combined Lost-and-Found listings, anonymous-viewable in summary form (FR-12).
- Search and filter across keyword, category, location, date range, type, and status (FR-14).
- Authenticated item detail view with role- and relationship-aware visibility (FR-13, FR-37 through FR-39).
- Claim submission with required reason, identifying details, and date lost (FR-15).
- Per-claim message thread (FR-26).
- Administrator claim review and decision (approve / auto-reject competitors / reject) (FR-16, FR-17, FR-18).
- Item lifecycle transitions (Open → Claim Requested → Claim Approved → Returned / Closed) (FR-22).
- Reporter withdrawal transitions reports to Closed (FR-20).
- Administrator Close on unclaimed or inappropriate reports (FR-21, FR-36).
- Returned confirmation with default or substitute receiver (FR-23, FR-24, FR-25).
- Three email notifications: account approved, new claim, claim decision (FR-27, FR-28, FR-29).
- Item history / audit trail recording who performed each important lifecycle action and when, with full substitute-receiver fields at Returned (FR-31).
- Audit trail visible to administrators only; retained for the lifetime of the report; no separate deletion mechanism (FR-32).
- Administrator dashboard with pending counts and queues (FR-33, FR-34, FR-35).
- Pending registrations queue with approve and reject-with-reason (FR-3).
- Account deactivation (FR-5).

### 6.2 Out of Scope for MVP

See §5 for full non-goals. Items deferred to v2/v3 explicitly:

- **Auto-matching between Lost and Found reports.** Deferred to v2.
- **Identity verification of claimants and substitute receivers.** Deferred.
- **In-platform photo proof of ownership (receipts, serial numbers).** Deferred.
- **Native mobile applications.** Deferred.
- **Internationalization beyond English.** Deferred.
- **External SSO/LDAP.** Deferred.
- **Multi-tenant administration console.** Deferred.
- **Real-time chat features (typing indicators, read receipts, attachments, presence).** Deferred.

## 7. Success Metrics

Each SM cross-references the FR(s) it validates. Counter-metrics balance primary metrics so the architect does not optimize the wrong thing.

**Primary**

- **SM-1: Account activation rate.** ≥ 90% of registered users are approved within 7 days of registration. Validates FR-3.
- **SM-2: Claim turnaround time.** Median time from claim submission to claim decision ≤ 48 hours. Validates FR-16, FR-17, FR-18.
- **SM-3: Item return rate.** ≥ 60% of items with an approved claim reach **Returned** status within 7 days of approval. Validates FR-23, FR-24.
- **SM-4: Listing-to-detail conversion.** ≥ 30% of authenticated sessions that view a summary listing proceed to a detail view within the same session. Validates FR-12, FR-13.
- **SM-5: Email delivery.** ≥ 95% of triggered notification emails delivered within 5 minutes. Validates FR-27, FR-28, FR-29.

**Secondary**

- **SM-6: Audit completeness.** 100% of items returned have a complete audit trail (no missing actor or timestamp). Validates FR-31.
- **SM-7: Edit safety.** 0% of edits to **Returned** reports succeed. Validates FR-9.
- **SM-8: Substitute-receiver completeness.** 100% of **Returned** confirmations with a non-claimant receiver include name, authorization, and relationship. Validates FR-24.
- **SM-9: Auto-rejection coverage.** When a claim is approved on an item with multiple pending claims, 100% of other pending claims on that item transition to **Rejected** with reason recorded. Validates FR-17.

**Counter-metrics (do not optimize)**

- **SM-C1: Report volume per active member.** Target ≤ 2 reports per active member per semester. Counterbalances SM-1 and SM-2: optimizing for approval speed should not produce a flood of low-quality registrations.
- **SM-C2: Claim approval rate.** Target 40%–70%. Counterbalances SM-2: optimizing for fast turnaround should not produce blanket approvals of claims that should be rejected.
- **SM-C3: Time-to-Close for unclaimed items.** No automatic target; reports remain Open indefinitely. Counterbalances SM-3: optimizing for return rate should not pressure administrators to close reports prematurely.

## 8. Open Questions

These are open at PRD finalization. Each has an owner and a revisit condition. None are blockers for downstream story creation.

- **OQ-1: Campus area enum per deployment.** The fixed list of campus areas in FR-8 is set per deployment. How is it configured at deployment time? **Owner:** Architecture. **Revisit:** When the deployment configuration story is written.
- **OQ-2: Image storage budget.** What is the storage budget per item image, and what is the cleanup policy if a report is hard-deleted under FR-10? **Owner:** Architecture. **Revisit:** When storage story is written.
- **OQ-3: Date lost beyond 365 days.** A member may report a wallet they lost more than a year ago. Is the 365-day bound in FR-15 a hard rule or relaxable? **Owner:** PM. **Revisit:** After first semester of operation, if data shows frequent rejections on date grounds.
- **OQ-4: Per-claim thread read-only point.** The thread closes when the claim is Approved, Rejected, or the item is Closed (FR-26). Should the thread close when the item reaches **Returned** as well, or remain readable in perpetuity? **Owner:** PM. **Revisit:** After UX design pass.
- **OQ-5: Auto-rejection message wording.** The auto-rejection reason "another claim was approved for this item" is in FR-17. Does this wording need to be softer or more informative in the email body? **Owner:** UX. **Revisit:** During UX writing pass.

## 9. Assumptions Index

PRD-author decisions recorded explicitly and inherited from the brief's "deferred to PRD" list:

- **D1 (PRD-author decision, contact/facilitation):** Per-claim message thread. Documented in FR-26.
- **D2 (PRD-author decision, sensitive info and anonymous summary fields):** Sensitive field set in FR-37; public summary field set in FR-38; member-facing visibility in FR-39.
- **D3 (PRD-author decision, competing claims UX):** Approve-one-auto-reject-others with audit retention. Documented in FR-17.
- **D4 (PRD-author decision, administrator registration-review process):** Pending queue with Approve / Reject-with-reason; rejection reason recorded in audit trail but not exposed to the rejected user. Documented in FR-3.

PRD-author assumptions (inferred without brief input):

- **A1:** The MVP web application supports modern evergreen browsers (Chrome, Edge, Firefox, Safari latest two major versions). No IE support. *Reasoning:* web-based MVP with no legacy constraint stated.
- **A2:** Sessions are cookie-based with server-side session storage. No JWT-only auth. *Reasoning:* simpler to revoke and aligns with internal-tool posture.
- **A3:** Image moderation is the administrator's manual review (FR-36) only; no automated image scanning. *Reasoning:* brief locks no automated matching or moderation tooling; adding it would be scope expansion.
- **A4:** The "campus area" enum is editable by an administrator without code change. *Reasoning:* the brief implies deployment-time configuration; this assumption operationalizes it.
- **A5:** Audit trail storage is append-only and uses the same database as the rest of the application. No external audit log service in MVP. *Reasoning:* scope discipline; integration density is non-goal.
- **A6:** Email delivery uses a third-party transactional email provider. Provider choice is an architecture decision. *Reasoning:* email is the only out-of-platform channel; reliability is captured in SM-5.

Each of A1–A6 is a candidate for explicit confirmation before downstream story creation begins.

## 10. Cross-Cutting NFRs

These apply across features unless a feature-specific NFR overrides.

- **Performance.**
  - Page render (initial HTML): ≤ 2 seconds at p95 on a 4G connection.
  - API response for read endpoints: ≤ 500 ms at p95.
  - API response for write endpoints: ≤ 1 second at p95.
  - Search: ≤ 500 ms at p95 against 10,000 active reports.
  - Image upload: ≤ 3 seconds at p95 for a 5 MB JPEG.
  - Audit trail queries: ≤ 1 second at p95 against 10,000 reports × 50 events.

- **Security.**
  - Passwords are stored using a modern adaptive hashing function (Argon2id or bcrypt) with appropriate work factors.
  - Sessions are HTTP-only, Secure, SameSite=Lax cookies.
  - CSRF protection on all state-changing endpoints.
  - Rate limiting on registration, login, claim submission, and message posting.
  - Sensitive fields are not returned in API responses to unauthorized viewers (enforced at the API layer, not just the UI).
  - Images are served with appropriate Content-Security-Policy and cache headers; image URLs are not predictable.
  - All administrator actions are recorded in the audit trail; audit trail is append-only at the database level.

- **Reliability.**
  - The MVP targets 99% uptime during business hours of the host organization. No formal SLA in MVP.
  - Email send failures are logged; the triggering action is not blocked.

- **Accessibility.**
  - WCAG 2.1 AA compliance is the design target for the MVP. This is a UX-implementation concern; the PRD carries it as an NFR so architecture and QA can plan for it.

- **Observability.**
  - Application logs include request ID, actor ID, action, and target ID where applicable.
  - Audit-trail reads are themselves logged (administrator ID, query, timestamp) — separate from the audit trail itself, so the access pattern is reviewable.

- **Data Retention.**
  - Reports, claims, and audit trail: retained for the lifetime of the report (FR-31).
  - Accounts: retained indefinitely while Active, indefinitely after Deactivation or Rejection.
  - Hard-deletion only happens when an Open claim-free report is deleted (FR-10).

## 11. Product Principles (Locked)

These are the Product Principles from the locked Product Brief, restated here as the alignment check for downstream work:

- **Simple.** Members should report and search without a learning curve; administrators should run the system without training.
- **Trustworthy.** Members should feel their information and claims are handled responsibly; administrators should have the visibility they need to decide and act.
- **Clear.** Item status, claim status, and account status should be obvious at a glance.

UX design and story creation must serve these principles. Where a story trade-off emerges (e.g., adding a UI affordance that improves "simple" at the cost of "trustworthy"), the principles are the tiebreaker.

---

## Consistency and Scope Check Against the Locked Product Brief

This PRD was checked against the brief for: contradictions, accidental scope expansion, missing locked requirements, and unresolved decisions.

| Locked brief item | Present in PRD | Section / FR |
|---|---|---|
| Single-tenant, one org per deployment | Yes | §1, §2.2, §5 |
| Pending → Active account approval by administrators | Yes | FR-1, FR-2, FR-3 |
| Lost and Found reporting | Yes | FR-6, FR-7 |
| User-driven search/filtering; no automatic matching | Yes | FR-14, §5 |
| Anonymous summary listings; authenticated details | Yes | FR-12, FR-13, FR-37, FR-38, FR-39 |
| Claims with reason, identifying details, date lost | Yes | FR-15 |
| Multiple claims permitted | Yes | FR-15, FR-17 |
| Administrator claim approval/rejection | Yes | FR-16, FR-17, FR-18 |
| Open → Claim Requested → Claim Approved → Returned / Closed | Yes | FR-22 |
| Returned requires administrator confirmation | Yes | FR-23, FR-24 |
| Receiver tracking, including substitute authorization + relationship | Yes | FR-23, FR-24, FR-31 |
| Admin-only audit trail with required who/when records | Yes | FR-31, FR-32 |
| Report edit/delete/withdraw rules | Yes | FR-9, FR-10, FR-11 |
| Exactly three email notification events | Yes | FR-27, FR-28, FR-29 |
| No in-app notifications or messaging (except per-claim thread) | Yes | §5, FR-26, FR-30 |

**Deferred decisions resolved:**
- D1 (contact/facilitation) — Per-claim message thread. FR-26.
- D2 (sensitive info and public summary fields) — FR-37, FR-38, FR-39.
- D3 (competing claims UX) — Approve-one-auto-reject-others. FR-17.
- D4 (admin registration-review process) — Queue with Approve / Reject-with-reason. FR-3.

**Out-of-scope items preserved unchanged:** See §5.

**Contradictions with the brief:** None detected.

**Missing locked requirements:** None detected.

**Unresolved deferred decisions:** None. All four deferred items are resolved in this PRD.

**Accidental scope expansion:** None. The per-claim message thread (D1) is the only feature addition; it implements the brief's "contact/facilitation process" deferred decision and does not introduce any out-of-scope capability.