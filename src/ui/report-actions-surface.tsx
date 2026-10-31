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

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DELETE_CONFIRMATION_COPY,
  WITHDRAW_CONFIRMATION_COPY,
  type ReporterActionPlan,
} from '@/domain/listings';

import {
  ADMINISTRATOR_ONLY_WORKFLOW,
  CANCEL,
  DELETE,
  EDIT,
  REPORT_CLOSED_CANNOT_EDIT,
  REPORT_HAS_INTERACTION_CANNOT_DELETE,
  WITHDRAW,
} from './member-copy';

/**
 * The reporter actions surface's props.
 */
export interface ReportActionsSurfaceProps {
  /** The plan the domain produced. */
  readonly plan: ReporterActionPlan;
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
  onEdit,
  onDelete,
  onWithdraw,
}: ReportActionsSurfaceProps): React.JSX.Element {
  const [confirming, setConfirming] = useState<'delete' | 'withdraw' | null>(null);

  return (
    <div className="button-row">
      {plan.edit.kind === 'Permitted' ? (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            onEdit?.();
          }}
        >
          {EDIT}
        </button>
      ) : (
        <BlockedAction label={EDIT} reason={REPORT_CLOSED_CANNOT_EDIT} />
      )}

      {/*
        **Delete and Withdraw are alternatives.** §10.4: once a Claim
        (Found) or RR (Lost) exists, "the reporter must use Withdraw
        instead". So when delete is blocked by an interaction, Withdraw is
        the action offered — and the plan has already decided that.
      */}
      {plan.delete.kind === 'Permitted' ? (
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            setConfirming('delete');
          }}
        >
          {DELETE}
        </button>
      ) : plan.withdraw.kind === 'Permitted' ? (
        <BlockedAction
          label={DELETE}
          reason={
            plan.delete.kind === 'Blocked' && plan.delete.reason === 'InteractionExists'
              ? REPORT_HAS_INTERACTION_CANNOT_DELETE
              : REPORT_CLOSED_CANNOT_EDIT
          }
        />
      ) : (
        <BlockedAction label={DELETE} reason={REPORT_CLOSED_CANNOT_EDIT} />
      )}

      {plan.withdraw.kind === 'Permitted' ? (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setConfirming('withdraw');
          }}
        >
          {WITHDRAW}
        </button>
      ) : plan.administratorOnly ? (
        <BlockedAction label={WITHDRAW} reason={ADMINISTRATOR_ONLY_WORKFLOW} />
      ) : (
        <BlockedAction label={WITHDRAW} reason={REPORT_CLOSED_CANNOT_EDIT} />
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
function BlockedAction({
  label,
  reason,
}: {
  readonly label: string;
  readonly reason: string;
}): React.JSX.Element {
  return (
    <span className="button-row">
      <button type="button" className="button button--secondary" disabled>
        {label}
      </button>

      <span className="field__helper">{reason}</span>
    </span>
  );
}

/**
 * The confirmation dialog.
 *
 * **The focus is trapped while it is open, Escape dismisses it as a
 * cancel, and closing returns focus to the element that opened it.**
 *
 * The trigger's focus is captured on open — before the dialog renders —
 * because by the time the effect runs, the trigger may have been blurred
 * by the click.
 */
function ConfirmationDialog({
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  readonly heading: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  /**
   * Capture the trigger and move focus into the dialog.
   *
   * **The active element is captured before the effect runs,** so the
   * element that opened the dialog is the one focus returns to.
   */
  useEffect(() => {
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    confirmRef.current?.focus();
  }, []);

  /**
   * The focus trap.
   *
   * **Tab and Shift+Tab cycle within the dialog.** The dialog is modal, so
   * focus must not escape it while it is open — a keyboard user who tabs
   * past the last control would otherwise land on the page behind an
   * overlay they cannot see.
   */
  const trapFocus = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (!focusable || focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  /**
   * Escape dismisses the dialog as a cancel.
   *
   * **The listener is on the dialog itself,** so an Escape elsewhere on
   * the page does not close it.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    },
    [onCancel],
  );

  /**
   * Return focus to the trigger when the dialog closes.
   */
  useEffect(
    () => () => {
      restoreFocusTo.current?.focus();
    },
    [],
  );

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
        onKeyDown={(event) => {
          onKeyDown(event);
          trapFocus(event);
        }}
      >
        <h2 className="modal__heading" id="modal-heading">
          {heading}
        </h2>

        <p className="modal__body">{body}</p>

        <p className="button-row">
          <button
            ref={confirmRef}
            type="button"
            className="button button--primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>

          <button type="button" className="button button--tertiary" onClick={onCancel}>
            {CANCEL}
          </button>
        </p>
      </div>
    </div>
  );
}

export type { ReporterActionPlan };
