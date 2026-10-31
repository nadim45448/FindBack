/**
 * The `ReturnConfirmationService`'s suite.
 *
 * **One suite, both directions.** The service is the *one* Confirm Returned
 * implementation, so the suite does not split into a Found half and a Lost
 * half — it drives the same service with a Found report and with a Lost one
 * and asserts that the same code path serves both. A suite with two
 * near-identical halves would prove that two implementations exist, which is
 * exactly what the story forbids.
 *
 * **The order of the calls is the mechanism.** The report is read *outside*
 * the transaction (so a refusal costs no transaction), the report's move and
 * the audit event are written *inside* it (so they commit together), and the
 * event is written *after* the move (so a move that did not land is never
 * followed by an event). Each of those is asserted by observing the recorded
 * call order rather than by trusting the code.
 *
 * **The race is asserted, not just the rule.** The write is conditional on the
 * report still being in its direction's precondition status. A report
 * confirmed by another administrator between the read and the write is not
 * confirmed again: the write lands nothing, the conflict is the outcome, and
 * **no audit event is recorded** — the trail is append-only, so an event for
 * a confirmation that did not happen would be a permanent falsehood.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { ReturnConfirmationService } from '@/application/listings/return-confirmation-service';
import type {
  ReturnConfirmationRepository,
  ReturnConfirmationWrite,
  StoredReturnConfirmation,
} from '@/application/listings/ports/return-confirmation-repository';
import type {
  ReturnSubject,
  ReturnSubjectReader,
} from '@/application/listings/ports/return-subject-reader';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

// ── The domain's own guard, and the service's ──────────────────────────────
//
// **The service checks the decision even though the domain's assertion
// already guarantees it.** That is a deliberate belt-and-braces: the service
// narrows the decision's kind explicitly rather than assuming it, so a
// malformed decision is refused by the *service* rather than crashing it.
//
// **The mock makes that guard reachable.** `assertConfirmReturnedPermitted`
// throws on every refusal, so the service's own guard is structurally
// unreachable through the real domain — and an unreachable guard is an
// untested guard. The mock returns a decision the real domain cannot
// produce, so the guard is exercised for what it is: a second line of
// defence, not the rule.

/** What the mocked assertion returns, or `null` for the real one. */
const mockedDecision = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/domain/returns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/returns')>();

  return {
    ...actual,
    assertConfirmReturnedPermitted: (facts: unknown) => {
      if (mockedDecision.current !== null) {
        return mockedDecision.current;
      }

      return actual.assertConfirmReturnedPermitted(facts as never);
    },
  };
});

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator confirming the return. */
const ADMIN = { actorId: 'admin-1', isAdministrator: true };

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

/** A Found report in its precondition status, with an approved Claim. */
const FOUND_SUBJECT: ReturnSubject = {
  id: 'report-found',
  type: 'Found',
  status: 'Claim Approved',
  reporterId: 'finder-1',
  approvedClaimantId: 'claimant-1',
};

/** A Lost report in its precondition status. */
const LOST_SUBJECT: ReturnSubject = {
  id: 'report-lost',
  type: 'Lost',
  status: 'Verification Pending',
  reporterId: 'owner-1',
  approvedClaimantId: null,
};

/** The substitute the administrator recorded. */
const SUBSTITUTE = {
  name: 'Sam Okafor',
  authorizationConfirmed: true,
  relationship: 'Friend',
};

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The report, as the reader returns it. `null` means "no such report". */
  subject: ReturnSubject | null = FOUND_SUBJECT;

  /**
   * Whether the conditional write lands.
   *
   * `false` is the lost race: another administrator confirmed the same report
   * between the read and the write.
   */
  writeLands = true;

  /** The confirmation the repository was given. */
  storedWrite: ReturnConfirmationWrite | null = null;

  /** The handle the repository was given. */
  storedHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly reports: ReturnSubjectReader = {
    readReturnSubject: async (
      _reportId: string,
      transaction?: TransactionHandle,
    ): Promise<ReturnSubject | null> => {
      this.calls.push(
        transaction === undefined ? 'reports.readReturnSubject' : 'reports.readReturnSubject.tx',
      );

      return this.subject;
    },
  };

  readonly confirmations: ReturnConfirmationRepository = {
    confirmReturned: async (
      confirmation: ReturnConfirmationWrite,
      transaction: TransactionHandle,
    ): Promise<string | null> => {
      this.calls.push('confirmations.confirmReturned');
      this.storedWrite = confirmation;
      this.storedHandle = transaction;

      return this.writeLands ? 'confirmation-1' : null;
    },
    findByReportId: async (
      _reportId: string,
      _transaction?: TransactionHandle,
    ): Promise<StoredReturnConfirmation | null> => {
      throw new Error('The confirmation path never reads the confirmation.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The confirmation path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The confirmation path never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly service: ReturnConfirmationService = new ReturnConfirmationService(
    this.reports,
    this.confirmations,
    this.audit,
    this.transactions,
  );
}

// ── The permitted confirmation ────────────────────────────────────────────

describe('the return confirmation service', () => {
  it('confirms a Found report and returns it', async () => {
    const harness = new Harness();

    const result = await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(result.reportId).toBe('report-found');
    expect(result.status).toBe('Returned');
    expect(result.confirmationId).toBe('confirmation-1');
    expect(result.substitute).toBeNull();
  });

  it('confirms a Lost report through the same service', async () => {
    // **The same code path, the same service.** A Lost report's precondition
    // and its default receiver differ — and nothing in the service knows
    // that, because the domain's decision carries the branch.
    const harness = new Harness();
    harness.subject = LOST_SUBJECT;

    const result = await harness.service.confirm({
      reportId: 'report-lost',
      actor: ADMIN,
      substitute: null,
    });

    expect(result.reportId).toBe('report-lost');
    expect(result.status).toBe('Returned');
    expect(result.defaultReceiverAccountId).toBe('owner-1');
  });

  it('derives the Found report\'s default receiver from the approved Claim', async () => {
    // **The finder is not the receiver.** The claimant on the approved Claim
    // is, and the service never asks the caller to name it.
    const harness = new Harness();

    const result = await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(result.defaultReceiverAccountId).toBe('claimant-1');
    expect(harness.storedWrite?.defaultReceiverAccountId).toBe('claimant-1');
  });

  it('reads the report before it decides, and decides before it writes', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.calls.indexOf('reports.readReturnSubject')).toBe(0);
    expect(harness.calls.indexOf('reports.readReturnSubject')).toBeLessThan(
      harness.calls.indexOf('transactions.run'),
    );
    expect(harness.calls.indexOf('transactions.run')).toBeLessThan(
      harness.calls.indexOf('confirmations.confirmReturned'),
    );
  });

  it('writes the report\'s move and the event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    // **The report's move, the confirmation row, and the audit event are one
    // act** (ADR-3, ADR-6). The move lands before the event, and both are
    // inside the transaction.
    const runIndex = harness.calls.indexOf('transactions.run');
    const writeIndex = harness.calls.indexOf('confirmations.confirmReturned');
    const auditIndex = harness.calls.indexOf('audit.record');

    expect(runIndex).toBeLessThan(writeIndex);
    expect(writeIndex).toBeLessThan(auditIndex);
  });

  it('passes the caller\'s transaction to the write', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.storedHandle).toBe(HANDLE);
  });

  it('records the administrator as the actor of the event', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.actorId).toBe('admin-1');
    expect(harness.events[0]?.actorRole).toBe('administrator');
    expect(harness.events[0]?.parentType).toBe('report');
    expect(harness.events[0]?.parentId).toBe('report-found');
  });

  it('records the Found default-receiver event with the receiver as the payload', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.events[0]?.eventType).toBe('returned.confirmed_default_receiver');
    expect(harness.events[0]?.metadata).toEqual({ receiver: 'claimant-1' });
  });

  it('records the Lost default-receiver event with the receiver as the payload', async () => {
    const harness = new Harness();
    harness.subject = LOST_SUBJECT;

    await harness.service.confirm({
      reportId: 'report-lost',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.events[0]?.eventType).toBe('returned.confirmed_lost_default_receiver');
    expect(harness.events[0]?.metadata).toEqual({ receiver: 'owner-1' });
  });

  it('reads the clock once and carries the value to the row and the event', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    const writtenAt = harness.storedWrite?.confirmedAt;
    const eventAt = harness.events[0]?.occurredAt;

    expect(writtenAt).toBeInstanceOf(Date);
    expect(eventAt).toEqual(writtenAt);
  });

  it('names the confirming administrator on the written row', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    expect(harness.storedWrite?.administratorId).toBe('admin-1');
    expect(harness.storedWrite?.reportType).toBe('Found');
  });
});

// ── The substitute ─────────────────────────────────────────────────────────

describe('the return confirmation service — the substitute', () => {
  it('records the substitute on the written row', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: SUBSTITUTE,
    });

    expect(harness.storedWrite?.substitute?.name.value).toBe('Sam Okafor');
    expect(harness.storedWrite?.substitute?.relationship).toBe('Friend');
    expect(harness.storedWrite?.substitute?.authorization.confirmed).toBe(true);
  });

  it('records the Found substitute event', async () => {
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: SUBSTITUTE,
    });

    expect(harness.events[0]?.eventType).toBe('returned.confirmed_substitute_receiver');
    expect(harness.events[0]?.metadata).toEqual({
      substituteReceiverName: 'Sam Okafor',
      authorizationAffirmation: 'Default receiver authorized the substitute',
      relationship: 'Friend',
    });
  });

  it('records the Lost substitute event', async () => {
    const harness = new Harness();
    harness.subject = LOST_SUBJECT;

    await harness.service.confirm({
      reportId: 'report-lost',
      actor: ADMIN,
      substitute: SUBSTITUTE,
    });

    expect(harness.events[0]?.eventType).toBe('returned.confirmed_lost_substitute_receiver');
  });

  it('still records the default receiver on a substitute confirmation', async () => {
    // **The authorization is the default receiver's.** The trail must be able
    // to say whose consent it was, so the default receiver's account id
    // travels with the substitute.
    const harness = new Harness();

    const result = await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: SUBSTITUTE,
    });

    expect(result.defaultReceiverAccountId).toBe('claimant-1');
    expect(harness.storedWrite?.defaultReceiverAccountId).toBe('claimant-1');
  });

  it('refuses a substitute whose authorization was not confirmed', async () => {
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: { ...SUBSTITUTE, authorizationConfirmed: false },
      }),
    ).rejects.toThrow();
  });

  it('refuses a relationship outside the five', async () => {
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: { ...SUBSTITUTE, relationship: 'Neighbour' },
      }),
    ).rejects.toThrow();
  });

  it('writes nothing when the substitute is invalid', async () => {
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: { ...SUBSTITUTE, relationship: 'Neighbour' },
      }),
    ).rejects.toThrow();

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });
});

// ── The refusals ──────────────────────────────────────────────────────────

describe('the return confirmation service — refusals', () => {
  it('refuses a member who is not an administrator', async () => {
    // **FR-23: a return is confirmed by an administrator.** Never by the
    // member, never by the Lost-side owner.
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: MEMBER,
        substitute: null,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('names the administrator-only rule in the refusal', async () => {
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: MEMBER,
        substitute: null,
      }),
    ).rejects.toThrow(/administrator/);
  });

  it('refuses the Lost-side owner, even though they own the report', async () => {
    const harness = new Harness();
    harness.subject = LOST_SUBJECT;

    await expect(
      harness.service.confirm({
        reportId: 'report-lost',
        actor: { actorId: 'owner-1', isAdministrator: false },
        substitute: null,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the actor is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: MEMBER,
        substitute: null,
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a report that does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.confirm({
        reportId: 'report-missing',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('writes nothing when the report does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.confirm({
        reportId: 'report-missing',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a Found report that is not in Claim Approved', async () => {
    const harness = new Harness();
    harness.subject = { ...FOUND_SUBJECT, status: 'Verification Pending' };

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a Lost report that is not in Verification Pending', async () => {
    const harness = new Harness();
    harness.subject = { ...LOST_SUBJECT, status: 'Claim Approved' };

    await expect(
      harness.service.confirm({
        reportId: 'report-lost',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a report that is already Returned', async () => {
    const harness = new Harness();
    harness.subject = { ...FOUND_SUBJECT, status: 'Returned' };

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a Found report with no approved Claim', async () => {
    // **There is nobody whose authorization could be recorded** and nobody to
    // hand the item to — so the confirmation cannot happen.
    const harness = new Harness();
    harness.subject = { ...FOUND_SUBJECT, approvedClaimantId: null };

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the report\'s state refuses the confirmation', async () => {
    const harness = new Harness();
    harness.subject = { ...FOUND_SUBJECT, status: 'Returned' };

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('confirmations.confirmReturned');
    expect(harness.events).toHaveLength(0);
  });
});

// ── The race ──────────────────────────────────────────────────────────────

describe('the return confirmation service — the race', () => {
  it('refuses when the conditional write lands nothing', async () => {
    // **Another administrator confirmed the same report between the read and
    // the write.** The write matched no row, so nothing was confirmed.
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('records no event when the conditional write lands nothing', async () => {
    // **A confirmation that did not happen gets no audit record.** The trail
    // is append-only, so a record for it would be a permanent falsehood.
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);

    expect(harness.events).toHaveLength(0);
    expect(harness.calls).not.toContain('audit.record');
  });

  it('writes the event only after the move', async () => {
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.confirm({
        reportId: 'report-found',
        actor: ADMIN,
        substitute: null,
      }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls.indexOf('confirmations.confirmReturned')).toBeLessThan(
      harness.calls.indexOf('audit.record') === -1
        ? Number.POSITIVE_INFINITY
        : harness.calls.indexOf('audit.record'),
    );
  });
});

// ── The sensitive fields ──────────────────────────────────────────────────

describe('the return confirmation service — the sensitive fields', () => {
  it('records no Sensitive Field in the event\'s payload', async () => {
    // **The report's Sensitive Fields** — `exact_place`, `identifying_details`,
    // `where_found` — never reach the trail. The payload is the catalog's,
    // exactly.
    const harness = new Harness();

    await harness.service.confirm({
      reportId: 'report-found',
      actor: ADMIN,
      substitute: null,
    });

    const keys = Object.keys(harness.events[0]?.metadata ?? {});

    expect(keys).not.toContain('exactPlace');
    expect(keys).not.toContain('identifyingDetails');
    expect(keys).not.toContain('whereFound');
    expect(keys).toEqual(['receiver']);
  });
});

// ── The service's own guard ────────────────────────────────────────────────

describe('the return confirmation service — the service\'s own guard', () => {
  afterEach(() => {
    // **The mock is cleared,** so the guard test cannot leak its decision
    // into any other test.
    mockedDecision.current = null;
  });

  it('refuses a permitted decision that carries no default receiver', async () => {
    // **The service does not assume the decision's shape.** The domain's
    // assertion guarantees a permitted decision carries a receiver, but the
    // service checks rather than assumes — so a malformed decision is
    // refused by the service instead of crashing it on a null dereference.
    mockedDecision.current = {
      kind: 'Permitted',
      defaultReceiver: null,
      substitute: null,
      reportStatus: 'Returned',
    };

    const harness = new Harness();

    await expect(
      harness.service.confirm({ reportId: 'report-found', actor: ADMIN, substitute: null }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a decision that is not a permitted one', async () => {
    // **The narrowing is explicit.** A decision of any other kind is refused
    // rather than read as though it were permitted.
    mockedDecision.current = { kind: 'Refused', reason: 'PreconditionNotMet' };

    const harness = new Harness();

    await expect(
      harness.service.confirm({ reportId: 'report-found', actor: ADMIN, substitute: null }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the decision is refused', async () => {
    mockedDecision.current = {
      kind: 'Permitted',
      defaultReceiver: null,
      substitute: null,
      reportStatus: 'Returned',
    };

    const harness = new Harness();

    await expect(
      harness.service.confirm({ reportId: 'report-found', actor: ADMIN, substitute: null }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });
});
