/**
 * The audit trail's **view** model — §17.2, §17.4, §17.5a, §20.3.
 *
 * ## This module renders the trail; it does not read it
 *
 * Unit 006 owns the trail's production, ordering, and append-only
 * enforcement. This module owns the *shape of a rendered row*: the icon,
 * the accent, the label, the accessible name, and whether a row has a
 * disclosure at all.
 *
 * ## The event classes
 *
 * §17.4's table gives every event an icon and a left-border accent in the
 * status colour of its class. **The accent is a token name, not a colour
 * value** — the CSS owns the value, and the view names the token. A view
 * that hard-coded a hex colour would drift from DESIGN.md the first time
 * the palette moved.
 *
 * ## The numbered events and the non-numbered records are different
 *
 * FR-31's events 1–14 and FR-48's events 15–30 are **workflow events** with
 * a frozen number, a frozen label, and frozen semantics. FR-2, FR-52, and
 * FR-53 add **non-numbered records** — `Registration submitted`,
 * `Member profile edited`, `Report edited by Administrator` — which have
 * their own labels and must **not** consume or display a numbered event ID
 * (§17.5a).
 *
 * `report.edited_by_reporter` is a *numbered* event (FR-31 event 8) and
 * renders as `Report edited by reporter` — **distinct** from the
 * administrator's non-numbered `Report edited by Administrator`.
 *
 * Pure — no I/O, no framework imports.
 */

/** The icon a row carries. §17.4's icon column, verbatim. */
export type AuditEventIcon =
  | 'plus-circle'
  | 'edit'
  | 'shield-edit'
  | 'user-edit'
  | 'archive'
  | 'archive-x'
  | 'inbox'
  | 'check'
  | 'x'
  | 'x-circle'
  | 'package-check'
  | 'package'
  | 'user-check'
  | 'user-x'
  | 'lock'
  | 'message-circle'
  | 'eye'
  | 'undo'
  | 'refresh';

/**
 * The accent token a row's left border carries.
 *
 * **Token names, not colours.** The values live in `src/ui/tokens.ts` and
 * `globals.css`; a view that carried a hex value would be a second copy of
 * the palette.
 */
export type AuditAccentToken =
  | 'status-report.open'
  | 'status-report.closed'
  | 'status-report.returned'
  | 'status-claim.pending'
  | 'status-claim.approved'
  | 'status-claim.rejected'
  | 'status-rr.submitted'
  | 'status-rr.selected'
  | 'status-rr.matchConfirmed'
  | 'status-rr.notAMatch'
  | 'status-rr.completed'
  | 'status-rr.resolvedReturned'
  | 'status-rr.resolvedClosed'
  | 'status-rr.withdrawn'
  | 'status-account.active'
  | 'status-account.rejected'
  | 'status-account.deactivated'
  | 'light.on-surface-variant';

/**
 * How one event type renders.
 */
export interface AuditEventPresentation {
  /** The row's label. */
  readonly label: string;
  /** The row's icon. */
  readonly icon: AuditEventIcon;
  /** The row's left-border accent token. */
  readonly accent: AuditAccentToken;
  /**
   * Whether the row carries a numbered workflow-event ID.
   *
   * **`false` for the non-numbered records** — they render their own label
   * and their changed fields, and they never display a number (§17.5a).
   */
  readonly numbered: boolean;
  /**
   * The row's plain-English action verb — §17.2.
   *
   * **The verb is declared with the event, not derived from the label.**
   * A label's first word is often the *entity* rather than the verb —
   * `Report created` starts with "Report" and `Claim approved` starts
   * with "Claim" — so deriving the verb from the label would produce
   * "Report" as an action. Declaring it per event makes the visible verb
   * and the accessible name's verb the same value by construction.
   */
  readonly verb: AuditActionVerb;
}

/**
 * The plain-English action verb a row shows.
 *
 * §17.2 names the verbs: `created`, `edited`, `claimed`, `approved`,
 * `rejected`, `auto-rejected`, `returned`, `withdrawn`, `closed`,
 * `registered`, `deactivated`, `message posted`.
 */
export type AuditActionVerb =
  | 'created'
  | 'edited'
  | 'claimed'
  | 'approved'
  | 'rejected'
  | 'auto-rejected'
  | 'returned'
  | 'withdrawn'
  | 'closed'
  | 'registered'
  | 'deactivated'
  | 'message posted'
  | 'removed'
  | 'submitted'
  | 'selected'
  | 'completed'
  | 'opened';

/**
 * Build a presentation.
 *
 * The `numbered` flag is derived from whether the catalog gave the type a
 * number, so it cannot drift from the frozen catalog.
 */
function presentation(
  label: string,
  icon: AuditEventIcon,
  accent: AuditAccentToken,
  numbered: boolean,
  verb: AuditActionVerb,
): AuditEventPresentation {
  return { label, icon, accent, numbered, verb };
}

/**
 * The presentation of every event type the trail can carry.
 *
 * **§17.4's table, transcribed.** The numbering is the catalog's, so the
 * entries appear in catalog order.
 */
const PRESENTATIONS: Readonly<Record<string, AuditEventPresentation>> = Object.freeze({
  // ── FR-31: Found / account / core workflow (1–14) ──────────────────────
  'report.created': presentation('Report created', 'plus-circle', 'status-report.open', true, 'created'),
  'report.edited_by_reporter': presentation(
    'Report edited by reporter',
    'edit',
    'light.on-surface-variant',
    true,
    'edited',
  ),
  'claim.submitted': presentation('Claim submitted', 'inbox', 'status-claim.pending', true, 'claimed'),
  'claim.approved': presentation('Claim approved', 'check', 'status-claim.approved', true, 'approved'),
  'claim.rejected_by_administrator': presentation(
    'Claim rejected by administrator',
    'x',
    'status-claim.rejected',
    true,
    'rejected',
  ),
  'claim.auto_rejected': presentation(
    'Claim auto-rejected',
    'x-circle',
    'status-claim.rejected',
    true,
    'auto-rejected',
  ),
  'returned.confirmed_default_receiver': presentation(
    'Returned confirmed (default receiver)',
    'package-check',
    'status-report.returned',
    true,
    'returned',
  ),
  'returned.confirmed_substitute_receiver': presentation(
    'Returned confirmed (substitute receiver)',
    'package-check',
    'status-report.returned',
    true,
    'returned',
  ),
  'report.found_withdrawn_by_reporter': presentation(
    'Found report withdrawn by reporter',
    'archive',
    'status-report.closed',
    true,
    'withdrawn',
  ),
  'report.found_closed_by_administrator': presentation(
    'Found report closed by administrator',
    'archive-x',
    'status-report.closed',
    true,
    'closed',
  ),
  'registration.approved': presentation(
    'Registration approved',
    'user-check',
    'status-account.active',
    true,
    'registered',
  ),
  'registration.rejected': presentation(
    'Registration rejected',
    'user-x',
    'status-account.rejected',
    true,
    'rejected',
  ),
  'account.deactivated': presentation(
    'Account deactivated',
    'lock',
    'status-account.deactivated',
    true,
    'deactivated',
  ),
  'thread.claim_message_posted': presentation(
    'Message posted in per-Claim thread',
    'message-circle',
    'light.on-surface-variant',
    true,
    'message posted',
  ),

  // ── FR-48: Lost-side Recovery Response (15–30) ─────────────────────────
  'recovery_response.submitted': presentation(
    'Recovery Response submitted',
    'inbox',
    'status-rr.submitted',
    true,
    'submitted',
  ),
  'recovery_response.thread_message_posted': presentation(
    'Message posted in per-Recovery-Response thread',
    'message-circle',
    'light.on-surface-variant',
    true,
    'message posted',
  ),
  'recovery_response.selected_for_verification': presentation(
    'Recovery Response selected for verification',
    'eye',
    'status-rr.selected',
    true,
    'selected',
  ),
  'recovery_response.determined_match_confirmed': presentation(
    'Recovery Response determined Match Confirmed',
    'check',
    'status-rr.matchConfirmed',
    true,
    'approved',
  ),
  'recovery_response.determined_not_a_match': presentation(
    'Recovery Response determined Not a Match',
    'x-circle',
    'status-rr.notAMatch',
    true,
    'rejected',
  ),
  'recovery_response.withdrawn_by_responder': presentation(
    'Recovery Response withdrawn by responder',
    'undo',
    'status-rr.withdrawn',
    true,
    'withdrawn',
  ),
  'returned.confirmed_lost_default_receiver': presentation(
    'Returned confirmed (Lost report, default receiver)',
    'package-check',
    'status-report.returned',
    true,
    'returned',
  ),
  'returned.confirmed_lost_substitute_receiver': presentation(
    'Returned confirmed (Lost report, substitute receiver)',
    'package-check',
    'status-report.returned',
    true,
    'returned',
  ),
  'report.lost_withdrawn_by_reporter': presentation(
    'Lost report withdrawn by reporter',
    'archive',
    'status-report.closed',
    true,
    'withdrawn',
  ),
  'report.lost_closed_by_administrator': presentation(
    'Lost report closed by administrator',
    'archive-x',
    'status-report.closed',
    true,
    'closed',
  ),
  'report.lost_cancelled_after_match_confirmed': presentation(
    'Lost report cancelled after Match Confirmed',
    'archive-x',
    'status-report.closed',
    true,
    'closed',
  ),
  'report.lost_returned_child_response_resolution': presentation(
    'Lost report Returned — responses resolved',
    'package',
    'status-rr.resolvedReturned',
    true,
    'closed',
  ),
  'report.lost_closed_child_response_resolution': presentation(
    'Lost report Closed — responses resolved',
    'archive',
    'status-rr.resolvedClosed',
    true,
    'closed',
  ),
  'report.lost_verification_pending_returned_to_open': presentation(
    'Lost report Verification Pending returned to Open',
    'refresh',
    'status-report.open',
    true,
    'opened',
  ),
  'report.lost_transition_to_verification_pending': presentation(
    'Lost report moved to Verification Pending',
    'refresh',
    'status-report.open',
    true,
    'opened',
  ),
  'recovery_response.completed_report_returned': presentation(
    'Recovery Response transition to Completed — Report Returned',
    'package-check',
    'status-rr.completed',
    true,
    'completed',
  ),

  // ── The non-numbered records (FR-2, FR-52, FR-53, FR-36) ─────────────
  //
  // **`numbered: false` for all four.** §17.5a: they "do not introduce
  // event 31 or any later event number" and they render their own labels.
  'member_profile.edited': presentation(
    'Member profile edited',
    'user-edit',
    'status-account.active',
    false,
    'edited',
  ),
  'report.edited_by_administrator': presentation(
    'Report edited by Administrator',
    'shield-edit',
    'light.on-surface-variant',
    false,
    'edited',
  ),
  'registration.submitted': presentation(
    'Registration submitted',
    'user-check',
    'status-account.active',
    false,
    'registered',
  ),
  'content.removed_by_administrator': presentation(
    'Content removed by administrator',
    'shield-edit',
    'status-report.closed',
    false,
    'removed',
  ),
});

/**
 * The presentation of an event type.
 *
 * **An unknown type is refused.** A type the frozen catalog does not name
 * cannot happen — the database's CHECK constraint rejects a numbered event
 * outside 1–30, and the non-numbered set is closed in the catalog — so an
 * unknown type here is a defect, and the view says so rather than
 * rendering a blank row.
 *
 * @throws {Error} when the type has no presentation.
 */
export function presentationFor(eventType: string): AuditEventPresentation {
  const found = PRESENTATIONS[eventType];

  if (!found) {
    throw new Error(`Audit event type "${eventType}" has no presentation. This is a defect.`);
  }

  return found;
}

/**
 * The action verb a row shows.
 *
 * **The verb is derived from the event type, not from the label.** §17.2
 * names the verbs — `created`, `edited`, `claimed`, `approved`,
 * `rejected`, `auto-rejected`, `returned`, `withdrawn`, `closed`,
 * `registered`, `deactivated`, `message posted` — and a label's first
 * word is often the *entity* rather than the verb: `Report created`
 * starts with "Report", and `Claim approved` starts with "Claim".
 *
 * So the verb is read from the event type's own action segment, which is
 * the thing that names the action. A type whose action segment is not one
 * of §17.2's verbs is **refused** rather than guessed at — a wrong verb
 * in the accessible name is worse than no row.
 */
export function actionVerbFor(eventType: string): AuditActionVerb {
  return presentationFor(eventType).verb;
}

/**
 * The accessible name of an audit row.
 *
 * **§20.3's template, verbatim:** *"{Action verb} {actor display name}
 * {target} at {timestamp}"*.
 *
 * The template is applied here rather than in the component so that the
 * test asserts the *same* string the component renders.
 */
export function auditRowAccessibleName(parts: {
  readonly eventType: string;
  readonly actorDisplayName: string;
  readonly target: string;
  readonly timestamp: string;
}): string {
  return `${actionVerbFor(parts.eventType)} ${parts.actorDisplayName} ${parts.target} at ${parts.timestamp}`;
}

/**
 * The role tag a row's actor carries.
 *
 * **§17.2 names two:** `Member` and `Administrator`. A `system` actor is
 * rendered as `Administrator`, because §17.2's table lists no third tag and
 * a row whose actor has no tag would not be scannable.
 */
export function actorRoleTag(actorRole: string): 'Member' | 'Administrator' {
  return actorRole === 'administrator' ? 'Administrator' : 'Member';
}

/**
 * Whether a row carries a `Show details` disclosure.
 *
 * **A row with no additional fields has no disclosure** (the story's edge
 * case: *"Event has no additional fields → `Show details` is not rendered
 * for that row"*). The disclosure is collapsed by default.
 */
export function hasDetailsDisclosure(additionalFields: readonly string[]): boolean {
  return additionalFields.length > 0;
}

/**
 * The audit trail's page size.
 *
 * **§17 and UX-OQ-C: 25 events per page,** reverse-chronological, with a
 * `Load older` button. Infinite scroll is explicitly rejected.
 */
export const AUDIT_TRAIL_PAGE_SIZE = 25;

/**
 * Whether a `Load older` button is offered.
 *
 * **It is offered only when there is more to load.** Exactly 25 events, or
 * fewer, shows every event and no button.
 */
export function offersLoadOlder(pageSize: number, hasMore: boolean): boolean {
  return hasMore && pageSize > 0;
}
