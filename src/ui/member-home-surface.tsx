'use client';

/**
 * The member dashboard — §9.4's `/home`, mockup `07-dashboard.html`.
 */

import Link from 'next/link';

import type { MemberDashboardStats } from '@/application/listings/ports/member-dashboard-reader';

import { MEMBER_VIEW_ENTRIES } from '@/domain/listings';

import { greetingName, salutation } from './greeting';
import {
  HOME_QUICK_ACTIONS,
  HOME_REPORT_FOUND_BODY,
  HOME_REPORT_FOUND_TITLE,
  HOME_REPORT_LOST_BODY,
  HOME_REPORT_LOST_TITLE,
  HOME_STAT_APPROVED_CLAIMS,
  HOME_STAT_OPEN_REPORTS,
  HOME_STAT_PENDING_CLAIMS,
  HOME_STAT_RETURNED_ITEMS,
  HOME_STAT_RESPONSES_TO_REVIEW,
  HOME_VIEW_BODIES,
  HOME_VIEW_ICONS,
  HOME_VIEW_TITLES,
  HOME_VIEWS_HEADING,
  HOME_WELCOME_SUB,
  REPORT_FOUND_ITEM,
  REPORT_LOST_ITEM,
} from './member-copy';

export interface MemberHomeSurfaceProps {
  readonly displayName?: string | undefined;
  readonly stats?: MemberDashboardStats | null | undefined;
  readonly statsError?: string | undefined;
}

export function MemberHomeSurface({
  displayName,
  stats,
  statsError,
}: MemberHomeSurfaceProps): React.JSX.Element {
  const name = greetingName(displayName);
  const greeting = `${salutation(new Date())}, ${name}.`;

  const openReports = stats?.openReports ?? 0;
  const pendingClaims = stats?.pendingClaims ?? 0;
  const approvedClaims = stats?.approvedClaims ?? 0;
  const returnedItems = stats?.returnedItems ?? 0;
  const responsesToReview = stats?.responsesToReview ?? 0;

  return (
    <section className="member-home">
      <section className="member-welcome" aria-labelledby="member-welcome-greeting">
        <h1 className="member-welcome__greeting" id="member-welcome-greeting">
          {greeting}
        </h1>
        <p className="member-welcome__sub">{HOME_WELCOME_SUB}</p>
      </section>

      {statsError ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{statsError}</p>
        </div>
      ) : null}

      <div className="member-stat-row" aria-label="Your summary">
        <div className="member-stat">
          <p className="member-stat__num tabular">{openReports}</p>
          <p className="member-stat__label">{HOME_STAT_OPEN_REPORTS}</p>
        </div>

        <div className="member-stat member-stat--accent">
          <p className="member-stat__num tabular">{pendingClaims}</p>
          <p className="member-stat__label">{HOME_STAT_PENDING_CLAIMS}</p>
        </div>

        <div className="member-stat">
          <p className="member-stat__num tabular">{approvedClaims}</p>
          <p className="member-stat__label">{HOME_STAT_APPROVED_CLAIMS}</p>
        </div>

        <div className="member-stat">
          <p className="member-stat__num tabular">{returnedItems}</p>
          <p className="member-stat__label">{HOME_STAT_RETURNED_ITEMS}</p>
        </div>

        <Link href="/my/reports" className="member-stat member-stat--link">
          <p className="member-stat__num tabular">{responsesToReview}</p>
          <p className="member-stat__label">{HOME_STAT_RESPONSES_TO_REVIEW}</p>
        </Link>
      </div>

      <section className="member-home__section" aria-labelledby="member-quick-actions">
        <h2 className="member-home__heading" id="member-quick-actions">
          {HOME_QUICK_ACTIONS}
        </h2>

        <div className="action-grid">
          <article className="action-card">
            <div className="action-card__icon" aria-hidden="true">
              ↗
            </div>
            <h3 className="action-card__title">{HOME_REPORT_LOST_TITLE}</h3>
            <p className="action-card__body">{HOME_REPORT_LOST_BODY}</p>
            <div className="action-card__cta">
              <Link href="/report/lost" className="button button--primary">
                {REPORT_LOST_ITEM}
              </Link>
            </div>
          </article>

          <article className="action-card action-card--found">
            <div className="action-card__icon" aria-hidden="true">
              ↘
            </div>
            <h3 className="action-card__title">{HOME_REPORT_FOUND_TITLE}</h3>
            <p className="action-card__body">{HOME_REPORT_FOUND_BODY}</p>
            <div className="action-card__cta">
              <Link href="/report/found" className="button button--primary">
                {REPORT_FOUND_ITEM}
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="member-home__section" aria-labelledby="member-destinations">
        <h2 className="member-home__heading" id="member-destinations">
          {HOME_VIEWS_HEADING}
        </h2>

        <ul className="action-grid">
          {MEMBER_VIEW_ENTRIES.map((entry) => (
            <li key={entry.href}>
              <Link href={entry.href} className="action-card action-card--link" aria-label={entry.label}>
                <div className="action-card__icon" aria-hidden="true">
                  {HOME_VIEW_ICONS[entry.href]}
                </div>
                <h3 className="action-card__title" aria-hidden="true">
                  {HOME_VIEW_TITLES[entry.href] ?? entry.label}
                </h3>
                <p className="action-card__body" aria-hidden="true">
                  {HOME_VIEW_BODIES[entry.href]}
                </p>
                <span className="action-card__open" aria-hidden="true">
                  Open {entry.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
