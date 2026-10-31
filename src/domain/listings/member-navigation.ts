/**
 * The member navigation — the topbar's entries and the four views' tabs.
 *
 * ## What this module is for
 *
 * EXPERIENCE.md §3.2 says the active member's top nav exposes *"the four
 * authoritative views: `My Reports`, `Browse`, `My Claims`, `My Recovery
 * Responses` — plus `Report ▾` (Lost / Found) and `Account`."* The four
 * views are **disjoint** (PRD FR-49), and the nav is what makes that
 * partition navigable.
 *
 * **The nav is data, not markup.** Every topbar in the product is the same
 * component with a different entry list, and the entry list is what differs:
 * the anonymous topbar has one link, the Pending header has none, the
 * administrator topbar has the four queues. So the entries live here, as
 * data, and the topbar renders whichever list it is given.
 *
 * ## Why the list is closed
 *
 * The list of topbar entries is **a closed set per actor**, exactly as the
 * administrator's four queues are a closed set. A closed set is a
 * compile-time decision: adding a fifth entry to the member nav is a
 * deliberate act, not something that can happen by accident. And FR-30's
 * absence is thereby structural — there is no slot into which a
 * notification bell could be added.
 *
 * ## The four views are the FR-49 partitions
 *
 * The nav's four entries are the four member partitions, and the mapping is
 * one-to-one. `My Reports` is `mine`, `Browse` is `browse`, `My Claims` is
 * `claims`, and `My Recovery Responses` is `recovery_responses`. The
 * partition is not a separate concept that the nav happens to mirror — the
 * nav entry **names** the partition, and the route is derived from it, so a
 * nav entry and the view it opens cannot drift apart.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The four authoritative member views (PRD FR-49).
 *
 * **The order is the nav's order.** §3.2 lists them as `My Reports`,
 * `Browse`, `My Claims`, `My Recovery Responses`, and the topbar renders
 * them in that order.
 *
 * **The set is closed.** These are the only four views, and the nav is the
 * only place a member can reach a participation view from.
 */
export const MEMBER_VIEWS = ['mine', 'browse', 'claims', 'recovery_responses'] as const;

/** One of the four member views. */
export type MemberView = (typeof MEMBER_VIEWS)[number];

/** True when `value` is one of the four member views. */
export function isMemberView(value: string): value is MemberView {
  return (MEMBER_VIEWS as readonly string[]).includes(value);
}

/**
 * A topbar entry.
 *
 * **Every entry names its own destination.** The route is part of the entry
 * rather than something the topbar computes, so a link's label and where it
 * goes cannot disagree.
 */
export interface TopbarEntry {
  /** The entry's visible label. */
  readonly label: string;
  /** Where the entry goes. */
  readonly href: string;
}

/**
 * The four view entries, in nav order.
 *
 * **The labels are §3.2's, verbatim.**
 */
export const MEMBER_VIEW_LABELS: Readonly<Record<MemberView, string>> = Object.freeze({
  mine: 'My Reports',
  browse: 'Browse',
  claims: 'My Claims',
  recovery_responses: 'My Recovery Responses',
});

/**
 * The route each member view lives at.
 *
 * **These are §3.1's routes, verbatim.** The one that is not a straight
 * member-view name is `Browse`: its route is `/listings`, because the
 * anonymous and the member Browse are the same surface at the same URL —
 * §9.4 says *"Same surface as anonymous listings but with richer view"*.
 */
export const MEMBER_VIEW_ROUTES: Readonly<Record<MemberView, string>> = Object.freeze({
  mine: '/my/reports',
  browse: '/listings',
  claims: '/my/claims',
  recovery_responses: '/my/recovery-responses',
});

/**
 * The four view entries, in nav order.
 *
 * **Derived from the two maps above,** so the label, the route, and the
 * view cannot drift apart: there is one place where each is written down.
 */
export const MEMBER_VIEW_ENTRIES: readonly TopbarEntry[] = Object.freeze(
  MEMBER_VIEWS.map((view) => ({
    label: MEMBER_VIEW_LABELS[view],
    href: MEMBER_VIEW_ROUTES[view],
  })),
);

/**
 * The `Report ▾` menu's entries.
 *
 * **§10.1: the type is encoded in the URL** — `/report/lost` and
 * `/report/found`. The menu offers both, and there is **no in-form switch**:
 * the form's type is fixed by the URL it was opened at.
 */
export const REPORT_MENU_ENTRIES: readonly TopbarEntry[] = Object.freeze([
  { label: 'Report Lost Item', href: '/report/lost' },
  { label: 'Report Found Item', href: '/report/found' },
]);

/**
 * The `Account ▾` menu's entries.
 *
 * **Exactly two.** §9.4: *"Profile entry (FR-52) and Logout."* There is no
 * `/account` route — the menu is navigation chrome, not a page — and Theme
 * is **not** here, because §19 makes Theme a separate topbar icon control
 * on every surface.
 */
export const ACCOUNT_MENU_ENTRIES: readonly TopbarEntry[] = Object.freeze([
  { label: 'Profile', href: '/my/profile' },
]);

/**
 * The `Report ▾` menu's label.
 *
 * §3.2 names it with the disclosure triangle.
 */
export const REPORT_MENU_LABEL = 'Report ▾';

/**
 * The `Account ▾` menu's label.
 *
 * §3.2 names it with the disclosure triangle.
 */
export const ACCOUNT_MENU_LABEL = 'Account ▾';

/**
 * The label of the member nav's landmark.
 *
 * **The nav's purpose is announced, not just its links.** A screen reader
 * user hears "My Reports, Browse, …" as a list of links; the landmark's
 * label tells them they are in the member's navigation.
 */
export const MEMBER_NAV_LABEL = 'Member navigation';
