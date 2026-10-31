'use client';

/**
 * The administrator queue surface — §15.2–§15.5, §5.7, §20.1, §21.
 *
 * ## One surface, four queues
 *
 * The four queues differ in their **columns** and their **rows**, not in
 * their behaviour. The ARIA grid pattern, the roving `tabindex`, the
 * arrow-key navigation, the empty states, and the loading and error states
 * are identical — so they are one component, and the differences are data.
 *
 * ## The ARIA grid pattern — §5.7, §20.1
 *
 * §5.7 names it for the `Items in Verification` queue, and the story
 * extends it to all four: *"the four operational queues are … the
 * `Items in Verification` queue uses the ARIA grid pattern (`role="grid"` /
 * `row` / `gridcell`) with roving `tabindex` and arrow-key row
 * navigation."*
 *
 * **Roving `tabindex` means exactly one row is in the tab order.** The
 * focused row carries `tabindex="0"`; every other row carries
 * `tabindex="-1"`. The arrow keys move the focus between rows, and the
 * cells inside the focused row are reached with Tab.
 *
 * ## The action column reaches the work item
 *
 * *"Every row action is a link or button that reaches the specific work
 * item, not a generic detail page."* The action is a **link**, because the
 * destination is a route and there is no state change to make.
 *
 * ## The empty states are per queue
 *
 * §15.2–§15.5 each name their own sentence, and **the Pending
 * Registrations queue carries a second line** that the other three do not.
 * The copy is data — it comes from the domain's
 * `OPERATIONAL_QUEUE_EMPTY_COPY`.
 *
 * ## No queue announces a change
 *
 * FR-30: a queue whose contents change raises **no** toast, bell, or
 * badge. There is no live region here, and the surface never polls.
 */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

import {
  emptyStateNoteFor,
  queueEmptyCopy,
  queueLabel,
  type OperationalQueueId,
} from '@/domain/administration';

import {
  COLUMN_ACTION,
  COLUMN_APPROVED_AT,
  COLUMN_CLAIMANT,
  COLUMN_CLAIM_ID,
  COLUMN_EMAIL,
  COLUMN_ITEM,
  COLUMN_NAME,
  COLUMN_OWNER,
  COLUMN_REGISTERED_AT,
  COLUMN_REPORT,
  COLUMN_ROLE,
  COLUMN_SELECTED_RESPONDER,
  COLUMN_SUBMITTED_AT,
  COLUMN_VERIFICATION_STARTED_AT,
  GO_BACK,
  LOADING,
  TRY_AGAIN,
} from './admin-copy';

/**
 * A queue's column.
 */
export interface QueueColumn {
  /** The column's heading. */
  readonly heading: string;
  /**
   * Whether the column can be sorted.
   *
   * §5.7: *"Sortable columns: submission time (default), claim/item ID."*
   * A sortable heading is a **button carrying `aria-sort`**.
   */
  readonly sortable?: boolean;
}

/**
 * A queue row's cells and its action.
 */
export interface QueueRowView {
  /** The row's stable key. */
  readonly key: string;
  /** The row's cells, in the column order. */
  readonly cells: readonly string[];
  /** The action's label. */
  readonly actionLabel: string;
  /** The action's destination. */
  readonly actionHref: string;
}

/** The queue surface's props. */
export interface AdminQueueSurfaceProps {
  /** Which queue this is. */
  readonly queue: OperationalQueueId;
  /** The columns, in order. */
  readonly columns: readonly QueueColumn[];
  /** The rows. */
  readonly rows: readonly QueueRowView[];
  /** The error, when the read failed. */
  readonly error?: string | undefined;
  /** Whether the read is still in flight. */
  readonly loading?: boolean | undefined;
  /** Where the error state's "Go back" link goes. */
  readonly backHref?: string | undefined;
}

/**
 * The administrator queue surface.
 */
export function AdminQueueSurface({
  queue,
  columns,
  rows,
  error,
  loading,
  backHref = '/',
}: AdminQueueSurfaceProps): React.JSX.Element {
  /**
   * The focused row.
   *
   * **The roving `tabindex`'s state.** It starts on the first row, because
   * a grid with no focused row would put every row in the tab order.
   */
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  /**
   * Move the focus to a row.
   *
   * **The focus is moved, not just the state.** The roving `tabindex` is
   * only half of the pattern: the arrow keys must actually move the
   * browser's focus, or a screen reader's cursor and the visual focus
   * would disagree.
   */
  const focusRow = useCallback((index: number): void => {
    setFocusedIndex(index);
    rowRefs.current[index]?.focus();
  }, []);

  /**
   * The arrow-key handler.
   *
   * **Up and Down move between rows; Home and End jump to the ends.**
   * The focus is clamped rather than wrapped — wrapping would send the
   * administrator to the top of the queue by accident.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, index: number): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusRow(Math.min(index + 1, rows.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusRow(Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusRow(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusRow(Math.max(rows.length - 1, 0));
      }
    },
    [focusRow, rows.length],
  );

  const heading = queueLabel(queue);

  if (error) {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{heading}</h1>

        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>

        {/*
          **'Try again' primary, 'Go back' secondary.** §5.14 names both.
          The secondary leaves the failed queue rather than repeating the
          read that just failed.
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
        <h1 className="hero__title">{heading}</h1>

        {/*
          **A skeleton table, not a spinner.** §15.6: "Each queue renders a
          skeleton table." The skeleton's shape is the table's shape, so the
          layout does not jump when the rows arrive.
        */}
        <div className="admin-queue" role="status" aria-label={LOADING}>
          <div className="admin-queue__head" aria-hidden="true">
            {columns.map((column) => (
              <span key={column.heading} className="admin-queue__cell admin-queue__skeleton-bar" />
            ))}
          </div>

          {[0, 1, 2].map((index) => (
            <div key={index} className="admin-queue__row" aria-hidden="true">
              {columns.map((column) => (
                <span
                  key={column.heading}
                  className="admin-queue__cell admin-queue__skeleton-bar"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    const note = emptyStateNoteFor(queue);

    return (
      <div className="admin-console">
        <h1 className="hero__title">{heading}</h1>

        <div className="admin-queue__empty" role="status">
          <p>{queueEmptyCopy(queue)}</p>
          {note ? <p className="field__helper">{note}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console">
      <div className="admin-console__head">
        <h1 className="hero__title">{heading}</h1>
        <p className="admin-console__meta">
          {rows.length} in this queue · ordered by submission time
        </p>
      </div>

      {/*
        **The ARIA grid.** `role="grid"` on the container, `role="row"` on
        each row, `role="gridcell"` on each cell, and `role="columnheader"`
        on each heading cell.
      */}
      <div
        className="admin-queue"
        role="grid"
        aria-label={heading}
        style={
          {
            '--admin-queue-columns': `repeat(${columns.length + 1}, minmax(0, 1fr))`,
          } as React.CSSProperties
        }
      >
        <div className="admin-queue__head" role="row">
          {columns.map((column) => (
            <span
              key={column.heading}
              role="columnheader"
              aria-sort={column.sortable ? 'ascending' : undefined}
              className="admin-queue__cell admin-queue__cell--head"
            >
              {/*
                **A sortable heading is a button.** §5.7: a sortable
                header is announced as "Sort by" the column name, with
                the direction. The `aria-sort` on the header cell
                carries the direction, and the button carries the action.
              */}
              {column.sortable ? (
                <button type="button" className="admin-queue__sort">
                  Sort by {column.heading}
                </button>
              ) : (
                column.heading
              )}
            </span>
          ))}
        </div>

        {rows.map((row, index) => (
          <div
            key={row.key}
            role="row"
            tabIndex={index === focusedIndex ? 0 : -1}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            onFocus={() => {
              setFocusedIndex(index);
            }}
            className="admin-queue__row"
          >
            {row.cells.map((cell, cellIndex) => (
              <span key={`${row.key}-${cellIndex}`} role="gridcell" className="admin-queue__cell">
                {cell}
              </span>
            ))}

            <span role="gridcell" className="admin-queue__cell admin-queue__cell--action">
              {/*
                **The action is a link.** It reaches the specific work item
                — the claim review, the registration review, the Lost-side
                verification screen — not a generic detail page.
              */}
              <Link href={row.actionHref} className="button button--primary button--sm">
                {row.actionLabel}
              </Link>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Pending Registrations queue's columns — §15.2.
 */
export const PENDING_REGISTRATIONS_COLUMNS: readonly QueueColumn[] = Object.freeze([
  { heading: COLUMN_NAME },
  { heading: COLUMN_EMAIL },
  { heading: COLUMN_ROLE },
  { heading: COLUMN_REGISTERED_AT, sortable: true },
]);

/**
 * The Pending Claims queue's columns — §15.3.
 */
export const PENDING_CLAIMS_COLUMNS: readonly QueueColumn[] = Object.freeze([
  { heading: COLUMN_CLAIM_ID, sortable: true },
  { heading: COLUMN_ITEM },
  { heading: COLUMN_CLAIMANT },
  { heading: COLUMN_SUBMITTED_AT, sortable: true },
]);

/**
 * The Items Awaiting Return queue's columns — §15.4.
 */
export const AWAITING_RETURN_COLUMNS: readonly QueueColumn[] = Object.freeze([
  { heading: COLUMN_ITEM },
  { heading: COLUMN_CLAIMANT },
  { heading: COLUMN_APPROVED_AT, sortable: true },
]);

/**
 * The Items in Verification queue's columns — §15.5.
 */
export const VERIFICATIONS_COLUMNS: readonly QueueColumn[] = Object.freeze([
  { heading: COLUMN_REPORT },
  { heading: COLUMN_OWNER },
  { heading: COLUMN_SELECTED_RESPONDER },
  { heading: COLUMN_VERIFICATION_STARTED_AT, sortable: true },
]);

/**
 * The action column's heading, appended to every queue's columns.
 *
 * **The action is a column in all four queues** (§15.2–§15.5 each name an
 * "action" column), and §5.7 says the action column is right-aligned.
 */
export const ACTION_COLUMN: QueueColumn = Object.freeze({ heading: COLUMN_ACTION });
