'use client';

import { useCallback, useEffect, useRef } from 'react';

import { CANCEL } from './member-copy';

/**
 * A modal confirmation — §5.10.
 *
 * **Focus is trapped while open, Escape cancels, and closing restores focus
 * to the control that opened the dialog.**
 */
export function ConfirmationDialog({
  heading,
  body,
  confirmLabel,
  confirmClassName = 'button button--primary',
  onConfirm,
  onCancel,
}: {
  readonly heading: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly confirmClassName?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    confirmRef.current?.focus();
  }, []);

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

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    },
    [onCancel],
  );

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
            className={confirmClassName}
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
