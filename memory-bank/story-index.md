# Global Story Index

## Overview

- **Intent**: `001-findback-lost-and-found`
- **Total stories**: 63
- **Generated**: 63 ✅ GENERATED
- **Units**: 7
- **Functional requirements traced**: 53 / 53 (each owned by exactly one unit)
- **Last updated**: 2026-10-23T12:55:00Z

---

## Stories by Unit

### `001-identity-and-access`  (10 stories)

- [x] **001-self-registration** (must) GENERATED - to register an account with my name, email, password, and self-declared role
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/001-self-registration.md` | traces: FR-1
- [x] **002-administrator-review-of-registrations** (must) GENERATED - to approve or reject pending registrations
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/002-administrator-review-of-registrations.md` | traces: FR-3, FR-27
- [x] **003-login-with-active-account** (must) GENERATED - to log in with my email and password
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/003-login-with-active-account.md` | traces: FR-2, FR-4
- [x] **004-deactivate-an-account** (must) GENERATED - to deactivate a member's account
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/004-deactivate-an-account.md` | traces: FR-5
- [x] **005-logout-revokes-session** (must) GENERATED - to log out
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/005-logout-revokes-session.md` | traces: FR-4
- [x] **006-pending-member-restricted-access** (must) GENERATED - unapproved members cannot participate in FindBack
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/006-pending-member-restricted-access.md` | traces: FR-2
- [x] **007-owner-rejects-registration** (must) GENERATED - to record why a registration was rejected
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/007-owner-rejects-registration.md` | traces: FR-3
- [x] **008-reset-request-never-discloses-account** (must) GENERATED - to request a password reset link
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/008-reset-request-never-discloses-account.md` | traces: FR-51
- [x] **009-reset-password** (must) GENERATED - to set a new password
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/009-reset-password.md` | traces: FR-51
- [x] **010-update-member-profile** (must) GENERATED - to view and edit my profile
  <br>`intents/001-findback-lost-and-found/units/001-identity-and-access/stories/010-update-member-profile.md` | traces: FR-52

### `002-reporting-and-listings`  (13 stories)

- [x] **001-create-lost-item-report** (must) GENERATED - to file a Lost item report
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/001-create-lost-item-report.md` | traces: FR-6, FR-8
- [x] **002-create-found-item-report** (must) GENERATED - to file a Found item report
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/002-create-found-item-report.md` | traces: FR-7, FR-8
- [x] **003-validate-report-field-set** (must) GENERATED - my report validated against the authoritative field set
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/003-validate-report-field-set.md` | traces: FR-8
- [x] **004-edit-own-report** (must) GENERATED - to correct my own report while it is active
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/004-edit-own-report.md` | traces: FR-9, FR-19
- [x] **005-delete-own-report** (must) GENERATED - to delete my own report
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/005-delete-own-report.md` | traces: FR-10
- [x] **006-withdraw-own-report** (must) GENERATED - to withdraw my own report
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/006-withdraw-own-report.md` | traces: FR-11, FR-20
- [x] **007-public-summary-listing** (must) GENERATED - to browse a paginated summary of Lost and Found reports
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/007-public-summary-listing.md` | traces: FR-12, FR-38
- [x] **008-authenticated-detail-view** (must) GENERATED - to open a report's detail page from a listing
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/008-authenticated-detail-view.md` | traces: FR-13
- [x] **009-search-and-filter** (must) GENERATED - to search and narrow the combined pool of reports
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/009-search-and-filter.md` | traces: FR-14
- [x] **010-visibility-matrix-by-actor** (must) GENERATED - to see exactly the fields my relationship to that item permits
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/010-visibility-matrix-by-actor.md` | traces: FR-39, FR-37
- [x] **011-member-facing-view-partition** (must) GENERATED - my authored reports, other members' reports, my Claims, and my Recovery Responses in separate views
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/011-member-facing-view-partition.md` | traces: FR-49
- [x] **012-administrator-edit-report** (must) GENERATED - to correct a report's content and metadata on a non-terminal report
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/012-administrator-edit-report.md` | traces: FR-53
- [x] **013-attach-image-to-report** (must) GENERATED - an image attached to a report and delivered privately
  <br>`intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/013-attach-image-to-report.md` | traces: FR-8

### `003-found-side-claims`  (8 stories)

- [x] **001-submit-a-claim** (must) GENERATED - to submit a claim with my reason, my identifying details, and the date I lost it
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/001-submit-a-claim.md` | traces: FR-15
- [x] **002-administrator-claim-review** (must) GENERATED - a review screen that shows a pending claim beside the item details and any competing pending claims
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/002-administrator-claim-review.md` | traces: FR-16
- [x] **003-approve-a-claim** (must) GENERATED - approving a claim to approve that claim, auto-reject every competing pending claim, and move the report to `Claim Approved` as one indivisible action
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/003-approve-a-claim.md` | traces: FR-17
- [x] **004-reject-a-claim** (must) GENERATED - to reject a pending claim with a reason
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/004-reject-a-claim.md` | traces: FR-18
- [x] **005-auto-status-transitions** (must) GENERATED - the report's lifecycle status to change automatically and predictably as claims are submitted and decided
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/005-auto-status-transitions.md` | traces: FR-22
- [x] **006-auto-reject-competing-claims** (must) GENERATED - every automatic claim rejection to record which of the three workflow triggers caused it
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/006-auto-reject-competing-claims.md` | traces: FR-17
- [x] **007-per-claim-message-thread** (must) GENERATED - one message thread per claim that closes when the claim is decided
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/007-per-claim-message-thread.md` | traces: FR-26
- [x] **008-claim-notification-emails** (must) GENERATED - an email when a claim arrives on my item and when my own claim is decided
  <br>`intents/001-findback-lost-and-found/units/003-found-side-claims/stories/008-claim-notification-emails.md` | traces: FR-28, FR-29

### `004-lost-side-recovery`  (8 stories)

- [x] **001-submit-a-recovery-response** (must) GENERATED - to respond to a Lost report describing where I found it
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/001-submit-a-recovery-response.md` | traces: FR-40, FR-44
- [x] **002-recovery-response-status-model** (must) GENERATED - the Lost-side state machine is unambiguous and cannot drift
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/002-recovery-response-status-model.md` | traces: FR-41
- [x] **003-owner-provisional-selection** (must) GENERATED - to select one Recovery Response for verification
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/003-owner-provisional-selection.md` | traces: FR-42, FR-43
- [x] **004-owner-determination-admin-records** (must) GENERATED - my decision on a candidate recorded on my behalf by an administrator
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/004-owner-determination-admin-records.md` | traces: FR-43, FR-48
- [x] **005-lost-report-lifecycle** (must) GENERATED - my Lost report to move through its lifecycle correctly
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/005-lost-report-lifecycle.md` | traces: FR-42
- [x] **006-per-recovery-response-thread** (must) GENERATED - a private message thread on my own Recovery Response
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/006-per-recovery-response-thread.md` | traces: FR-47
- [x] **007-responder-withdraws-response** (must) GENERATED - to withdraw my Recovery Response
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/007-responder-withdraws-response.md` | traces: FR-40
- [x] **008-recovery-response-audit-events** (must) GENERATED - every Lost-side recovery action recorded in the audit trail
  <br>`intents/001-findback-lost-and-found/units/004-lost-side-recovery/stories/008-recovery-response-audit-events.md` | traces: FR-48

### `005-returns-and-handover`  (7 stories)

- [x] **001-confirm-returned-default-receiver** (must) GENERATED - to confirm that an item was physically returned
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/001-confirm-returned-default-receiver.md` | traces: FR-23
- [x] **002-confirm-returned-substitute-receiver** (must) GENERATED - to record who actually received an item when it was not the default receiver
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/002-confirm-returned-substitute-receiver.md` | traces: FR-24
- [x] **003-no-receiver-no-returned-guard** (must) GENERATED - no item is ever marked recovered without someone being answerable for it
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/003-no-receiver-no-returned-guard.md` | traces: FR-25
- [x] **004-complete-lost-verification-closeout** (must) GENERATED - confirming a Lost return to resolve every recovery response at once
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/004-complete-lost-verification-closeout.md` | traces: FR-45
- [x] **005-close-report** (must) GENERATED - to close a report that should not proceed
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/005-close-report.md` | traces: FR-21
- [x] **006-remove-inappropriate-content** (must) GENERATED - to remove inappropriate content while preserving the record of it
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/006-remove-inappropriate-content.md` | traces: FR-36
- [x] **007-lost-side-notification-events** (must) GENERATED - to be told what happens to my response
  <br>`intents/001-findback-lost-and-found/units/005-returns-and-handover/stories/007-lost-side-notification-events.md` | traces: FR-46

### `006-audit-and-observability`  (6 stories)

- [x] **001-append-only-audit-writes** (must) GENERATED - the trail is complete by construction rather than by diligence
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/001-append-only-audit-writes.md` | traces: FR-31
- [x] **002-lost-side-audit-events** (must) GENERATED - every Lost-side recovery action recorded with its numbers intact
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/002-lost-side-audit-events.md` | traces: FR-31, FR-48
- [x] **003-non-numbered-audit-records** (must) GENERATED - the frozen event catalog stays intact while the record stays complete
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/003-non-numbered-audit-records.md` | traces: FR-31
- [x] **004-append-only-enforcement** (must) GENERATED - the trail remains trustworthy for as long as it exists
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/004-append-only-enforcement.md` | traces: FR-31
- [x] **005-audit-visibility-and-read-logging** (must) GENERATED - reading it is itself accountable
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/005-audit-visibility-and-read-logging.md` | traces: FR-32
- [x] **006-operational-logging-and-quota** (must) GENERATED - I can tell what happened and know before a free-tier limit stops the app
  <br>`intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/006-operational-logging-and-quota.md` | traces: FR-31

### `007-web-surfaces`  (11 stories)

- [x] **001-design-foundations-and-theme** (must) GENERATED - one shared token layer, layout shell, and theme control
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/001-design-foundations-and-theme.md` | traces: FR-30
- [x] **002-public-and-authentication-surfaces** (must) GENERATED - ten clear public and authentication surfaces
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/002-public-and-authentication-surfaces.md` | traces: FR-1, FR-2, FR-4, FR-51, FR-27
- [x] **003-member-view-shell-and-navigation** (must) GENERATED - four disjoint participation views and a shell that navigates only between entry points
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/003-member-view-shell-and-navigation.md` | traces: FR-49
- [x] **004-item-detail-by-relationship** (must) GENERATED - the detail page rendered for exactly my relationship to that item
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/004-item-detail-by-relationship.md` | traces: FR-39, FR-13, FR-37
- [x] **005-report-forms-and-member-actions** (must) GENERATED - to create, edit, delete, or withdraw a report with the correct actions offered at the correct lifecycle point
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/005-report-forms-and-member-actions.md` | traces: FR-6, FR-7, FR-8, FR-9, FR-11, FR-10
- [x] **006-claim-and-recovery-threads** (must) GENERATED - Claim and Recovery Response forms and their message threads
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/006-claim-and-recovery-threads.md` | traces: FR-47, FR-26, FR-15, FR-40
- [x] **007-administrator-dashboard** (must) GENERATED - a dashboard that shows me four queue entry points with live counts
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/007-administrator-dashboard.md` | traces: FR-33
- [x] **008-administrator-queues** (must) GENERATED - four working queues that each list exactly their own work and link into it
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/008-administrator-queues.md` | traces: FR-34, FR-35, FR-50
- [x] **009-no-other-notifications** (must) GENERATED - to prove that no in-app notification stream exists anywhere in the interface
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/009-no-other-notifications.md` | traces: FR-30
- [x] **010-contextual-audit-views** (must) GENERATED - that item's audit trail at its own URL
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/010-contextual-audit-views.md` | traces: FR-31, FR-32
- [x] **011-accessibility-and-secure-image-delivery** (must) GENERATED - every surface to meet WCAG 2.1 AA and every image to be authorized at the server before it is read
  <br>`intents/001-findback-lost-and-found/units/007-web-surfaces/stories/011-accessibility-and-secure-image-delivery.md` | traces: FR-37, FR-39

---

## Stories by Status

- **Planned**: 0
- **Generated**: 63
- **In Progress**: 0
- **Completed**: 0

## Traceability Notes

- Every one of the 53 FRs is owned by exactly **one** unit. No FR is double-owned.
- Frontend stories carry `traces_to: []` with `realizes_fr: [...]` where the requirement
  is owned by a domain unit but rendered here. Ownership stays unambiguous while the link
  to what the story actually implements is preserved.
- Every story file is `status: draft`. None is `ready` until Checkpoint 3 review.

---

## Status

All 63 stories are `draft`. Checkpoint 3 review is required before any story moves to
`ready` or is assigned to a bolt.
