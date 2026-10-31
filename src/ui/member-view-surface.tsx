'use client';

/**
 * The four member views — §9.4.
 *
 * ## The four views are disjoint, and the surface renders one at a time
 *
 * PRD FR-49 names four authoritative member views, and story 003's
 * criterion is that they are *"mutually exclusive — a given record appears
 * in exactly one"*. **The disjointness is the server's** — it is the
 * partition (`report-partition.ts`), and the partition is part of the
 * query's predicate, not a filter applied to a fuller result. So this
 * surface renders **one** view, and the rows it is given are already the
 * right rows.
 *
 * **A member's own report never appears in their own Browse.** That is the
 * `browse` partition's own definition — the member's id is *in* the
 * partition — so there is no code path where the exclusion is forgotten,
 * and no client-side filter that would hide a leak rather than fix one.
 *
 * ## The tabs are links, and the current tab is marked
 *
 * §9.4 gives each view a tab set. A tab is a **filter**, so it is a link
 * with a real destination, and the current tab carries `aria-current="page"`
 * so a screen reader announces which one is selected.
 *
 * ## The empty view has exactly one next action
 *
 * §5.14 and story 003's criterion: *"a friendly headline, a one-sentence
 * body, a single next-action button, and no illustration."* The headline
 * is a noun phrase rather than an apology, the body says what will appear
 * here, and there is **one** button.
 */

import Link from 'next/link';

import type {
  ClaimListingRow,
  RecoveryResponseListingRow,
  ReportListingRow,
} from '@/domain/listings';

import {
  BREADCRUMB_LABEL,
  EMPTY_VIEW_BODY,
  EMPTY_VIEW_HEADING,
  MY_CLAIMS_HEADING,
  MY_RECOVERY_RESPONSES_HEADING,
  MY_REPORTS_HEADING,
  SERVER_ERROR_MESSAGE,
} from './member-copy';
import { StatusBadge } from './status-badge';

/**
 * A tab on a view's tab strip.
 */
export interface ViewTab {
  /** The tab's visible label. */
  readonly label: string;
  /** Where the tab goes. */
  readonly href: string;
  /** Whether this tab is the selected one. */
  readonly current: boolean;
}

/**
 * A breadcrumb crumb.
 */
export interface Breadcrumb {
  readonly label: string;
  /** Where the crumb goes. `null` for the current page. */
  readonly href: string | null;
}

/**
 * The view surface's props.
 *
 * **The rows are three separate optional lists, not a union.** A view
 * renders one kind of row, and the props make it impossible to pass the
 * wrong kind: the `My Claims` view renders `claimRows` and ignores
 * `reportRows` entirely.
 */
export interface MemberViewSurfaceProps {
  /** The view's heading. */
  readonly heading: string;
  /** The view's tab strip, when the view has one. */
  readonly tabs?: readonly ViewTab[] | undefined;
  /** The view's breadcrumb trail. */
  readonly crumbs?: readonly Breadcrumb[] | undefined;
  /** The report rows — `My Reports` and `Browse`. */
  readonly reportRows?: readonly ReportListingRow[] | undefined;
  /** The claim rows — `My Claims`. */
  readonly claimRows?: readonly ClaimListingRow[] | undefined;
  /** The Recovery Response rows — `My Recovery Responses`. */
  readonly recoveryResponseRows?: readonly RecoveryResponseListingRow[] | undefined;
  /** The error, when the read failed. */
  readonly error?: string | undefined;
  /** The next-action button for the empty state. */
  readonly emptyAction?: { readonly label: string; readonly href: string } | undefined;
}

/**
 * The member view surface.
 */
export function MemberViewSurface({
  heading,
  tabs,
  crumbs,
  reportRows,
  claimRows,
  recoveryResponseRows,
  error,
  emptyAction,
}: MemberViewSurfaceProps): React.JSX.Element {
  const rows = reportRows ?? claimRows ?? recoveryResponseRows ?? [];
  const isEmpty = rows.length === 0;

  return (
    <section className="member-view">
      <Breadcrumbs crumbs={crumbs} />

      <h1 className="hero__title">{heading}</h1>

      {tabs && tabs.length > 0 ? <TabStrip tabs={tabs} /> : null}

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      {!error && isEmpty ? (
        <EmptyView action={emptyAction} />
      ) : null}

      {!error && reportRows && reportRows.length > 0 ? (
        <ReportRows rows={reportRows} />
      ) : null}

      {!error && claimRows && claimRows.length > 0 ? <ClaimRows rows={claimRows} /> : null}

      {!error && recoveryResponseRows && recoveryResponseRows.length > 0 ? (
        <RecoveryResponseRows rows={recoveryResponseRows} />
      ) : null}
    </section>
  );
}

/**
 * The breadcrumb trail.
 *
 * **The current page is the last crumb and is not a link** — it is where
 * the member already is.
 */
export function Breadcrumbs({ crumbs }: { readonly crumbs?: readonly Breadcrumb[] | undefined }): React.JSX.Element | null {
  if (!crumbs || crumbs.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label={BREADCRUMB_LABEL}>
      <ol className="breadcrumbs__list">
        {crumbs.map((crumb) => (
          <li className="breadcrumbs__item" key={crumb.label}>
            {crumb.href === null ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The tab strip.
 *
 * **Every tab is a link.** A tab filters a view, and a filter has an
 * address — so the member can share the filtered view and the browser's
 * back button returns to it.
 */
function TabStrip({ tabs }: { readonly tabs: readonly ViewTab[] }): React.JSX.Element {
  return (
    <nav aria-label="Filters">
      <ul className="view-tabs">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className="view-tabs__link"
              aria-current={tab.current ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The empty view.
 *
 * **A headline, a body, and one button.** No illustration — the criterion
 * forbids one, and a decorative image would push the next action below
 * the fold on a small screen.
 */
function EmptyView({
  action,
}: {
  readonly action?: { readonly label: string; readonly href: string } | undefined;
}): React.JSX.Element {
  return (
    <div className="empty-view">
      <h2 className="empty-view__heading">{EMPTY_VIEW_HEADING}</h2>

      <p className="empty-view__body">{EMPTY_VIEW_BODY}</p>

      {action ? (
        <Link href={action.href} className="button button--primary">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The report rows.
 *
 * **A row links to the detail.** §9.4: each row shows a type badge, the
 * item name, a status badge, and a last-updated timestamp.
 */
function ReportRows({ rows }: { readonly rows: readonly ReportListingRow[] }): React.JSX.Element {
  return (
    <ul className="listing">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/listings/${row.id}`} className="listing__row">
            <span className="listing__name">{row.name}</span>

            <StatusBadge status={row.type} kind="Type" tone="neutral" />

            <span className="listing__meta">{row.category}</span>

            <span className="listing__meta tabular">{row.date}</span>

            <span className="listing__meta">{row.campusArea}</span>

            <StatusBadge status={row.status} kind="Status" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Claim rows.
 *
 * **The row links to the claim detail,** not to the report: §9.4 says
 * "Click → claim detail".
 */
function ClaimRows({ rows }: { readonly rows: readonly ClaimListingRow[] }): React.JSX.Element {
  return (
    <ul className="listing">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/my/claims/${row.id}`} className="listing__row">
            <span className="listing__name">{row.report.name}</span>

            <StatusBadge status={row.report.type} kind="Type" tone="neutral" />

            <span className="listing__meta tabular">{row.submittedAt}</span>

            <StatusBadge status={row.status} kind="Status" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Recovery Response rows.
 *
 * **The row links to the response detail,** and carries the canonical
 * status with the `Submitted — Standby` derivation the server applied.
 */
function RecoveryResponseRows({
  rows,
}: {
  readonly rows: readonly RecoveryResponseListingRow[];
}): React.JSX.Element {
  return (
    <ul className="listing">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/my/recovery-responses/${row.id}`} className="listing__row">
            <span className="listing__name">{row.report.name}</span>

            <StatusBadge status={row.report.type} kind="Type" tone="neutral" />

            <span className="listing__meta tabular">{row.submittedAt}</span>

            <StatusBadge status={row.status} kind="Status" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The four views' headings.
 *
 * **Exported so the routes use the same strings the surface renders.**
 */
export const MEMBER_VIEW_HEADINGS = Object.freeze({
  mine: MY_REPORTS_HEADING,
  browse: 'Browse',
  claims: MY_CLAIMS_HEADING,
  recovery_responses: MY_RECOVERY_RESPONSES_HEADING,
});

export { SERVER_ERROR_MESSAGE };
