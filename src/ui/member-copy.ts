/**
 * The user-facing copy for the member surfaces.
 *
 * **Every string here is verbatim from `EXPERIENCE.md`.** The same rule the
 * public surfaces' `copy.ts` follows, and for the same reason: a string
 * transcribed into a component is a second copy that can drift from the
 * test that asserts it. So the copy lives in one module, the surface
 * renders it, and the test asserts it.
 *
 * ## Where each string comes from
 *
 * | Constant | EXPERIENCE.md |
 * |---|---|
 * | `MY_REPORTS_HEADING`, `BROWSE_HEADING`, … | §9.4 |
 * | `REPORT_LOST_HEADING`, `REPORT_FOUND_HEADING` | §10.1, §10.2 |
 * | `REPORT_FORM_LOST_DESCRIPTION`, `REPORT_FORM_FOUND_DESCRIPTION` | §10.2 |
 * | `REQUIRED_FIELDS_HEADING`, `OPTIONAL_FIELDS_HEADING` | §10.2 |
 * | `SUBMIT_REPORT`, `CANCEL`, `EDIT`, `DELETE`, `WITHDRAW` | §10.2, §10.4 |
 * | `HIDDEN_FROM_OTHER_MEMBERS`, `SENSITIVE_HELPER` | §11.1, §11.4 |
 * | `SUBMIT_CLAIM`, `I_MAY_HAVE_FOUND_THIS_ITEM` | §12.1, §9.6 |
 * | `CLAIM_SUBMITTED_BODY` | §12.1 |
 * | `THREAD_EMPTY`, `THREAD_PERMISSION_DENIED`, … | §13.4 |
 * | `STATUS_HELPERS` | §4.3, §4.5, §4.6 |
 * | `SERVER_ERROR_MESSAGE` | §4.9 |
 *
 * ## What is deliberately *not* here
 *
 * The **read-only thread notices** are not here — they live in
 * `src/domain/listings/thread-read-only-notice.ts`, because they are
 * derived from a decision the domain makes and the two families' notices
 * must not drift. The **delete and withdraw confirmation copy** is not here
 * either — it lives in `src/domain/listings/report-lifecycle-messages.ts`,
 * for the same reason. A second copy of either would be a second answer to
 * the same question.
 */

/* -------------------------------------------------------------------------- */
/* The report type's own label — §4.2                                          */
/* -------------------------------------------------------------------------- */

/**
 * The report type, as the copy module names it.
 *
 * **The label is not the type.** §4.2's canonical vocabulary gives the
 * user-facing label as `Lost item` / `Found item`; the type itself is
 * `Lost` / `Found`. This alias exists so the copy module can talk about
 * the type without importing the domain's vocabulary.
 */
export type ReportTypeForCopy = 'Lost' | 'Found';

/**
 * The label for a report type.
 *
 * §4.2: `Lost item`, `Found item`.
 */
export function reportTypeLabel(type: ReportTypeForCopy): string {
  return type === 'Lost' ? 'Lost item' : 'Found item';
}

/* -------------------------------------------------------------------------- */
/* The four views — §9.4                                                        */
/* -------------------------------------------------------------------------- */

/** The `My Reports` heading (nav and document title). */
export const MY_REPORTS_HEADING = 'My Reports';

/** The My reports page title — mockup `08-my-reports`. */
export const MY_REPORTS_PAGE_TITLE = 'My reports';

/** My reports filter card heading. */
export const MY_REPORTS_FILTER_LABEL = 'Filter';

/** My reports table column headers. */
export const MY_REPORTS_TABLE_ITEM = 'Item';
export const MY_REPORTS_TABLE_TYPE = 'Type';
export const MY_REPORTS_TABLE_DATE = 'Date';
export const MY_REPORTS_TABLE_STATUS = 'Status';
export const MY_REPORTS_TABLE_CLAIMS = 'Claims';

/** Compact report CTAs on the My reports header row. */
export const REPORT_LOST_ITEM_SHORT = 'Report lost';
export const REPORT_FOUND_ITEM_SHORT = 'Report found';

/** My reports empty state — mockup `08-my-reports`. */
export const MY_REPORTS_EMPTY_HEADING = "You haven't reported anything yet.";

export const MY_REPORTS_EMPTY_BODY =
  'Use Report lost or Report found to start.';

/** The `Browse` heading. */
export const BROWSE_HEADING = 'Browse';

/** Member browse page title — mockup `02-listings-member`. */
export const MEMBER_BROWSE_PAGE_TITLE = 'Lost & Found';

/** Secondary CTA on participation list pages. */
export const BROWSE_ITEMS_BUTTON = 'Browse items';

/** Table action linking to a claim or recovery thread. */
export const OPEN_THREAD_BUTTON = 'Open thread';

/** The `My Claims` heading. */
export const MY_CLAIMS_HEADING = 'My Claims';

/** My claims page title — mockup `10-my-claims`. */
export const MY_CLAIMS_PAGE_TITLE = 'My claims';

export const MY_CLAIMS_FILTER_LABEL = 'Filter';

export const MY_CLAIMS_TABLE_ITEM = 'Item';
export const MY_CLAIMS_TABLE_SUBMITTED = 'Submitted';
export const MY_CLAIMS_TABLE_CLAIM_STATUS = 'Claim status';
export const MY_CLAIMS_TABLE_ITEM_STATUS = 'Item status';

export const MY_CLAIMS_EMPTY_HEADING = "You haven't submitted any claims yet.";

/** The `My Recovery Responses` heading. */
export const MY_RECOVERY_RESPONSES_HEADING = 'My Recovery Responses';

/** My recovery responses page title — mockup `18-my-recovery-responses`. */
export const MY_RECOVERY_RESPONSES_PAGE_TITLE = 'My recovery responses';

export const MY_RECOVERY_RESPONSES_LEDE =
  "Recovery Responses you have submitted on other members' Lost reports. A response is Standby while another response is being verified.";

export const MY_RECOVERY_RESPONSES_FILTER_LABEL = 'Filter';

export const MY_RECOVERY_RESPONSES_TABLE_LOST_REPORT = 'Lost report';
export const MY_RECOVERY_RESPONSES_TABLE_SUBMITTED = 'Submitted';
export const MY_RECOVERY_RESPONSES_TABLE_STATUS = 'Status';

export const MY_RECOVERY_RESPONSES_EMPTY_HEADING =
  "You haven't submitted any recovery responses yet.";

/* -------------------------------------------------------------------------- */
/* The member dashboard — §9.4                                                */
/* -------------------------------------------------------------------------- */

/**
 * The member dashboard's heading.
 *
 * §9.4 calls it the "Member dashboard / entry surface". The live page
 * greets with a time-of-day salutation instead of this word; the
 * constant remains the page's identity for tests and titles.
 */
export const HOME_HEADING = 'FindBack';

/**
 * The member dashboard's supporting line.
 *
 * The generated mockup's welcome card uses this sentence under the
 * greeting. §9.4 still describes the page as task entry to the four
 * views; the mockup line is what the member sees.
 */
export const HOME_TAGLINE = 'Report an item, or look through what the community has shared.';

/**
 * The welcome card's subtitle — mockup `07-dashboard.html`.
 */
export const HOME_WELCOME_SUB = "Here's what's happening with your reports and claims.";

/** Dashboard stat tile — open reports authored by the member. */
export const HOME_STAT_OPEN_REPORTS = 'My open reports';

/** Dashboard stat tile — pending claims submitted by the member. */
export const HOME_STAT_PENDING_CLAIMS = 'Pending claims';

/** Dashboard stat tile — approved claims submitted by the member. */
export const HOME_STAT_APPROVED_CLAIMS = 'Approved claims';

/** Dashboard stat tile — returned reports authored by the member. */
export const HOME_STAT_RETURNED_ITEMS = 'Returned items';

export const HOME_STAT_RESPONSES_TO_REVIEW = 'Responses to review';

/**
 * The heading of the two report action cards.
 */
export const HOME_QUICK_ACTIONS = 'Quick actions';

/**
 * The lost-item action card's title.
 */
export const HOME_REPORT_LOST_TITLE = 'Report a lost item';

/**
 * The found-item action card's title.
 */
export const HOME_REPORT_FOUND_TITLE = 'Report a found item';

/**
 * The lost-item action card's body.
 *
 * Same sentence as the Lost report form, so the card and the form agree.
 */
export const HOME_REPORT_LOST_BODY = 'Tell us what you lost so we can help you find it.';

/**
 * The found-item action card's body.
 */
export const HOME_REPORT_FOUND_BODY = 'Turn in something you found so its owner can find it.';

/**
 * The `Report Lost Item` button's label.
 *
 * §9.4 names the two primary CTAs "Report Lost, Report Found"; §10.1
 * names the form's heading "Report Lost Item" / "Report Found Item". The
 * button takes the form's heading, so the button and the page it opens
 * agree.
 */
export const REPORT_LOST_ITEM = 'Report Lost Item';

/**
 * The `Report Found Item` button's label.
 */
export const REPORT_FOUND_ITEM = 'Report Found Item';

/**
 * The heading of the section holding the four view entry points.
 *
 * §9.4 says the entry-point links sit *"below the fold"* of the
 * dashboard. This is the section's heading.
 */
export const HOME_VIEWS_HEADING = 'Where would you like to go?';

/**
 * Visible titles on the four destination cards.
 *
 * The link's accessible name stays the EXPERIENCE.md view name
 * (`Browse`, not `Browse Lost & Found`).
 */
export const HOME_VIEW_TITLES: Readonly<Record<string, string>> = {
  '/listings': 'Browse Lost & Found',
  '/my/reports': 'My Reports',
  '/my/claims': 'My Claims',
  '/my/recovery-responses': 'My Recovery Responses',
};

/**
 * Icons on the four destination cards — mockup `07-dashboard.html`.
 */
export const HOME_VIEW_ICONS: Readonly<Record<string, string>> = {
  '/listings': '⌕',
  '/my/reports': '≣',
  '/my/claims': '✉',
  '/my/recovery-responses': '↺',
};

/**
 * Supporting lines for the four dashboard destination cards.
 *
 * The mockup's member dashboard names what each view is for. The link
 * label stays the EXPERIENCE.md view name.
 */
export const HOME_VIEW_BODIES: Readonly<Record<string, string>> = {
  '/listings': 'See what other members have reported. Browse never shows your own reports.',
  '/my/reports': 'Your authored Lost and Found reports. Edit, withdraw, or follow up.',
  '/my/claims': "Claims you submitted against other members' Found items.",
  '/my/recovery-responses': "Recovery Responses you submitted against other members' Lost items.",
};

/* -------------------------------------------------------------------------- */
/* The report form — §10.1, §10.2, §10.3                                      */
/* -------------------------------------------------------------------------- */

/** The `Report a lost item` form's heading (mockup §10). */
export const REPORT_LOST_HEADING = 'Report a lost item';

/** The `Report a found item` form's heading (mockup §10). */
export const REPORT_FOUND_HEADING = 'Report a found item';

/** Breadcrumb label on `/report/lost`. */
export const REPORT_LOST_BREADCRUMB = 'Report lost item';

/** Breadcrumb label on `/report/found`. */
export const REPORT_FOUND_BREADCRUMB = 'Report found item';

/** Member dashboard label in breadcrumbs (mockup). */
export const DASHBOARD_LABEL = 'Dashboard';

/**
 * The Lost form's intro copy (mockup `14-report-lost`).
 */
export const REPORT_FORM_LOST_DESCRIPTION =
  "Tell us what you lost and we'll match it against found reports. Sensitive fields are hidden from other members until they have a relationship to your item.";

/**
 * The Found form's intro copy (mockup `15-report-found`).
 */
export const REPORT_FORM_FOUND_DESCRIPTION =
  "Thanks for turning something in. Once you submit, members can browse and claim it. You'll be notified by email if someone claims it.";

/** The required-fields card's heading. */
export const REQUIRED_FIELDS_HEADING = 'Required details';

/** The optional-fields card's heading. */
export const OPTIONAL_FIELDS_HEADING = 'Optional details';

/** The `Name` field's label (admin edit and generic). */
export const NAME_LABEL = 'Name';

/** The report form's `Item name` label. */
export const ITEM_NAME_LABEL = 'Item name';

/** The `Category` field's label. */
export const CATEGORY_LABEL = 'Category';

/** The `Description` field's label. */
export const DESCRIPTION_LABEL = 'Description';

/** The `Date` field's label. */
export const DATE_LABEL = 'Date';

/** The report form's `Date lost` label (§10.3). */
export const REPORT_DATE_LOST_LABEL = 'Date lost';

/** The report form's `Date found` label (§10.3). */
export const REPORT_DATE_FOUND_LABEL = 'Date found';

/** Help under the lost-report date field. */
export const REPORT_DATE_LOST_HELPER =
  'Within the last 365 days. Cannot be in the future.';

/** Help under the found-report date field. */
export const REPORT_DATE_FOUND_HELPER = 'Today or earlier (last 30 days).';

/** The report form's location label. */
export const REPORT_LOCATION_LABEL = 'Location (campus area)';

/** The `Campus area` field's label. */
export const CAMPUS_AREA_LABEL = 'Campus area';

/** Empty option for the category select. */
export const SELECT_CATEGORY_PLACEHOLDER = 'Select a category…';

/** Empty option for the campus area select. */
export const SELECT_LOCATION_PLACEHOLDER = 'Select a location…';

/** Placeholder on the lost-report name field. */
export const REPORT_LOST_NAME_PLACEHOLDER = 'e.g., Black leather wallet';

/** Placeholder on the found-report name field. */
export const REPORT_FOUND_NAME_PLACEHOLDER =
  'e.g., Black iPhone 14 with cracked screen protector';

/** Placeholder on the description field. */
export const REPORT_DESCRIPTION_PLACEHOLDER = '10–2000 characters';

/** Helper under exact place on the report form. */
export const REPORT_EXACT_PLACE_HELPER =
  'Hidden from other members until they have a relationship to your item. Visible to administrators.';

/** Placeholder on the lost-report exact place field. */
export const REPORT_LOST_EXACT_PLACE_PLACEHOLDER =
  'Optional — e.g., Table 7, west window';

/** Placeholder on the found-report exact place field. */
export const REPORT_FOUND_EXACT_PLACE_PLACEHOLDER =
  'Optional — e.g., Found on cafeteria table 7';

/** Placeholder on the identifying details field (lost). */
export const REPORT_LOST_IDENTIFYING_PLACEHOLDER =
  "Optional — anything that proves it's yours";

/** Placeholder on the identifying details field (found). */
export const REPORT_FOUND_IDENTIFYING_PLACEHOLDER =
  'Optional — anything that identifies the item';

/** Helper under the optional image field. */
export const REPORT_IMAGE_HELPER = 'JPEG, PNG, or WebP up to 5 MB. Optional.';

/** The `Exact place` field's label. */
export const EXACT_PLACE_LABEL = 'Exact place';

/** The `Identifying details` field's label. */
export const IDENTIFYING_DETAILS_LABEL = 'Identifying details';

/** The `Image` field's label. */
export const IMAGE_LABEL = 'Image';

/**
 * The report form's field labels, keyed by field name.
 *
 * **The error summary names the fields,** and the names it uses are these —
 * the same labels the fields themselves carry. A summary that said
 * `name` where the field says `Name` would send the member looking for
 * something the form does not call that.
 *
 * **The keys are the field names the server uses,** because the server is
 * what identifies the offending field in its error response.
 */
export const REPORT_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  name: ITEM_NAME_LABEL,
  category: CATEGORY_LABEL,
  description: DESCRIPTION_LABEL,
  date: DATE_LABEL,
  campusArea: REPORT_LOCATION_LABEL,
  exactPlace: EXACT_PLACE_LABEL,
  identifyingDetails: IDENTIFYING_DETAILS_LABEL,
  image: IMAGE_LABEL,
});

/** The report form's error summary's heading. */
export const REPORT_ERROR_SUMMARY_HEADING = 'Check the form';

/** The form's submit button's label. */
export const SUBMIT_REPORT = 'Submit report';

/** The form's submit button's label while a submission is in flight. */
export const SUBMITTING = 'Submitting…';

/** The form's cancel button's label. */
export const CANCEL = 'Cancel';

/**
 * The `Sensitive` marker beside a withheld field.
 *
 * §11.1: *"A 'Sensitive' inline flag appears next to fields that are hidden
 * from non-owners."*
 */
export const SENSITIVE_LABEL = 'Sensitive';

/**
 * The helper under a `Sensitive` field.
 *
 * §11.1 gives it verbatim: *"This is hidden from other members."*
 */
export const SENSITIVE_HELPER = 'This is hidden from other members.';

/**
 * The label beside a withheld section's heading.
 *
 * §11.4: *"When a field is hidden, an inline 'Hidden from other members'
 * label appears next to the section heading."*
 */
export const HIDDEN_FROM_OTHER_MEMBERS = 'Hidden from other members';

/* -------------------------------------------------------------------------- */
/* Report actions — §10.4                                                      */
/* -------------------------------------------------------------------------- */

/** The `Edit` action's label. */
export const EDIT = 'Edit';

/** The `Delete` action's label. */
export const DELETE = 'Delete';

/** The `Withdraw` action's label. */
export const WITHDRAW = 'Withdraw';

/**
 * The message shown when a Lost report's workflow has passed the point
 * where its owner may withdraw it.
 *
 * §10.4: *"only an Administrator may end the Lost workflow."* The surface
 * must make that clear rather than showing a button that cannot work.
 */
export const ADMINISTRATOR_ONLY_WORKFLOW =
  'Only an administrator can end this workflow now.';

/**
 * The message shown when a report is `Returned` or `Closed` and cannot be
 * edited.
 *
 * §10.4 blocks Edit at both terminal statuses; §9.4 says the closed action
 * and timestamp are annotated.
 */
export const REPORT_CLOSED_CANNOT_EDIT =
  'This report is closed, so it can no longer be edited.';

/**
 * The message shown when a report has an interaction and cannot be hard
 * deleted.
 *
 * §10.4: *"Once a Claim (Found) or RR (Lost) exists, the reporter must use
 * Withdraw instead."* The message points at Withdraw, because the remedy
 * is Withdraw.
 */
export const REPORT_HAS_INTERACTION_CANNOT_DELETE =
  'Someone has responded to this report, so it can no longer be deleted. You can withdraw it instead, which closes it and keeps its history.';

/* -------------------------------------------------------------------------- */
/* Item detail — §11.3                                                         */
/* -------------------------------------------------------------------------- */

/** The detail page's `Category` section heading. */
export const CATEGORY_SECTION = 'Category';

/** The detail page's `Date` section heading. */
export const DATE_SECTION = 'Date';

/** The detail page's `Campus area` section heading. */
export const CAMPUS_AREA_SECTION = 'Campus area';

/** The detail page's `Description` section heading. */
export const DESCRIPTION_SECTION = 'Description';

/** The detail page's `Location` section heading. */
export const LOCATION_SECTION = 'Location';

/** The detail page's `Exact place` section heading. */
export const EXACT_PLACE_SECTION = 'Exact place';

/** The detail page's `Identifying details` section heading. */
export const IDENTIFYING_DETAILS_SECTION = 'Identifying details';

/** The detail page's `Reporter` section heading. */
export const REPORTER_SECTION = 'Reporter';

/** The detail page's `Status history` section heading. */
export const STATUS_HISTORY_SECTION = 'Status history';

/** The detail page's `Actions` section heading. */
export const ACTIONS_SECTION = 'Actions';

/** The detail aside's heading (mockup quick facts). */
export const QUICK_FACTS_HEADING = 'Quick facts';

/** Claim CTA section heading on a Found item. */
export const CLAIM_CTA_HEADING = 'Does this look familiar?';

/** Recovery response CTA section heading on a Lost item. */
export const RECOVERY_CTA_HEADING = 'I may have found this item';

/** Detail image placeholder when no photo is attached. */
export const DETAIL_NO_PHOTO = 'No photo attached';

/**
 * The toolbar's label when the viewer owns the report.
 *
 * §9.4 names it the *"your Found report" toolbar*.
 */
export const YOUR_FOUND_REPORT = 'your Found report';

/**
 * The toolbar's label when the viewer owns a Lost report.
 *
 * The mirror of `YOUR_FOUND_REPORT`, for the Lost side.
 */
export const YOUR_LOST_REPORT = 'your Lost report';

/**
 * The label of the finder's toolbar on a Found report.
 *
 * §9.4 names the finder a member who reported a Found item. The label is
 * the item's, not the viewer's, because the finder is not the owner.
 */
export const FINDER_TOOLBAR = 'You reported this item';

/**
 * The label of the claimant's toolbar on a Found report.
 *
 * §9.4: a claimant sees *"their own Claim detail … and the per-Claim
 * thread for their own Claim"*.
 */
export const CLAIMANT_TOOLBAR = 'Your claim';

/**
 * The label of the responder's toolbar on a Lost report.
 *
 * §9.4: a responder sees *"their own RR fields … and the per-RR thread for
 * their own response"*.
 */
export const RESPONDER_TOOLBAR = 'Your recovery response';

/**
 * The label of the administrator's toolbar on any report.
 *
 * §9.4: an administrator sees *"everything plus audit trail"*.
 */
export const ADMINISTRATOR_TOOLBAR = 'Administrator view';

/* -------------------------------------------------------------------------- */
/* The item detail's call to action — §12.1, §9.6                              */
/* -------------------------------------------------------------------------- */

/**
 * The CTA on a Found item.
 *
 * §12.1 names it "Submit claim".
 */
export const SUBMIT_CLAIM = 'Submit claim';

/**
 * The CTA on a Lost item.
 *
 * §9.6 names it explicitly and warns against the alternative: *"CTA on the
 * Lost item detail page reads `I may have found this item` (NOT 'Submit
 * claim')."*
 */
export const I_MAY_HAVE_FOUND_THIS_ITEM = 'I may have found this item';

/**
 * The explanation shown when the `Submit claim` CTA is unavailable.
 *
 * §12.1 says the CTA is *"disabled with explanatory tooltip text"*, and
 * story 004's criterion requires the explanation to be present on focus.
 */
export const CLAIM_NOT_ELIGIBLE =
  'You cannot submit a claim on this item right now.';

/**
 * The explanation shown when the `I may have found this item` CTA is
 * unavailable.
 *
 * The mirror of `CLAIM_NOT_ELIGIBLE`, for the Lost side.
 */
export const RESPONSE_NOT_ELIGIBLE =
  'You cannot submit a recovery response on this item right now.';

/* -------------------------------------------------------------------------- */
/* The claim form and detail — §12.1, §12.2                                    */
/* -------------------------------------------------------------------------- */

/** The claim form's heading. */
export const CLAIM_FORM_HEADING = 'Claim this item';

/**
 * The claim form's one-line description.
 *
 * §12.1 names the three fields; the description says what a claim is for.
 */
export const CLAIM_FORM_DESCRIPTION =
  'Tell the administrator who found this item that it is yours.';

/** The `Reason` field's label. */
export const CLAIM_REASON_LABEL = 'Reason';

/** The `Identifying details` field's label. */
export const CLAIM_IDENTIFYING_DETAILS_LABEL = 'Identifying details';

/** The `Date lost` field's label. */
export const CLAIM_DATE_LOST_LABEL = 'Date lost';

/** The claim form's submit button's label. */
export const SUBMIT_CLAIM_BUTTON = 'Submit claim';

/**
 * The claim form's field labels, keyed by field name.
 *
 * **The error summary names the fields,** and the names it uses are these —
 * the same labels the fields themselves carry.
 */
export const CLAIM_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  reason: CLAIM_REASON_LABEL,
  identifyingDetails: CLAIM_IDENTIFYING_DETAILS_LABEL,
  dateLost: CLAIM_DATE_LOST_LABEL,
});

/**
 * The claim form's element ids, keyed by field name.
 *
 * **The server's field name is not always the element's id.** The server
 * calls the field `identifyingDetails`; the form's element is
 * `claimIdentifyingDetails`, because the detail page has a Claim form and
 * a Report form on the same page's vocabulary, and the two must not
 * collide. The map bridges the two so the focus hook can find the element
 * the error belongs to.
 */
export const CLAIM_FIELD_ELEMENT_IDS: Readonly<Record<string, string>> = Object.freeze({
  identifyingDetails: 'claimIdentifyingDetails',
});

/** The claim form's error summary's heading. */
export const CLAIM_ERROR_SUMMARY_HEADING = 'Check the form';

/**
 * The body shown after a claim is submitted.
 *
 * §12.1 names it: *"An administrator will review your claim and email you
 * with the decision."*
 */
export const CLAIM_SUBMITTED_BODY =
  'An administrator will review your claim and email you with the decision.';

/** The claim detail's heading. */
export const CLAIM_DETAIL_HEADING = 'Your claim';

/** The claim detail's `Claim ID` label. */
export const CLAIM_ID_LABEL = 'Claim ID';

/** The claim detail's `Claim reason` label. */
export const CLAIM_REASON_SECTION = 'Claim reason';

/** The claim detail's `Identifying details` label. */
export const CLAIM_IDENTIFYING_DETAILS_SECTION = 'Identifying details';

/** The claim detail's `Date lost` label. */
export const CLAIM_DATE_LOST_SECTION = 'Date lost';

/** The claim detail's `Submitted` label. */
export const CLAIM_SUBMITTED_LABEL = 'Submitted';

/**
 * The banner shown on an auto-rejected claim.
 *
 * §4.4 gives it verbatim: *"Your claim was not approved because another
 * claim on this item was approved. If you think this is a mistake, contact
 * your administrator."*
 */
export const CLAIM_AUTO_REJECTED_BANNER =
  'Your claim was not approved because another claim on this item was approved. If you think this is a mistake, contact your administrator.';

/**
 * The badge text for a Claim auto-rejected by a competing approval.
 *
 * §12.7's table: `Rejected — auto`.
 */
export const CLAIM_REJECTED_AUTO_BADGE = 'Rejected — auto';

/* -------------------------------------------------------------------------- */
/* The recovery response form and detail — §9.6                                */
/* -------------------------------------------------------------------------- */

/** Lost-report owner: recovery responses on their report. */
export const LOST_OWNER_RECOVERY_HEADING = 'Recovery responses on your report';

export const LOST_OWNER_RECOVERY_BODY =
  'Other members submit recovery responses when they think they found your item. You cannot submit a response on your own lost report — review what others sent and choose one to verify if it looks like a match.';

export const LOST_OWNER_RECOVERY_NONE =
  'No recovery responses yet. When someone submits one, you will get an email and can review them here.';

export const REVIEW_RECOVERY_RESPONSES = 'Review responses';

export const REVIEW_RESPONSES_PAGE_TITLE = 'Review recovery responses';

export const REVIEW_RESPONSES_LEDE =
  'Compare responses side by side. Select one for verification when you are ready — the report moves to Verification Pending and an administrator will help confirm the match.';

export const SELECT_FOR_VERIFICATION = 'Select for verification';

export const VIEW_RESPONSE_AND_THREAD = 'View details and message';

export const RECOVERY_RESPONSES_ON_REPORT = 'Responses on this report';

/** The recovery response form's heading. */
export const RECOVERY_RESPONSE_FORM_HEADING = 'I may have found this item';

/**
 * The recovery response form's one-line description.
 *
 * §9.6 lists the fields the form collects; the description says what a
 * response is for.
 */
export const RECOVERY_RESPONSE_FORM_DESCRIPTION =
  'Tell the person who lost this item where you found it.';

/** The `Where found area` field's label. */
export const WHERE_FOUND_AREA_LABEL = 'Where found area';

/** The `Exact place` field's label on the response form. */
export const RESPONSE_EXACT_PLACE_LABEL = 'Exact place';

/** The `Observed identifying details` field's label. */
export const OBSERVED_IDENTIFYING_DETAILS_LABEL = 'Observed identifying details';

/** The `Date found` field's label. */
export const DATE_FOUND_LABEL = 'Date found';

/** The `Candidate image` field's label. */
export const CANDIDATE_IMAGE_LABEL = 'Candidate image';

/**
 * The recovery response form's field labels, keyed by field name.
 *
 * **The error summary names the fields,** and the names it uses are these —
 * the same labels the fields themselves carry.
 */
export const RECOVERY_RESPONSE_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  whereFoundArea: WHERE_FOUND_AREA_LABEL,
  campusArea: WHERE_FOUND_AREA_LABEL,
  exactPlace: RESPONSE_EXACT_PLACE_LABEL,
  whereFoundExactPlace: RESPONSE_EXACT_PLACE_LABEL,
  observedIdentifyingDetails: OBSERVED_IDENTIFYING_DETAILS_LABEL,
  dateFound: DATE_FOUND_LABEL,
  candidateImage: CANDIDATE_IMAGE_LABEL,
});

/**
 * The recovery response form's element ids, keyed by field name.
 *
 * **The server's field name is not always the element's id.** The server
 * calls the field `exactPlace`; the form's element is
 * `responseExactPlace`, because the Claim form and the Recovery Response
 * form share a page's vocabulary, and the two must not collide. The map
 * bridges the two so the focus hook can find the element the error belongs
 * to.
 */
export const RECOVERY_RESPONSE_FIELD_ELEMENT_IDS: Readonly<Record<string, string>> = Object.freeze({
  whereFoundArea: 'whereFoundArea',
  campusArea: 'whereFoundArea',
  exactPlace: 'responseExactPlace',
  whereFoundExactPlace: 'responseExactPlace',
});

/** The recovery response form's error summary's heading. */
export const RECOVERY_RESPONSE_ERROR_SUMMARY_HEADING = 'Check the form';

/** The recovery response form's submit button's label. */
export const SUBMIT_RECOVERY_RESPONSE = 'Submit recovery response';

/** The recovery response detail's heading. */
export const RECOVERY_RESPONSE_DETAIL_HEADING = 'Your recovery response';

/** The Lost-report owner's view of a response on their report. */
export const RECOVERY_RESPONSE_OWNER_DETAIL_HEADING = 'Recovery response on your report';

/** The recovery response detail's `Where found area` label. */
export const WHERE_FOUND_AREA_SECTION = 'Where found area';

/** The recovery response detail's `Observed identifying details` label. */
export const OBSERVED_IDENTIFYING_DETAILS_SECTION = 'Observed identifying details';

/** The recovery response detail's `Date found` label. */
export const DATE_FOUND_SECTION = 'Date found';

/** The recovery response detail's `Status` label. */
export const RECOVERY_RESPONSE_STATUS_LABEL = 'Status';

/* -------------------------------------------------------------------------- */
/* The threads — §13.2, §13.3, §13.4                                           */
/* -------------------------------------------------------------------------- */

/** The per-Claim thread's heading. */
export const CLAIM_THREAD_HEADING = 'Messages';

/** The per-Recovery-Response thread's heading. */
export const RECOVERY_RESPONSE_THREAD_HEADING = 'Messages';

/**
 * The thread's empty state.
 *
 * §13.4 names it: *"No messages yet. Be the first to ask a question."*
 */
export const THREAD_EMPTY = 'No messages yet. Be the first to ask a question.';

/**
 * The thread's permission-denied notice.
 *
 * §13.4 names it: *"Only the claimant, finder, and administrators can see
 * this thread."*
 */
export const THREAD_PERMISSION_DENIED =
  'Only the claimant, finder, and administrators can see this thread.';

/**
 * The message shown when a send fails.
 *
 * §13.4 names it: *"We couldn't send your message. Try again."*
 */
export const THREAD_SEND_FAILED = "We couldn't send your message. Try again.";

/**
 * The message shown when the history fetch fails.
 *
 * §13.4 names it: *"We couldn't load the conversation. Try again."*
 */
export const THREAD_LOAD_FAILED = "We couldn't load the conversation. Try again.";

/** The thread composer's placeholder. */
export const THREAD_MESSAGE_LABEL = 'Message';

/** The thread composer's send button's label. */
export const SEND = 'Send';

/**
 * The Lost-side thread's permission-denied notice.
 *
 * The mirror of `THREAD_PERMISSION_DENIED`, naming the Lost side's three
 * participants: the Lost-report owner, the responder, and administrators.
 */
export const RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED =
  'Only the report owner, the responder, and administrators can see this thread.';

/* -------------------------------------------------------------------------- */
/* Status helpers — §4.3, §4.5, §4.6                                           */
/* -------------------------------------------------------------------------- */

/**
 * The helper copy for each report status.
 *
 * **§4.3's Found-side and §4.5's Lost-side microcopy are separate**, and
 * the type decides which set applies. `Open` has two different helpers —
 * "Active. No Claims yet." on a Found report and "Active. No Recovery
 * Responses yet." on a Lost one — because mixing the two terminologies is
 * wrong.
 *
 * **The keys are the six canonical statuses,** and a status with no entry
 * for a type simply has no helper.
 */
export const REPORT_STATUS_HELPERS: Readonly<
  Record<ReportTypeForCopy, Readonly<Record<string, string>>>
> = Object.freeze({
  Found: Object.freeze({
    Open: 'Active. No Claims yet.',
    'Claim Requested': 'An administrator is reviewing {N} claim on this item.',
    'Claim Approved': 'A Claim has been approved. The administrator is arranging the return.',
    Returned: 'This item has been returned. No further action is needed.',
    Closed: 'This report is no longer active.',
  }),
  Lost: Object.freeze({
    Open: 'Active. No Recovery Responses yet.',
    'Verification Pending':
      'The Lost-report owner selected a Recovery Response for verification. An administrator will record the determination.',
    Returned: 'This item has been returned. No further action is needed.',
    Closed: 'This report is no longer active.',
  }),
});

/**
 * The Claim status helper copy.
 *
 * §4.3's Claim microcopy.
 */
export const CLAIM_STATUS_HELPERS: Readonly<Record<string, string>> = Object.freeze({
  Pending: 'Submitted. An administrator will review your claim and email you with the decision.',
  Approved: 'Your claim was approved. The administrator will arrange the return with you.',
  Rejected: 'Your claim was not approved.',
});

/**
 * The Recovery Response status helper copy.
 *
 * §4.6's table, verbatim. The `Submitted — Standby` entry is the derived
 * display status; the stored status stays `Submitted`.
 */
export const RECOVERY_RESPONSE_STATUS_HELPERS: Readonly<Record<string, string>> =
  Object.freeze({
    Submitted: 'Submitted. The report owner may select this response for verification.',
    'Submitted — Standby': 'Submitted — Standby. Another response is currently being verified.',
    'Selected for Verification': 'Selected for verification. The owner is checking the item.',
    'Match Confirmed': 'Owner confirmed this is a match. Awaiting physical handoff.',
    'Not a Match': 'Not a match. The owner determined this item is not theirs.',
    'Completed — Report Returned': 'Returned to owner.',
    'Resolved — Report Returned': 'Resolved. The item was returned via another response.',
    'Resolved — Report Closed': 'Resolved. The Lost report was closed.',
    Withdrawn: 'Withdrawn by the responder.',
  });

/* -------------------------------------------------------------------------- */
/* The empty states — §5.14                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The empty-view pattern's headline.
 *
 * §5.14 and story 003's criterion: a friendly headline, a one-sentence
 * body, and a single next-action button. The headline is a noun phrase,
 * not an apology.
 */
export const EMPTY_VIEW_HEADING = 'Nothing here yet';

/**
 * The empty-view pattern's body.
 *
 * The member's next action is named, because the pattern requires the body
 * to say what to do.
 */
export const EMPTY_VIEW_BODY =
  'When you take part in FindBack, your activity appears here.';

/* -------------------------------------------------------------------------- */
/* Errors — §4.9                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The server-error message.
 *
 * §4.9's row: *"Something went wrong on our side. Try again, or come back
 * in a moment."*
 */
export const SERVER_ERROR_MESSAGE =
  'Something went wrong on our side. Try again, or come back in a moment.';

/**
 * The permission-denied message.
 *
 * §4.9's row: *"You don't have access to this. If you think you should,
 * contact your administrator."*
 */
export const PERMISSION_DENIED_MESSAGE =
  "You don't have access to this. If you think you should, contact your administrator.";

/**
 * The session-expired message.
 *
 * §4.9's row: *"You've been signed out. Sign in again to continue."*
 */
export const SESSION_EXPIRED_MESSAGE = "You've been signed out. Sign in again to continue.";

/* -------------------------------------------------------------------------- */
/* Breadcrumbs — §9.4                                                          */
/* -------------------------------------------------------------------------- */

/** The breadcrumb nav's landmark label. */
export const BREADCRUMB_LABEL = 'Breadcrumb';

/* -------------------------------------------------------------------------- */
/* Profile — §9.4a                                                             */
/* -------------------------------------------------------------------------- */

/** The profile page heading. */
export const PROFILE_HEADING = 'My profile';

/** The profile page lede. */
export const PROFILE_LEDE =
  'The information FindBack uses to identify you in reports, claims, recovery responses, and messages.';

/** The display-name field. */
export const PROFILE_DISPLAY_NAME_LABEL = 'Display name';

/** The display-name helper. */
export const PROFILE_DISPLAY_NAME_HELPER =
  'Visible to other members where your identity matters (report owner, claimant, responder, message author).';

/** The self-declared-role field. */
export const PROFILE_ROLE_LABEL = 'Self-declared role';

/** The self-declared-role helper. */
export const PROFILE_ROLE_HELPER =
  'Helps your community understand who is reporting or responding.';

/** The read-only email field. */
export const PROFILE_EMAIL_LABEL = 'Registered email';

/** The read-only email helper. */
export const PROFILE_EMAIL_HELPER = "Email changes aren't supported in FindBack.";

/** The profile form's secondary action. */
export const PROFILE_BACK = 'Back to dashboard';

/** The profile form's primary action. */
export const PROFILE_SAVE = 'Save changes';

/** The profile form's success toast. */
export const PROFILE_UPDATED = 'Profile updated.';

/** What the profile form cannot change. */
export const PROFILE_FOOTER =
  "What you can't change here: email, account lifecycle status, administrator flag. Profile edits do not affect pending or rejected registrations.";
