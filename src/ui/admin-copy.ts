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

/** The claimant column's heading. */
export const COLUMN_CLAIMANT = 'Claimant';

/** The submitted-at column's heading. */
export const COLUMN_SUBMITTED_AT = 'Submitted';

/** The approved-at column's heading. */
export const COLUMN_APPROVED_AT = 'Approved';

/** The report column's heading — the Lost report's name. */
export const COLUMN_REPORT = 'Report';

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
