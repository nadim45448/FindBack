/**
 * The shared fixtures for the report lifecycle service suites.
 *
 * **The fakes are hand-written, not generated.** Each one records what it
 * was asked to do, so a test can assert on the *sequence* — and the
 * sequence is the mechanism these services are built around. A mock that
 * returned canned values would prove nothing about the order.
 *
 * **The transaction is real enough to be meaningful.** The fake factory runs
 * the work function with a handle and, when the work rejects, records the
 * rollback — so a test can assert that the audit event was written *inside*
 * the transaction rather than after it.
 */

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  AuditEventRecord,
  AuditEventRepository,
} from '@/application/ports/audit-event-repository';

import type { AuditActorRole, AuditEvent, AuditParentType } from '@/domain/audit';
import type { CampusArea, PersistedReport, ReportStatus, ReportType } from '@/domain/listings';

import {
  createReportDescription,
  createReportName,
  parseReportDate,
} from '@/domain/listings';

export const HANDLE: TransactionHandle = { transaction: { fake: true } };

export const NOW = new Date('2026-10-29T12:00:00.000Z');

export const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
];

/** A persisted report, for a test to start from. */
export function aReport(overrides: Partial<PersistedReport> = {}): PersistedReport {
  // **The value objects are built through their own constructors,** so the
  // fixture is a real report rather than a hand-assembled object that wears
  // the type's brand without carrying it.
  return {
    id: 'report-1',
    type: 'Found',
    status: 'Open',
    name: createReportName('Brown leather wallet'),
    category: 'Wallet',
    description: createReportDescription('A brown leather wallet with a folded receipt inside.'),
    date: parseReportDate('2026-10-20'),
    campusArea: { value: 'library' },
    exactPlace: null,
    identifyingDetails: null,
    imageRef: null,
    reporterId: 'reporter-1',
    createdAt: new Date('2026-10-20T09:00:00.000Z'),
    updatedAt: new Date('2026-10-20T09:00:00.000Z'),
    ...overrides,
  };
}

/** The type and status a report carries, for a test to vary. */
export function aReportOf(
  type: ReportType,
  status: ReportStatus,
  overrides: Partial<PersistedReport> = {},
): PersistedReport {
  return aReport({ type, status, ...overrides });
}

/**
 * The report a repository returned after an update.
 *
 * **The helper exists so the suites do not spread a nullable report.** The
 * report a service holds may be `null` — that is what "the report does not
 * exist" looks like — so a suite that spreads it directly cannot satisfy the
 * domain's non-null type. This narrows once, in one place.
 */
export function anUpdatedReport(
  report: PersistedReport | null,
  overrides: Partial<PersistedReport> = {},
): PersistedReport {
  if (report === null) {
    throw new Error('A repository cannot update a report that does not exist.');
  }

  return { ...report, ...overrides };
}

/** The call log. */
export type Call = string;

/**
 * A transaction factory that records what happened.
 *
 * **A rejection is recorded as a rollback.** The factory's contract says a
 * failing work function rolls the transaction back, and the fake records
 * that so a test can assert the compensating write happened *after* the
 * rollback.
 */
export function aTransactionFactory(calls: Call[]): TransactionFactory {
  return {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      calls.push('transactions.run');

      try {
        const result = await work(HANDLE);
        calls.push('transactions.commit');

        return result;
      } catch (error) {
        calls.push('transactions.rollback');

        throw error;
      }
    },
  };
}

/**
 * An audit event repository that records what it was asked to write.
 *
 * **The recorded events are kept, so a test can assert on the payload** —
 * and on the fact that the write happened inside the transaction.
 */
export function anAuditEventRepository(
  calls: Call[],
  options: { readonly fails?: boolean } = {},
): AuditEventRepository & { readonly written: RecordedAuditEvent[] } {
  const written: RecordedAuditEvent[] = [];

  return {
    written,
    append: async (
      record: AuditEventRecord,
      transaction: TransactionHandle,
    ): Promise<AuditEvent> => {
      calls.push('audit.append');

      if (transaction !== HANDLE) {
        throw new Error('The audit event was written outside the transaction.');
      }

      if (options.fails) {
        throw new Error('The audit write failed.');
      }

      written.push({
        eventType: record.eventType,
        actorId: record.actorId,
        actorRole: record.actorRole,
        // **The payload is the event's metadata.** The repository's port types
        // it as `unknown` because the trail's columns are not all JSON — so
        // the fixture narrows it to what a payload is.
        payload: asPayload(record.metadata),
      });

      // **The returned event is the domain's shape.** The repository's port
      // types its record with flat columns — the repository's own concern —
      // while the domain's `AuditEvent` groups the parent and the actor.
      return {
        id: record.id,
        eventNumber: record.eventNumber,
        eventType: record.eventType,
        parent: {
          parentType: record.parentType as AuditParentType,
          parentId: record.parentId,
        },
        actor: {
          actorId: record.actorId,
          actorRole: record.actorRole as AuditActorRole,
        },
        payload: asPayload(record.metadata) ?? {},
        reason: record.reason ?? null,
        previousValues: asPayload(record.previousValues),
        changedFields: asPayload(record.changedFields),
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
      };
    },
    listByParent: async (): Promise<never> => {
      throw new Error('Not used by the lifecycle suites.');
    },
    listAll: async (): Promise<never> => {
      throw new Error('Not used by the lifecycle suites.');
    },
  };
}

/** The fields the audit repository received, for an assertion. */
export interface RecordedAuditEvent {
  readonly eventType: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly payload: Record<string, unknown> | null;
}

/**
 * Narrow an unknown payload to the record shape.
 *
 * **A payload is a plain object of named fields** — the sanitizer's
 * deny-by-default rule works on its top-level keys — so anything else is
 * `null`. The fixture does not pretend an array or a primitive is a payload.
 */
function asPayload(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}
