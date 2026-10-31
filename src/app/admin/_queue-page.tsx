import { AdminAccessScreen } from '@/ui/admin-access-screen';
import {
  AdminQueueSurface,
  type QueueColumn,
  type QueueRowView,
} from '@/ui/admin-queue-surface';
import {
  APPROVE,
  CONFIRM_RETURNED,
  MANAGE_VERIFICATION,
  REVIEW,
} from '@/ui/admin-copy';

import type { OperationalQueueId } from '@/domain/administration';

import type {
  AwaitingReturnQueue,
  PendingClaimsQueue,
  PendingRegistrationsQueue,
  VerificationsQueue,
} from '@/application/administration/administrator-queue-query';

import { ADMIN_READ_FAILED, buildAdminStack, resolveAdminAccess } from './_admin-page';

/**
 * The shared reading for the four queue pages.
 *
 * ## One page shape, four filters
 *
 * The four queues differ in their **columns** and their **rows**, not in
 * their behaviour — the ARIA grid, the roving `tabindex`, the empty
 * states, and the loading and error states are identical. So the reading
 * is shared and the differences are data.
 *
 * ## The authorisation happens before the read
 *
 * A non-administrator gets the access screen and **no rows, no count, and
 * no queue name**. The application layer refuses too, so a caller that
 * reaches the stack directly still gets a refusal.
 */

/**
 * A queue's rows, as the surface renders them.
 */
export interface QueuePageResult {
  readonly rows: readonly QueueRowView[];
  readonly error?: string | undefined;
}

/**
 * Read a queue and map its rows to the surface's row shape.
 *
 * **The mapping is per queue,** because each queue's columns are its own.
 */
export async function readQueue(
  queue: OperationalQueueId,
  userId: string,
): Promise<QueuePageResult> {
  try {
    const stack = buildAdminStack();
    const result = await stack.queues.read({ userId, isAdministrator: true }, queue);

    switch (result.queue) {
      case 'pending-registrations':
        return { rows: registrationRows(result) };
      case 'pending-claims':
        return { rows: claimRows(result) };
      case 'awaiting-return':
        return { rows: awaitingReturnRows(result) };
      case 'verifications':
        return { rows: verificationRows(result) };
    }
  } catch {
    return { rows: [], error: ADMIN_READ_FAILED };
  }
}

/**
 * The Pending Registrations queue's rows — §15.2.
 *
 * **The action reaches the registration review.**
 */
function registrationRows(queue: PendingRegistrationsQueue): readonly QueueRowView[] {
  return queue.rows.map((row) => ({
    key: row.accountId,
    cells: [
      row.displayName,
      row.email,
      row.selfDeclaredRole,
      formatTimestamp(row.registeredAt),
    ],
    actionLabel: APPROVE,
    actionHref: `/admin/registrations/${row.accountId}`,
  }));
}

/**
 * The Pending Claims queue's rows — §15.3.
 *
 * **The item name links to the report,** and the action reaches the claim
 * review screen.
 */
function claimRows(queue: PendingClaimsQueue): readonly QueueRowView[] {
  return queue.rows.map((row) => ({
    key: row.claimId,
    cells: [row.claimId, row.itemName, row.claimantDisplayName, formatTimestamp(row.submittedAt)],
    actionLabel: REVIEW,
    actionHref: `/admin/claims/${row.claimId}`,
  }));
}

/**
 * The Items Awaiting Return queue's rows — §15.4.
 */
function awaitingReturnRows(queue: AwaitingReturnQueue): readonly QueueRowView[] {
  return queue.rows.map((row) => ({
    key: row.reportId,
    cells: [row.itemName, row.claimantName, formatTimestamp(row.approvedAt)],
    actionLabel: CONFIRM_RETURNED,
    actionHref: `/admin/awaiting-return/${row.reportId}`,
  }));
}

/**
 * The Items in Verification queue's rows — §15.5.
 *
 * **The action reaches the Lost-side verification screen,** `/admin/lost/:id`.
 */
function verificationRows(queue: VerificationsQueue): readonly QueueRowView[] {
  return queue.rows.map((row) => ({
    key: row.reportId,
    cells: [
      row.reportName,
      row.ownerDisplayName,
      row.selectedResponderDisplayName ?? '—',
      formatTimestamp(row.verificationStartedAt),
    ],
    actionLabel: MANAGE_VERIFICATION,
    actionHref: `/admin/lost/${row.reportId}`,
  }));
}

/**
 * Format a timestamp for the queue's cell.
 *
 * **Full date and time, in the organization's locale** — §17.2's rule for
 * the trail's timestamp column, applied to the queues' time columns too.
 *
 * The formatter is **fixed to `en-US`** — PRD §5 defers i18n, so the
 * locale is the organization's, not the visitor's.
 */
export function formatTimestamp(value: Date | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

/**
 * The shared queue page.
 *
 * **The columns and the queue id are the only differences.**
 */
export async function renderQueuePage(
  queue: OperationalQueueId,
  columns: readonly QueueColumn[],
): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen />;
  }

  const { rows, error } = await readQueue(queue, access.userId);

  return <AdminQueueSurface queue={queue} columns={columns} rows={rows} error={error} />;
}
