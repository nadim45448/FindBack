---
title: "PRD: FindBack"
status: final
created: 2026-08-28
updated: 2026-09-17
revision_note: "Production-readiness cleanup (2026-09-17): restored the locked Brief's Member Profile requirement as FR-52; resolved the locked Brief's deferred Administrator report-edit capability as FR-53; aligned FR-2 / FR-4 login-state wording; removed product-release framing (v1/v2/v3/MVP/Phase 1) from normative text; removed internal editing residue (correction markers and reconciliation commentary) from canonical requirements; removed implementation decisions from A1–A6 and from the cross-cutting Security NFR block (session-storage mechanism, audit-storage topology, email provider, password-hash algorithm, image-CSP header detail); clarified OQ-3 to state unambiguously that 365 days is the current requirement. Identifiers preserved: FR-1..FR-53 (new FRs appended), UJ-1..UJ-5, D1..D8, A1..A6 (wording cleaned; A2/A4/A5/A6 reframed as product assumptions), OQ-1..OQ-5, audit events 1–30."
---

# PRD: FindBack

## 0. Document Purpose

This PRD is the authoritative specification for the FindBack product. It is for the product team, UX designer, architect, and downstream story authoring. It builds on the locked Product Brief at `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/brief.md`, which is the source of truth for product direction. The PRD does not contradict the brief; where the brief deferred a decision to the PRD, this PRD resolves it. Where the brief was silent on a product detail, this PRD adds the minimum needed for downstream work without expanding scope.

Glossary terms appear in §3 and are used verbatim throughout. Features are in §4 and functional requirements are numbered globally (FR-1 through FR-N) so stories and acceptance criteria can cross-reference them stably. User journeys in §2.3 are the named-persona narratives the product enables. Out-of-scope items are explicit in §5 and §6.2.

### Document Revision History

The PRD document itself has been revised since first authoring. Document revisions describe revisions of this PRD document and are not product releases of FindBack. The current document revision is **2026-09-17** (production-readiness cleanup). Earlier document revisions of this PRD:

- **2026-09-15** — integrated the locked Brief's Lost-side Recovery Response capability and the Browse / My Reports partition, added the canonical eight-status Recovery Response model with `Completed — Report Returned` as the successful terminal status, owner-determines / administrator-records verification responsibility, per-Recovery-Response threads, the Items-in-Verification queue, and the eight business/workflow notification email events. Renumbered decisions (D1–D8) and added new audit events.
- **2026-09-16** — added Forgot Password / Password Recovery (FR-51) and minor wording alignment on FR-30, §4.8, and §6.1 summary bullets.
- **2026-09-17** (this revision) — restored the locked Brief's Member Profile requirement as FR-52; resolved the locked Brief's deferred Administrator report-edit capability as FR-53; aligned FR-2 / FR-4 login-state wording; removed product-release framing (v1/v2/v3/MVP/Phase 1) from normative text; removed internal editing-residue markers from canonical requirements; removed implementation-decision language from assumptions A1–A6 and from the cross-cutting Security NFR block; clarified OQ-3 to state unambiguously that 365 days is the current requirement.

## 1. Vision

FindBack is the place each organization uses to return things to its members. One organization runs it at a time — a school, an office, a public venue — and members of that organization use it to report lost and found items, search what others have reported, claim Found items they recognize as theirs, and submit Recovery Responses to Lost reports they believe they may have found. Administrators of the host organization act as the human authority at the center: they approve accounts, review Claims, manage Lost-side physical verification (with the Lost-report owner determining match), confirm Returned on both sides, and close reports that never resolve.

Recovery works in both directions and runs through two separate, deliberately non-merged mechanisms:

- **Found-side:** A member sees a Found item, submits a Claim; administrators review, approve or reject, confirm physical return.
- **Lost-side:** A member sees another member's Lost report in Browse, submits a Recovery Response; the Lost-report owner selects one candidate for verification, determines whether the item is theirs; an administrator manages handoff and confirms Returned.

A Claim and a Recovery Response are not the same thing. Each has its own form fields, lifecycle states, selection rules, and audit trail. FindBack keeps them separate throughout.

FindBack replaces the lost-and-found box and the chat thread with a single, durable, searchable record. It does not try to be clever. There is no automatic matching, no in-app notification stream, and no cross-organization sprawl. The product earns its place by being simple to use, trustworthy to depend on, and clear about what has happened to every item.

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

### 2.2 Non-Users

- **Other organizations.** FindBack runs one deployment per organization. There is no federation, no shared pool, no marketplace.
- **Anonymous actors.** Anonymous users can browse summary listings only. They cannot report, claim, or message.
- **Identity providers.** External SSO/LDAP integration is out of scope.
- **Mobile-only users.** FindBack is a web application. There is no native mobile app.

### 2.3 Key User Journeys

**UJ-1. Maya reports a lost wallet and is reunited with it (Lost-and-Found recovery on someone else's Found report).**

- *Persona + context:* Maya, a graduate student, has lost her wallet somewhere on campus. She is a registered, approved member.
- *Entry state:* authenticated via the web application; landing on the dashboard after seeing an "account approved" email the previous day.
- *Path:*
  1. Maya clicks **Report Lost Item**, fills in name (Wallet), category (Wallets & purses), description ("Brown leather, zip closure, contains student ID and a photo card"), date lost (today), location (campus — she selects "Main Library" from the campus area list), and an optional image.
  2. She submits. The system creates the Lost report in `Open` status. The audit trail records Maya as the reporter with a timestamp.
  3. Two days later, she logs in, opens **Browse**, and filters Found items by category and location.
  4. She finds a wallet report that looks like hers, opens the detail page (logged in), and clicks **Submit Claim**. The wallet report appears in Browse because it was authored by another member (Sam); Maya's own Lost report — and any reports she authored — does not appear in her Browse (FR-49).
  5. She enters reason ("This is my wallet — brown leather, with a photo of my dog inside"), identifying details ("There is a small scratch on the back, and a folded metro card in the inner pocket"), and date lost.
  6. The system creates a Claim in `Pending` status and sends the "new claim submitted on your Found report" email to the finder (Sam, FR-28). Maya's Claim now appears in her **My Claims** view (FR-49, D8).
  7. An administrator reviews the claim and approves it. The Claim status transitions to `Approved`; the Found report status transitions to `Claim Approved`. **Maya receives the "claim approved" email (FR-29).** **No Claim-decision email is sent to the finder**. Other Pending Claims on the same Found report are auto-rejected with reason "another claim was approved for this item" (FR-17).
  8. Maya visits the desk. The administrator hands the wallet to her and records **Returned**: receiver is Maya (default claimant), confirming administrator and timestamp recorded (FR-23, FR-31 event 6).
  9. The Found report status transitions to `Returned` (terminal). The audit trail now contains the complete journey.
  10. **Maya's Lost-report cleanup:** Maya's original Lost report has remained in `Open` status throughout UJ-1 (no Recovery Responses were submitted against it in this journey). Maya performs an explicit final manual reporter action: she visits **My Reports**, opens her Lost report, and clicks **Withdraw** (FR-11 Lost-side withdrawal — permitted on `Open` and on `Verification Pending` before Match Confirmed). Her Lost report transitions `Open → Closed`; history is preserved. The Withdraw is a reporter action — **not** an automatic cross-report effect, and **not** a system-mediated cross-link between the Found report and the Lost report. UJ-1 is independent of the Lost-side Recovery Response flow demonstrated in UJ-5.
- *Climax:* Maya walks away with her wallet and a clear email notification. The audit trail proves who returned it and when.
- *Resolution:* The Found report is `Returned`. Maya's **My Claims** shows her Claim as `Approved` (the wallet report is **not** in My Reports — it is someone else's report). Maya's original Lost report has been manually retired to `Closed` via her explicit Withdraw in step 10. **No automatic Lost↔Found linkage** occurs — Maya's Found-side Claim success did **not** transition her Lost report automatically.
- *Edge case — Claim rejection:* If the administrator rejects Maya's Claim, Maya receives the "claim rejected" email (FR-29); the Found report returns to `Open` if no other Pending Claims remain (FR-22). Maya could submit a new Claim per FR-15 (one Pending Claim at a time per item).
- *Edge case — Claim on her own Found-style report:* Maya cannot submit a Claim on a report she authored; the action returns HTTP 403 (FR-49).

**UJ-2. Sam finds a phone and wants to do the right thing.**

- *Persona + context:* Sam, an employee of the same organization, found a phone at the cafeteria. He is an approved member.
- *Entry state:* authenticated, landing on the dashboard.
- *Path:*
  1. Sam clicks **Report Found Item**, fills in the item fields including location (Cafeteria) and description, and submits.
  2. The report is created in `Open` status. Audit trail records Sam as the reporter and timestamp.
  3. Three days later, Sam receives an email: a new claim has been submitted on his found item (FR-28). He opens the item and sees that a Claim exists. **He does NOT see the claimant's reason or identifying details** (FR-37, FR-39); those are visible only to the claimant and administrators. Sam can see the Found-report status and post in the per-Claim thread, but he does not evaluate the claimant's private ownership evidence — the administrator evaluates it.
  4. Sam does not respond directly. He trusts the administrator's review.
  5. The administrator approves Maya's claim. **Sam does NOT receive a Claim-decision email**; only the claimant receives FR-29. He sees the item status change to `Claim Approved` the next time he visits his My Reports.
  6. Sam brings the phone to the administrator. The administrator records Returned with Maya as the receiver.
- *Climax:* Sam sees the item status move to `Returned` with the audit trail intact. The system has done the right thing without Sam having to chase anyone or receive claim-decision emails.
- *Resolution:* Sam's report is `Returned` (terminal). Sam does not see "Approved"-related email; he observes the state change through My Reports.
- *Edge case:* if Sam edits his Found report before any Claim exists, the edit is recorded with a timestamp in the audit trail (FR-19). If Sam tries to edit it after it reaches `Returned` or `Closed`, the edit is blocked with a clear message (FR-9).

**UJ-3. Alex, a new intern, registers and is approved.**

- *Persona + context:* Alex has joined the organization. He has been told about FindBack by a colleague.
- *Entry state:* unauthenticated, on the public landing page.
- *Path:*
  1. Alex clicks **Register**, fills in name, email, and self-declared role (Employee), and submits.
  2. The account is created in `Pending` status. Alex sees a confirmation screen that says an administrator will review the request. **No email is sent** (FR-1).
  3. The registration appears in the **Pending Registrations** queue (FR-3). **No separate in-app notification event fires for administrators**; administrators learn of new registrations by visiting the queue, not via an in-app notification banner.
  4. An administrator opens **Pending Registrations**, sees Alex's request, and clicks **Approve**.
  5. The system sends Alex an "account approved" email (FR-27) and changes Alex's status to `Active`.
  6. Alex logs in and sees the dashboard with **Report Lost Item** and **Report Found Item** actions enabled.
- *Climax:* Alex receives the approval email within minutes and can use the system.
- *Resolution:* Alex is now an active member.
- *Edge case — Rejection:* If Alex's account is rejected, no rejection email is sent. The account is set to `Rejected`. Alex's record is preserved for audit but he cannot log in. The rejection reason is visible only to administrators in the audit trail. Alex is informed of his rejection status only if he attempts to log in (FR-4 generic "your account is not active" message).

**UJ-4. Riley, an administrator, handles a busy morning.**

- *Persona + context:* Riley works at the organization's security desk and is the only administrator scheduled today. There are 6 pending Claims, 2 pending registrations, 1 approved Found report awaiting physical return, and 1 Lost report in `Verification Pending` (UJ-5).
- *Entry state:* authenticated as administrator, on the administrator dashboard.
- *Path:*
  1. Riley opens **Pending Claims** (FR-34) and sees the queue ordered by submission time. The dashboard also shows separate counters for Pending Registrations, Items Awaiting Return (Found-side), and **Items in Verification** (FR-33, FR-50).
  2. For the first Claim, Riley opens the review screen, sees the claimant's reason, identifying details, date lost, and the item details side by side. Riley reads both. The status of every other Pending Claim on the same item is shown.
  3. Riley clicks **Approve**. The system updates this Claim to `Approved`, auto-rejects any other Pending Claims on the same item with reason "another claim was approved for this item" (FR-17), and the item status moves to `Claim Approved`. **Email notifications sent:** the claimant receives the "claim approved" email (FR-29); the finder (Sam) does **not** receive a Claim-decision email.
  4. Riley moves to the second Pending Claim on a different item. There are two competing Claims on that item. Riley opens the Pending Claim review screen (FR-16). The screen shows the current Claim and item details side by side, and indicates that another Pending Claim exists on the same Found report (count + reference). Riley can navigate to and review the competing Claim through the Claim review workflow before making a decision. Riley approves one Claim; the other is auto-rejected with reason "another claim was approved for this item" (FR-17).
  5. Riley works through the queue. Each decision records Riley and timestamp in the audit trail.
  6. The owner of the approved item arrives to collect it. Riley opens **Items Awaiting Return** (FR-35), clicks **Confirm Returned** (FR-23), and records the handoff with Maya as the default receiver. The Found report status moves to `Returned` (terminal).
  7. Riley reviews the two pending registrations, approves one (sends the approval email FR-27 and activates the account), and rejects the other with a recorded reason (no rejection email).
  8. Riley switches to the **Items in Verification** queue (FR-50), opens the UJ-5 Lost report in `Verification Pending`, sees every Recovery Response (selected and the standby pool), opens the verification screen (FR-45), and arranges the physical verification at the desk. The acting administrator on each verification action is Riley. **At the desk, the Lost-report owner (Maya) physically inspects the candidate item and determines whether it is hers; Riley records Maya's determination in FindBack on her behalf** (FR-43 owner-determines / FR-45 admin-records). The audit entry records `determined_by = Maya` and `recorded_by = Riley`, with the determination itself and the verification timestamp.
- *Climax:* Riley processes 6 Claims, 2 registrations, 1 Found-side Returned, and 1 Lost-side Verification Pending across four queues — Pending Claims, Pending Registrations, Items Awaiting Return, and Items in Verification — without confusion. Every action is captured; emails are sent only to the parties entitled to them.
- *Resolution:* the Pending Claims queue is empty; the Pending Registrations queue is empty (both registrations decided — one approved, one rejected); one Found report is `Returned`; the Lost report remains in `Verification Pending` until verification concludes.
- *Edge case:* if Riley tries to edit a report that is already `Returned` or `Closed`, the edit is blocked with a clear message (FR-53; terminal edit prohibition is consistent with FR-9).

**UJ-5. Maya recovers her lost wallet after Sam submits a Recovery Response (Lost-side flow).**

- *Persona + context:* Maya (UJ-1) lost her wallet and posted a Lost report two days ago. She is an approved member. Sam (UJ-2) found a wallet that looks like it could be hers. Riley is the administrator on shift. There is also a second responder, Pat, who submitted a Recovery Response on the same Lost report.
- *Entry state:* Maya is authenticated and on her dashboard. Sam is authenticated and has just opened Maya's Lost report from **Browse**. Pat is authenticated and saw the Lost report on Browse. Riley is authenticated on the administrator dashboard.
- *Path:*
  1. From her dashboard, Maya clicks **Report Lost Item** (UJ-1, step 1–2) and posts the wallet Lost report in `Open` status.
  2. Two days later, Sam opens **Browse**, filters by category (Wallets & purses) and location (Main Library), and sees Maya's Lost report at the top of his results. His own reports do not appear in his Browse (FR-49). Pat, also browsing, sees the same Lost report.
  3. Sam opens the Lost report detail page (the report is not his own), reads the **authenticated-visible** description (FR-39; Sam does **not** see Maya's private identifying-details text), and clicks **Submit Recovery Response**.
  4. Sam enters: where he found the item ("On a bench outside the Main Library east entrance, ~3pm"), observed identifying details he noted from outside the wallet ("brown leather, zip closure, scuffed on the back corner"), and the date he found it. He submits. The system creates a Recovery Response in `Submitted` status and records the audit event "Recovery Response submitted" (FR-48 event 15). Separately, Pat also submits a Recovery Response, creating a second `Submitted` record.
  5. Maya receives the "new Recovery Response on your Lost report" email (FR-46 event 4) — once per response. She logs in, opens **My Reports**, opens her Lost report, and clicks **Review Responses**. She sees Sam's and Pat's responses (FR-39: Lost-report owner can see every response on their own Lost report). Each response has its own per-Recovery-Response thread (FR-47). Sam's thread shows the Lost-report owner (Maya), Sam, and administrators only — Pat is not in Sam's thread. Pat's thread shows Maya, Pat, and administrators only — Sam is not in Pat's thread.
  6. Maya reviews each response in submission order. The Lost report remains in `Open` while Maya deliberates. Maya and Sam exchange a few messages in Sam's per-Recovery-Response thread (writable while Sam's response is `Submitted`). Pat's thread is independent.
  7. Maya selects Sam's response by clicking **Select for Verification**. The system records the selection event (FR-48 event 17); Sam's response moves to `Selected for Verification`. The Lost report transitions from `Open` to `Verification Pending` (FR-42, FR-43). **Pat's response stays in `Submitted`** but the UI renders it as `Submitted — Standby` while Sam's response is selected — `Standby` is a **display-only condition**; Pat's canonical persisted status remains `Submitted`. Pat's per-Recovery-Response thread remains writable because Pat's response is still `Submitted`.
  8. Riley, on the administrator dashboard, sees the **Items in Verification** count increment to 1 (FR-50). Riley opens the Lost report, sees every Recovery Response (Sam selected, Pat in `Submitted — Standby`), opens the verification screen (FR-45), and arranges physical verification at the desk. The acting administrator on Riley's actions is Riley (any administrator may manage verification; each verification action records the acting administrator who performed it; there is no pre-assignment gate and no separate verifier assignment lifecycle).
  9. Maya physically inspects the candidate item and determines it is her wallet (owner-determines). **Riley records Maya's Match Confirmed determination in FindBack** on her behalf (admin-records) — the audit entry records `determined_by = Maya`, `recorded_by = Riley`, the determination `Match Confirmed`, and the verification timestamp (FR-48 event 18). Sam's response transitions to `Match Confirmed` (not terminal — physical return still pending). The Lost report **remains in `Verification Pending`**. **Reporter withdrawal is now blocked**.
  10. Physical handoff occurs. Riley confirms physical return: receiver is Maya (Lost-report owner, default per FR-45 mirrors FR-24 with Lost-report owner as default receiver; substitute rules apply if the actual receiver differs and is authorized by the owner). Riley clicks **Confirm Returned**. The Lost report transitions from `Verification Pending` to `Returned`. In the same transaction:
     - Sam's response transitions to `Completed — Report Returned` (the new successful terminal status reached after Match Confirmed + physical handoff + administrator Confirm Returned).
     - Pat's response transitions to `Resolved — Report Returned`.
     - Sam's and Pat's per-Recovery-Response threads become read-only.
     - The successful-recovery email fires (FR-46 event 8 to Sam; FR-46 event 7 to Maya). Event 8 is gated on `Completed — Report Returned` + Lost report `Returned` — it does NOT fire at Match Confirmed.
  11. Maya's **My Reports** shows her Lost report as `Returned`. Sam observes his Recovery Response as `Completed — Report Returned` in **My Recovery Responses** (FR-49, D8). Pat observes his Recovery Response as `Resolved — Report Returned` in My Recovery Responses. None of Sam's / Pat's responses appear in their My Reports — those views are only for reports the member authored.
- *Edge case A — Not a Match on the first candidate:* Maya physically inspects the candidate item and determines it is not hers (owner-determines). **Riley records Maya's Not a Match determination** on her behalf (admin-records) — Sam's response transitions to `Not a Match` (terminal — Sam is notified via FR-46 event 6). The Lost report returns from `Verification Pending` to `Open` (FR-42, FR-43). Maya may select Pat's response (or any other `Submitted` one). The previously selected response remains `Not a Match`; it never returns to `Submitted`.
- *Edge case B — New response during Verification Pending, before Match Confirmed:* If during the verification a third member (Quinn) finds and submits a Recovery Response, the Lost report is `Verification Pending` and the currently selected response has not yet reached `Match Confirmed`. Per FR-40, the system accepts Quinn's submission: Quinn's response is created with canonical status `Submitted` (UI rendered as `Submitted — Standby`). It does not replace Sam's selection. **Quinn can be selected only if Sam's verification results in `Not a Match` and the Lost report returns to `Open`**. If Sam's response reaches `Match Confirmed` instead, no further response can be selected, no further new Recovery Response is accepted, and the workflow proceeds to physical handoff / `Returned` or exceptional administrator cancellation.
- *Edge case C — Lost report Closed during verification, before Match Confirmed:* Maya or Riley closes the Lost report before Match Confirmed (Maya via permitted Withdraw; Riley via administrator moderation). The Lost report transitions to `Closed`. In the same transaction: Sam's currently `Selected for Verification` response transitions to `Resolved — Report Closed`, Pat's `Submitted` response transitions to `Resolved — Report Closed`, and any other non-terminal Recovery Responses — such as Quinn's if one was submitted during Edge Case B — also transition to `Resolved — Report Closed`. Threads become read-only. **No closure email is sent to any responder** (FR-30).
- *Edge case D — Exceptional administrator cancellation after Match Confirmed, before Returned:* Riley cancels the workflow for a documented exceptional reason. The Lost report transitions to `Closed`. In the same transaction: Sam's currently `Match Confirmed` response transitions to `Resolved — Report Closed` (Match Confirmed is not terminal and may transition to `Resolved — Report Closed` only under exceptional cancellation with reason recorded), as do every other non-terminal response. Threads become read-only. The audit trail records the cancellation reason and the acting administrator (FR-48 event 25).
- *Edge case E — Responder withdrawal:* Sam may withdraw his own Recovery Response only while it is `Submitted` and not currently `Selected for Verification`. Once Sam's response reaches `Selected for Verification` or any terminal status, the Withdraw action is unavailable.
- *Edge case F — Responder Deactivation:* Sam's account is deactivated during the verification (penalty scenario). His existing responses remain in their canonical status (FR-5); the Lost report workflow continues; Sam simply can no longer post on the thread or take further actions. Riley (acting administrator) continues to manage verification.
- *Climax:* Maya walks away with her wallet and a clear terminal status. The audit trail (FR-48 events 15, 17, 18, 21, 26, and 30) proves which response was submitted, which was selected, what Maya determined, who recorded the determination, who administered the handoff, that the parent Lost report reached `Returned`, and that the matched selected Recovery Response reached `Completed — Report Returned`. Thread privacy is preserved throughout.
- *Resolution:* Maya's Lost report is `Returned`; Sam's response is `Completed — Report Returned` (successful terminal after Match Confirmed + Confirm Returned); Pat's response, and any other unresolved Recovery Responses such as Quinn's if one was submitted during the workflow (see Edge Case B), transition to `Resolved — Report Returned`; history is preserved for everyone; no closure or stale-report emails were generated.

## 3. Glossary

- **Organization** — The single host (school, office, venue, etc.) that operates one FindBack deployment. Every account, report, claim, and Recovery Response belongs to exactly one organization.
- **Member** — A user who has completed registration and is **Active**. Members can create Lost and Found reports, browse and search listings (My Reports, Browse), submit Claims on Found reports, submit Recovery Responses on Lost reports, select Recovery Responses on their own Lost reports, and post messages on the per-Claim and per-Recovery-Response threads they participate in.
- **Anonymous User** — A visitor who is not authenticated. Can see public summary fields only (FR-38).
- **Pending User** — A registered user whose account has not yet been approved. Cannot use lost-and-found features (FR-2). Receives a confirmation page after registration; **no email is sent** at registration, on rejection, or until approval — only the account-approved email is sent on approval (FR-1, FR-3).
- **Rejected User** — A registered user whose registration was declined. Cannot log in. Record is preserved for audit; rejection reason is preserved in the audit trail but **not exposed** to the rejected user and is not communicated by email.
- **Active User** — A registered user whose account has been approved by an administrator. Full member capabilities, including Lost-side recovery actions.
- **Deactivated User** — A previously Active user whose account has been turned off by an administrator. Record preserved; cannot log in. The deactivated user's reports, Claims, Recovery Responses, messages, and audit history are preserved (FR-5).
- **Administrator** — Designated staff of the host organization. Administrators approve/reject registrations, deactivate accounts, review and decide Found-side Claims, manage Lost-side physical verification (any administrator may act; the acting administrator is recorded on each verification action), record the outcome the Lost-report owner determines, confirm Returned on both sides, close or moderate reports, and may remove inappropriate content. Administrators are not a separate role type; an Administrator is a Member with the `administrator` flag set.
- **Report** — A Lost item report or a Found item report. Each report has a status (see Lifecycle) and an audit trail.
- **Lost Item Report** — A report created by a member who has lost something.
- **Found Item Report** — A report created by a member who has found something and is willing to return it.
- **Listing** — A row in the combined pool of Lost and Found reports. Anonymous users see summary listings; members see partitioned listings (My Reports / Browse, FR-49) with the same summary fields plus additional authenticated-visible fields per FR-39.
- **Claim** — A submission by a member asserting that a specific Found item report is theirs. A Claim has its own status (`Pending` / `Approved` / `Rejected`) and its own audit-trail entries. **There is no `Closed` Claim status.**
- **Pending Claim** — A Claim awaiting administrator review.
- **Approved Claim** — A Claim an administrator has approved. At most one approved Claim exists per Found item at any time.
- **Rejected Claim** — A Claim that was rejected directly by an Administrator, or automatically rejected because:
  1. another Claim on the same Found report was approved,
  2. the Found report was withdrawn by its reporter, or
  3. the Found report was closed by an Administrator.

  The specific rejection reason/trigger is preserved in the audit trail (FR-31 event 5). The Claim status in all cases is `Rejected`; no new Claim status is introduced. The claimant receives the FR-29 "claim rejected" email in all rejection cases.
- **Lifecycle Status** — The status of a Report. Found reports use the Found lifecycle; Lost reports use the Lost lifecycle. Both share `Open`, `Returned`, and `Closed`. Found-only intermediates are `Claim Requested` and `Claim Approved`. Lost-only intermediate is `Verification Pending`.
- **Open** — A report is active. No candidate is being pursued.
- **Claim Requested** (Found report only) — At least one Claim is pending review on the report.
- **Claim Approved** (Found report only) — An administrator has approved a Claim. The item is awaiting physical return.
- **Verification Pending** (Lost report only) — Lost-report lifecycle status used after a Recovery Response has been selected and before the recovery workflow is fully resolved. It covers both: (1) physical verification of the selected candidate, and (2) the post-Match-Confirmed period while physical handoff / administrator Confirm Returned is still pending. The status ends when the Lost report transitions to `Open` after Not a Match, to `Returned` after successful physical handoff, or to `Closed` through an allowed closure path.
- **Returned** — An administrator has confirmed the item was physically returned. **Terminal**. Reachable only via administrator confirmation of physical return (FR-22, FR-23, FR-24, FR-45). On a Found report the receiver is the approved claimant (or substitute); on a Lost report the receiver is the Lost-report owner (or substitute).
- **Closed** — The report is no longer in active circulation. **Terminal**. Reachable via permitted reporter withdrawal, administrator moderation, or organization removal (FR-22). Once Closed, the report is not in active listings; the owner retains retrieval access.
- **Receiver** — The person recorded as having taken physical possession of the item. For a Found report the default receiver is the approved claimant. For a Lost report the default receiver is the Lost-report owner. A substitute receiver may be recorded with authorization and relationship.
- **Substitute Receiver** — A person other than the default receiver who collected the item with documented authorization from the default receiver. Recorded with the administrator-confirmed authorization and the relationship between default receiver and substitute. Applies to both Found-side and Lost-side Returned transitions.
- **Audit Trail** — The ordered, append-only record of who did what when on a Report, Claim, Recovery Response, User/Registration, per-Claim thread, per-Recovery-Response thread, or Lost-side verification action. Visible only to administrators (FR-32). Retention follows the parent entity's retention rule (see Data Retention section).
- **Audit Event** — One append-only record describing an auditable system or user action. It includes actor, action, target/context, timestamp, and any event-specific fields required by FR-31 or FR-48. The target/context may be a Report, Claim, Recovery Response, User/Registration, per-Claim thread message, per-Recovery-Response thread message, or Lost-side verification action.
- **Per-claim Message Thread** — The contact channel between the claimant, the finder of the Found item the claim targets, and all administrators. See PRD-author decision D1.
- **Per-Recovery-Response Message Thread** — The contact channel scoped to a single Recovery Response (D6).
- **Sensitive Field** — A field whose visibility is restricted according to FR-37 and the actor/relationship matrix in FR-39. Authorization differs by field and viewer relationship; not every Sensitive Field is limited exclusively to the report owner and administrators. FR-39 is the final authority for who can see each field. Examples include: exact location free text; report identifying details; reporter contact details; Claim reason; Claim identifying details; Recovery Response exact-place details; observed identifying details; candidate image; responder identity; workflow-thread content; substitute receiver information. See PRD-author decision D2.
- **Public Summary Field** — A field visible in the listing shown to anonymous users and to non-involved members. See PRD-author decision D2.
- **My Claims** — A member-facing participation view listing every Claim the authenticated member has submitted on other members' Found reports, with current Claim status, a link to the Found report, and access to the per-Claim thread.
- **My Recovery Responses** — A member-facing participation view listing every Recovery Response the authenticated member has submitted on other members' Lost reports, with current canonical status and access to the per-Recovery-Response thread (D8 — member participation views).

### 3.1 Lost-side Recovery Glossary

The following terms define the Lost-report recovery path that runs in parallel with — but separate from — the Found-item Claim path. A Recovery Response is **not** a Claim; the two concepts are deliberately not merged.

- **Recovery Response** — A submission by an active member asserting that they may have found the item described in a specific Lost item report. A Recovery Response has its own status and its own audit-trail entries. Multiple Recovery Responses on the same Lost report are permitted. Each Recovery Response is independent and independently reviewable.
- **Submitted** — Initial canonical status of a Recovery Response. The system has accepted the response; the Lost-report owner may review.
- **Standby (derived/display condition)** — A **display-only** condition for a `Submitted` Recovery Response when another response on the same Lost report is currently `Selected for Verification`. Standby is **never** a persisted lifecycle status; the canonical persisted status remains `Submitted`. The UI may render it as `Submitted — Standby` for clarity.
- **Selected for Verification** — Canonical status. The Lost-report owner has provisionally chosen this Recovery Response for physical verification. Selection is **provisional**: it means "verify this one first" and does not permanently close or reject the other Recovery Responses. Exactly one response per Lost report may hold this status at a time.
- **Not a Match** — Canonical terminal status recorded when the Lost-report owner determines the candidate item is not theirs during verification. **Terminal for that Recovery Response**; the response never returns to `Submitted`. The Lost report returns from `Verification Pending` to `Open`; the report owner may select a different `Submitted` response.
- **Match Confirmed** — Canonical status recorded when the **Lost-report owner** physically determines the candidate item is theirs during verification. **Not terminal.** Physical return is still pending. On the Lost-report Returned transition, the response transitions to `Completed — Report Returned` (see below), not to `Resolved — Report Returned`. On a documented exceptional administrator cancellation after Match Confirmed, the response transitions to `Resolved — Report Closed`.
- **Resolved — Report Returned** — Canonical terminal status recorded on a Recovery Response that was **not** the one selected for verification when the Lost report reaches `Returned`. Preserved in history; not actionable.
- **Completed — Report Returned** — Canonical terminal status recorded on the **selected** Recovery Response when (a) Match Confirmed was recorded on it, (b) physical handoff occurred, (c) the administrator confirmed Returned, and (d) the parent Lost report transitioned to `Returned`. This is the successful terminal status for the matched selected response.
- **Resolved — Report Closed** — Canonical terminal status recorded on any non-terminal Recovery Response (including a response currently `Selected for Verification`, `Match Confirmed`, or `Submitted`) when the Lost report transitions to `Closed`. Preserved in history; not actionable. `Match Confirmed → Resolved — Report Closed` is permitted only under documented exceptional administrator cancellation.
- **Withdrawn** — Canonical terminal status recorded when the responder withdraws their own Recovery Response while it is still `Submitted` and not currently `Selected for Verification`.
- **Verification Pending** — Lost-report lifecycle status used after a Recovery Response has been selected and before the recovery workflow is fully resolved. It covers both: (1) physical verification of the selected candidate, and (2) the post-Match-Confirmed period while physical handoff / administrator Confirm Returned is still pending. The status ends when the Lost report transitions to `Open` after Not a Match, to `Returned` after successful physical handoff (FR-45), or to `Closed` through an allowed closure path (FR-21, FR-42). A Match Confirmed determination does NOT end Verification Pending; the Lost report intentionally remains `Verification Pending` until Confirm Returned transitions it to `Returned` (or until documented exceptional cancellation transitions it to `Closed`).
- **Per-Recovery-Response Message Thread** — The contact channel scoped to a **single** Recovery Response. Participants are the Lost-report owner, the responder who submitted that Recovery Response, and all administrators. Competing responders do **not** see each other's threads. See PRD-author decision D6.
- **acting Administrator (Lost-side verification) —** The administrator who actually performed a given verification action on a Lost report. Any administrator may manage the verification workflow; there is no pre-assignment gate and no separate verifier assignment lifecycle. Every Lost-side verification action records the administrator who performed it as the acting administrator on that action (FR-45).
- **My Recovery Responses** — A member-facing participation view listing every Recovery Response the authenticated member has submitted on other members' Lost reports, with current canonical status and a link to the per-Recovery-Response thread. See PRD-author decision D8 (member participation views).
- **Lost-report owner deactivation** — A defined operational state that may occur while the Lost report is active or in verification. Three paths exist depending on current Lost-report status: (a) report `Open` → administrator closes with reason "report owner account deactivated"; (b) report `Verification Pending` before Match Confirmed → owner may physically determine outcome, administrator records, workflow continues or close; (c) post-Match Confirmed before Returned → administrator may complete handoff and Confirm Returned, otherwise documented exceptional cancellation. Defined in this PRD; see FR-5, FR-42, FR-45.

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
- **No email is sent on registration, on rejection, or on any other account transition except approval.** Email is sent only after approval via FR-27.

#### FR-2: Pending State and Restricted Access

A Pending user can authenticate but cannot create reports, search beyond the public summary listing, view item details, submit Claims, submit Recovery Responses, select Recovery Responses, post messages, or use any lost-and-found feature.

**Consequences (testable):**
- Authenticating as a Pending user shows a status banner reading "Your account is pending administrator approval."
- Every endpoint that creates a report, Claim, Recovery Response, message, or Lost-side recovery action returns HTTP 403 with a clear message when the actor is not Active.
- The audit trail records the registration event with the user's name, email, and self-declared role and timestamp.

#### FR-3: Administrator Review of Pending Registrations

Administrators see a queue of Pending registrations ordered by submission time. Each entry shows name, email, self-declared role, and registration timestamp.

**Consequences (testable):**
- The queue is accessible only to administrators.
- Each entry has **Approve** and **Reject** actions.
- Approve changes status to Active and sends the "account approved" email (FR-27).
- Reject requires a short reason (free text, minimum 5 characters). The reason is recorded in the audit trail but is **not exposed** to the rejected user. **No rejection email is sent**; the rejected user has no way to log in and therefore no way to receive in-platform messages; no out-of-platform email is sent.
- The Pending Registrations queue is the only mechanism by which administrators learn of a new registration. There is no separate in-app notification event for new registrations.

#### FR-4: Login and Logout

Users may attempt login with their registered email and password. The behavior on a successful authentication depends on the account's lifecycle status:

- **Active** — lands on the member dashboard with full member access.
- **Pending** — authentication succeeds but lands on a confirmation banner stating that the account is pending administrator approval. Pending users have no lost-and-found feature access (FR-2).
- **Rejected** — authentication attempt results in the generic "your account is not active" message; the user is not authenticated into a member session.
- **Deactivated** — authentication attempt results in the generic "your account is not active" message; the user is not authenticated into a member session.

The generic message used for Rejected and Deactivated must not disclose which non-Active state the account is in.

**Consequences (testable):**
- Sessions expire after 14 days of inactivity.
- Logout clears the session.

#### FR-5: Deactivation

An administrator can deactivate an Active account. Deactivated accounts cannot log in; their record is preserved.

**Consequences (testable):**
- The action records the administrator and timestamp in the user's audit trail.
- All reports, Claims, Recovery Responses, messages, and audit history owned by the deactivated user remain visible to administrators.
- Existing Recovery Responses submitted by the user remain in their current canonical status (e.g., `Submitted`, `Selected for Verification`). The user simply cannot post further messages or withdraw that response. Administrators retain operational control over the Lost report.
- A new Recovery Response cannot be submitted by the deactivated user (Pending or Deactivated users are blocked from member actions per FR-2).
- **Lost-report owner deactivation:** If a Lost report's owner is deactivated, the report and history remain preserved. The deactivated owner cannot log in, post on threads, select Recovery Responses, or perform member actions.
  - **Report `Open`:** Administrator closes with reason `report owner account deactivated` (FR-21, FR-48 event 24). Every non-terminal Recovery Response transitions to `Resolved — Report Closed` in the same transaction. Threads become read-only.
  - **Report `Verification Pending` before `Match Confirmed`:** Physical verification may still occur. The owner may physically inspect and verbally provide Match Confirmed / Not a Match. The acting administrator records the owner's determination on the owner's behalf (FR-43 owner-determines / FR-45 admin-records). If verification cannot continue, administrator closes with documented reason; every non-terminal response transitions to `Resolved — Report Closed`; threads become read-only.
  - **Report after `Match Confirmed`, before `Returned`:** The acting administrator may complete physical handoff and Confirm Returned. Otherwise, documented exceptional cancellation; the matched selected response transitions to `Resolved — Report Closed` along with every other non-terminal response; threads become read-only.
  - The deactivated owner cannot use threads, perform member actions, or directly record in the application; administrator-mediated workflow continues.
- Once an account is Deactivated, any existing authenticated session must no longer permit member actions.

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
- Same validation rules as FR-6, except the date field uses the Found-report rules: **date found must be within the last 30 days and must not be in the future, per FR-8.** For FindBack, the 30-day past bound is the authoritative requirement (FR-8 is the authoritative field definition; no further past-bound expansion or configurability is specified by the Product Brief or another authoritative requirement).
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

A member can edit their own report only while the report remains active and has not reached **Returned** or **Closed**. Both terminal statuses block edits.

**Consequences (testable):**
- Editing a report does not change its status.
- Attempting to edit a **Returned** report is blocked with the message "Returned reports cannot be edited."
- Attempting to edit a **Closed** report is blocked with the message "Closed reports cannot be edited."
- **Edit traceability:** Every edit is recorded in the audit trail with actor and timestamp and a snapshot of changed fields. Once any Claim exists on a Found report, or any Recovery Response exists on a Lost report, every subsequent edit is audit-logged with the changed fields and the previous values so administrators can see that the report changed after interactions began. Previous values are reconstructable from the audit/history. This rule does not restrict which fields may be edited, but it makes silent evidence mutation impossible.

#### FR-10: Delete Own Report (Interaction-Free Open Only)

A member can delete their own report only when:

- The report status is **Open**, AND
- For a **Found report**, no Claim exists on it.
- For a **Lost report**, no Recovery Response exists on it.

Hard deletion is preserved exclusively for interaction-free Open reports. Once any Claim (Found) or Recovery Response (Lost) exists on the report, hard deletion is unavailable; the owner must Withdraw instead (FR-11).

**Consequences (testable):**
- After hard deletion of an interaction-free Open report, the report and its audit entries are removed from the system.
- For a Found report with at least one Claim, hard deletion returns HTTP 409 with a message pointing to the Withdraw action (FR-11).
- For a Lost report with at least one Recovery Response, hard deletion returns HTTP 409 with a message pointing to the Withdraw action (FR-11).
- The `interaction-free Open` rule is symmetric across Found and Lost reports. There is no exception path through any other FR. The canonical rule lives in FR-10; FR-42 cross-references it.

#### FR-11: Withdraw Own Report

A member may withdraw their own report. Withdrawal transitions the report to **Closed** and removes it from active listings. The withdrawal rules differ by report type.

**Found report withdrawal:**

- **Allowed** while the Found report is `Open` or `Claim Requested`.
- **Blocked** once the Found report reaches `Claim Approved`, `Returned`, or `Closed`.
- When a Found report in `Claim Requested` is withdrawn, the Found report transitions to `Closed` and **every Pending Claim on it transitions to `Rejected` with audit reason "report withdrawn by reporter"**. Claim history is preserved. Per-Claim threads become read-only. The Claim rejection email (FR-29) is sent to each affected claimant. Withdrawal and automatic Claim-rejection events are recorded in the audit trail.
- Once a Claim is `Approved`, reporter withdrawal is blocked. The administrator must manage physical return or, exceptionally, documented administrative closure (FR-21).

**Lost report withdrawal:**

- **Allowed** while the Lost report is `Open` or `Verification Pending` **before Match Confirmed has been recorded**.
- **Blocked** once Match Confirmed has been recorded, once the report reaches `Returned`, or once the report reaches `Closed`.
- When a Lost report is withdrawn, the Lost report transitions to `Closed` and every non-terminal Recovery Response (including any currently `Selected for Verification` and all `Submitted`) transitions to `Resolved — Report Closed`. Threads become read-only. History remains preserved. No closure email is sent to responders (FR-30).

**General rules (both report types):**

- **Withdraw is unavailable after Returned.** The report has reached terminal state.
- **Closed is terminal.** Closed reports are not in active listings. The owner can still retrieve their own report from My Reports (per the My Reports visibility rule; FR-49).
- **History is preserved.** Withdrawn reports remain in history for administrators.
- Members browsing listings do not see withdrawn reports.
- The owner's My Reports retrieval rule is governed by FR-49, not by FR-28 (cross-reference).

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

#### FR-13: Authenticated Detail View (Member-Facing Visibility on a Report Detail)

Active members can view item details by clicking through from a listing. The detail page renders different field sets based on viewer role and relationship to the item per the unified visibility matrix in FR-39.

**Consequences (testable):**
- **Anonymous visibility** is governed by FR-38 (Public Summary Fields) — see that FR for the anonymous-only field set. FR-13 does NOT extend anonymous visibility.
- **The detail page is NOT uniform across authenticated viewers.** Different fields are exposed depending on whether the viewer is the report owner, a claimant, a recovery responder, an unrelated authenticated member, or an administrator. See FR-39 for the authoritative matrix.
- **Exact location free text is a Sensitive Field.** It is visible only to the report owner, to administrators, and (where applicable per the matrix) to parties with a role on the item. **It is NOT visible to an unrelated authenticated member**.
- Identifying details free text on the report is also a Sensitive Field with the same restricted visibility.

#### FR-14: Search and Filter

Anyone can search and filter the combined pool using keyword, category, location, date range, type (lost / found), and status.

**Consequences (testable):**
- Keyword matches against item name and description (case-insensitive, partial match).
- Category is single-select from the enum in FR-8.
- Location filter uses the campus area enum, not exact-place text.
- Date range filters the report's date field.
- Type filter restricts to Lost, Found, or both (default both).
- **Status filter enum:**
  - **Found reports:** `Open`, `Claim Requested`, `Claim Approved`, `Returned`, `Closed`.
  - **Lost reports:** `Open`, `Verification Pending`, `Returned`, `Closed`.
- **A Lost report in `Verification Pending` is discoverable.** Status filter includes `Verification Pending` for Lost reports and is visible to authenticated members through `Browse` (and to anonymous viewers through the public summary listing). Verification Pending is treated as an active Lost-side intermediate status, not as a terminal status.
- Default status view for non-administrators (members and anonymous) excludes `Returned` and `Closed`; the user can opt to include them. Administrators see all statuses by default.
- Type filter and status filter compose: a Found-type + `Claim Requested` filter, or a Lost-type + `Verification Pending` filter, is valid.

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
- **Auto-rejection of other Pending Claims on the same item — three workflow triggers:** A Pending Claim may be automatically rejected by any of the following workflow triggers. The audit trail records the specific trigger reason. The three triggers are not all caused by another Claim; the wording below reflects the actual triggers. Claim history is preserved in all cases; the rejected claimant receives the "claim rejected" email (FR-29) carrying the trigger reason.

  ### Trigger 1 — Another Claim approved (D3)

  When an administrator approves a Pending Claim on a Found item that has other Pending Claims, every other Pending Claim on the same item transitions to `Rejected` with the audit reason `"another claim was approved for this item"` (the FR-17 / D3 case). The claimant of each auto-rejected Claim is sent a "claim rejected" email (FR-29) carrying this reason.

  ### Trigger 2 — Reporter withdrawal (FR-11)

  When the Found report is withdrawn by the reporter while the report is in `Claim Requested`, every Pending Claim on the report transitions to `Rejected` with audit reason `"report withdrawn by reporter"`. Claim history is preserved.

  ### Trigger 3 — Administrator closure (FR-21 / FR-36)

  When an administrator closes the Found report while Pending Claims exist (e.g., `Open → Closed` or `Claim Requested → Closed` with Pending Claims present), every Pending Claim on the report transitions to `Rejected` with audit reason `"report closed by administrator"`. (Exceptional `Claim Approved → Closed` closure does not auto-reject Pending Claims because none are Pending by that point.)

- Each auto-rejection event is recorded in the audit trail as a separate event (FR-31 event 5) with the appropriate trigger reason.
- The Found item report's lifecycle status transitions to **Claim Approved** when this FR's approval action is recorded (Trigger 1 path).
- The audit trail records the approval with the approving administrator and timestamp, plus the auto-rejection events with their timestamps and trigger reasons.
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

An administrator may close a report when permitted by the report's current lifecycle status. Closing transitions the report to **Closed** and removes it from active listings.

**Lost report closure:**

- **`Open` → `Closed`:** Allowed (administrator moderation, organization removal, Lost-report owner deactivation, etc.).
- **`Verification Pending` before Match Confirmed → `Closed`:** Allowed with a documented reason. Every non-terminal Recovery Response transitions to `Resolved — Report Closed` in the same transaction (FR-41, FR-42). Threads become read-only.
- **`Verification Pending` with the currently selected Recovery Response in `Match Confirmed` → `Closed`:** Permitted **only** as a documented exceptional cancellation by an administrator. Note: `Match Confirmed` is a Recovery Response status, not a Lost-report lifecycle status — the Lost report itself remains `Verification Pending` until this exceptional cancellation. A reason is required and recorded in the audit trail (FR-48 event 25). The Lost report transitions to `Closed`; the matched selected response transitions to `Resolved — Report Closed`; every other non-terminal response also transitions to `Resolved — Report Closed`.
- **`Returned` → `Closed`:** **Unavailable** (Returned is terminal).
- **`Closed` → `Closed`:** **No-op** (idempotent only; no state change).

**Found report closure:**

- **`Open` → `Closed`:** Allowed (administrator moderation, organization removal, etc.).
- **`Claim Requested` → `Closed`:** Allowed (withdrawal by reporter reaches `Closed` per FR-11, or administrator moderation). Any Pending Claims transition to `Rejected` with audit reason "report withdrawn by reporter" or "report closed by administrator" depending on the trigger.
- **`Claim Approved` → `Closed`:** Permitted only as documented exceptional administrator closure. The Approved Claim remains `Approved` for historical accuracy; the audit trail records that physical return did not complete and why. Per-Claim threads remain read-only.
- **`Returned` → `Closed`:** **Unavailable** (Returned is terminal).
- **`Closed` → `Closed`:** **No-op**.

**Consequences (testable):**
- Close is used when an unclaimed item is removed from the lost-and-found, when inappropriate content is taken down, or when exceptional lifecycle-guard conditions (post-Match Confirmed; post-Claim Approved) require documented closure.
- **Audit cross-references (Found-side vs Lost-side):** The audit trail records the Close action with the administrator, the documented reason, the prior report lifecycle status, and a timestamp. The audit event used depends on the report type:
  - **Found-side Administrator Close** (covers `Open → Closed`, `Claim Requested → Closed`, exceptional `Claim Approved → Closed`) — recorded as **FR-31 event 10**. FR-31 event 10 records: administrator, report ID, previous lifecycle status (one of `Open`, `Claim Requested`, `Claim Approved` — Found lifecycle statuses only), closure reason, timestamp.
  - **Lost-side Administrator Close** — recorded using the Lost-side FR-48 events:
    - **FR-48 event 24** for normal Lost-side Administrator closure: `Open → Closed` (moderation, organization removal, owner deactivation), and `Verification Pending` (pre-Match Confirmed) → `Closed` (moderation, organization removal, owner deactivation, Administrator moderation while `Verification Pending` before Match Confirmed). FR-48 event 24 records: administrator, Lost report ID, reason, prior Lost-report lifecycle status, timestamp. **Reporter-triggered withdrawal is NOT recorded here** — that uses FR-48 event 23.
    - **FR-48 event 25** for **exceptional** Lost-side Administrator closure: `Verification Pending` (post-Match Confirmed) → `Closed`. FR-48 event 25 records: administrator, Lost report ID, exceptional reason, prior selected response ID (with the selected response's `Match Confirmed` status at close time), timestamp.
  - When a Lost report is closed after Match Confirmed, FR-31 event 10 does **NOT** apply (it is Found-side). The audit uses FR-48 event 25; the prior Lost-report lifecycle status recorded is `Verification Pending`, and the matched selected Recovery Response's `Match Confirmed` status is recorded through FR-48 event 25, not through FR-31.
- This FR does not silently bypass the detailed lifecycle rules defined in FR-22 (Found-side terminal-state responsibility) and FR-42 (Lost-side lifecycle).

#### FR-22: Auto-Status Transitions (Found-side; Lost-side governed by FR-42)

The system transitions Found report status automatically when Claims are submitted, decided, or auto-rejected. Lost-report transitions are governed by FR-42 and are explicitly not covered here.

**Returned and Closed terminal-state responsibility:**

- **Returned** is reachable only through administrator confirmation of physical return (FR-23 / FR-24 / FR-45). No reporter withdrawal, no auto-transition, no timeout. Found-side Returned requires the approved Claim's physical handoff; Lost-side Returned requires Match Confirmed + physical handoff + administrator Confirm Returned.
- **Closed** is reachable through:
  - **Permitted reporter withdrawal** (FR-11; active on Open or pre-Match-Confirmed Verification Pending Lost reports, and on Open or Claim Requested Found reports).
  - **Administrator moderation or content removal** (FR-21, FR-36) — including exceptional Found-side closure after `Claim Approved` and exceptional Lost-side cancellation after `Match Confirmed`.
  - **Documented exceptional administrator cancellation** (FR-21) after a Lost-side `Match Confirmed`.
  - **Lost-report-owner deactivation administrative closure** (FR-5, FR-21).
  - **Organization-removal of an unclaimed item** (already-defined behavior; unchanged).

Both `Returned` and `Closed` are terminal.

**Consequences (testable):**
- First Pending Claim on an Open Found report → **Claim Requested**.
- Pending Claim approved → **Claim Approved**.
- All Pending Claims rejected and no other Pending Claims remain → Found report returns to **Open**.
- Found report reaching `Returned` requires an explicit administrator Confirm Returned action (FR-23, FR-24).
- Found report reaching `Closed` requires either a reporter Withdraw action (FR-11) or an administrator Close action (FR-21 / FR-36).
- The system never auto-transitions a Found report directly to `Returned` or `Closed` from a non-terminal status without a human action.

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
- FindBack does not perform identity verification; the administrator's recorded affirmation is the entire confirmation mechanism.
- The action records: confirming administrator, substitute receiver's name, authorization affirmation, relationship, timestamp.
- The item status transitions to **Returned**, terminal.

**Out of Scope:** Identity verification, photo proof of authorization, in-platform message to claimant asking for confirmation, push notifications related to the substitute confirmation.

#### FR-25: No-Receiver-No-Returned Guard

The system refuses to confirm Returned without a recorded receiver (default or substitute).

**Consequences (testable):**
- If the administrator attempts to confirm Returned without selecting default-or-substitute and without filling the substitute fields, the system blocks the action with a clear message.

**Feature-specific NFRs:** None.

### 4.7 Per-Claim Message Thread

**Description:** FindBack provides a per-claim message thread as the contact channel between claimant, finder of the item, and administrators. No email addresses, phone numbers, or external chat tools are exposed between members. Realizes UJ-1, UJ-4. Implements PRD-author decision D1.

**Functional Requirements:**

#### FR-26: Per-Claim Thread

Each claim has a single message thread. The thread is visible to the claimant, the finder of the Found item the claim targets, and all administrators.

**Consequences (testable):**
- Members who are neither the claimant nor the finder cannot view or post in the thread.
- The thread is created when the first message is posted (or when the claim is created — implementation choice, but the thread is visible from claim creation onward).
- Posts are plain text and limited to 2000 characters. No attachments, no rich text, no images.
- Posts record actor and timestamp in the audit trail.
- FindBack does not include real-time chat, typing indicators, read receipts, or push notifications for messages.
- The thread is closed (read-only) once the claim is Approved, Rejected, or the item is Closed. The thread is not deleted; members and administrators can read history.

**Out of Scope:** Phone number or email exposure between members, in-app push notifications for new messages, third-party chat integrations, attachments.

### 4.8 Email Notifications

**Description:** Eight business/workflow notification email events are defined: three Found-side events (FR-27, FR-28, FR-29) plus five Lost-side Recovery Response events (FR-46 Events 4–8). No in-app notification stream; no push notifications; no SMS. Email is the only out-of-platform notification channel. Authentication/security emails, including the FR-51 password-reset email, are separate and are not counted as workflow notification events. Realizes UJ-1, UJ-2, UJ-3, UJ-5.

**Functional Requirements:**

#### FR-27: Account Approved Email (Found-side event 1)

Sent when an administrator approves a Pending registration.

**Consequences (testable):**
- Sent to the user's registered email address.
- Contains a link to the application login page (no auto-login token).
- **No email is sent on registration, on rejection, or on any other account transition** (FR-1, FR-3).

#### FR-28: New Claim Email (Found-side event 2)

Sent when a Pending Claim is created on a Found item report.

**Consequences (testable):**
- Sent to the reporter (finder) of the Found item.
- Contains a link to the claim's detail page (login required).

#### FR-29: Claim Decision Email (Found-side event 3)

Sent when a Claim is approved or rejected (including all automatic rejection cases defined in FR-17).

**Consequences (testable):**
- Sent to the claimant.
- For approval: contains a link to the item detail page and a note that the item is awaiting physical hand-off.
- For rejection: contains a brief reason (the administrator-supplied reason, or one of the auto-rejection reasons: `"another claim was approved for this item"` for D3 trigger; `"report withdrawn by reporter"` for FR-11 trigger; `"report closed by administrator"` for FR-21 / FR-36 trigger).
- **Sent to the claimant only.** No Claim-decision email is sent to the finder; the finder's view of the Found-report status changes silently via My Reports — the finder is not the beneficiary of a Claim decision email.

#### FR-30: Unsupported Notification Channels and Events

FindBack supports exactly eight business/workflow notification email events enumerated in FR-27, FR-28, FR-29, and FR-46. Authentication/security emails explicitly defined elsewhere in the PRD, such as the FR-51 password-reset email, are separate from this workflow-notification set and are not counted among the eight. FindBack does **not** support the following channels or events:

- **No in-app notification stream.** New registrations, new Claims, Claim decisions, new Recovery Responses, verification outcomes, Returned confirmations, and the like produce no in-app notification banners, badges, or feed entries.
- **No push notifications.**
- **No SMS.**
- **No email for ordinary workflow-thread messages.** A new message in a per-Claim thread or in a per-Recovery-Response thread does not generate an email to any participant.
- **No report-edit email** to any party.
- **No automatic stale-report reminders** to anyone.
- **No closure email** to responders or claimants when a report transitions to `Closed` (administrator moderation or reporter withdrawal). Closure is observed by the affected parties when they next visit the report or thread.
- **No registration-rejection email**.
- **No "lost-and-found digest" emails.**

**Consequences (testable):**
- The system does not produce any of the unsupported events above under any trigger.
- The workflow/business notification list above is exhaustive for FindBack. Any new workflow notification must be explicitly added to the applicable notification requirements. Authentication/security emails explicitly defined by another FR, such as FR-51, are outside this workflow-notification count.

**Feature-specific NFRs:** Email delivery success rate target is **95% within 5 minutes** for all eight business/workflow notification email events; failure does not block the triggering action. Validates SM-5 across all business/workflow notification emails.

### 4.9 Audit Trail

**Description:** Every important action on a Report, Claim, User/Registration, or workflow-thread message is recorded in an append-only audit trail visible only to administrators. Audit entries are retained according to the applicable parent entity's retention rules: Report / Claim / Recovery Response / per-Claim-thread / per-Recovery-Response-thread audit entries follow report retention; account and registration audit events follow account retention. See the Data Retention section. Realizes UJ-1, UJ-2, UJ-4. Implements PRD-author decisions from the brief's locked audit-trail list and PRD-author decision D4.

**Functional Requirements:**

#### FR-31: Audit Trail Scope (Authoritative)

The audit trail records every one of the following events. Each audit event includes actor, action, target, timestamp, and any event-specific fields listed below. The target may be a Report, Claim, User/Registration, Recovery Response, or workflow-thread context as applicable.

**Audit-event catalog (numbering and additional records):**

- FR-31 events 1–14 form the numbered Found/account/core workflow and lifecycle audit-event catalog.
- FR-48 events 15–30 form the numbered Lost-side Recovery Response audit-event catalog.
- FR-31 events 1–14 and FR-48 events 15–30 together form the complete numbered workflow/lifecycle audit-event catalog.
- Additional audit records explicitly required by other requirements are also part of the append-only administrator-visible audit history but do **not** receive additional numbered workflow-event identifiers. In particular:
  - **FR-52 Member Profile edits** are recorded with actor, timestamp, changed fields, and previous values.
  - **FR-53 Administrator report edits** are recorded with acting administrator, report ID, timestamp, changed fields, and previous values.

**Events and required additional fields:**

1. **Report created** — actor (reporter), report ID, name, category, type (lost/found), date, location, optional fields, image presence, timestamp.
2. **Claim submitted** — actor (claimant), claim ID, item ID, reason, identifying details, date lost, timestamp.
3. **Claim approved** — actor (administrator), claim ID, item ID, timestamp. (Auto-rejection of competing claims is recorded as separate events.)
4. **Claim rejected by administrator** — actor (administrator), claim ID, item ID, reason, timestamp.
5. **Claim auto-rejected (three triggers)** — `actor` (system, performing the automatic Claim transition), `triggered_by` (the human or system actor whose action caused the rejection — the Administrator who approved the winning Claim for Trigger 1, the Found-report owner for Trigger 2, or the Administrator who closed the Found report for Trigger 3), `triggering_action` (Claim approval / Found-side report withdrawal / Administrator Close), claim ID, Found report ID, auto-rejection trigger reason (`"another claim was approved for this item"` for D3 trigger; `"report withdrawn by reporter"` for FR-11 trigger; `"report closed by administrator"` for FR-21 / FR-36 trigger), timestamp.
6. **Returned confirmed (default receiver)** — actor (administrator), item ID, receiver (claimant on approved claim), timestamp.
7. **Returned confirmed (substitute receiver)** — actor (administrator), item ID, substitute receiver name, authorization affirmation, relationship, timestamp.
8. **Report edited by reporter** — actor (reporter), item ID, snapshot of changed fields, timestamp.
9. **Found report withdrawn by reporter (Found-side only)** — actor (Found-report owner), Found report ID, previous Found-report lifecycle status (`Open` or `Claim Requested`), timestamp. **Lost-side withdrawal is NOT recorded here** — Lost-side reporter withdrawal uses FR-48 event 23. If Pending Claims exist on the Found report, the auto-rejection events for those Pending Claims remain separately recorded under FR-31 event 5.
10. **Found report closed by Administrator (Found-side only)** — actor (administrator), Found report ID, previous Found-report lifecycle status (the status the Found report held immediately before the close action — `Open`, `Claim Requested`, or `Claim Approved`; Found lifecycle statuses only), closure reason (free text, recorded for the audit trail; required for exceptional closures such as post-`Claim Approved` and for moderation/removal; the same reason is also surfaced in the administrator UI), timestamp. **Lost-side closure is NOT recorded here** — Lost-side Administrator closure uses FR-48 event 24 (normal closure) or FR-48 event 25 (exceptional post-Match Confirmed cancellation). `Match Confirmed` is a Recovery Response status, not a Lost-report lifecycle status, so it MUST NOT appear as a previous lifecycle status here.
11. **Registration approved** — actor (administrator), user ID, timestamp.
12. **Registration rejected** — actor (administrator), user ID, reason, timestamp.
13. **Account deactivated** — actor (administrator), user ID, timestamp.
14. **Message posted in per-claim thread** — actor (claimant / finder / administrator), claim ID, message text (subject to retention), timestamp. (Treated as an audit record; messaging is operational rather than a core lifecycle event.)

**Consequences (testable):**
- The trail is append-only: no entry can be edited or deleted.
- The trail is visible only to administrators (FR-32).
- Retention follows the parent entity's retention rule (see Data Retention section). Report / Claim / Recovery Response / per-Claim-thread / per-Recovery-Response-thread audit entries follow report retention. Account and registration audit events follow account retention. If the report is hard-deleted (claim-free Open only for Found reports; `Open` and no Recovery Response only for Lost reports), the trail entries tied to that report are removed with it. If the report is withdrawn, Closed, or Returned, the trail is retained.
- There is no separate deletion mechanism for the trail while the report exists.
- Rejected claims remain in the trail even when the item's status does not change.

#### FR-32: Audit Trail Visibility

Only administrators can view the full audit trail.

**Consequences (testable):**
- Non-administrator users do not receive access to the full audit trail. They may see only the member-facing status/history information explicitly permitted by FR-39 and their workflow-specific views.
- Reporters, claimants, responders, and Lost-report owners do not gain access to the administrator audit trail merely by virtue of participating in a report, Claim, Recovery Response, or thread. Their member-facing status/history is not the same as the full audit trail.
- Anonymous users cannot see any audit entries.

**Feature-specific NFRs:** Audit trail queries must complete within 1 second at p95 against 10,000 reports with 50 events each.

### 4.10 Administrator Functions

**Description:** Administrators perform all cross-cutting administrative actions: approve and reject registrations, deactivate accounts, review and decide claims, confirm returns, close reports, and remove inappropriate content. Realizes UJ-3, UJ-4.

**Functional Requirements:**

#### FR-33: Administrator Dashboard

Administrators see a dashboard with pending counts and four dedicated queues:

1. **Pending Registrations** (FR-3).
2. **Pending Claims** (FR-34).
3. **Items Awaiting Return** (FR-35) — Found-side only (Found reports in `Claim Approved`).
4. **Items in Verification** (FR-50) — Lost-side only (Lost reports in `Verification Pending`).

The four queues are kept separate. Each count is a link to the corresponding queue. The dashboard is accessible only to administrators. **The audit trail (FR-32) is not one of these four operational queues** — it is an administrator-readable cross-cutting record visible from any report, Claim, Recovery Response, or thread detail.

#### FR-34: Pending Claims Queue

Administrators see a queue of Pending claims across all items, ordered by submission time. The queue shows item ID, claimant display name, submission time, and a link to the review screen.

**Consequences (testable):**
- The queue is filtered to claims with status **Pending**.
- The queue is accessible only to administrators.

#### FR-35: Items Awaiting Return Queue (Found-side only)

Administrators see a queue of Found reports with status **Claim Approved**, ordered by approval time.

**Consequences (testable):**
- Each entry has a **Confirm Returned** action (FR-23 / FR-24).
- The queue is scoped to Found reports only. Lost reports in `Verification Pending` belong to FR-50 (Items-in-Verification Queue) and are not mixed into this queue.

#### FR-36: Remove Inappropriate Content

An administrator can remove a report for inappropriate content. Removal transitions status to **Closed** and records the action in the audit trail.

**Consequences (testable):**
- The action records the administrator and timestamp.
- Removed reports disappear from active listings.
- The audit trail retains the entry.

**Feature-specific NFRs:** None.

### 4.11 Information Visibility Rules (Sensitive and Public Fields)

**Description:** Implements PRD-author decision D2 and the unified visibility matrix. Defines which fields are visible to which audiences, with FR-39 as the authoritative relationship-based visibility model.

**Functional Requirements:**

#### FR-37: Sensitive Fields (Authoritative Set)

The following fields are Sensitive Fields. They are hidden from viewers who are not authorized by the matrix in FR-39. Authorization is enforced at the API layer.

**Report-level Sensitive Fields:**

- Exact location free text (the "exact place" portion of the location field).
- Reporter's email address.
- Reporter's phone number (if collected — FindBack does not require phone).
- Identifying details free text on the report.

**Claim-level Sensitive Fields:**

- Claimant's identifying details free text on a Claim (visible only to administrators and to the claimant themselves).
- Claimant's reason free text on a Claim (visible only to administrators and to the claimant themselves). The Found-report owner/finder does not see the claimant's reason.

**Receiver-substitution fields:**

- Substitute receiver's name, authorization affirmation, and relationship.

**Image:**

- Image (until the viewer is authenticated and authorized to see it on this specific item per the matrix).

**Recovery Response Sensitive Fields:**

- Where-found exact place free text on the Recovery Response.
- Observed identifying details free text on the Recovery Response.
- Candidate image (image of the candidate item).
- Responder identity (display name and other identifier fields) on a per-Recovery-Response basis.
- Per-Recovery-Response thread content (thread is not visible to anonymous users, unrelated members, or competing responders).

#### FR-38: Public Summary Fields (Authoritative)

**This FR defines the field set visible to anonymous (non-authenticated) users only.** Authenticated users — including unrelated authenticated members — are governed by FR-39, not by this FR.

**There is NO anonymous report-detail page in FindBack.** Anonymous users may see only the public summary listing (FR-12). When an anonymous user clicks a report row in the public summary listing, the application routes the user to login with a return-after-login affordance; the authenticated detail page (FR-13, FR-39) renders after successful login. This is consistent with FR-12's anonymous-navigation behavior and is preserved here.

Anonymous users may see the following fields in public summary listings:

- Item name.
- Category.
- Date (lost or found).
- Campus area (the enum value, not exact place).
- Status (lifecycle status):
  - For Found reports (non-administrators): `Open`, `Claim Requested`, `Claim Approved` only. `Returned` and `Closed` are excluded from the default view.
  - For Lost reports (non-administrators): `Open`, `Verification Pending` only. `Returned` and `Closed` are excluded from the default view.
  - Administrators see all statuses.
- Type (lost / found).

Anonymous users must NOT see (in summary listings, in any pre-login page, or after login as part of the public summary set):

- Description.
- Image.
- Reporter identity (display name, email, phone).
- Exact location free text.
- Identifying details.
- Claims or any Claim content.
- Recovery Responses or any Recovery Response content.
- Workflow threads (per-Claim or per-Recovery-Response).
- Audit history.

**Note:** FR-38 is anonymous-only and covers the public summary listing set only. There is no anonymous detail page in FindBack. The matrix in FR-39 governs authenticated visibility once the user has logged in. Do not describe FR-38 as covering "members who are not on the item" — FR-38 governs anonymous visibility only. Do not introduce an anonymous detail page; the existing flow is `public listing → Login → authenticated detail page`.

#### FR-39: Member-Facing Visibility Matrix by Actor (Authoritative)

The following matrix is the authoritative visibility rule. Each row represents a field or category of fields; each column represents a viewer category. `Y` = visible; `N` = not visible; `(own)` = visible only on the viewer's own object; `(scoped)` = visible only on the specific Recovery Response or Claim the viewer has a role on.

**Columns (owner-role split):**

1. **Anonymous** — unauthenticated visitor.
2. **Authenticated unrelated member** — authenticated member with no role on this report.
3. **Found-report owner / finder** — authenticated member who authored the Found report.
4. **Claimant** — authenticated member who submitted a Claim on this Found report (scoped to their own Claim unless noted).
5. **Recovery responder** — authenticated member who submitted a Recovery Response on this Lost report (scoped to their own response unless noted).
6. **Lost-report owner** — authenticated member who authored the Lost report. Retains normal owner visibility over their own Lost report (description, image, exact location, identifying details, reporter info, status/history) in addition to Recovery Response-specific visibility over responses and threads on their own Lost report.
7. **Administrator** — administrator role.

| Field | Anon | Unrelated member | Found-report owner / finder | Claimant (own Claim) | Recovery responder (own response) | Lost-report owner | Administrator |
|---|---|---|---|---|---|---|---|
| Public summary fields (FR-38) | Y (summary listing only; no detail page — see FR-12, FR-38) | Y | Y | Y | Y | Y | Y |
| Description (full text) | N | Y | Y | Y | Y | Y | Y |
| Image (if present) | N | Y | Y | Y | Y | Y | Y |
| Reporter's display name | N | Y | Y | Y | Y | Y | Y |
| Member-facing status history (current status + last-action timestamp) | N | Y | Y (own Found report) | Y (related Found report) | Y (related Lost report) | Y (own Lost report) | Y |
| **Exact location free text (Sensitive)** | N | N | Y (own Found report) | N | N | Y (own Lost report) | Y |
| **Identifying details free text on the report (Sensitive)** | N | N | Y (own Found report) | N | N | Y (own Lost report) | Y |
| **Reporter email/phone (Sensitive)** | N | N | Y (own Found report) | N | N | Y (own Lost report) | Y |
| **Receiver-substitution fields (Sensitive)** | N | N | N | N (claimant does not see substitute fields of their own claim by default; visible if relevant to their own substitution — see FR-24) | N | N | Y |
| **Other Claimants' / Claims' identifying details** | N | N | N | N | N | N | Y |
| **Own Claim (reason, identifying details, date lost, current status, audit-light history)** | N | N | N | Y (own) | N | N | Y |
| **Other Claimants' / Claims' reason and identifying details** | N | N | N | N | N | N | Y |
| **Per-Claim thread content** | N | N | Y — scoped to Claims on own Found report | Y — scoped to own Claim | N | N | Y |
| **Own Recovery Response (where-found, observed identifying details, date found, candidate image, current status)** | N | N | N | N | Y (own) | Y (scoped to own Lost report) | Y |
| **Other Recovery Responses on the same Lost report (responder-supplied fields)** | N | N | N | N | N | Y (full visibility on own Lost report) | Y |
| **Per-Recovery-Response thread content (own response)** | N | N | N | N | Y (scoped) | Y (scoped to own Lost report) | Y |
| **Other responders' per-Recovery-Response threads on that same Lost report** | N | N | N | N | N | Y (scoped to own Lost report) | Y |
| **Other responders' per-Recovery-Response threads on Lost reports the viewer does not own** | N | N | N | N | N | N | Y |
| **Audit trail (full, with all actors and timestamps)** | N | N | N | N | N | N | Y |

Notes:

- **Owner-role semantics:** The Found-report owner / finder column and the Lost-report owner column are **explicitly split** because they have different scope semantics. A Found-report owner has ownership only on Found reports they authored; a Lost-report owner has ownership only on Lost reports they authored. For a Lost report, the Lost-report owner column governs all owner-level visibility, including normal owner fields (description, image, exact location, identifying details, reporter info, status) **and** Recovery Response-specific fields (responses, per-RR threads). For a Found report, the Found-report owner column governs all owner-level visibility, including per-Claim thread access on Claims against their Found report. There is no single "Report owner" column because no single member is simultaneously a Found-report owner and a Lost-report owner of the same report.
- **The Lost-report owner can see every Recovery Response and every per-Recovery-Response thread on their own Lost report.** This is necessary for them to evaluate and select from the responses. The Lost-report owner is the only non-administrator party with cross-response visibility on a Lost report.
- **A recovery responder cannot see other responders' responses, fields, or threads.** The responder sees only their own response, its status, and its own thread.
- **A claimant cannot see other claimants' identifying details or threads** and is not granted access to unrelated report-level Sensitive Fields merely by submitting a Claim.
- **The Found-report owner / finder** can see **per-Claim thread content on Claims against their own Found report** — i.e., they are a participant in each per-Claim thread on their Found report (FR-26). They can see that a Claim exists, the Found-report status, and the per-Claim thread. They do **NOT** see the claimant's `reason` free text or the claimant's `identifying details` free text on the Claim — those remain Sensitive Fields visible only to the claimant and administrators (FR-37, FR-39). **Per-Claim thread participation does not grant access to private Claim evidence** (claimant reason, claimant identifying details, or private ownership evidence) — those remain visible only to the claimant and administrators. The administrator evaluates private ownership evidence; the finder does not.
- **An unrelated authenticated member** (one who has no role on this report) sees the public summary fields plus description, image, and reporter display name; **no Sensitive Fields, no Claim content, no Recovery Response content, no thread content.**

**Consequences (testable):**
- The detail page renders different field sets based on viewer role and relationship to the item per this matrix.
- API responses to listing endpoints expose only the public summary fields unless the caller is authenticated and has a role on the item per this matrix.
- Authorization is enforced at the API layer; client-side hiding is insufficient.
- Sensitive Recovery Response fields (where-found exact place, observed identifying details, candidate image) are protected against competing responders and unrelated members.
- The two owner columns (Found-report owner, Lost-report owner) resolve unambiguously because the report type is known at detail-page render time and the request is authenticated.

**Feature-specific NFRs:** None.

### 4.12 Lost-Report Recovery Response Workflow

**Description:** An active member who, while browsing another member's Lost report (FR-49), believes they may have found the lost item can submit a **Recovery Response** to that Lost report. The Lost-report owner reviews the responses, may **provisional select** one response for physical verification, and is the one who determines whether the candidate item is theirs (Match Confirmed vs. Not a Match). The administrator manages the verification and the physical handoff and confirms Returned only after the owner confirms the match. A Recovery Response is a separate domain concept from a Claim; the two are intentionally not merged. Realizes UJ-5. Implements PRD-author decisions D5, D6, D7.

**Functional Requirements:**

#### FR-40: Submit a Recovery Response

An active member can submit a Recovery Response on another member's **Lost item report** (never on their own Lost report and never on a Found report). Submission is permitted while the Lost report status is `Open` or `Verification Pending`.

**Consequences (testable):**
- Required: where the responder found the item (campus area from the deployment enum + optional exact place free text, 0-200 chars), observed identifying details from outside the item (free text, 10-500 chars), and the date found (today or within the past 30 days, not future).
- Optional: an image of the candidate item (same constraints as report images — JPEG/PNG/WebP, ≤ 5 MB).
- The responder cannot submit a Recovery Response on their own Lost report. The system returns HTTP 403 with a clear message.
- The responder cannot submit a Recovery Response on a Found report. The Found-report response is a Claim (FR-15); the Lost-report response is a Recovery Response (this FR). The two are not interchangeable.
- The responder cannot submit a Recovery Response on a Lost report whose status is `Returned` or `Closed`. Submission is permitted only on `Open` or `Verification Pending` Lost reports.
- **One active response per responder per Lost report:** A responder may have at most one **non-terminal** Recovery Response on a given Lost report. **Non-terminal Recovery Response statuses** are:
  - `Submitted`
  - `Selected for Verification`
  - `Match Confirmed`

  If the responder's prior response on the same Lost report reached a terminal status (e.g., `Not a Match`) and the Lost report is still active, the responder may submit a new Recovery Response, which creates a new record. The prior terminal record is preserved and is not reactivated.
- **Submission during Verification Pending:** When a Recovery Response is submitted while the Lost report is in `Verification Pending` **and the currently selected response has not yet reached `Match Confirmed`**, the new response's canonical status is `Submitted`. The UI may display it as `Submitted — Standby`. The new response does not replace the currently `Selected for Verification` response. The new response can be selected only if the current selected response reaches `Not a Match` and the Lost report returns to `Open`. **Once `Match Confirmed` has been recorded, no further new Recovery Response submission is accepted**; the workflow proceeds to physical handoff / `Returned` or to exceptional administrator cancellation.
- On submit, the Recovery Response is created in `Submitted` status. The Lost-report owner is sent the "new Recovery Response on your Lost report" email (FR-46).
- The audit trail records the response submission with actor (responder), the Lost report ID, the response text fields, image presence, and timestamp.

#### FR-41: Recovery Response Statuses and Transitions (Authoritative)

A Recovery Response moves through a fixed set of canonical statuses. **Standby is a derived/display condition only and is not a persisted status**. Multiple Recovery Responses may exist on the same Lost report simultaneously; exactly one may be in `Selected for Verification` status at any time.

**Canonical Recovery Response statuses (8 statuses):**

- **Submitted** — Initial status of a Recovery Response. May be displayed as `Submitted — Standby` (derived/display condition) when another response on the same Lost report is currently `Selected for Verification`. The canonical persisted status remains `Submitted`.
- **Selected for Verification** — The Lost-report owner has provisionally chosen this response for verification. At most one response per Lost report may be in this status at a time. The atomic-selection rule is enforced at the data layer (this FR, FR-43, and the concurrency NFR in §10).
- **Match Confirmed** — The **Lost-report owner** has physically determined the candidate item is theirs during verification. **Not terminal.** Physical return is still pending. The Lost report remains in `Verification Pending` until the administrator confirms Returned (or exceptional cancellation occurs).
- **Not a Match** — Terminal-with-rejection. The Lost-report owner has determined the candidate item is not theirs. **This status is terminal for that Recovery Response; the response never returns to Submitted.**
- **Completed — Report Returned** — Terminal. Set on the matched **selected** Recovery Response when (a) Match Confirmed was recorded on it, (b) physical handoff occurred, (c) the administrator confirmed Returned, and (d) the parent Lost report transitioned to `Returned`. This is the successful terminal status for the matched selected response.
- **Resolved — Report Returned** — Terminal. Set on a non-selected non-terminal response when the Lost report reaches `Returned`.
- **Resolved — Report Closed** — Terminal. Set on any non-terminal response (including a response currently `Selected for Verification`, `Match Confirmed`, or `Submitted`) when the Lost report reaches `Closed`. `Match Confirmed → Resolved — Report Closed` is permitted only under documented exceptional administrator cancellation.
- **Withdrawn** — Terminal. Set when the responder withdraws their own Recovery Response while it is still `Submitted` and not currently `Selected for Verification`.

**Recovery Response status transitions (authoritative):**

```text
Submitted
→ Selected for Verification    (owner selects this one)
→ Withdrawn                    (responder withdraws, only while Submitted and not currently Selected for Verification)
→ Resolved — Report Returned   (Lost report reaches Returned and this one was not the selected one)
→ Resolved — Report Closed     (Lost report reaches Closed while this response is non-terminal)

Selected for Verification
→ Match Confirmed              (owner determines the candidate item is theirs; physical return still pending)
→ Not a Match                  (owner determines the candidate item is not theirs; response is terminal)
→ Resolved — Report Closed     (Lost report reaches Closed before Match Confirmed/Not a Match is recorded)

Match Confirmed
→ Completed — Report Returned  (physical handoff + administrator Confirm Returned; Lost report reaches Returned)
→ Resolved — Report Closed     (documented exceptional administrator cancellation after Match Confirmed, before Returned)
```

**Consequences (testable):**
- `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, and `Withdrawn` are all terminal for the Recovery Response. There is no transition from any of these back to `Submitted` or to any other non-terminal status.
- `Match Confirmed` is **not** terminal. It transitions only to `Completed — Report Returned` (the successful path) or to `Resolved — Report Closed` (the documented exceptional cancellation path).
- The only path from `Submitted` into a verified outcome is via `Selected for Verification`.
- All transitions are recorded in the audit trail with actor, target Recovery Response, source/target status, and timestamp (FR-48). Match Confirmed and Not a Match events additionally record `determined_by` (the Lost-report owner) and `recorded_by` (the acting administrator who recorded the determination in the system).
- A Lost report may have exactly one Recovery Response in `Selected for Verification` status at any time (atomic write enforced at the data layer; FR-41, FR-43, and the concurrency NFR in §10). The atomic-selection rule is NOT governed by FR-37 (Sensitive Fields) — that FR is unrelated.
- When the Lost report reaches `Returned` after a Match Confirmed + Confirm Returned sequence, the matched selected response transitions to `Completed — Report Returned`; **only other** non-terminal responses transition to `Resolved — Report Returned` in the same transaction.
- If the Lost report reaches `Closed` while a response is currently `Selected for Verification` or `Match Confirmed`, that response transitions to `Resolved — Report Closed` (along with every other non-terminal response). This is the operational mirror of the Returned path for the cancellation/closure case.
- Recovery Responses in any terminal status are preserved in the Lost report's history and remain visible to the Lost-report owner and to administrators.
- Reverting a Lost report from Verification Pending to Open (Not-a-Match path, FR-43) does not auto-reactivate the previously selected response. The previously selected response remains `Not a Match`. The standby pool of `Submitted` responses is available for selection.

#### FR-42: Lost-Report Lifecycle and Auto-Transitions

The Lost report's lifecycle is:

```text
Open
→ Verification Pending      (when a Recovery Response transitions to Selected for Verification; FR-43)

Open
→ Closed                   (reporter withdrawal permitted under FR-11; administrator moderation; organization removal; owner-deactivation administrative closure)

Verification Pending
→ Returned                 (Match Confirmed reached on the selected response AND physical handoff AND administrator confirms physical return; FR-43 + FR-45)

Verification Pending
→ Open                     (Not a Match on the selected response; Lost report remains active; FR-43)

Verification Pending
→ Closed                   (administrator moderation or organization removal BEFORE Match Confirmed —; reporter withdrawal BEFORE Match Confirmed permitted under FR-11; documented exceptional administrator cancellation AFTER Match Confirmed, FR-21)
```

**Consequences (testable):**
- A Lost report cannot transition directly from `Open` to `Returned`. It must pass through `Verification Pending`.
- A Lost report cannot transition from `Open` to `Claim Requested`, `Claim Approved`, or any Found-only status. The Claim lifecycle and the Lost lifecycle are disjoint.
- A Lost report that has at least one Recovery Response cannot be hard-deleted (canonical rule lives in FR-10; this FR cross-references FR-10 and FR-11). The reporter's only option is to withdraw, which transitions to `Closed` (FR-11), subject to the post-Match-Confirmed block.
- Returning from `Verification Pending` to `Open` does not lose the audit trail of the previously selected response or its Not-a-Match determination. The previously selected response remains `Not a Match` (terminal). The standby pool of `Submitted` responses remains available for selection.
- **Verification Pending → Closed:** Two distinct closure categories are recognized:
  - **Before Match Confirmed:** Permitted through (a) reporter withdrawal under FR-11 while `Verification Pending` and pre-Match-Confirmed; (b) administrator moderation or organization-removal (FR-21); (c) Lost-report owner deactivation (this FR + glossary). In all cases every non-terminal Recovery Response (including any currently `Selected for Verification` and all `Submitted`) transitions to `Resolved — Report Closed` in the same transaction. Threads become read-only. No closure email is sent.
  - **After Match Confirmed, before Returned:** Reporter withdrawal is blocked. Only documented exceptional administrator cancellation (FR-21, FR-48 event 25) may close the report. The matched selected response transitions to `Resolved — Report Closed` along with every other non-terminal response. The audit trail records the cancellation reason and the acting administrator.
- **On Lost-report Returned:** the matched selected response transitions to `Completed — Report Returned`; every other non-terminal response transitions to `Resolved — Report Returned` in the same transaction (FR-41). Both happen in the same transaction as the administrator's Confirm Returned action.
- **On Lost-report Closed (pre-Match Confirmed):** every non-terminal response — including any currently `Selected for Verification` and all `Submitted` — transitions to `Resolved — Report Closed` in the same transaction. Threads become read-only.
- **Match Confirmed before administrator Returned:** reporter withdrawal is no longer permitted. The flow must proceed to administrator Confirm Returned. Administrator cancellation of a Match-Confirmed Lost report is permitted only with a documented exceptional reason; the matched selected response transitions to `Resolved — Report Closed` along with all other non-terminal responses, and the audit trail records the cancellation reason and acting administrator.

#### FR-43: Owner Review, Provisional Selection, and Verification Outcomes (owner-determines / administrator-records)

The Lost-report owner reviews the Recovery Responses on their Lost report (from **My Reports** → report detail → **Review Responses**) and may select one response for verification. The owner physically determines whether the candidate item is theirs; the acting administrator records the owner's determination in the system. The administrator does not independently decide whether the item belongs to the owner.

**Consequences (testable):**
- The owner sees every Recovery Response on the Lost report with submission time, responder display name, where-found text, observed identifying details, candidate image, and date found. Each row shows its current canonical status (`Submitted`, `Selected for Verification`, `Match Confirmed`, `Not a Match`, `Withdrawn`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`).
- **Display-only Standby:** While one Recovery Response on the Lost report is in `Selected for Verification`, the UI may render the other `Submitted` responses as `Submitted — Standby`. The canonical persisted status remains `Submitted`.
- The owner selects exactly one response at a time by clicking **Select for Verification** on that response's row. The system records the selection event with the owner, the response ID, the Lost report ID, and a timestamp. The selected response moves to `Selected for Verification`. The Lost report moves from `Open` to `Verification Pending`.
- Selection is **provisional and reversible only through the Not-a-Match path**. A new selection is permitted only after the currently selected response reaches `Not a Match` and the Lost report has returned to `Open`. **Match Confirmed does NOT unlock another selection**: once Match Confirmed has been recorded, no further response may be selected and no further new Recovery Response is accepted.
- **Verification responsibility  — owner physically determines; administrator records:**
  - **Match Confirmed** — The Lost-report owner physically inspects the candidate item and determines it is theirs. The acting administrator records the owner's determination in the system on the owner's behalf. The selected response transitions to `Match Confirmed` (NOT terminal — physical return is still pending). The administrator does **not** independently decide that the item belongs to the owner. The audit entry records `determined_by = Lost-report owner`, `recorded_by = acting administrator`, the determination `Match Confirmed`, and the verification timestamp. Successful example wording: *"Maya physically confirms that the wallet is hers. Riley records Maya's Match Confirmed determination in FindBack."*
  - **Not a Match** — The Lost-report owner physically inspects the candidate item and determines it is not theirs. The acting administrator records the owner's determination in the system. The selected response transitions to `Not a Match` (terminal). The audit entry records `determined_by = Lost-report owner`, `recorded_by = acting administrator`, the determination `Not a Match`, and the verification timestamp. Failure example wording: *"Maya physically determines that the candidate is not her wallet. Riley records Not a Match based on Maya's determination."*
- A Recovery Response in `Selected for Verification` must produce one of the two outcomes above (`Match Confirmed` or `Not a Match`) before any other response can be selected on the same Lost report.
- The audit trail records every owner determination (`Match Confirmed` / `Not a Match`) with both `determined_by` (owner) and `recorded_by` (acting administrator), the selected response ID, the Lost report ID, and the timestamp. The Administrator is recorded as the system actor performing the write; the Owner is recorded as the determination-maker (FR-48 events 18 and 19).
- **Withdrawn response:** A responder may withdraw their own Recovery Response only while it is `Submitted` and not currently `Selected for Verification`. Withdrawn is a terminal status preserved in history; the response cannot be reactivated.

#### FR-44: Recovery Response Field Set (Authoritative)

| Field | Required | Type | Constraints | Visibility |
|---|---|---|---|---|
| Where the item was found (campus area) | yes | enum | Fixed deployment list | Responder, Lost-report owner, administrators |
| Where the item was found (exact place text) | optional | string | 0-200 chars (Sensitive Field per D2) | Responder, Lost-report owner, administrators — **not** anonymous; **not** unrelated members; **not** competing responders |
| Observed identifying details | yes | string | 10-500 chars (Sensitive Field per D2) | Responder, Lost-report owner, administrators — **not** anonymous; **not** unrelated members; **not** competing responders |
| Date found | yes | date | Today or within the past 30 days, not future | Responder, Lost-report owner, administrators |
| Image of candidate | optional | image | JPEG/PNG/WebP, ≤ 5 MB | Responder, Lost-report owner, administrators — **not** anonymous; **not** unrelated members; **not** competing responders |

The responder who submitted the Recovery Response can see their own response, its current canonical status, and messages on its own per-Recovery-Response thread. The Lost-report owner can see every response submitted on their Lost report, all of the responder-supplied fields they are authorized to see, and each per-Recovery-Response thread. Anonymous users and unrelated members cannot see Recovery Response details. The full audit trail remains administrator-only (FR-32).

**Privacy on the original Lost report shown to a prospective responder:** A responder viewing a Lost report from **Browse** sees only the authenticated-visible Lost-report fields (FR-39 member-facing visibility). They do **not** see report-level Sensitive Fields (identifying details; exact location free text) of the Lost-report owner. Their Recovery Response must be based on information they independently observed about the candidate item, not on private information supplied by the Lost-report owner.

#### FR-45: Administrator Verification Management and Returned Confirmation (Lost side)

When a Lost report is in **Verification Pending**, the administrator manages the physical verification and handoff. Administrators see every Recovery Response on the Lost report (selected and standby) on a single verification screen, so verification is administered honestly and traceably.

**Consequences (testable):**
- The verification screen shows the Lost report details, every Recovery Response (responder, submission time, where-found, observed identifying details, date found, candidate image, current canonical status), the owner's identity, and the currently selected response.
- **Acting-administrator model:** Any administrator may manage verification. The acting administrator on any verification action is determined by which administrator actually performs it. There is no pre-assignment gate. Another administrator may take over at any time by performing the next action; the previous acting administrator becomes the recorded actor on prior actions.
- **Concurrency:** Simultaneous verification actions on the same Lost report are handled atomically per Lost report at the data layer (the atomic-selection rule lives at FR-41, FR-43, and the §10 concurrency NFR; it is not governed by FR-37). The first action wins; the second administrator receives a conflict message and must take no further action.
- The administrator cannot independently determine `Match Confirmed` or `Not a Match`. Those determinations are physically made by the Lost-report owner (FR-43). The administrator's role is to manage process and record the owner's determination.
- The administrator confirms physical return only after the owner has recorded `Match Confirmed` via the administrator (FR-43). Confirm Returned records: confirming administrator, receiver (default is the Lost-report owner; substitute rules per FR-24 apply if the actual receiver differs and is authorized by the owner), timestamp, and (if substituted) substitute receiver's name, authorization affirmation, and relationship.
- The Lost report transitions from `Verification Pending` to `Returned` at the moment Confirm Returned is recorded. In the same transaction: **the matched selected response transitions to `Completed — Report Returned`** and every other non-terminal Recovery Response transitions to `Resolved — Report Returned`. All per-Recovery-Response threads become read-only. The successful-recovery emails fire (FR-46 event 7 to Lost-report owner; FR-46 event 8 to matched responder; event 8 fires only at this transition, not at the earlier Match Confirmed step).
- **Cancellation after Match Confirmed:** If the acting administrator cancels a Match-Confirmed Lost report, a documented exceptional reason is required. The matched selected response transitions to `Resolved — Report Closed` along with every other non-terminal response; threads become read-only; the audit trail records the cancellation reason and acting administrator (FR-48 event 25).
- **Closure during Verification Pending, before Match Confirmed:** If a Lost report transitions to `Closed` while one Recovery Response is currently `Selected for Verification` (and has not yet reached `Match Confirmed` or `Not a Match`), in the same transaction **the selected response transitions to `Resolved — Report Closed`**, along with every other non-terminal response. The selected response is not retained in its pre-closure status. All threads become read-only. No closure email is sent.
- **Lost-report-owner deactivation handling:**
  - **Open report:** Administrator closes with reason `report owner account deactivated` (per the operational rule in this PRD's glossary entry for "Lost-report owner deactivation"); every non-terminal response transitions to `Resolved — Report Closed`; threads become read-only.
  - **`Verification Pending` before Match Confirmed:** Physical verification may still occur (the owner may physically inspect and determine outcome). The acting administrator records the owner's determination. If verification cannot continue, administrator closes with documented reason; every non-terminal response transitions to `Resolved — Report Closed`; threads become read-only.
  - **After Match Confirmed, before Returned:** Administrator may complete handoff and Confirm Returned. Otherwise, documented exceptional cancellation; selected response transitions to `Resolved — Report Closed` along with every other non-terminal response.

#### FR-46: Recovery Response Email Notifications (Lost-side)

The Lost-report recovery flow requires the following five email events, in addition to the three Found-side events in FR-27, FR-28, FR-29. FindBack's complete email event set is **eight** events total (3 Found-side + 5 Lost-side) — do not describe the set as "five email notifications".

| # | Event | Recipient | Trigger |
|---|---|---|---|
| 4 | New Recovery Response on my Lost report | Lost-report owner | A Recovery Response transitions to `Submitted` |
| 5 | My response was selected for verification | The responder whose response just transitioned to `Selected for Verification` | The Lost-report owner selects a response for verification |
| 6 | Verification failed (Not a Match) | The responder whose response just transitioned to `Not a Match` | The acting administrator records the owner's Not a Match determination and the response reaches that status |
| 7 | Successful return (my Lost report is Returned) | The Lost-report owner | The Lost report transitions to `Returned` via the administrator's Confirm Returned action |
| 8 | Successful recovery completed  | The responder whose selected Recovery Response transitioned to `Completed — Report Returned` | The Recovery Response transitions `Match Confirmed → Completed — Report Returned` AND the Lost report transitions `Verification Pending → Returned` (in the same transaction). The email fires only at this transition. It does NOT fire when Match Confirmed is initially recorded. |

Email content links back to the relevant detail page (login required). **No email is generated when the Lost report transitions to `Closed`** — closure is handled by the Lost-report owner's withdrawal path (no email) or by administrator moderation (no email to responders).

#### FR-47: Per-Recovery-Response Message Thread (One thread per Recovery Response)

**Privacy model:** There is one message thread **per Recovery Response**, not one shared thread per Lost report. Each thread is scoped to one specific Recovery Response. Participants in that thread are:

- The Lost-report owner.
- The responder who submitted that Recovery Response.
- All administrators.

A responder can see and post on their own thread. A responder **cannot see** other responders' threads. The Lost-report owner can see every per-Recovery-Response thread on their own Lost report. Administrators can see and post on every thread.

**Thread lifecycle:**

- **Writable** while the Recovery Response status is `Submitted` or `Selected for Verification` or `Match Confirmed` (the response is still active in the verification/return-pending phase).
- **Read-only** when the Recovery Response status becomes `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, or `Withdrawn`.
- **Read-only** when the parent Lost report transitions to `Returned` or `Closed` (whichever Recovery Response status the response currently holds).

**Consequences (testable):**
- Posts are plain text and limited to 2000 characters. No attachments, no rich text, no images. Same constraints as the per-Claim thread (FR-26).
- Posts record actor and timestamp in the audit trail (audit event 16 below).
- Existing messages remain readable by the Lost-report owner, the responder of the scoped thread, and administrators once the thread becomes read-only. History is preserved; the thread is not deleted.
- The per-Recovery-Response thread is independent of the per-Claim thread. They are scoped to different objects (Claim vs. Recovery Response).
- Anonymous users and unrelated members cannot see or post on any thread.

**Out of Scope:** General-purpose member-to-member messaging, real-time chat, typing indicators, read receipts, presence, attachments, third-party chat integrations, phone/email exposure between members.

#### FR-48: Recovery Response Audit Events

The audit trail records the following Lost-side events in addition to the events in FR-31. Each event includes actor, action, target (Lost report, Recovery Response, or per-Recovery-Response thread message), timestamp, and any event-specific fields. Acting-administrator-on-action is recorded on every action; no separate verifier assignment event exists.

15. **Recovery Response submitted** — actor (responder), Lost report ID, response ID, where-found, observed identifying details, date found, image presence, timestamp.
16. **Message posted in per-Recovery-Response thread** — actor (Lost-report owner / responder / administrator), response ID, message text, timestamp. (Scoped to the per-Recovery-Response thread.)
17. **Recovery Response selected for verification** — actor (Lost-report owner), Lost report ID, response ID, timestamp.
18. **Recovery Response determined Match Confirmed** — `determined_by` (Lost-report owner identity), `recorded_by` (acting administrator identity), Lost report ID, response ID, verification timestamp. (The acting administrator is recorded as the system actor performing the write; the Lost-report owner is recorded as the determination-maker.)
19. **Recovery Response determined Not a Match** — `determined_by` (Lost-report owner identity), `recorded_by` (acting administrator identity), Lost report ID, response ID, verification timestamp. (Same actor model as event 18.)
20. **Recovery Response withdrawn by responder** — actor (responder), Lost report ID, response ID, timestamp.
21. **Returned confirmed (Lost report, default receiver)** — actor (administrator), Lost report ID, receiver (Lost-report owner), timestamp.
22. **Returned confirmed (Lost report, substitute receiver)** — actor (administrator), Lost report ID, substitute receiver name, authorization affirmation, relationship, timestamp.
23. **Lost report withdrawn by reporter (Lost-side only)** — actor (Lost-report owner), Lost report ID, prior Lost-report lifecycle status (`Open` or `Verification Pending` — pre-Match Confirmed only), timestamp. **Lost-side reporter-triggered withdrawal only.** Child-response batch resolution is recorded under FR-48 event 27. No duplicate FR-31 event 9 is written for Lost-side withdrawal.
24. **Lost report closed by Administrator (Administrator-triggered normal closure, Lost-side)** — actor (administrator), Lost report ID, reason, prior Lost-report lifecycle status (`Open` or `Verification Pending` — pre-Match Confirmed only), timestamp. **Administrator-triggered closure only.** Covers moderation, organization removal, Lost-report-owner deactivation, and Administrator closure while `Verification Pending` before Match Confirmed. **Reporter-triggered withdrawal is NOT recorded here** — that uses FR-48 event 23.
25. **Lost report cancellation after Match Confirmed by Administrator (exceptional, Lost-side)** — actor (administrator), Lost report ID, exceptional reason, prior Lost-report lifecycle status (`Verification Pending`), prior selected response ID with its status at close time (`Match Confirmed`), timestamp. **Administrator-triggered exceptional post-Match Confirmed cancellation only.**
26. **Lost report Returned — automatic child response resolution (parent/batch event)** — actor (system; identifying the administrator who confirmed Returned), Lost report ID, list of all non-selected non-terminal child response IDs transitioning to `Resolved — Report Returned`, and explicit reference to the matched selected response ID that is transitioning to `Completed — Report Returned` under event 30, timestamp. **This is the parent Lost-report-level batch event recording the entire Returned transaction.**
27. **Lost report Closed — automatic child response resolution** — actor (system; identifying administrator or reporter who triggered closure), Lost report ID, list of child response IDs transitioning to `Resolved — Report Closed`, timestamp.
28. **Lost report Verification Pending returned to Open after Not a Match** — actor (system; identifying administrator who recorded the outcome), Lost report ID, prior selected response ID, timestamp.
29. **Lost report current state transition to Verification Pending** — actor (system; identifying the owner who selected), Lost report ID, selected response ID, timestamp.
30. **Recovery Response transition to Completed — Report Returned (individual-terminal event)** — actor (system; identifying the administrator who confirmed physical return), Lost report ID, response ID, the matched selected Recovery Response's new canonical status (`Completed — Report Returned`), timestamp. **This is the per-response terminal-event fired in the same transaction as event 26.** Event 26 covers the parent Lost report's batch child-resolution and references this event by response ID; event 30 records the individual matched selected response reaching its successful terminal status. Both events are recorded in the same transaction so the audit trail can be reconstructed either at the parent Lost-report level (event 26) or at the individual response level (event 30).

The acting administrator on every verification action is the administrator who performed that action. There is no separate verifier assignment event.

Events 21 and 22 mirror FR-31 events 6 and 7 (Found-side Returned) but are scoped to the Lost-report lifecycle and identify the receiver as the Lost-report owner (or substitute).

**Feature-specific NFRs:**
- Recovery Response submission and selection operations must complete within 1 second at p95.
- Verification screen renders within 1 second at p95 against a Lost report with up to 50 Recovery Responses.

### 4.13 Member Listing and Participation Views (Authoritative)

**Description:** A member's view of the system is composed of four distinct views. **My Reports** contains reports the member authored. **Browse** contains reports authored by other members (a member's own reports never appear in their own Browse). **My Claims** contains Claims the member submitted on other members' Found reports. **My Recovery Responses** contains Recovery Responses the member submitted on other members' Lost reports. The four views are disjoint and authoritative. Implements PRD-author decisions D5 and D8. Anonymous browsing behavior continues to follow FR-12 and FR-38.

**Functional Requirements:**

#### FR-49: Listing Partition and Participation Views (Authoritative)

For an authenticated Active Member, the system presents the following four views:

**My Reports (member's authored reports):**

- That member's Lost item reports.
- That member's Found item reports.
- Reports remain retrievable in My Reports across all lifecycle statuses, including `Returned` and `Closed`. Default status filters may hide `Returned` and `Closed`, but the owner can opt to show them.
- **No other member's reports appear here.**

**Browse (other members' reports):**

- Other members' Lost item reports (subject to FR-14 filters; includes `Verification Pending`).
- Other members' Found item reports (subject to FR-14 filters).
- **Reports authored by the requesting member never appear in their own Browse**.
- For a Found report in Browse, the detail page exposes the **Submit Claim** action (FR-15).
- For a Lost report in Browse, the detail page exposes the **Submit Recovery Response** action (FR-40).

**My Claims (member's submitted Claims on other members' Found reports):**

- Each Claim the authenticated member has submitted on any other member's Found report.
- Each row shows: Claim status (`Pending` / `Approved` / `Rejected`), the related Found report's summary fields (FR-38), submission timestamp, and a link to the per-Claim thread.
- The view is independent of My Reports. **A successful Claim on another member's Found report does not transition any report authored by the member**.
- The view exposes the per-Claim thread for each Claim the member submitted.

**My Recovery Responses (member's submitted Recovery Responses on other members' Lost reports):**

- Each Recovery Response the authenticated member has submitted on any other member's Lost report.
- Each row shows: Recovery Response canonical status (`Submitted` / `Selected for Verification` / `Match Confirmed` / `Not a Match` / `Withdrawn` / `Completed — Report Returned` / `Resolved — Report Returned` / `Resolved — Report Closed`), the related Lost report's summary fields (FR-38), submission timestamp, and a link to the per-Recovery-Response thread.
- The view is independent of My Reports. **A successful Recovery Response (matched and Returned) does not transition any report authored by the member**.
- The view exposes the per-Recovery-Response thread for each Recovery Response the member submitted. The per-Recovery-Response thread participants are the Lost-report owner, this responder, and all administrators (FR-47).

**Anonymous behavior:**

- Anonymous users continue to see the public summary listing (FR-12), which includes both Lost and Found reports of all members. Anonymous viewing is not partitioned.
- Login prompts (FR-12) and authenticated detail view (FR-13) remain unchanged.

**Consequences (testable):**
- Listing endpoints accept a `partition` parameter with values `mine`, `browse`, `claims`, `recovery_responses`, or (default for anonymous) `public`. The default for an authenticated request is `browse` to avoid accidental self-exposure, with `mine`, `claims`, and `recovery_responses` available as top-level navigation.
- API responses do not return reports authored by the caller under the `browse` partition under any filter combination.
- For a Found report in Browse, the detail page exposes the **Submit Claim** action (FR-15).
- For a Lost report in Browse, the detail page exposes the **Submit Recovery Response** action (FR-40).
- For a report in My Reports (whether Lost or Found), the detail page exposes the report-management actions (edit, withdraw) per FR-9 / FR-11 and does not expose Submit Claim / Submit Recovery Response.
- A successful Claim or Recovery Response submitted by a member on another member's report appears in **My Claims** or **My Recovery Responses** respectively; **it does not appear in My Reports**.
- My Claims and My Recovery Responses are independent navigation entries; neither overrides nor duplicates the other.
- A member who authored no reports and submitted no Claims or Recovery Responses sees empty states in My Reports / My Claims / My Recovery Responses and a populated Browse.
- My Claims entries for `Rejected` Claims remain visible (audit-light) but cannot be re-submitted on the same item if a `Pending` Claim by the same member already exists (FR-15 unchanged).
- My Recovery Responses entries for terminal-status responses (`Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, `Withdrawn`) remain visible in history. A response currently in `Match Confirmed` is **non-terminal** (physical handoff pending) and remains visible in My Recovery Responses as an active return-pending response, not as a historical/terminal entry; it transitions to `Completed — Report Returned` (success path) or, exceptionally, `Resolved — Report Closed` (documented exceptional cancellation) and is then classified as historical. The view does not allow editing; it allows the responder to withdraw while Submitted-and-not-Selected.

**Feature-specific NFRs:**
- The four views must be presented as distinct navigation entries with no overlap in the rendered result set. API-level enforcement is required in addition to UI-level enforcement so a client cannot bypass the rule by re-querying the underlying endpoint.

### 4.14 Administrator Items-in-Verification Queue

#### FR-50: Items-in-Verification Queue

The administrator dashboard exposes a dedicated **Items in Verification** queue for Lost reports in `Verification Pending` status. This is separate from the Found-side Items Awaiting Return queue (FR-35), so administrators do not mix Claim Approved Found items with Verification Pending Lost items.

**Consequences (testable):**
- The queue contains only Lost reports whose status is `Verification Pending`.
- Each row shows: Lost report ID, Lost-report owner display name, currently selected Recovery Response ID and responder display name, time entered Verification Pending, time since owner last actioned.
- Each row provides a **Open Verification** action that navigates to the FR-45 verification screen for that Lost report.
- The dashboard counters (FR-33) include this queue as a separate count: "Items in Verification".
- When a Lost report leaves `Verification Pending` (transitions to `Returned`, `Open` after Not a Match, or `Closed`), the row is removed from the queue in the same transaction.
- The queue is accessible only to administrators.

### 4.15 Password Recovery

#### FR-51: Forgot Password / Password Recovery

A user who cannot remember their password can request password-reset instructions using the email address associated with their FindBack account.

**Consequences / testable requirements:**

- The Login screen provides a `Forgot your password?` action. Selecting it opens the Forgot Password form.
- The form accepts the user's email address.
- After submission, the system always shows a neutral confirmation message regardless of whether the email belongs to an account.
- The response must not disclose whether:
  - the email is registered,
  - the account exists,
  - the account is `Pending`,
  - the account is `Active`,
  - the account is `Rejected`,
  - the account is `Deactivated`.
- User-facing confirmation copy is equivalent to: *"If an account exists for that email address, password reset instructions have been sent."*
- For an eligible existing account, the system sends a password-reset email containing a secure recovery mechanism. For FindBack, **eligible existing account** is defined as **any existing FindBack account that uses local password authentication, regardless of lifecycle state** — i.e., the account may be in any of the following states: `Pending`, `Active`, `Rejected`, or `Deactivated`. Password recovery therefore may send the reset email for an existing local-password account in any of those four states.
- The reset mechanism must be time-limited and single-use or otherwise invalidated after successful password change.
- A valid reset flow allows the user to set a new password that satisfies the same password policy used during registration (FR-1).
- After a successful password reset, the previous password must no longer authenticate the user.
- An invalid, expired, or already-used reset request must fail safely and provide a way to request another reset.
- Password-reset requests must be rate-limited.
- Password-reset responses must use anti-account-enumeration behavior (the response, timing, and any subsequent screen state must not differ in a way that reveals whether the email is associated with an account).
- Password reset does **not** activate, approve, reject, or otherwise change the user's account lifecycle state. Password recovery does **not** bypass Administrator approval. Password recovery does **not** activate an account, approve an account, reactivate a Deactivated account, undo a Rejected state, or grant lost-and-found feature access.
  - A `Pending` account remains `Pending`.
  - An `Active` account remains `Active`.
  - A `Rejected` account remains `Rejected`.
  - A `Deactivated` account remains `Deactivated`.
- The password-reset email is an authentication/security message. It is **not** part of the eight business/workflow email events (FR-46 Events 1–8) and is **not** a ninth event. It is documented separately from FR-46.
- The Forgot Password flow does not require the user to be signed in. It is available to anonymous and signed-out users.
- Login (FR-4) remains unchanged in its surface area; the only addition is the `Forgot your password?` link on the Login screen.

**Out of scope for FR-51 (no project change):**

- SMS-based password recovery.
- Security questions.
- Two-factor authentication / step-up authentication.
- Cross-account password reuse detection.
- Account-recovery by Administrator on behalf of the user (the Administrator path remains FR-3 / FR-5 only).

**Architecture-owned implementation details (not prescribed by this PRD):**

- Reset-token format.
- Token hashing / storage.
- Reset-token expiry duration.
- Invalidation strategy on successful reset or expiration.
- Email-provider implementation.
- Backend endpoints and request/response contracts.
- Session handling after a successful reset (e.g., whether active sessions are invalidated).

### 4.16 Member Profile

#### FR-52: Member Profile

The locked Product Brief identifies `Login, logout, and member profile (limited to what the system needs to identify the member)` as in scope. Login and logout are defined in FR-4. This FR defines the Member Profile requirement.

The Member Profile exists solely to support identification of the member within FindBack. It does not introduce a general account-management or social-profile system.

**Profile fields**

- **Display name** — the human-readable name shown to other members where the member's identity is needed (e.g., the report owner, claimant, recovery responder, message author).
- **Self-declared role** — one of `Student`, `Employee`, `Visitor`, `Other` (collected at registration per FR-1 and surfaced on the profile).
- **Email address** — the address used for authentication and FindBack's notification emails. Visible to the member and to administrators; not exposed to other members.

**Member-facing capabilities**

- An Active member can view their own profile information.
- An Active member can edit their **display name** and **self-declared role**.
- A member cannot edit the email address through the profile UI. Email changes, if ever supported, would be a separate explicit capability introduced by a future PRD revision. The current PRD does not introduce email-change.
- A member cannot edit their account lifecycle status. Profile editing is for identifying information only.

**Forbidden profile edits (do not bypass lifecycle, approval, or audit):**

- Profile editing does **not** change the account lifecycle status (`Pending`, `Active`, `Rejected`, `Deactivated`).
- Profile editing does **not** grant, revoke, or modify the `administrator` flag. Administrator designation is outside the Member Profile capability and is managed separately.
- Profile editing does **not** bypass Administrator registration approval. A Pending account remains Pending regardless of profile edits.
- Profile editing does **not** modify the audit history.

**Profile-edit audit record**

- Every profile edit is recorded in the account/profile audit history with actor, timestamp, changed fields, and previous values.
- The account/profile audit record is an audit record distinct from report, Claim, and Recovery Response audit events. It does not renumber or modify any FR-31 or FR-48 audit event, and it does not introduce a new FR-46 workflow-notification event number.
- Historical account/profile audit records remain append-only and cannot be edited or deleted through the Member Profile capability.

**Visibility**

- The Member Profile view is visible to the member themselves.
- Administrators can view member profile fields through the existing administrator account-management view (per FR-3 / FR-5).
- Other members do **not** see an arbitrary "profile page" for a member. They see identifying fields only where required by workflow context (e.g., the report owner's display name on a report, the responder's display name on a Recovery Response, message author in a thread) per FR-39.

**Out of scope for FR-52 (no project change):**

- Profile photos / avatars.
- Bio, social links, or other social-profile fields.
- Email change through the profile UI.
- Privacy / notification preferences.
- Self-service deactivation or self-service account deletion.
- Profile edit by the member on behalf of another member.

### 4.17 Administrator Report Edit

#### FR-53: Administrator Report Edit (Moderation / Operational Correction)

The locked Product Brief grants Administrators the ability to `moderate, edit, close, or remove reports where appropriate for moderation purposes`, and explicitly defers `detailed rules and lifecycle constraints` to the PRD. FR-21 and FR-36 define Close and Remove-Inappropriate-Content. This FR defines the Administrator report-edit capability for moderation and operational correction.

**Purpose and scope**

- Administrator report edit is a narrow operational capability for moderation, content correction, and metadata correction. It is **not** unrestricted database editing.
- Administrator report edit is permitted while the report is in any non-terminal status: `Open`, `Claim Requested`, `Verification Pending`, `Claim Approved`.
- Administrator report edit on a `Returned` report is **blocked**. `Returned` is terminal; the historical record of the return event is preserved as recorded.
- Administrator report edit on a `Closed` report is **blocked**. `Closed` is terminal; the historical record of the closure event is preserved as recorded.
- This FR does not authorize rewriting historical workflow facts (Claim decisions, Recovery Response determinations, Returned confirmations, audit events, receivers, or historical lifecycle transitions). Those remain immutable.

**Editability rules**

- The following fields are editable by an Administrator for moderation / operational correction: report name, category, description, date, location (campus area enum value and exact-place free text), identifying details, image replacement.
- The following are **not** editable through Administrator report edit: reporter identity, report type (Lost/Found), report lifecycle status (use FR-21 close paths and FR-22/FR-42 lifecycle transitions), any Claim content, any Recovery Response content, any audit-trail entry, any Returned-confirmation fields, any substitute-receiver fields.
- All edits are limited to what is necessary for moderation or operational correction. Mass data migration is out of scope; a separate data-migration story would be required.

**Auditability**

- Every Administrator report edit is recorded in the audit trail with: acting administrator, timestamp, the report ID, the changed fields, and the previous values.
- The audit entry makes it possible to reconstruct what changed and when. Administrators cannot silently modify report content.
- The audit record itself is append-only; previous audit entries are never edited or deleted by an Administrator report-edit action.

**Lifecycle interaction**

- Administrator report edit does **not** change the report's lifecycle status.
- Administrator report edit does **not** bypass the edit blocklist in FR-9 for terminal reports. `Returned` and `Closed` remain uneditable through this FR.
- Administrator report edit does **not** reset or restart any workflow timer, claim-decision state, recovery-response state, or selection state.
- Administrator report edit does **not** introduce or remove Claims, Recovery Responses, threads, audit events, or lifecycle transitions.

**Visibility**

- The member-facing view re-renders the report after the edit. The member is not notified by email about the edit (FR-30: no report-edit email).
- The edit appears in the administrator-visible audit trail immediately.

**Out of scope for FR-53 (no project change):**

- Direct database-level edits bypassing the application-layer audit.
- Rewriting historical Claim decisions, Recovery Response determinations, Returned confirmations, or audit events.
- Restoring a hard-deleted report.
- Editing a `Returned` or `Closed` report through this path. Terminal reports remain immutable through the user-facing application.

## 5. Non-Goals (Explicit)

The following are non-goals for FindBack. They are stated here because downstream readers (UX, architecture, story creation) may otherwise assume them.

**Messaging scope:**

- **In scope (workflow-scoped threads only):**
  - Per-Claim message thread (FR-26).
  - Per-Recovery-Response message thread (FR-47).
- **Out of scope:**
  - General-purpose member-to-member messaging.
  - Real-time chat (typing indicators, read receipts, presence, attachments) on any thread.
  - In-app notification stream (no banners, badges, or feed entries).
  - Push notifications.
  - SMS.
  - Third-party chat integrations (Slack, WhatsApp, etc.) for member contact.
  - Phone or email exposure between members (unless explicitly allowed elsewhere).
  - Closure emails on Lost-report Closed transitions.
  - Registration-rejection emails.
  - Report-edit emails.
  - Auto-close or stale-report reminder emails.

**Other non-goals:**

- **[NON-GOAL]** Cross-organization item sharing or federation. FindBack runs one deployment per organization.
- **[NON-GOAL]** A global public marketplace where any user can browse items from any organization.
- **[NON-GOAL]** Automatic match suggestions or proactive notifications of potential matches between Lost and Found reports.
- **[NON-GOAL]** Identity verification. The administrator's recorded affirmation is the entire confirmation mechanism for substitute receivers.
- **[NON-GOAL]** Proof-of-ownership uploads. FindBack does not allow members to upload photos of receipts, serial numbers, or other proof.
- **[NON-GOAL]** Native mobile applications. FindBack is a web application.
- **[NON-GOAL]** Multi-tenant administration of multiple organizations from one console.
- **[NON-GOAL]** Bulk import of historical lost-and-found records.
- **[NON-GOAL]** Analytics dashboards or reporting beyond what administrators need to operate the system.
- **[NON-GOAL]** Integration with external identity providers (SSO, LDAP, Google, Microsoft, etc.).
- **[NON-GOAL]** Internationalization beyond English.
- **[NON-GOAL]** Automatic expiry or auto-close of unclaimed reports.
- **[NON-GOAL]** Auto-close reminders or "stale report" emails.
- **[NON-GOAL]** Responder-initiated edit of an already-submitted Recovery Response (responses can only be Withdrawn and re-submitted if eligible, not edited in place).

## 6. Project Scope

### 6.1 In Scope

FindBack delivers, end to end:

- Self-registration with administrator approval (FR-1, FR-2, FR-3, FR-4).
- Login, logout, and session management (FR-4).
- Forgot Password / Password Recovery, with anti-account-enumeration behavior and no account-lifecycle side effects (FR-51). The password-reset email is an authentication/security message and is not part of the eight FR-46 business/workflow events.
- Lost item reporting with create, view, edit, delete / withdraw by owner (FR-6, FR-9, FR-10, FR-11).
- Found item reporting with the same behaviors (FR-7, FR-9, FR-10, FR-11).
- Combined Lost-and-Found listings, anonymous-viewable in summary form, partitioned for authenticated members into My Reports (own reports), Browse (other members' reports), My Claims (Claims submitted by member), and My Recovery Responses (Recovery Responses submitted by member) (FR-12, FR-49, D8).
- Search and filter across keyword, category, location, date range, type, and status (FR-14; includes Verification Pending for Lost reports).
- Authenticated item detail view with the unified visibility matrix by actor (FR-13, FR-38 anonymous summary, FR-39 authenticated detail matrix).
- Claim submission on another member's Found report with required reason, identifying details, and date lost (FR-15); Claim reason and identifying details are Sensitive Fields visible only to claimant and administrators (FR-37, FR-39).
- Per-claim message thread (FR-26).
- Administrator claim review and decision (approve / auto-reject competitors / reject) (FR-16, FR-17, FR-18).
- Found-item lifecycle transitions (Open → Claim Requested → Claim Approved → Returned / Closed) (FR-22); exceptional administrator Close after `Claim Approved` requires documented reason (FR-21).
- Recovery Response submission on another member's Lost report (permitted while Lost report is `Open` or `Verification Pending` **before `Match Confirmed`**), owner review, provisional selection, owner-determines / administrator-records verification outcomes, lifecycle transitions, responder withdrawal, and resubmission after Not a Match (FR-40, FR-41, FR-42, FR-43, FR-44, FR-45).
- Per-Recovery-Response message thread, one per Recovery Response, with privacy scoped to Lost-report owner, that responder, and administrators (FR-47).
- Business/workflow email notifications — eight total events (FR-27, FR-28, FR-29, and FR-46 Events 4–8); Event 8 fires only after Completed — Report Returned + Lost report Returned. The FR-51 password-reset email is a separate authentication/security email and is not counted among these eight workflow events.
- Recovery Response audit events (FR-48 events 15-30, with `determined_by` and `recorded_by` for events 18 and 19).
- Reporter withdrawal rules: Found on `Open` / `Claim Requested`; Lost on `Open` / `Verification Pending` pre-Match-Confirmed. FR-11.
- FR-9 edit blocklist extends to both `Returned` and `Closed` (SM-7).
- FR-10 hard-deletion restricted to interaction-free Open reports (Found requires no Claim; Lost requires no Recovery Response).
- Administrator Close on unclaimed or inappropriate reports, with detailed lifecycle guards (FR-21, FR-36).
- Returned confirmation with default or substitute receiver on both Found and Lost sides (FR-23, FR-24, FR-25 extended via FR-45 for Lost side); Lost-side Returned requires Match Confirmed + physical handoff + Confirm Returned; the matched selected response transitions to `Completed — Report Returned` (FR-41, FR-45).
- **Eight business/workflow notification email events**: three Found-side events plus five Lost-side Recovery Response events. The FR-51 password-reset email is a separate authentication/security email and is not counted among the eight workflow events. There is no registration-rejection email, no standalone report-closure email, and no in-app notification stream (FR-30). Claim-rejection emails are supported under FR-29; closure emails are not.
- Item history / audit trail recording who performed each important lifecycle action and when, including the expanded Recovery Response event set, with full substitute-receiver fields at Returned on both report types (FR-31, FR-48).
- Audit trail visible to administrators only; retained for the lifetime of the report; no separate deletion mechanism (FR-32).
- Administrator dashboard with pending counts and four queues: **Pending Registrations**, **Pending Claims**, **Items Awaiting Return** (Found-side, FR-35), **Items in Verification** (Lost-side, FR-50). FR-33. Audit is not one of the four operational queues.
- Pending registrations queue with approve and reject-with-reason; no registration-rejection email (FR-3).
- Account deactivation preserving all reports, Claims, Recovery Responses, messages, and audit history (FR-5); Lost-report-owner deactivation handling paths defined in FR-5 / FR-42 / FR-45.
- Member Profile (FR-52), limited to identifying information (display name, self-declared role) and the registered email; profile editing never alters account lifecycle, the administrator flag, or audit history.
- Administrator report edit (FR-53) for moderation / operational correction, auditable, scope-limited to non-terminal reports, and unable to rewrite historical workflow facts.

### 6.2 Out of Scope

See §5 for full non-goals. The following items are outside the current FindBack project scope and are not planned as part of this product:

- **Auto-matching between Lost and Found reports.**
- **Identity verification of claimants and substitute receivers.**
- **In-platform photo proof of ownership (receipts, serial numbers).**
- **Native mobile applications.**
- **Internationalization beyond English.**
- **External SSO/LDAP.**
- **Multi-tenant administration console.**
- **Real-time chat features (typing indicators, read receipts, attachments, presence).**

## 7. Success Metrics

Each SM cross-references the FR(s) it validates. Counter-metrics balance primary metrics so the architect does not optimize the wrong thing.

**Primary**

- **SM-1: Account activation rate.** ≥ 90% of registered users are approved within 7 days of registration. Validates FR-3.
- **SM-2: Claim turnaround time.** Median time from claim submission to claim decision ≤ 48 hours. Validates FR-16, FR-17, FR-18.
- **SM-3: Item return rate.** ≥ 60% of items with an approved claim reach **Returned** status within 7 days of approval. Validates FR-23, FR-24.
- **SM-4: Listing-to-detail conversion.** ≥ 30% of authenticated sessions that view a summary listing proceed to a detail view within the same session. Validates FR-12, FR-13.
- **SM-5: Email delivery.** ≥ 95% of all triggered business/workflow notification emails delivered within 5 minutes. Validates FR-27, FR-28, FR-29, FR-46.

**Secondary**

- **SM-6: Audit completeness.** 100% of items returned have a complete audit trail (no missing actor or timestamp). Validates FR-31 (Found-side and account audit trail) and FR-48 (Lost-side audit trail).
- **SM-7: Edit safety.** 0% of edits to **Returned** or **Closed** reports succeed. Validates FR-9 and FR-53.
- **SM-8: Substitute-receiver completeness.** 100% of **Returned** confirmations where the actual receiver differs from the flow's default receiver (Found default = approved claimant; Lost default = Lost-report owner) include substitute receiver's name, authorization affirmation, and relationship. Validates FR-24 (Found-side substitute fields), mirrored by FR-45 (Lost-side substitute fields).
- **SM-9: Auto-rejection coverage.** When a claim is approved on an item with multiple pending claims, 100% of other pending claims on that item transition to **Rejected** with reason recorded. Validates FR-17.
- **SM-10: Recovery Response turnaround.** Median time from Recovery Response submission to owner selection for verification ≤ 7 days. Validates FR-40, FR-43.
- **SM-11: Lost-side verification outcome recorded.** 100% of Lost reports reaching **Returned** have a recorded Match Confirmed → Completed — Report Returned transition with `determined_by` (Lost-report owner) and `recorded_by` (acting administrator) audit fields, plus verification and Returned timestamps, mirroring SM-6 for the Lost side. Validates FR-43, FR-45, FR-48 events 18, 26, 30.
- **SM-12: Browse / My Reports separation.** 0 reports authored by the requesting member appear in that member's Browse results under any filter combination. Validates FR-49.
- **SM-13: Standby-response preservation.** When a Lost report reaches **Returned** or **Closed** with prior standby Recovery Responses, 100% of those non-terminal responses transition to a terminal-but-preserved status (**Resolved — Report Returned** or **Resolved — Report Closed**) in the same transaction; the matched selected response transitions to `Completed — Report Returned` on the Returned path. Validates FR-41, FR-45, FR-48.
- **SM-14: Successful-return email timing.** 0 successful-match emails (FR-46 event 8) fire before physical handoff confirmation. The email fires only when the matched selected Recovery Response transitions to `Completed — Report Returned` and the Lost report transitions to `Returned` in the same transaction. Validates FR-46 event 8.
- **SM-15: Owner-vs-administrator audit.** 100% of `Match Confirmed` and `Not a Match` audit events record both `determined_by = Lost-report owner` and `recorded_by = acting administrator`. Validates FR-48 events 18, 19.

**Counter-metrics (do not optimize)**

- **SM-C1: Report volume per active member.** Target ≤ 2 reports per active member per semester. Counterbalances SM-1 and SM-2: optimizing for approval speed should not produce a flood of low-quality registrations.
- **SM-C2: Claim approval rate.** Target 40%–70%. Counterbalances SM-2: optimizing for fast turnaround should not produce blanket approvals of claims that should be rejected.
- **SM-C3: Time-to-Close for unclaimed items.** No automatic target; reports remain Open indefinitely. Counterbalances SM-3: optimizing for return rate should not pressure administrators to close reports prematurely.

## 8. Open Questions

These are open at PRD finalization. Each has an owner and a revisit condition. None are blockers for downstream story creation.

- **OQ-1: Campus area enum per deployment.** The fixed list of campus areas in FR-8 is set per deployment. How is it configured at deployment time? **Owner:** Architecture. **Revisit:** When the deployment configuration story is written.
- **OQ-2: Image storage budget.** What is the storage budget per item image, and what is the cleanup policy if a report is hard-deleted under FR-10? **Owner:** Architecture. **Revisit:** When storage story is written.
- **OQ-3: Date lost beyond 365 days.** The current FindBack product rule is **365 days** as the upper bound on Lost-report `date lost` (FR-6, FR-8) and Claim `date lost` (FR-15). Implementation must enforce 365 days as the bound today; the rule is not relaxable in the current product. Whether to relax the bound after operational data shows frequent rejections on date grounds may be reconsidered after the first semester of operation. **Owner:** PM. **Revisit:** After first semester of operation, if data shows frequent rejections on date grounds.
- **OQ-5: Auto-rejection message wording.** The auto-rejection reason "another claim was approved for this item" is in FR-17. Does this wording need to be softer or more informative in the email body? **Owner:** UX. **Revisit:** During UX writing pass.

### 8.1 Resolved / Retired Questions 

- **OQ-4 — retired.** FR-26 already defines the per-Claim thread as read-only once the Claim is Approved or Rejected, so the per-Claim thread is read-only before the report reaches Returned in the Approved case. The open question about whether the per-Claim thread should become read-only at Returned is already answered by FR-26. Retired because the answer is already in FR-26.

## 9. Assumptions Index

PRD-author decisions recorded explicitly and inherited from the brief's "deferred to PRD" list:

- **D1 (PRD-author decision, contact/facilitation):** Per-claim message thread. Documented in FR-26.
- **D2 (PRD-author decision, sensitive info and anonymous summary fields):** Sensitive field set in FR-37; public summary field set in FR-38; member-facing visibility in FR-39.
- **D3 (PRD-author decision, competing claims UX):** Approve-one-auto-reject-others with audit retention. Documented in FR-17.
- **D4 (PRD-author decision, administrator registration-review process):** Pending queue with Approve / Reject-with-reason; rejection reason recorded in audit trail but not exposed to the rejected user. Documented in FR-3.

PRD-author decisions inherited from the finalized Product Brief's "deferred to PRD" lists for the Lost-side recovery flow and the listing partition:

- **D5 (PRD-author decision, listing partition):** For an authenticated Active Member, listings are split into **My Reports** (the member's own Lost and Found reports) and **Browse** (other members' Lost and Found reports). A member's own reports never appear in that member's Browse results. This separation applies regardless of report type and regardless of whether the member is acting as claimant (Found-side Claim) or responder (Lost-side Recovery Response). Anonymous browsing behavior continues to follow FR-12 and the public-summary rules. Documented in FR-49.

- **D6 (PRD-author decision, per-Recovery-Response message thread):** One message thread exists per Recovery Response. Participants are the Lost-report owner, that responder, and all Administrators. Competing responders cannot see each other's threads. The thread is **writable** while the Recovery Response is `Submitted`, `Selected for Verification`, or `Match Confirmed`. It becomes **read-only** once the Recovery Response reaches `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, or `Withdrawn`, or when the parent Lost report becomes `Returned` or `Closed`. `Match Confirmed` is non-terminal — physical handoff is still pending — so the thread remains writable during the active return-pending phase. Thread history is preserved; messages are not deleted. Documented in FR-47.

- **D7 (PRD-author decision, Recovery Response selection is provisional):** When the Lost-report owner selects one Recovery Response for verification, the selection is provisional and reversible only through the Not-a-Match path. The selection does not permanently close or reject any other Recovery Response. Other `Submitted` responses remain on the Lost report and are available for selection; the UI may render them as `Submitted — Standby` while another response is `Selected for Verification` (the canonical persisted status remains `Submitted`; **Standby is a derived/display condition only**, not a persisted status). If the selected one reaches `Not a Match`, the Lost report returns to `Open` and the owner may select a different `Submitted` candidate. When the Lost report reaches `Returned`, the matched selected response transitions to `Completed — Report Returned` and every other non-terminal Recovery Response transitions to `Resolved — Report Returned` in the same transaction. When the Lost report reaches `Closed`, every non-terminal Recovery Response (including any currently `Selected for Verification` or `Match Confirmed`) transitions to `Resolved — Report Closed` in the same transaction. Documented in FR-41, FR-42, FR-43, FR-45, FR-49.

- **D8 (PRD-author decision, member participation views):** Because `My Reports` contains only reports authored by the member, two additional member-facing participation views are introduced to surface interactions the member initiated on other members' reports: **`My Claims`** (Claims the member submitted on other members' Found reports) and **`My Recovery Responses`** (Recovery Responses the member submitted on other members' Lost reports). The four views (`My Reports`, `Browse`, `My Claims`, `My Recovery Responses`) are disjoint and authoritative. `My Reports` contains reports the member authored; `Browse` contains reports authored by other members; `My Claims` contains Claims submitted by the member on other members' Found reports; `My Recovery Responses` contains Recovery Responses submitted by the member on other members' Lost reports. A successful Claim or Recovery Response on another member's report appears in the corresponding participation view, not in `My Reports`. D8 is **exclusively** the participation-views decision. The rule that "Standby is a derived/display condition, not a persisted Recovery Response status" is **not** part of D8 — it lives in FR-41, D7, and the glossary as a lifecycle behavior, not as a separate deferred-brief decision. Documented in FR-49.

PRD-author assumptions (inferred without brief input). These are product-level assumptions about the deployment context; implementation choices such as session-storage mechanism, database topology, and email-provider selection are reserved for Architecture:

- **A1:** The FindBack web application targets modern evergreen browsers (Chrome, Edge, Firefox, Safari latest two major versions). No Internet Explorer support. *Reasoning:* web-based product with no legacy constraint stated.
- **A2:** Authenticated sessions must be revocable and expire after inactivity. The session mechanism and storage strategy are Architecture decisions. *Reasoning:* the brief and PRD require revocable authenticated sessions; storage mechanism is implementation detail.
- **A3:** Image moderation is the administrator's manual review (FR-36) only; no automated image scanning. *Reasoning:* brief locks no automated matching or moderation tooling; adding it would be scope expansion.
- **A4:** Each deployment has a fixed campus-area list (per FR-8); how the list is configured per deployment is resolved via OQ-1 (Architecture-owned). The PRD does not introduce an Administrator-configuration UI for the campus-area list. *Reasoning:* the brief requires location/campus-area behavior; runtime-configurability is an Architecture concern.
- **A5:** The audit trail is append-only, retains entries under each parent entity's retention rule, and is visible only to administrators (FR-31, FR-32, FR-48). The PRD does not prescribe the storage topology (same database vs. external log service); that is an Architecture decision. *Reasoning:* the audit requirements are product requirements; storage topology is implementation detail.
- **A6:** Email is the supported out-of-platform notification channel (FR-30). Delivery reliability for workflow notification emails is captured in SM-5. The PRD does not prescribe an email provider or implementation; that is an Architecture decision. *Reasoning:* the channel and reliability requirements are product requirements; provider selection is implementation detail.

Each of A1–A6 is a product-level assumption; each is a candidate for explicit confirmation before downstream story creation begins.

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
  - Passwords are stored using a modern adaptive hashing function. The specific algorithm and work factors are an Architecture decision.
  - Authenticated sessions are revocable and expire after inactivity (FR-4). Session-invalidation behavior on logout, deactivation, or password reset is an Architecture decision.
  - State-changing endpoints are protected against cross-site request forgery.
  - **Rate limiting explicitly covers:** registration, login, Claim submission, Recovery Response submission, and workflow message posting (per-Claim thread and per-Recovery-Response thread).
  - **Sensitive fields are not returned in API responses to unauthorized viewers (enforced at the API layer, not just the UI).** Sensitive Recovery Response fields (where-found exact place, observed identifying details, candidate image, responder identity on a per-response basis, thread content) are protected against unrelated members and competing responders.
  - Images are served in a way that prevents casual unauthorized access (e.g., not via predictable URLs); detailed caching and header behavior is an Architecture decision.
  - All administrator actions are recorded in the audit trail; the audit trail is append-only.
  - Per-Recovery-Response thread visibility is enforced at the API layer: a responder requesting another responder's thread is denied.

- **Reliability.**
  - FindBack targets 99% uptime during business hours of the host organization. No formal SLA.
  - Email send failures are logged; the triggering action is not blocked.

- **Accessibility.**
  - WCAG 2.1 AA compliance is the design target for FindBack. This is a UX-implementation concern; the PRD carries it as an NFR so architecture and QA can plan for it.

- **Observability.**
  - Application logs include request ID, actor ID, action, and target ID where applicable.
  - Audit-trail reads are themselves logged (administrator ID, query, timestamp) — separate from the audit trail itself, so the access pattern is reviewable.

- **Data Retention.**
  - **Reports, Claims, Recovery Responses, per-Claim and per-Recovery-Response message histories, and the audit trail:** all retained for the lifetime of the parent report (FR-31 events 1–14 and FR-48 events 15–30). When the report is hard-deleted under FR-10, the related Claims / Recovery Responses / messages / audit entries are removed with it.
  - **Accounts:** retained indefinitely while Active, indefinitely after Deactivation or Rejection (FR-5 — deactivation preserves all historical artifacts).
  - **Hard deletion:** remains limited to eligible Open reports with no relevant interaction — Found reports with no Claim, Lost reports with no Recovery Response (FR-10).
  - **Open + interaction cases:** For a Lost report in `Open` status with at least one Recovery Response, withdrawal (FR-11) transitions the report to `Closed` and the responses to `Resolved — Report Closed`. The history is preserved; nothing is hard-deleted.
  - **Terminal statuses (`Returned` / `Closed`):** nothing is hard-deleted. All Claims, Recovery Responses, per-thread messages, and audit events are preserved indefinitely under the parent report.

## 11. Product Principles (Locked)

These are the Product Principles from the locked Product Brief, restated here as the alignment check for downstream work:

- **Simple.** Members should report and search without a learning curve; administrators should run the system without training.
- **Trustworthy.** Members should feel their information, Claims, and Recovery Responses are handled responsibly; administrators should have the visibility they need to decide and act.
- **Clear.** Item status, Claim status, Recovery Response status, and Account status should be obvious at a glance.

UX design and story creation must serve these principles. Where a story trade-off emerges (e.g., adding a UI affordance that improves "simple" at the cost of "trustworthy"), the principles are the tiebreaker.

---

## Consistency and Scope Check Against the Locked Product Brief

This PRD was checked against the brief for: contradictions, accidental scope expansion, missing locked requirements, and unresolved decisions.

### Brief Revision 1 (original brief — preserved unchanged)

| Locked brief item | Present in PRD | Section / FR |
|---|---|---|
| Single-tenant, one org per deployment | Yes | §1, §2.2, §5 |
| Login, logout, and Member Profile (limited to what the system needs to identify the member) | Yes | FR-4, FR-52 |
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
| Report edit/delete/withdraw rules (member editing) | Yes | FR-9, FR-10, FR-11 |
| Administrator can `moderate, edit, close, or remove reports` (brief deferred detailed rules to PRD) | Yes — moderation edit resolved by FR-53; close by FR-21; remove inappropriate content by FR-36 | FR-21, FR-36, FR-53 |
| Three business/workflow notification email events (original brief lock) | Yes — three Found-side events preserved (FR-27, FR-28, FR-29); the set was subsequently extended by the finalized Brief's Lost-side Recovery Response requirements to a unified eight-event model (see below) | FR-27, FR-28, FR-29, FR-30, FR-46, FR-48 |
| No in-app notifications or messaging (except per-claim and per-Recovery-Response threads) | Yes | §5, FR-26, FR-30, FR-47 |

### Brief Lost-side Recovery Response and Browse / My Reports

| Locked brief item | Present in PRD | Section / FR |
|---|---|---|
| Recovery Response as a separate domain concept from Claim | Yes | §3.1, §4.12 (intro), FR-40, FR-41 |
| Recovery Response submission by another member on a Lost report | Yes | FR-40 |
| Recovery Response status model with provisional selection, owner determination, and Administrator recordkeeping | Yes — exact canonical 8-status set, `Completed — Report Returned` as successful terminal status, and `Standby` as a derived display condition are **PRD resolutions of Brief-deferred details** | FR-41, FR-43, FR-44 |
| Lost-report lifecycle with states Open, Returned, Closed (intermediate Verification Pending) | Yes | §3, FR-42 |
| Provisional, reversible selection of one Recovery Response at a time | Yes | FR-41, FR-43, D7 |
| Owner-driven determination of Match Confirmed vs. Not a Match | Yes | FR-43, FR-45 |
| Administrator manages verification and confirms Returned only after owner match | Yes | FR-45 |
| Other responses remain actionable until the Lost report resolves; non-terminal responses resolve to Resolved — … at Returned / Closed | Yes | FR-41, FR-45 |
| Verification screen shows ALL Recovery Responses (selected and standby) to the administrator | Yes | FR-45 |
| Audit trail covers the full Recovery Response path with who/when | Yes | FR-48 (events 15-30 extending FR-31; events 18/19 record `determined_by` and `recorded_by`) |
| Browse vs. My Reports partition for authenticated members | Yes | FR-49, D5 |
| Member's own reports never appear in that member's Browse results | Yes | FR-49 |
| For a Found report in Browse → Claim flow applies | Yes | FR-49 (cross-reference to FR-15) |
| For a Lost report in Browse → Recovery Response flow applies | Yes | FR-49 (cross-reference to FR-40) |
| Lost-side workflow communication / coordination mechanism | Yes — resolved by PRD as **one per-Recovery-Response message thread** (participants: the Lost-report owner, that responder, and Administrators); the Brief deferred the detailed mechanism to the PRD | FR-47, D6 |
| Recovery Response email events (new RR on my Lost report; selected; Not a Match; successful return) | Yes — the Brief required notification coverage for the Lost-side workflow; the exact set of 5 Lost-side email events, their recipients, and their triggers are **PRD resolutions of a Brief-deferred detail** | FR-46, FR-48 events 15-30 |
| Recovery Response default receiver = Lost-report owner; substitute receiver rules apply | Yes — substitute-receiver fields and authorization affirmation are mirrored from the Found-side flow; the explicit default-receiver rule on the Lost side is a **PRD resolution of a Brief-deferred detail** | FR-45 (mirrors FR-24), FR-48 |
| Lost-side hard delete only when `Open` and has no Recovery Response | Yes (hard delete is symmetric across Found and Lost — Found requires no Claim, Lost requires no Recovery Response) | FR-10 (authoritative), FR-42 (cross-reference) |
| Verification screen admin visibility mirrors Claim audit visibility | Yes | FR-45 (mirrors FR-17 atomic-write conflict handling) |

### Cross-Cutting Brief Items

| Item | Present in PRD | Section / FR |
|---|---|---|
| Editing blocked once a report reaches Returned **or** Closed | Yes | FR-9 |
| Reporter withdrawal reaches Closed (not Returned); Returned requires administrator confirmation of physical return | Yes | FR-11, FR-22 |
| Hard deletion symmetric: Found report requires no Claim; Lost report requires no Recovery Response | Yes | FR-10 |
| Withdrawal rules separate by report type (Found allowed Open / Claim Requested; Lost allowed Open / Verification Pending pre-Match-Confirmed) | Yes | FR-11 |
| Recovery Response lifecycle: Submitted → Selected for Verification → Not a Match (terminal); Match Confirmed (non-terminal) → Completed — Report Returned | Yes | FR-41 |
| Standby is a derived/display condition, not a persisted canonical status | Yes | FR-41, FR-43, glossary §3.1 (NOT a separate decision ID; lives under D7's behavior) |
| Per-Recovery-Response message thread (not per Lost report); writable on Submitted/Selected for Verification/Match Confirmed; read-only on Not a Match/Completed — Report Returned/Resolved — Report Returned/Resolved — Report Closed/Withdrawn or parent Returned/Closed | Yes | FR-47, D6 |
| Verification Pending is included in the Lost-report status filter | Yes | FR-14 (not FR-13) |
| Verification Pending covers both verification and post-Match-Confirmed handoff period; Lost report remains Verification Pending until Confirm Returned transitions to Returned | Yes | §3 Glossary (Verification Pending entry), FR-42 |
| Recovery Responses can still be submitted while Lost report is Verification Pending, but only while the currently selected response has not reached Match Confirmed | Yes | FR-40 |
| Lost reports in Verification Pending are surfaced as a separate administrator queue (Items in Verification) | Yes | FR-50 |
| My Claims / My Recovery Responses participation views available to authenticated members | Yes (D8) | FR-49 |
| My Recovery Responses excludes Match Confirmed from its terminal-status list — Match Confirmed is non-terminal and remains visible as an active return-pending response | Yes | FR-49 |
| My Reports includes terminal-state reports so members can retrieve Returned/Closed history | Yes | FR-49 |
| Lost-report owner can see every Recovery Response and every per-Recovery-Response thread on their own Lost report (and only those) | Yes | FR-39, FR-47 |
| Found-report owner/finder can see per-Claim threads on Claims against their own Found report; per-Claim thread participation does NOT grant access to claimant private ownership evidence | Yes | FR-26, FR-37, FR-39, D1 |
| Four separate administrator queues: Pending Registrations, Pending Claims, Items Awaiting Return (Found-side), Items in Verification (Lost-side) — Audit is not one of the four | Yes | FR-33, FR-3, FR-34, FR-35, FR-50 |
| Owner determines / Administrator records: owner physically determines Match Confirmed / Not a Match; administrator records on owner's behalf | Yes | FR-43, FR-45, FR-48 events 18/19 |
| Match Confirmed is not terminal: physical return still pending; Lost report remains Verification Pending | Yes | FR-41, FR-43, FR-47 |
| Successful Recovery Response transitions to Completed — Report Returned after physical handoff + administrator Confirm Returned | Yes | FR-41, FR-45 |
| Verification Pending → Closed has two categories — pre-Match-Confirmed (reporter withdrawal / admin moderation) and post-Match-Confirmed (documented exceptional admin cancellation only) | Yes | FR-21, FR-42, FR-45 |
| Match Confirmed before Returned: reporter withdrawal blocked; admin cancellation requires documented reason | Yes | FR-11, FR-21, FR-45, FR-48 event 25 |
| Responder may Withdraw a Submitted Recovery Response (only while Submitted and not Selected) | Yes | FR-41, FR-43 |
| Resubmission after Not a Match: new Recovery Response record; original preserved as Not a Match | Yes | FR-40 |
| Candidate image hidden from unrelated / competing responders; visible to Lost-report owner and administrators | Yes | FR-37, FR-39 |
| Responder does not see private Lost-report fields (exact location, reporter identifying details) | Yes | FR-39, FR-40 |
| Claim reason and identifying details visible only to claimant and administrators | Yes | FR-37, FR-39 |
| Lost-report owner deactivation paths (Open → admin Close; VP pre-Match → may continue or admin Close; post-Match → admin handoff or exceptional cancellation) | Yes | FR-5, FR-21, FR-42, FR-45, glossary §3.1 |
| Audit events 18/19 record `determined_by` (Lost-report owner) and `recorded_by` (acting administrator) | Yes | FR-48 events 18, 19 |
| FR-48 events 15-30 cover the full Lost-side audit trail; Event 26 is parent/batch Lost-report Returned; Event 30 is individual matched selected response Completed — Report Returned | Yes | FR-48 |
| FR-31 event 10 records Found report ID, previous Found-report lifecycle status, and closure reason for Found-side administrator Close | Yes | FR-31 event 10 |
| FR-48 event 24 records Lost report ID, prior Lost-report lifecycle status, and closure reason for normal Lost-side administrator Close; FR-48 event 25 records exceptional post-Match Confirmed cancellation with prior selected response ID | Yes | FR-48 events 24, 25 |
| Auto-rejection of Pending Claims distinguishes three triggers: D3 (another-claim-approved), FR-11 (reporter withdrawal), FR-21/FR-36 (admin closure); each carries its own audit reason | Yes | FR-17, FR-31 event 5, FR-29 |
| UJ-1 Lost-report cleanup is an explicit manual reporter Withdraw action; no automatic Lost↔Found linkage | Yes | UJ-1 step 10, FR-11, FR-49 |

**Deferred decisions resolved (full set):**
- D1 (contact/facilitation — Found-side) — Per-claim message thread. FR-26.
- D2 (sensitive info and anonymous summary fields) — FR-37 (Sensitive Fields set), FR-38 (anonymous-only public summary), FR-39 (authenticated detail visibility matrix).
- D3 (competing claims UX) — Approve-one-auto-reject-others. FR-17.
- D4 (admin registration-review process) — Queue with Approve / Reject-with-reason. FR-3.
- D5 (listing partition) — My Reports vs. Browse. FR-49.
- D6 (per-Recovery-Response message thread) — Thread is per Recovery Response, not per Lost report. FR-47.
- D7 (Recovery Response selection is provisional and reversible until the currently selected response reaches Not a Match; Standby is a derived/display condition only). FR-41, FR-43, FR-45.
- D8 (member participation views) — `My Reports` (authored reports) / `Browse` (other members' reports) / `My Claims` (member's submitted Claims on other members' Found reports) / `My Recovery Responses` (member's submitted Recovery Responses on other members' Lost reports). FR-49.

**Out-of-scope items preserved unchanged:** See §5. Notably, automatic match suggestions, in-app notifications, real-time chat, identity verification, proof-of-ownership uploads, cross-organization sharing, and native mobile apps remain out of scope. The unsupported notification channels and event types are enumerated in FR-30.

**Contradictions with the brief:** None. The PRD's authoritative decisions and normative requirements are consistent with the locked Product Brief.

**Missing locked requirements:** None. All original-brief items and all revision-2 brief items are resolved in the PRD. The canonical `Completed — Report Returned` status implements the brief's requirement that the administrator confirms physical Returned after the owner confirms the match. The Lost-report-owner deactivation handling implements the brief's `Active → Deactivated` lifecycle combined with the verification responsibility. The `determined_by`/`recorded_by` audit fields implement the brief's record-keeping requirement.

**Unresolved deferred decisions:** None. All eight deferred items (D1 through D8) are resolved. OQ-4 is retired into §8.1 Resolved / Retired Questions because the answer was already provided by FR-26.

**Accidental scope expansion:** None. Recovery Response, per-Recovery-Response messaging, the listing partition, the five Recovery Response email events, the Items-in-Verification queue, `Completed — Report Returned`, the `determined_by`/`recorded_by` audit fields, and the Lost-report-owner deactivation paths are all implementation consequences of the locked brief's verification responsibility, reporting requirements, and audit requirements, and are not scope additions.

**Brief items addressed by this revision:** Member Profile (Brief `Login, logout, and member profile`) is added as FR-52, and Administrator report editing (Brief `moderate, edit, close, or remove reports … detailed rules and lifecycle constraints will be defined in the PRD`) is added as FR-53. With these additions, all brief-level requirements are now represented in the PRD.