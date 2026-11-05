/**
 * The user-facing copy for the administrator surfaces.
 *
 * **Every string here is verbatim from `EXPERIENCE.md`.** The file is the
 * single place that copy lives for these surfaces, so a wording change is
 * one edit in one file, and the copy cannot drift between a page and the
 * test that asserts it — the same discipline `copy.ts` follows for the
 * public and authentication surfaces.
 *
 * ## Where each string comes from
 *
 * | Constant | EXPERIENCE.md |
 * |---|---|
 * | `ADMIN_ACCESS_MESSAGE` | §15.6 |
 * | `ADMIN_DASHBOARD_HEADING` | §15.1 |
 * | `ALL_CAUGHT_UP` | §15.1 |
 * | `PENDING_REGISTRATIONS_EMPTY` | §15.2 |
 * | `PENDING_REGISTRATIONS_EMPTY_NOTE` | §15.2 |
 * | `PENDING_CLAIMS_EMPTY` | §15.3 |
 * | `NO_ITEMS_AWAITING_RETURN` | §15.4 |
 * | `NO_ITEMS_IN_VERIFICATION` | §15.5 |
 * | `TRY_AGAIN`, `GO_BACK` | §5.14 |
 * | `SHOW_DETAILS`, `LOAD_OLDER` | §17.2, UX-OQ-C |
 * | `ADMIN_NAV_LABEL` | §3.2 |
 *
 * ## The forbidden phrasings are not here
 *
 * §4.7 names three phrasings the Lost-side verification surface must never
 * use — *"Administrator confirms ownership"*, *"Administrator decides
 * match"*, and *"Verify ownership"* — because they imply the administrator
 * decides ownership rather than recording the owner's determination.
 *
 * They are **absent from this file on purpose.** A string that is not
 * declared cannot be rendered, and the absence is asserted by the test that
 * greps the rendered surface for them.
 */

/* -------------------------------------------------------------------------- */
/* Permission — §15.6                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The administrator-only access screen's message.
 *
 * §15.6, verbatim: *"Non-administrator hitting `/admin/*` routes sees the
 * access screen (Section 4.5), but the message can be more specific: 'This
 * area is for administrators only.'"*
 */
export const ADMIN_ACCESS_MESSAGE = 'This area is for administrators only.';

/** The access screen's heading. */
export const ADMIN_ACCESS_HEADING = 'Not available to you';

/* -------------------------------------------------------------------------- */
/* Dashboard — §15.1                                                            */
/* -------------------------------------------------------------------------- */

/** The administrator dashboard's heading. */
export const ADMIN_DASHBOARD_HEADING = 'Administrator';

/** The welcome card's eyebrow. From the generated admin dashboard mockup. */
export const OPERATIONS_CONSOLE = 'Operations console';

/** The welcome card's role badge. */
export const ADMINISTRATOR_BADGE = 'Administrator';

/** The welcome card's meta line, before the date. */
export const ADMIN_DASHBOARD_META = 'Administrator dashboard';

/** The heading above the four queue cards. */
export const REVIEW_WORKLOAD = 'Review workload';

/**
 * The empty tile's copy.
 *
 * §15.1, verbatim: *"If all counts are zero, each tile shows 'All caught
 * up.' with a subtle check icon."*
 */
export const ALL_CAUGHT_UP = 'All caught up.';

/**
 * The dashboard's own empty notice.
 *
 * **The dashboard has no empty state of its own.** §15.1 puts the copy on
 * the *tiles*, and the story's criterion is that a tile shows `All caught
 * up.` — so there is no dashboard-level banner. The constant exists only
 * so a test can assert that the dashboard never renders a block-level
 * empty notice.
 */
export const ADMIN_DASHBOARD_EMPTY_NOTICE = '';

/* -------------------------------------------------------------------------- */
/* Queues — §15.2–§15.5                                                        */
/* -------------------------------------------------------------------------- */

/** The Pending Registrations queue's empty state. §15.2, verbatim. */
export const PENDING_REGISTRATIONS_EMPTY = 'No pending registrations.';

/**
 * The Pending Registrations queue's empty-state note.
 *
 * §15.2, verbatim: *"plus a one-line note: 'When someone new registers,
 * they appear here.'"*
 */
export const PENDING_REGISTRATIONS_EMPTY_NOTE = 'When someone new registers, they appear here.';

/** The Pending Claims queue's empty state. §15.3, verbatim. */
export const PENDING_CLAIMS_EMPTY = 'No pending claims.';

/** The Items Awaiting Return queue's empty state. §15.4, verbatim. */
export const NO_ITEMS_AWAITING_RETURN = 'No items are awaiting return.';

/** The Items in Verification queue's empty state. §15.5, verbatim. */
export const NO_ITEMS_IN_VERIFICATION = 'No items are in verification.';

/* -------------------------------------------------------------------------- */
/* Queue actions — §15.2–§15.5                                                */
/* -------------------------------------------------------------------------- */

/** The Pending Registrations queue's approve action. */
export const APPROVE = 'Approve';

/** The Pending Registrations queue's reject action. */
export const REJECT = 'Reject';

/** The Pending Claims queue's review action. */
export const REVIEW = 'Review';

/** The Items Awaiting Return queue's action. */
export const CONFIRM_RETURNED = 'Confirm Returned';

/** The Items in Verification queue's action. */
export const MANAGE_VERIFICATION = 'Manage verification';

/** Shown after the owner’s match is recorded — the next step is physical return. */
export const VERIFICATION_MATCH_CONFIRMED_LEDE =
  'The owner confirmed a match. Confirm returned when the physical handoff is complete.';

/** Link to the substitute-receiver return form (FR-24). */
export const LOST_RETURN_SUBSTITUTE_LINK = 'Someone else received the item';

/* -------------------------------------------------------------------------- */
/* Lost verification review — BMAD mockup 15                                 */
/* -------------------------------------------------------------------------- */

export const VERIFICATION_BREADCRUMB_QUEUE = 'Items in verification';

export const VERIFICATION_REVIEW_HEADING = 'Verification review';

export const VERIFICATION_LOST_REPORT_SECTION = 'Lost report';

export const VERIFICATION_RESPONSES_SECTION = 'Recovery responses';

export const VERIFICATION_ACTIONS_SECTION = 'Verification actions';

export const VERIFICATION_ACTIONS_HELP =
  'The owner determines whether this is a match. You record the outcome after confirming with the owner in person. If the owner has not decided yet, leave this report in verification pending.';

export const VERIFICATION_RECORD_MATCH =
  "Record Match Confirmed (owner says it's theirs)";

export const VERIFICATION_RECORD_NOT_MATCH =
  "Record Not a Match (owner says it's not theirs)";

export const VERIFICATION_MATCH_CONFIRM_MODAL =
  'Record that the owner confirmed this is their item? The recovery response will move to Match Confirmed and the report stays in verification pending until the handoff is complete.';

export const VERIFICATION_NOT_MATCH_MODAL =
  'Record that the owner said this is not their item? The recovery response will move to Not a Match and the report will return to Open.';

export const VERIFICATION_SELECTED_RESPONSE_SECTION =
  'Currently selected recovery response';

export const VERIFICATION_NO_RESPONSES = 'No recovery responses submitted yet.';

export const VERIFICATION_NO_SELECTED =
  'No recovery response has been selected for verification yet.';

export const VERIFICATION_BACK_TO_QUEUE = 'Back to queue';

/* -------------------------------------------------------------------------- */
/* Confirm returned — §15.4 / mockups 10–11                                   */
/* -------------------------------------------------------------------------- */

/** Breadcrumb label for the Items Awaiting Return queue. */
export const AWAITING_RETURN_BREADCRUMB_QUEUE = 'Items awaiting return';

export const CONFIRM_RETURN_PAGE_HEADING = 'Confirm returned';

export const CONFIRM_RETURN_DEFAULT_RECEIVER_FOUND =
  'The default receiver is the approved claimant. Confirm when they have the item, or use the substitute option if someone else collected it on their behalf.';

export const CONFIRM_RETURN_DEFAULT_RECEIVER_LOST =
  'The default receiver is the Lost-report owner. Confirm when they have the item, or use the substitute option if someone else received it.';

export const CONFIRM_RETURN_WHAT_HAPPENS_HEADING = 'This will:';

export const CONFIRM_RETURN_WHAT_HAPPENS_ITEMS = [
  'Record you as the confirming administrator',
  'Record who received the item',
  'Move the report to Returned (terminal)',
  'Add an entry to the audit trail',
] as const;

export const CONFIRM_RETURN_SUBSTITUTE_SECTION = 'Substitute receiver';

export const CONFIRM_RETURN_SUBSTITUTE_CHECKBOX =
  'Someone other than the default receiver received the item';

export const CONFIRM_RETURN_MATCHED_RESPONSE_SECTION = 'Matched recovery response';

/**
 * The registration rejection's reason label.
 *
 * The modal's reason field. §15.2 requires **at least 5 characters**.
 */
export const REJECTION_REASON_LABEL = 'Reason';

/**
 * The registration rejection's reason hint.
 *
 * **The 5-character minimum, stated in the surface.** §15.2's "reason
 * modal, ≥ 5 chars" is a rule the administrator needs to know before they
 * type, not only after they are refused.
 */
export const REJECTION_REASON_HINT = 'Give at least 5 characters of reason.';

/**
 * The reason that is too short.
 *
 * **The same rule the server enforces,** stated in the surface so the
 * administrator is not refused without an explanation.
 */
export const REJECTION_REASON_TOO_SHORT = 'The reason must be at least 5 characters.';

/* -------------------------------------------------------------------------- */
/* Registration review — BMAD mockups 03 / 04                                 */
/* -------------------------------------------------------------------------- */

export const REGISTRATION_BREADCRUMB_QUEUE = 'Pending registrations';

export const REGISTRATION_APPROVE_HEADING = 'Approve registration';

export const REGISTRATION_REJECT_HEADING = 'Reject registration';

export const REGISTRATION_APPROVE_ACCOUNT = 'Approve account';

export const REGISTRATION_REJECT_ACCOUNT = 'Reject account';

export const REGISTRATION_ALREADY_REVIEWED =
  'This application was already reviewed or is no longer pending.';

export const REGISTRATION_APPROVE_INFO_HEADING = 'Approving will:';

export function REGISTRATION_APPROVE_INFO_AUDIT(administratorName: string): string {
  return `Record this action in the audit trail (actor: ${administratorName})`;
}

export const REGISTRATION_REJECT_REASON_LABEL = 'Rejection reason';

export const REGISTRATION_REJECT_REASON_PLACEHOLDER =
  'At least 5 characters. Recorded in the audit trail but not shown to the rejected user.';

export const REGISTRATION_REJECT_REASON_HELP =
  'The user sees a generic "your account is not active" message. They don\'t see this reason.';

export const REGISTRATION_REJECT_REASON_REQUIRED = 'Rejection reason is required.';

/* -------------------------------------------------------------------------- */
/* Claim review — BMAD mockups 06 / 08                                         */
/* -------------------------------------------------------------------------- */

export const CLAIM_BREADCRUMB_QUEUE = 'Pending claims';

export const CLAIM_REVIEW_HEADING = 'Review claim';

export const CLAIM_REVIEW_ITEM_PHOTO = 'Item photo';

export const CLAIM_APPROVE_HEADING = 'Approve this claim';

export const CLAIM_REJECT_HEADING = 'Reject this claim';

export const CLAIM_APPROVE_CONFIRM = 'Confirm approval';

export const CLAIM_REJECT_CONFIRM = 'Confirm rejection';

export const CLAIM_APPROVE_THIS = 'Approve this claim';

export const CLAIM_REJECT_THIS = 'Reject this claim';

export const CLAIM_NO_LONGER_PENDING = 'This claim is no longer pending.';

/** Shown when approve/reject loses a race (HTTP 409) — §6.4. */
export const CLAIM_DECISION_CONFLICT_HEADING = 'This claim can no longer be decided';

export const CLAIM_DECISION_FORM_ERROR_HEADING = 'Check the form';

export const ADMIN_CLAIM_ACTION_FAILED =
  'Something went wrong on our side. Try again, or come back in a moment.';

export const CLAIM_REJECT_REASON_LABEL = 'Rejection reason';

export const CLAIM_REJECT_REASON_PLACEHOLDER =
  '10–500 characters. The claimant will see this in their rejection email.';

export const CLAIM_REJECT_REASON_HELP =
  'Visible to the claimant in the rejection email and recorded in the audit trail.';

export const CLAIM_REJECT_REASON_REQUIRED = 'Rejection reason is required.';

export const CLAIM_REJECT_REASON_TOO_SHORT =
  'Rejection reason must be at least 10 characters.';

export const CLAIM_REJECT_REASON_TOO_LONG =
  'Rejection reason must be at most 500 characters.';

export const CLAIM_COMPETING_NONE =
  'No competing claims. Approving will move the item to Claim Approved.';

export const CLAIM_APPROVE_INFO_HEADING = 'This approval will:';

/* -------------------------------------------------------------------------- */
/* Column headings — §15.2–§15.5, §5.7                                        */
/* -------------------------------------------------------------------------- */

/** The name column's heading. */
export const COLUMN_NAME = 'Name';

/** The email column's heading. */
export const COLUMN_EMAIL = 'Email';

/** The self-declared-role column's heading. */
export const COLUMN_ROLE = 'Self-declared role';

/** The registered-at column's heading. */
export const COLUMN_REGISTERED_AT = 'Registered';

/** The claim-id column's heading. */
export const COLUMN_CLAIM_ID = 'Claim ID';

/** The item column's heading. */
export const COLUMN_ITEM = 'Item';

/** Report type on the Items Awaiting Return queue (Found or Lost). */
export const COLUMN_REPORT_TYPE = 'Type';

/** The claimant column's heading. */
export const COLUMN_CLAIMANT = 'Claimant';

/** Default receiver on the Items Awaiting Return queue. */
export const COLUMN_RECEIVER = 'Receiver';

/** The submitted-at column's heading. */
export const COLUMN_SUBMITTED_AT = 'Submitted';

/** The approved-at column's heading. */
export const COLUMN_APPROVED_AT = 'Approved';

/** The report column's heading — the Lost report's name. */
export const COLUMN_REPORT = 'Report';

/** The report status column on the Items in Verification queue. */
export const COLUMN_REPORT_STATUS = 'Status';

/** The owner column's heading. */
export const COLUMN_OWNER = 'Owner';

/** The selected-responder column's heading. */
export const COLUMN_SELECTED_RESPONDER = 'Selected responder';

/** The verification-started-at column's heading. */
export const COLUMN_VERIFICATION_STARTED_AT = 'Verification started';

/** The action column's heading. */
export const COLUMN_ACTION = 'Action';

/** The timestamp column's heading — the audit trail's table. §17.2. */
export const COLUMN_TIMESTAMP = 'Timestamp';

/** The actor column's heading — the audit trail's table. §17.2. */
export const COLUMN_ACTOR = 'Actor';

/** The action column's heading — the audit trail's table. §17.2. */
export const COLUMN_AUDIT_ACTION = 'Action';

/** The target column's heading — the audit trail's table. §17.2. */
export const COLUMN_TARGET = 'Target';

/** The details column's heading — the audit trail's table. §17.2. */
export const COLUMN_DETAILS = 'Details';

/* -------------------------------------------------------------------------- */
/* Audit trail — §17.2, UX-OQ-C                                                */
/* -------------------------------------------------------------------------- */

/** The audit trail's heading. */
export const AUDIT_TRAIL_HEADING = 'Audit trail';

/** Link label — contextual audit for one report (§17.1). */
export const VIEW_AUDIT_TRAIL = 'View audit trail';

/** When the embedded trail is truncated to one page. */
export const OPEN_FULL_AUDIT_TRAIL = 'Open full audit trail';

/** Hint below embedded audit when older events live on the full trail page. */
export const EMBEDDED_AUDIT_MORE_ON_FULL_PAGE =
  'More events are on the full audit trail page.';

/** Audit block on the Lost verification review screen. */
export const VERIFICATION_AUDIT_SECTION = 'Audit trail';

/** Shown on the audit page after a successful handoff confirmation. */
export const AUDIT_AFTER_RETURN_LEDE =
  'The return confirmation and related lifecycle events appear below.';

/**
 * The disclosure's label.
 *
 * §17.2: *"These render as a small expandable row ('Show details') so the
 * audit trail stays scannable."* **Collapsed by default.**
 */
export const SHOW_DETAILS = 'Show details';

/**
 * The `Load older` button's label.
 *
 * UX-OQ-C and §17: pagination is a button, **not infinite scroll** —
 * infinite scroll "confuses screen readers and makes an administrator's
 * position in the list unrecoverable."
 */
export const LOAD_OLDER = 'Load older';

/** The audit trail's empty state. */
export const NO_AUDIT_EVENTS = 'There are no events for this item yet.';

/**
 * The member-facing status history's disclosure label.
 *
 * §17.5: a member sees a short status history and **no control or
 * disclosure exposes the full Administrator audit trail.**
 */
export const STATUS_HISTORY_LABEL = 'Status history';

/* -------------------------------------------------------------------------- */
/* Loading, error — §5.14, §15.6                                               */
/* -------------------------------------------------------------------------- */

/**
 * The error state's primary action.
 *
 * §5.14: *"Calm headline, sentence body, 'Try again' as primary, 'Go
 * back' as secondary. No stack traces."*
 */
export const TRY_AGAIN = 'Try again';

/** The error state's secondary action. */
export const GO_BACK = 'Go back';

/**
 * The loading state's text.
 *
 * The skeleton is visual; this is the screen-reader announcement that
 * accompanies it.
 */
export const LOADING = 'Loading…';

/* -------------------------------------------------------------------------- */
/* Navigation — §3.2                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The administrator nav layer's label.
 *
 * §3.2: *"A second nav layer under the member nav exposes `Admin ▾`
 * containing the four operational queues plus `Accounts`."*
 */
export const ADMIN_NAV_LABEL = 'Admin';

/** The administrator nav's dashboard entry. */
export const ADMIN_NAV_DASHBOARD = 'Dashboard';

/**
 * The administrator nav layer's queue items.
 *
 * **The four operational queues only**, labelled the way the generated
 * mockup labels them. Audit is **not** among them (§15.1, §17.1).
 */
export const ADMIN_NAV_ITEMS = Object.freeze([
  'Registrations',
  'Claims',
  'Awaiting return',
  'In verification',
] as const);

/** Handoff history — not one of the four operational queues. */
export const ADMIN_NAV_RETURNED = 'Returned items';

export const ADMIN_RETURNED_HEADING = 'Returned items';

export const ADMIN_RETURNED_LEDE =
  'Physical handoffs recorded on the system. Open a row to see who reported the item, who received it, and every claim or recovery response on that report.';

export const ADMIN_RETURNED_EMPTY = 'No returned items yet.';

export const COLUMN_REPORTER = 'Reporter';

export const COLUMN_RETURNED_AT = 'Returned';

export const VIEW_RECORD = 'View record';

export const ADMIN_TRACK_HEADING = 'Item record';

export const ADMIN_TRACK_REPORTER_HEADING = 'Who reported';

export const ADMIN_TRACK_RETURN_HEADING = 'Return confirmation';

export const ADMIN_TRACK_RECEIVER_HEADING = 'Who received the item';

export const ADMIN_TRACK_CLAIMS_HEADING = 'Claims on this item';

export const ADMIN_TRACK_RESPONSES_HEADING = 'Recovery responses on this item';
