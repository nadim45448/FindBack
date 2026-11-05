'use client';

/**
 * The reporter's actions — §10.4.
 *
 * ## The actions are the domain's plan, rendered
 *
 * `planReporterActions` decides what is offered and why something is
 * blocked. **This component makes no decision of its own** — it renders
 * the plan it is given. The interlocks between Edit, Delete, and Withdraw
 * live in the domain, where the decisions live, so a surface cannot
 * re-derive them differently.
 *
 * ## A blocked action is stated, not silently dropped
 *
 * Story 005's criterion: *"when an irreversible action was blocked at a
 * terminal point, the surface states the blocked-at-terminal reason in
 * plain English rather than silently doing nothing."*
 *
 * **So a blocked action renders as a disabled control with its reason
 * beside it** — not as an absent control. The member learns that the
 * action exists and why it is unavailable, which is different from a
 * member who never sees it and does not know it exists.
 *
 * ## The destructive actions confirm
 *
 * §10.4's modals are named in the spine, and the copy lives in the
 * domain (`report-lifecycle-messages.ts`) — **the surface renders the
 * domain's constants**, so the modal's text cannot drift from the frozen
 * UX.
 *
 * The modal **traps focus**, **dismisses on Escape as a cancel**, and
 * **returns focus to the triggering element** — §5.10's dialog
 * requirements.
 */

import { useState } from 'react';

import { ConfirmationDialog } from './confirmation-dialog';

import {
  DELETE_CONFIRMATION_COPY,
  withdrawalBlockMessage,
  WITHDRAW_CONFIRMATION_COPY,
  type ReporterActionAvailability,
  type ReporterActionPlan,
  type ReportStatus,
  type ReportType,
} from '@/domain/listings';

import {
  ADMINISTRATOR_ONLY_WORKFLOW,
  DELETE,
  EDIT,
  LOST_OWNER_AWAITING_RETURN_CALLOUT,
  LOST_OWNER_VERIFICATION_PENDING_CALLOUT,
  REPORT_CLOSED_CANNOT_EDIT,
  REPORT_HAS_INTERACTION_CANNOT_DELETE,
  WITHDRAW,
} from './member-copy';

/**
 * The reporter actions surface's props.
 */
/**
 * Callout copy shown under “You reported this item.”
 *
 * **Long delete-block reasons belong here,** not beside a disabled Delete
 * button in the action row — mockup `04-item-detail-reporter` shows Edit
 * and Withdraw only once someone has interacted.
 */
export function reporterCalloutNotice(
  plan: ReporterActionPlan,
  context?: {
    readonly status: ReportStatus;
    readonly type: ReportType;
    readonly hasMatchConfirmed?: boolean;
  },
): string | null {
  const parts: string[] = [];

  if (plan.administratorOnly) {
    parts.push(ADMINISTRATOR_ONLY_WORKFLOW);
  } else if (context?.type === 'Lost' && context.status === 'Verification Pending') {
    parts.push(
      context.hasMatchConfirmed
        ? LOST_OWNER_AWAITING_RETURN_CALLOUT
        : LOST_OWNER_VERIFICATION_PENDING_CALLOUT,
    );
  } else if (plan.delete.kind === 'Blocked' && plan.delete.reason === 'InteractionExists') {
    parts.push(REPORT_HAS_INTERACTION_CANNOT_DELETE);
  }

  if (plan.edit.kind === 'Blocked') {
    parts.push(reporterBlockMessage('edit', plan.edit));
  }

  if (plan.withdraw.kind === 'Blocked' && !plan.administratorOnly) {
    const verificationExplained =
      context?.type === 'Lost' && context.status === 'Verification Pending';

    if (!verificationExplained) {
      parts.push(reporterBlockMessage('withdraw', plan.withdraw));
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' ');
}

/** Whether the toolbar shows a Delete control (including disabled). */
export function showsDeleteInReporterToolbar(plan: ReporterActionPlan): boolean {
  if (plan.delete.kind === 'Permitted') {
    return true;
  }

  // **§10.4: once someone has interacted, Delete is never shown** — the
  // remedy is Withdraw, and a disabled Delete with the wrong reason only
  // clutters the toolbar.
  if (plan.delete.kind === 'Blocked' && plan.delete.reason === 'InteractionExists') {
    return false;
  }

  return plan.delete.kind === 'Blocked';
}

export interface ReportActionsSurfaceProps {
  /** The plan the domain produced. */
  readonly plan: ReporterActionPlan;
  /**
   * Reporter callout mode — mockup `04-item-detail-reporter`.
   *
   * **Only enabled actions render as buttons.** Block reasons live in the
   * callout note, not beside disabled controls in the action row.
   */
  readonly calloutOnly?: boolean | undefined;
  /** The edit handler. */
  readonly onEdit?: (() => void) | undefined;
  /** The delete handler. */
  readonly onDelete?: (() => void) | undefined;
  /** The withdraw handler. */
  readonly onWithdraw?: (() => void) | undefined;
}

/**
 * The reporter's actions.
 */
export function ReportActionsSurface({
  plan,
  calloutOnly = false,
  onEdit,
  onDelete,
  onWithdraw,
}: ReportActionsSurfaceProps): React.JSX.Element {
  const [confirming, setConfirming] = useState<'delete' | 'withdraw' | null>(null);

  return (
    <div className="reporter-toolbar-actions button-row">
      {plan.edit.kind === 'Permitted' ? (
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => {
            onEdit?.();
          }}
        >
          {EDIT}
        </button>
      ) : calloutOnly ? null : (
        <BlockedAction label={EDIT} reason={reporterBlockMessage('edit', plan.edit)} />
      )}

      {/*
        **Delete and Withdraw are alternatives.** §10.4: once a Claim
        (Found) or RR (Lost) exists, "the reporter must use Withdraw
        instead". The callout carries that explanation; the row offers
        Edit and Withdraw like the mockup reporter toolbar.
      */}
      {showsDeleteInReporterToolbar(plan) ? (
        plan.delete.kind === 'Permitted' ? (
          <button
            type="button"
            className="button button--danger button--sm"
            onClick={() => {
              setConfirming('delete');
            }}
          >
            {DELETE}
          </button>
        ) : calloutOnly ? null : (
          <BlockedAction label={DELETE} reason={reporterBlockMessage('delete', plan.delete)} />
        )
      ) : null}

      {plan.withdraw.kind === 'Permitted' ? (
        <button
          type="button"
          className="button button--tertiary button--sm"
          onClick={() => {
            setConfirming('withdraw');
          }}
        >
          {WITHDRAW}
        </button>
      ) : calloutOnly || plan.administratorOnly ? null : (
        <BlockedAction label={WITHDRAW} reason={reporterBlockMessage('withdraw', plan.withdraw)} />
      )}

      {confirming === 'delete' ? (
        <ConfirmationDialog
          heading={DELETE}
          body={DELETE_CONFIRMATION_COPY}
          confirmLabel={DELETE}
          onConfirm={() => {
            setConfirming(null);
            onDelete?.();
          }}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      ) : null}

      {confirming === 'withdraw' ? (
        <ConfirmationDialog
          heading={WITHDRAW}
          body={WITHDRAW_CONFIRMATION_COPY}
          confirmLabel={WITHDRAW}
          onConfirm={() => {
            setConfirming(null);
            onWithdraw?.();
          }}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A blocked action.
 *
 * **The control is disabled and the reason is beside it.** The reason is
 * the point: a disabled button with no explanation tells the member
 * nothing they can act on.
 */
function reporterBlockMessage(
  action: 'edit' | 'delete' | 'withdraw',
  availability: ReporterActionAvailability,
): string {
  if (availability.kind === 'Permitted') {
    return '';
  }

  switch (availability.reason) {
    case 'TerminalStatus':
      return action === 'edit'
        ? REPORT_CLOSED_CANNOT_EDIT
        : withdrawalBlockMessage('TerminalStatus');
    case 'InteractionExists':
      return REPORT_HAS_INTERACTION_CANNOT_DELETE;
    case 'ClaimApproved':
      return withdrawalBlockMessage('ClaimApproved');
    case 'MatchConfirmed':
      return ADMINISTRATOR_ONLY_WORKFLOW;
    default: {
      const unreachable: never = availability.reason;
      throw new Error(`Unhandled reporter action block reason: ${String(unreachable)}`);
    }
  }
}

function BlockedAction({
  label,
  reason,
}: {
  readonly label: string;
  readonly reason: string;
}): React.JSX.Element {
  return (
    <span className="reporter-action-blocked">
      <button type="button" className="button button--secondary button--sm" disabled>
        {label}
      </button>

      <span className="reporter-action-blocked__reason field__helper">{reason}</span>
    </span>
  );
}

export type { ReporterActionPlan };
