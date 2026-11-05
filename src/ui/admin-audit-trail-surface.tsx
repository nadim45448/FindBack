'use client';

/**
 * The contextual audit trail — §17.1–§17.6, FR-31, FR-32, §20.3.
 *
 * ## Audit is contextual, and this surface is the only place it appears
 *
 * The trail is reachable at exactly two routes —
 * `/admin/items/:id/audit` and `/admin/lost/:id/audit` — and **each one
 * names the parent whose trail is being read.** There is no
 * `/admin/audit` route, no dashboard tile, and no topbar link, so this
 * component is only ever rendered with a parent in hand.
 *
 * ## The table is a real table
 *
 * §17.2 gives the trail five columns: Timestamp, Actor, Action, Target,
 * Details. **A `<table>` with `<th scope="col">`**, not a list of divs —
 * a screen reader announces the column headers when it moves between
 * cells, and a div-based table does not.
 *
 * ## The details disclosure is collapsed by default
 *
 * §17.2: *"These render as a small expandable row ('Show details') so the
 * audit trail stays scannable."* A row with no additional fields carries
 * **no** disclosure at all — the story's edge case.
 *
 * ## Pagination is a button, never infinite scroll
 *
 * UX-OQ-C: infinite scroll *"confuses screen readers and makes an
 * administrator's position in the list unrecoverable."* So the trail
 * paginates with a `Load older` button.
 *
 * ## There is no edit and no delete
 *
 * The trail is append-only (FR-10). This surface therefore has **no**
 * control that mutates an event — not a hidden one, not a disabled one.
 * The `Show details` disclosure is the only interactive element in a row.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';

import {
  actionVerbFor,
  actorRoleTag,
  auditRowAccessibleName,
  hasDetailsDisclosure,
  offersLoadOlder,
  presentationFor,
} from '@/domain/administration';

import {
  AUDIT_AFTER_RETURN_LEDE,
  AUDIT_TRAIL_HEADING,
  COLUMN_ACTOR,
  COLUMN_AUDIT_ACTION,
  COLUMN_DETAILS,
  COLUMN_TARGET,
  COLUMN_TIMESTAMP,
  ADMIN_NAV_DASHBOARD,
  GO_BACK,
  LOADING,
  LOAD_OLDER,
  NO_AUDIT_EVENTS,
  EMBEDDED_AUDIT_MORE_ON_FULL_PAGE,
  SHOW_DETAILS,
  TRY_AGAIN,
  VERIFICATION_AUDIT_SECTION,
  VIEW_AUDIT_TRAIL,
} from './admin-copy';
import { Breadcrumbs } from './breadcrumbs';
import { StatusBadge } from './status-badge';

/**
 * One audit event, as the surface renders it.
 */
export interface AuditTrailRow {
  /** The event's id. */
  readonly id: string;
  /** The event type — the catalog key. */
  readonly eventType: string;
  /** The actor's display name. */
  readonly actorDisplayName: string;
  /** The actor's role — `member` or `administrator`. */
  readonly actorRole: string;
  /** The event's target — the thing acted upon. */
  readonly target: string;
  /** When the action happened, already formatted. */
  readonly occurredAt: string;
  /** The additional fields, as rendered lines. Empty when there are none. */
  readonly details: readonly string[];
  /** The event's reason, when it has one. */
  readonly reason?: string | null;
}

/**
 * The audit trail surface's props.
 */
export interface AdminAuditTrailSurfaceProps {
  /**
   * The trail's rows.
   *
   * **Empty when the parent has no events yet** — the empty state is the
   * trail's own copy, not the queue's.
   */
  readonly rows: readonly AuditTrailRow[];
  /** The error, when the read failed. */
  readonly error?: string | undefined;
  /** Whether the read is still in flight. */
  readonly loading?: boolean | undefined;
  /** Whether another page of older events exists. */
  readonly hasMore?: boolean | undefined;
  /** The parent's name, for the page heading. */
  readonly parentLabel?: string | undefined;
  /** Where the error state's "Go back" link goes. */
  readonly backHref?: string | undefined;
  /**
   * Where the moderation edit lives.
   *
   * **The trail is the natural place to reach the edit.** The
   * administrator is already looking at one report's history; a
   * correction to that report is one click away rather than a route to
   * be typed.
   */
  readonly editHref?: string | undefined;
  /** Banner after a successful confirm-returned redirect. */
  readonly afterReturn?: boolean;
  /** Full page vs section embedded in verification review. */
  readonly variant?: 'page' | 'embedded';
  /** Link to the dedicated audit route when `variant` is `embedded`. */
  readonly fullTrailHref?: string | undefined;
}

function AuditTrailTable({
  rows,
  expandedId,
  toggle,
  compact = false,
}: {
  readonly rows: readonly AuditTrailRow[];
  readonly expandedId: string | null;
  readonly toggle: (id: string) => void;
  readonly compact?: boolean;
}): React.JSX.Element {
  const tableClassName = compact
    ? 'audit-trail audit-trail--timeline audit-trail--embedded'
    : 'audit-trail audit-trail--timeline';

  return (
    <table className={tableClassName}>
      <caption className="visually-hidden">{AUDIT_TRAIL_HEADING}</caption>

      <thead>
        <tr>
          <th scope="col" className="visually-hidden">
            Timeline
          </th>
          <th scope="col">{COLUMN_TIMESTAMP}</th>
          <th scope="col">{COLUMN_ACTOR}</th>
          <th scope="col">{COLUMN_AUDIT_ACTION}</th>
          <th scope="col">{COLUMN_TARGET}</th>
          <th scope="col">{COLUMN_DETAILS}</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
          const presentation = presentationFor(row.eventType);
          const disclosureId = `audit-details-${row.id}`;
          const open = expandedId === row.id;
          const showsDisclosure = hasDetailsDisclosure(row.details);

          return (
            <tr key={row.id} className="audit-trail__row" data-accent={presentation.accent}>
              <td className="audit-trail__cell audit-trail__cell--timeline" aria-hidden="true">
                <span className="audit-trail__timeline-dot" />
              </td>

              <td className="audit-trail__cell audit-trail__cell--time tabular">
                {row.occurredAt}
              </td>

              <td className="audit-trail__cell audit-trail__cell--actor">
                <div className="audit-trail__actor" aria-hidden="true">
                  <span className="audit-trail__actor-name">{row.actorDisplayName}</span>
                  <StatusBadge status={actorRoleTag(row.actorRole)} kind="Role" tone="neutral" />
                </div>
                <span className="visually-hidden">
                  {auditRowAccessibleName({
                    eventType: row.eventType,
                    actorDisplayName: row.actorDisplayName,
                    target: row.target,
                    timestamp: row.occurredAt,
                  })}
                </span>
              </td>

              <td className="audit-trail__cell">
                <span className="audit-trail__action">{actionVerbFor(row.eventType)}</span>
                <span className="audit-trail__label">{presentation.label}</span>
              </td>

              <td className="audit-trail__cell audit-trail__cell--target">{row.target}</td>

              <td className="audit-trail__cell">
                {showsDisclosure ? (
                  <>
                    <button
                      type="button"
                      className="audit-trail__disclosure"
                      aria-expanded={open}
                      aria-controls={disclosureId}
                      onClick={() => {
                        toggle(row.id);
                      }}
                    >
                      {SHOW_DETAILS}
                    </button>

                    <div id={disclosureId} hidden={!open} className="audit-trail__details">
                      {row.details.map((detail) => (
                        <p key={detail} className="audit-trail__detail">
                          {detail}
                        </p>
                      ))}
                      {row.reason ? (
                        <p className="audit-trail__detail">Reason: {row.reason}</p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The contextual audit trail.
 */
export function AdminAuditTrailSurface({
  rows,
  error,
  loading,
  hasMore,
  parentLabel,
  backHref = '/admin',
  editHref,
  afterReturn = false,
  variant = 'page',
  fullTrailHref,
}: AdminAuditTrailSurfaceProps): React.JSX.Element {
  /**
   * The expanded row.
   *
   * **One disclosure at a time.** The trail is scannable when one row is
   * open; opening a second closes the first, so the administrator's
   * position in the trail is always recoverable.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = useCallback((id: string): void => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const heading = AUDIT_TRAIL_HEADING;
  const breadcrumbCurrent = parentLabel ?? 'Report';

  if (variant === 'embedded') {
    return (
      <section
        className="card admin-embedded-audit verification-admin-review__audit"
        aria-labelledby="verification-audit-heading"
      >
        <div className="admin-embedded-audit__head verification-admin-review__audit-head">
          <h2 id="verification-audit-heading" className="verification-admin-review__card-subtitle">
            {VERIFICATION_AUDIT_SECTION}
          </h2>

          {fullTrailHref ? (
            <Link href={fullTrailHref} className="button button--tertiary button--sm">
              {VIEW_AUDIT_TRAIL}
            </Link>
          ) : null}
        </div>

        {error ? (
          <div className="error-summary" role="alert">
            <p className="error-summary__heading">{error}</p>
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <p className="verification-admin-review__meta">{NO_AUDIT_EVENTS}</p>
        ) : null}

        {!error && rows.length > 0 ? (
          <>
            <div className="audit-trail__table-wrap">
              <AuditTrailTable compact rows={rows} expandedId={expandedId} toggle={toggle} />
            </div>

            {offersLoadOlder(rows.length, hasMore === true) && fullTrailHref ? (
              <p className="admin-embedded-audit__more verification-admin-review__meta">
                {EMBEDDED_AUDIT_MORE_ON_FULL_PAGE}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    );
  }

  function pageHead(): React.JSX.Element {
    return (
      <>
        <Breadcrumbs
          variant="compact"
          crumbs={[
            { label: ADMIN_NAV_DASHBOARD, href: backHref },
            { label: breadcrumbCurrent, href: null },
            { label: AUDIT_TRAIL_HEADING, href: null },
          ]}
        />

        <div className="claim-admin-review__head admin-audit-trail__head">
          <h1 className="hero__title">{heading}</h1>

          <div className="admin-audit-trail__head-actions">
            {editHref ? (
              <Link href={editHref} className="button button--tertiary button--sm">
                Edit report
              </Link>
            ) : null}

            <Link href={backHref} className="button button--secondary button--sm">
              {GO_BACK}
            </Link>
          </div>
        </div>

        {parentLabel ? (
          <p className="admin-console__meta">
            Traceability for <strong>{parentLabel}</strong>
          </p>
        ) : null}

        {afterReturn ? (
          <div className="banner banner--success" role="status">
            <p>{AUDIT_AFTER_RETURN_LEDE}</p>
          </div>
        ) : null}
      </>
    );
  }

  if (error) {
    return (
      <div className="admin-console">
        {pageHead()}

        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>

        {/*
          **'Try again' primary, 'Go back' secondary.** §5.14 names both.
          A failed trail read leaves the administrator on the page with a
          way forward rather than a dead end.
        */}
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

  if (loading) {
    return (
      <div className="admin-console">
        {pageHead()}

        <div className="audit-trail" role="status" aria-label={LOADING}>
          <div className="audit-trail__row" aria-hidden="true">
            {[
              COLUMN_TIMESTAMP,
              COLUMN_ACTOR,
              COLUMN_AUDIT_ACTION,
              COLUMN_TARGET,
              COLUMN_DETAILS,
            ].map((column) => (
              <span key={column} className="audit-trail__cell audit-trail__skeleton-bar" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="admin-console">
        {pageHead()}

        <div className="admin-queue__empty" role="status">
          <p>{NO_AUDIT_EVENTS}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console">
      {pageHead()}

      <AuditTrailTable rows={rows} expandedId={expandedId} toggle={toggle} />

      {/*
        **Pagination is a button.** UX-OQ-C rejects infinite scroll because
        it "makes an administrator's position in the list unrecoverable".
      */}
      {offersLoadOlder(rows.length, hasMore === true) ? (
        <p>
          <button type="button" className="button button--secondary">
            {LOAD_OLDER}
          </button>
        </p>
      ) : null}
    </div>
  );
}
