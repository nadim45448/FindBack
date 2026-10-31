/**
 * FR-30 — the **absence** of an in-app notification stream.
 *
 * ## Why this module exists at all
 *
 * FR-30 is a **negative** requirement. It cannot be satisfied by a feature
 * and it cannot be verified by a positive test: "there is no bell" is not
 * a behaviour a test can assert without first deciding what a bell *is*.
 *
 * So this module makes the absence **checkable**. It names the surfaces a
 * notification stream would appear on, and it names the strings and
 * attributes that would betray one. A test then inspects every rendered
 * route's DOM for those names and finds nothing.
 *
 * **The absence is an architecture, not an omission.** The product has
 * exactly nine channels: the eight FR-46 business email events and the
 * FR-51 authentication email. The list below is closed, so a ninth
 * in-product channel has nowhere to be declared.
 *
 * ## The dashboard's `Recent activity` aggregation
 *
 * It was **deliberately removed** in the 2026-09-17 reconciliation. Its
 * return is a regression against a frozen contract, so its name is in the
 * forbidden set below and the verification checks for it like any other.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The notification channels the product supports.
 *
 * **Exactly nine, and the list is closed.**
 *
 * The eight FR-46 business events plus the FR-51 authentication email.
 * The FR-51 email is **not** a ninth FR-46 event — it is an authentication
 * message — and the distinction is load-bearing, because "FR-46 has nine
 * events" would be a false statement about a frozen PRD.
 */
export const SUPPORTED_NOTIFICATION_CHANNELS = Object.freeze([
  'email:fr46.event.1',
  'email:fr46.event.2',
  'email:fr46.event.3',
  'email:fr46.event.4',
  'email:fr46.event.5',
  'email:fr46.event.6',
  'email:fr46.event.7',
  'email:fr46.event.8',
  'email:fr51.password_reset',
] as const);

/** A supported notification channel. */
export type NotificationChannel = (typeof SUPPORTED_NOTIFICATION_CHANNELS)[number];

/**
 * The **FR-46 business event** channels, without the FR-51 authentication
 * email.
 *
 * **Exactly eight.** The PRD's catalogue is closed at eight, and this list
 * is what a test asserts against when it enumerates the business events.
 */
export const FR46_BUSINESS_EVENT_CHANNELS: readonly NotificationChannel[] = Object.freeze(
  SUPPORTED_NOTIFICATION_CHANNELS.filter(
    (channel) => channel !== 'email:fr51.password_reset',
  ),
);

/**
 * The names that would betray an in-app notification surface.
 *
 * **The check is a string search, so the list must be the strings a
 * developer would actually write.** A bell is named "notification" or
 * "bell"; a badge is "unread" or "badge"; a feed is "activity" or
 * "timeline".
 *
 * The list is used for **verification**, not for rendering: nothing in the
 * product imports it.
 */
export const NOTIFICATION_SURFACE_MARKERS: readonly string[] = Object.freeze([
  'notification-bell',
  'notification-center',
  'notification-centre',
  'notification-drawer',
  'notification-inbox',
  'notification-hub',
  'notification-count',
  'notification-badge',
  'unread-count',
  'unread-indicator',
  'unread-badge',
  'data-notification',
  'data-unread',
  'data-notification-count',
  'Recent activity',
  'recent-activity',
  'activity-feed',
  'activity-timeline',
  'Notifications',
]);

/**
 * The names that would betray the removed `Recent activity` aggregation.
 *
 * **A separate list, because this one is a regression** rather than a
 * forbidden feature: `Notifications` is forbidden because FR-30 forbids
 * the stream; `Recent activity` is forbidden because the reconciliation
 * removed it.
 */
export const REMOVED_AGGREGATION_MARKERS: readonly string[] = Object.freeze([
  'Recent activity',
  'recent-activity',
  'activity-feed',
]);

/**
 * The role a surface's confirmation plays.
 *
 * §5.9 and §9.4: a toast is for **the action the user just took**, and it
 * is `role="status"` (polite). A background event — a Claim approved, a
 * report returned, a new Pending Claim arriving — is **never** announced.
 */
export type ConfirmationScope = 'OwnAction' | 'BackgroundEvent';

/**
 * The confirmations the product may raise.
 *
 * **Only the user's own action.** A `BackgroundEvent` confirmation does not
 * exist, and the type says so: an implementer cannot write one without
 * changing this file.
 */
export const PERMITTED_CONFIRMATION_SCOPE: ConfirmationScope = 'OwnAction';

/**
 * The member-facing status history's shape — §17.5.
 *
 * **At most three entries, most recent first.** A member sees a short
 * status history on their own items, and *nothing* that exposes the
 * administrator's audit trail.
 */
export const MEMBER_STATUS_HISTORY_LIMIT = 3;

/**
 * The member-facing status history's entry.
 *
 * **Timestamp, status label, and "by {actor}"** — no audit verb, no
 * additional fields (§17.5). The absence of a `verb` field is the
 * structural statement that a member does not see the trail.
 */
export interface MemberStatusHistoryEntry {
  readonly timestamp: Date;
  readonly statusLabel: string;
  readonly actorDisplayName: string;
}

/**
 * The member-facing status history, capped at three entries.
 */
export function memberStatusHistory(
  entries: readonly MemberStatusHistoryEntry[],
): readonly MemberStatusHistoryEntry[] {
  return entries.slice(0, MEMBER_STATUS_HISTORY_LIMIT);
}
