'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { csrfHeaders } from './csrf';
import { StatusBadge } from './status-badge';

import {
  REVIEW_RESPONSES_LEDE,
  SELECT_FOR_VERIFICATION,
  SERVER_ERROR_MESSAGE,
  VIEW_RESPONSE_AND_THREAD,
  WHERE_FOUND_AREA_LABEL,
} from './member-copy';

export interface ReviewResponseRowView {
  readonly responseId: string;
  readonly displayStatus: string;
  readonly canonicalStatus: string;
  readonly submittedAt: string;
  readonly campusArea: string | null;
  readonly canSelect: boolean;
  readonly detailHref: string;
}

export interface ReviewResponsesPanelProps {
  readonly reportId: string;
  readonly reportName: string;
  readonly reportStatus: string;
  readonly rows: readonly ReviewResponseRowView[];
}

export function ReviewResponsesPanel({
  reportId,
  reportName,
  reportStatus,
  rows,
}: ReviewResponsesPanelProps): React.JSX.Element {
  const router = useRouter();
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

  return (
    <section className="review-responses">
      <header className="detail-section">
        <h1 className="hero__title">{reportName}</h1>
        <p className="hero__lede">
          <StatusBadge status={reportStatus} kind="Status" />
        </p>
        <p className="detail-section__body">{REVIEW_RESPONSES_LEDE}</p>

        {reportStatus === 'Verification Pending' ? (
          <p className="detail-section__body" role="status">
            {
              'You already selected a response for verification. An administrator will help confirm the match — you can still open each response to read messages.'
            }
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty-view__body">{'No recovery responses on this report yet.'}</p>
      ) : (
        <ul className="review-responses__list">
          {rows.map((row) => (
            <li key={row.responseId} className="review-responses__card detail-section--card">
              <div className="review-responses__card-head">
                <StatusBadge status={row.displayStatus} kind="Response status" />
                <span className="tabular review-responses__submitted">{row.submittedAt}</span>
              </div>

              {row.campusArea ? (
                <p className="detail-section__body">
                  <strong>{WHERE_FOUND_AREA_LABEL}:</strong> {row.campusArea}
                </p>
              ) : null}

              <div className="detail-section__actions review-responses__actions">
                <Link href={row.detailHref} className="button button--secondary">
                  {VIEW_RESPONSE_AND_THREAD}
                </Link>

                {row.canSelect ? (
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busyId !== null}
                    onClick={() => void selectResponse(row.responseId)}
                  >
                    {busyId === row.responseId ? 'Selecting…' : SELECT_FOR_VERIFICATION}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="detail-section__actions">
        <Link href={`/my/reports/${reportId}`} className="button button--tertiary">
          {'Back to report'}
        </Link>
      </p>
    </section>
  );
}
