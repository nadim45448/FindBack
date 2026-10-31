'use client';

/**
 * The administrator dashboard — FR-33, §15.1.
 *
 * The generated mockup is
 * `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/mockups/admin/01-dashboard.html`
 * (rendered by `admin-renderer.js`): a welcome card, then four queue cards
 * under "Review workload".
 *
 * ## Four tiles, and nothing else
 *
 * §15.1: *"Four count tiles at the top, each linking to the corresponding
 * queue."* The dashboard's whole job is routing an administrator into a
 * queue, so the tiles are **real links**.
 *
 * ## What is deliberately absent
 *
 * - **No `Recent activity` aggregation.**
 * - **No audit tile.** Audit is contextual (§17.1).
 * - **No `Reports to edit` tile.**
 * - **No notification bell, badge, or unread count.**
 */

import Link from 'next/link';

import {
  buildDashboardTiles,
  tileEmptyCopy,
  type DashboardCounts,
  type DashboardTile,
} from '@/domain/administration';

import {
  ADMIN_DASHBOARD_HEADING,
  ADMIN_DASHBOARD_META,
  ADMINISTRATOR_BADGE,
  GO_BACK,
  OPERATIONS_CONSOLE,
  REVIEW_WORKLOAD,
  TRY_AGAIN,
} from './admin-copy';
import { greetingName, longDate, salutation } from './greeting';

/** The dashboard's props. */
export interface AdminDashboardSurfaceProps {
  /** The four counts, keyed by queue. */
  readonly counts: DashboardCounts | null;
  /** The account's display name, for the welcome greeting. */
  readonly displayName?: string | null | undefined;
  /** The error, when the read failed. */
  readonly error?: string | undefined;
  /** Where the error state's "Go back" link goes. */
  readonly backHref?: string | undefined;
}

/**
 * The helper line under a queue card that still has work.
 */
function tileHelper(tile: DashboardTile): string {
  switch (tile.queue) {
    case 'pending-registrations':
      return `${tile.count} awaiting review`;
    case 'pending-claims':
      return `${tile.count} awaiting decision`;
    case 'awaiting-return':
      return `${tile.count} approved claim${tile.count === 1 ? '' : 's'} pending physical handoff`;
    case 'verifications':
      return 'Lost reports · awaiting Recovery Response verification';
  }
}

/**
 * The administrator dashboard.
 */
export function AdminDashboardSurface({
  counts,
  displayName,
  error,
  backHref = '/',
}: AdminDashboardSurfaceProps): React.JSX.Element {
  if (error) {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{ADMIN_DASHBOARD_HEADING}</h1>

        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>

        <p className="button-row">
          <button type="button" className="button button--primary">
            {TRY_AGAIN}
          </button>

          <Link href={backHref} className="button button--secondary">
            {GO_BACK}
          </Link>
        </p>
      </div>
    );
  }

  if (!counts) {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{ADMIN_DASHBOARD_HEADING}</h1>

        <div className="admin-tiles" role="status" aria-label="Loading the queues">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="admin-tile admin-tile--skeleton">
              <span className="admin-tile__label admin-tile__skeleton-bar" />
              <span className="admin-tile__count admin-tile__skeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tiles = buildDashboardTiles(counts);
  const now = new Date();
  const name = greetingName(displayName);

  return (
    <div className="admin-console">
      <section className="admin-welcome" aria-labelledby="admin-welcome-greeting">
        <div className="admin-welcome__accent" aria-hidden="true" />
        <div className="admin-welcome__inner">
          <div className="admin-welcome__main">
            <p className="admin-welcome__eyebrow">{OPERATIONS_CONSOLE}</p>
            <h1 className="admin-welcome__greeting" id="admin-welcome-greeting">
              {salutation(now)}, <em>{name}</em>.
            </h1>
            <p className="admin-welcome__meta">
              {ADMIN_DASHBOARD_META} · {longDate(now)}
            </p>
            <div className="admin-welcome__actions">
              <Link href="/admin/registrations" className="button button--secondary button--sm">
                Pending registrations
              </Link>
              <Link href="/admin/claims" className="button button--primary button--sm">
                Pending claims
              </Link>
            </div>
          </div>
          <span className="admin-welcome__badge">{ADMINISTRATOR_BADGE}</span>
        </div>
        <div className="admin-welcome__kpis" aria-label="Workload summary">
          <WelcomeKpi
            count={counts['pending-registrations']}
            label="Pending registrations"
            alert={counts['pending-registrations'] > 0}
          />
          <WelcomeKpi
            count={counts['pending-claims']}
            label="Pending claims"
            alert={counts['pending-claims'] > 0}
          />
          <WelcomeKpi count={counts['awaiting-return']} label="Awaiting return" />
        </div>
      </section>

      <h2 className="admin-console__section">{REVIEW_WORKLOAD}</h2>

      <div className="admin-tiles">
        {tiles.map((tile) => {
          const emptyCopy = tileEmptyCopy(tile);

          return (
            <Link
              key={tile.queue}
              href={tile.href}
              className="admin-tile"
              aria-label={`${tile.label}: ${tile.count}`}
            >
              <span className="admin-tile__count admin-tile__count--tabular">{tile.count}</span>
              <span className="admin-tile__label">{tile.label}</span>

              {emptyCopy ? (
                <span className="admin-tile__empty">
                  <svg
                    aria-hidden="true"
                    className="admin-tile__check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {emptyCopy}
                </span>
              ) : (
                <span className="admin-tile__hint">{tileHelper(tile)}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** One welcome-card KPI. */
function WelcomeKpi({
  count,
  label,
  alert = false,
}: {
  readonly count: number;
  readonly label: string;
  readonly alert?: boolean;
}): React.JSX.Element {
  return (
    <div className="admin-welcome__kpi">
      <div
        className={
          alert ? 'admin-welcome__kpi-num admin-welcome__kpi-num--alert' : 'admin-welcome__kpi-num'
        }
      >
        {count}
      </div>
      <div className="admin-welcome__kpi-label">{label}</div>
    </div>
  );
}
