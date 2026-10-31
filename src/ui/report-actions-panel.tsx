'use client';

/**
 * The report actions panel — the client half of the reporter's actions.
 *
 * ## The plan is the domain's
 *
 * **The panel renders the plan the server produced** and makes no decision
 * of its own. Which actions are offered, and why something is blocked, is
 * `planReporterActions`'s answer — the interlocks between Edit, Delete, and
 * Withdraw live in the domain, so a surface cannot re-derive them
 * differently.
 *
 * ## The blocked actions are stated, not dropped
 *
 * Story 005's criterion: *"when an irreversible action was blocked at a
 * terminal point, the surface states the blocked-at-terminal reason in plain
 * English rather than silently doing nothing."* So `ReportActionsSurface`
 * renders a disabled control with its reason beside it.
 *
 * ## The destructive actions go to the API
 *
 * **Delete is `DELETE /api/reports/[id]/delete`; Withdraw is `POST
 * /api/reports/[id]/withdraw`.** A withdrawal is not a deletion — the report
 * and its history are preserved — so the two are different requests.
 *
 * **The server's refusal is surfaced.** The delete route answers a blocked
 * delete with a 409 and the domain's message, which names Withdraw as the
 * remedy — so a refusal is shown to the member rather than swallowed.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ReporterActionPlan } from '@/domain/listings';

import { csrfHeaders } from './csrf';
import { ReportActionsSurface } from './report-actions-surface';

import { SERVER_ERROR_MESSAGE } from './member-copy';

/**
 * The report actions panel's props.
 */
export interface ReportActionsPanelProps {
  /** The report's id. */
  readonly reportId: string;
  /** The plan the domain produced. */
  readonly plan: ReporterActionPlan;
}

/**
 * The report actions panel.
 */
export function ReportActionsPanel({
  reportId,
  plan,
}: ReportActionsPanelProps): React.JSX.Element {
  const router = useRouter();

  const [failure, setFailure] = useState<string | null>(null);

  /**
   * Delete the report.
   *
   * **A successful delete navigates to the member's own reports,** because
   * the report is gone and there is nothing to re-read.
   */
  const remove = useCallback(async (): Promise<void> => {
    setFailure(null);

    try {
      const response = await fetch(`/api/reports/${reportId}/delete`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });

      if (response.ok) {
        router.push('/my/reports');
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };

      setFailure(body.error ?? SERVER_ERROR_MESSAGE);
    } catch {
      setFailure(SERVER_ERROR_MESSAGE);
    }
  }, [reportId, router]);

  /**
   * Withdraw the report.
   *
   * **A successful withdrawal refreshes the route,** so the report's new
   * `Closed` status and the withdrawn participation's new status both come
   * from the server.
   */
  const withdraw = useCallback(async (): Promise<void> => {
    setFailure(null);

    try {
      const response = await fetch(`/api/reports/${reportId}/withdraw`, {
        method: 'POST',
        headers: csrfHeaders(),
      });

      if (response.ok) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };

      setFailure(body.error ?? SERVER_ERROR_MESSAGE);
    } catch {
      setFailure(SERVER_ERROR_MESSAGE);
    }
  }, [reportId, router]);

  return (
    <>
      {failure ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{failure}</p>
        </div>
      ) : null}

      <ReportActionsSurface
        plan={plan}
        onEdit={() => {
          router.push(`/my/reports/${reportId}/edit`);
        }}
        onDelete={() => {
          void remove();
        }}
        onWithdraw={() => {
          void withdraw();
        }}
      />
    </>
  );
}
