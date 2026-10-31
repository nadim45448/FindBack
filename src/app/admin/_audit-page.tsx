import { headers } from 'next/headers';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminAuditTrailSurface, type AuditTrailRow } from '@/ui/admin-audit-trail-surface';

import { createRequestId } from '@/lib/logging';

import { ADMIN_READ_FAILED, buildAdminStack, resolveAdminAccess } from './_admin-page';

/**
 * The shared reading for the two contextual audit routes.
 *
 * ## Audit is contextual — the route names the parent
 *
 * `/admin/items/:id/audit` is the Found-side route and
 * `/admin/lost/:id/audit` is the Lost-side route. **Each one reads only
 * its own side's report.** A Found report id on the Lost route is a
 * refusal, not a Found report's trail.
 *
 * ## There is no third route
 *
 * **No `/admin/audit`.** §17.1: *"Audit is reached from the relevant
 * report, Claim, Recovery Response, or thread context only."* The
 * directory `src/app/admin/audit/` does not exist, so a request for it
 * cannot be served — the absence is structural, not a matter of the
 * handler refusing.
 */

/**
 * The report's side.
 */
export type AuditRouteSide = 'Found' | 'Lost';

/**
 * The audit page's result.
 */
export interface AuditPageResult {
  readonly rows: readonly AuditTrailRow[];
  readonly parentLabel?: string | undefined;
  readonly hasMore: boolean;
  readonly error?: string | undefined;
}

/**
 * Render the contextual audit page for one report and one side.
 */
export async function renderAuditPage(
  reportId: string,
  side: AuditRouteSide,
): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen />;
  }

  const result = await readAuditTrail(reportId, side, access.userId);

  return (
    <AdminAuditTrailSurface
      rows={result.rows}
      parentLabel={result.parentLabel}
      hasMore={result.hasMore}
      error={result.error}
      editHref={`/admin/reports/${reportId}/edit`}
    />
  );
}

/**
 * Read the report's trail.
 *
 * **The report is read first.** A report that does not exist, or that
 * belongs to the other side, produces no trail read at all — the trail
 * query is not issued, so the response carries no signal about whether a
 * trail exists for that id.
 */
async function readAuditTrail(
  reportId: string,
  side: AuditRouteSide,
  userId: string,
): Promise<AuditPageResult> {
  try {
    const stack = buildAdminStack();

    const report = await stack.context.readReport(reportId);

    if (!report || report.type !== side) {
      return { rows: [], hasMore: false, error: ADMIN_READ_FAILED };
    }

    const requestId = await readRequestId();

    const page = await stack.audit.read(
      { userId, isAdministrator: true },
      'report',
      reportId,
      null,
      { requestId },
    );

    const names = await stack.context.readActorNames(
      page.events.map((event) => event.actor.actorId),
    );

    return {
      rows: page.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        actorDisplayName: names.get(event.actor.actorId) ?? 'Unknown actor',
        actorRole: event.actor.actorRole,
        target: report.name,
        occurredAt: formatTimestamp(event.occurredAt),
        details: detailsFor(event),
        reason: event.reason,
      })),
      parentLabel: report.name,
      hasMore: page.nextCursor !== null,
    };
  } catch {
    return { rows: [], hasMore: false, error: ADMIN_READ_FAILED };
  }
}

/**
 * The additional fields a row's disclosure shows.
 *
 * **§17.2: "Additional fields. Per PRD FR-31: claim reason, identifying
 * details (sensitive but admin-visible), substitute receiver fields,
 * etc."**
 *
 * The fields are the event's **metadata and changed fields** — and
 * **nothing else.** A row with neither has no disclosure at all.
 */
function detailsFor(event: {
  readonly payload: Record<string, unknown>;
  readonly changedFields: Record<string, unknown> | null;
  readonly previousValues: Record<string, unknown> | null;
}): readonly string[] {
  const details: string[] = [];

  for (const [key, value] of Object.entries(event.changedFields ?? {})) {
    details.push(`Changed: ${key}`);
    void value;
  }

  for (const [key, value] of Object.entries(event.payload ?? {})) {
    details.push(`${key}: ${String(value)}`);
  }

  if (event.previousValues && Object.keys(event.previousValues).length > 0) {
    details.push(`Previous values: ${Object.keys(event.previousValues).join(', ')}`);
  }

  return details;
}

/**
 * The request id for the read record.
 *
 * **The read is recorded,** because PRD §10 requires audit-trail reads to
 * be logged separately from the trail. The id is the same one the record
 * and the log line carry.
 */
async function readRequestId(): Promise<string> {
  try {
    const headerStore = await headers();
    const existing = headerStore.get('x-request-id');

    if (existing) {
      return existing;
    }
  } catch {
    // **No request context is not a failure.** The id is minted below.
  }

  return createRequestId();
}

/**
 * Format a timestamp for the trail's timestamp column.
 *
 * **Full date and time, in the organization's locale** — §17.2's rule.
 */
function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
