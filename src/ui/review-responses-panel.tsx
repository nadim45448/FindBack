'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { csrfHeaders, useCsrfToken } from './csrf';
import { StatusBadge } from './status-badge';

import {
  REVIEW_RESPONSES_LEDE,
  REVIEW_RESPONSES_META_DATE_FOUND,
  REVIEW_RESPONSES_META_OBSERVED,
  REVIEW_RESPONSES_META_SUBMITTED,
  REVIEW_RESPONSES_META_WHERE,
  REVIEW_RESPONSES_SELECTED_LABEL,
  REVIEW_RESPONSES_SUMMARY_CLOSED,
  REVIEW_RESPONSES_SUMMARY_EMPTY,
  REVIEW_RESPONSES_SUMMARY_OPEN,
  REVIEW_RESPONSES_SUMMARY_RETURNED,
  REVIEW_RESPONSES_SUMMARY_VERIFICATION_PENDING,
  SELECT_FOR_VERIFICATION,
  SERVER_ERROR_MESSAGE,
  VIEW_RESPONSE_AND_THREAD,
  reviewResponsesPageHeading,
} from './member-copy';

export interface ReviewResponseRowView {
  readonly responseId: string;
  readonly displayStatus: string;
  readonly canonicalStatus: string;
  readonly submittedAt: string;
  readonly campusArea: string | null;
  readonly exactPlace: string | null;
  readonly observedIdentifyingDetails: string | null;
  readonly dateFound: string | null;
  readonly responderDisplayName: string;
  readonly canSelect: boolean;
  readonly isSelected: boolean;
  readonly detailHref: string;
}

export interface ReviewResponsesPanelProps {
  readonly reportId: string;
  readonly reportName: string;
  readonly reportStatus: string;
  readonly selectedResponseId: string | null;
  readonly rows: readonly ReviewResponseRowView[];
}

function formatSubmittedAt(iso: string): string {
  if (iso.length >= 10 && iso[4] === '-' && iso[7] === '-') {
    return iso.slice(0, 10);
  }

  return iso;
}

function whereFoundLabel(campusArea: string | null, exactPlace: string | null): string {
  const parts = [campusArea, exactPlace].filter((part) => part && part.length > 0);

  return parts.length > 0 ? parts.join(' · ') : '—';
}

function reviewSummaryMessage(
  reportStatus: string,
  rowCount: number,
  selectedResponseId: string | null,
): string {
  if (reportStatus === 'Verification Pending' && selectedResponseId) {
    return REVIEW_RESPONSES_SUMMARY_VERIFICATION_PENDING;
  }

  if (reportStatus === 'Returned') {
    return REVIEW_RESPONSES_SUMMARY_RETURNED;
  }

  if (reportStatus === 'Closed') {
    return REVIEW_RESPONSES_SUMMARY_CLOSED;
  }

  if (rowCount === 0) {
    return REVIEW_RESPONSES_SUMMARY_EMPTY;
  }

  return REVIEW_RESPONSES_SUMMARY_OPEN;
}

export function ReviewResponsesPanel({
  reportId,
  reportName,
  reportStatus,
  selectedResponseId,
  rows,
}: ReviewResponsesPanelProps): React.JSX.Element {
  const router = useRouter();
  useCsrfToken();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectResponse = useCallback(
    async (responseId: string): Promise<void> => {
      setBusyId(responseId);
      setError(null);

      try {
        const response = await fetch(
          `/api/reports/${reportId}/recovery-responses/${responseId}/select`,
          { method: 'POST', headers: csrfHeaders() },
        );

        const body = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          setError(body.error ?? SERVER_ERROR_MESSAGE);
          return;
        }

        router.refresh();
      } catch {
        setError(SERVER_ERROR_MESSAGE);
      } finally {
        setBusyId(null);
      }
    },
    [reportId, router],
  );

  const summary = reviewSummaryMessage(reportStatus, rows.length, selectedResponseId);

  return (
    <div className="member-view-page review-responses-page">
      <div className="member-view-page__head">
        <h1 className="member-view-page__title">{reviewResponsesPageHeading(reportName)}</h1>
      </div>

      <p className="field__helper member-view-page__lede">{REVIEW_RESPONSES_LEDE}</p>

      <div className="banner banner--info review-responses-page__summary" role="status">
        <p>{summary}</p>
      </div>

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty-view__body">{REVIEW_RESPONSES_SUMMARY_EMPTY}</p>
      ) : (
        <ul className="review-responses__list">
          {rows.map((row) => (
            <li
              key={row.responseId}
              className={
                row.isSelected
                  ? 'review-response-card review-response-card--selected'
                  : 'review-response-card'
              }
            >
              <div className="review-response-card__head">
                <p className="review-response-card__responder">
                  <strong>{row.responderDisplayName}</strong>
                </p>

                <StatusBadge status={row.displayStatus} kind="Response status" />
              </div>

              <dl className="review-response-card__meta">
                <dt>{REVIEW_RESPONSES_META_WHERE}</dt>
                <dd>{whereFoundLabel(row.campusArea, row.exactPlace)}</dd>

                <dt>{REVIEW_RESPONSES_META_OBSERVED}</dt>
                <dd>{row.observedIdentifyingDetails?.trim() || '—'}</dd>

                <dt>{REVIEW_RESPONSES_META_DATE_FOUND}</dt>
                <dd className="tabular">{row.dateFound ?? '—'}</dd>

                <dt>{REVIEW_RESPONSES_META_SUBMITTED}</dt>
                <dd className="tabular">{formatSubmittedAt(row.submittedAt)}</dd>
              </dl>

              <div className="review-response-card__actions">
                {row.canSelect ? (
                  <button
                    type="button"
                    className="button button--primary button--sm"
                    disabled={busyId !== null}
                    onClick={() => void selectResponse(row.responseId)}
                  >
                    {busyId === row.responseId ? 'Selecting…' : SELECT_FOR_VERIFICATION}
                  </button>
                ) : row.isSelected ? (
                  <span className="review-response-card__selected-label">
                    {REVIEW_RESPONSES_SELECTED_LABEL}
                  </span>
                ) : null}

                <Link
                  href={row.detailHref}
                  className="button button--secondary button--sm"
                >
                  {VIEW_RESPONSE_AND_THREAD}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="review-responses-page__back">
        <Link href={`/my/reports/${reportId}`} className="button button--tertiary button--sm">
          {'Back to report'}
        </Link>
      </p>
    </div>
  );
}
