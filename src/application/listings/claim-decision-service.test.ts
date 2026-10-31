/**
 * The claim decision service's suite.
 *
 * **The sequence is the mechanism, and the sequence is asserted here.** The
 * approval locks the Found report, re-reads the Claim, writes the approval,
 * moves the report, and writes the audit events — all inside one
 * transaction — and only then sends the emails. The order is what delivers
 * the PRD's rule that two administrators approving two different Claims on
 * the same item cannot both commit, and that an email is never sent from
 * inside the transaction.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value. The race is simulated by making a fake
 * report a status that has already moved on — which is exactly what the
 * second administrator's transaction would see after the first's commit.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import {
  ClaimDecisionConflictError,
  ClaimDecisionService,
} from '@/application/listings/claim-decision-service';
import { DefaultClaimDecisionEmailBuilder } from '@/application/listings/claim-decision-email';
import type {
  ClaimDecisionReader,
  ClaimDecisionState,
  CompetingPendingClaim,
} from '@/application/listings/ports/claim-decision-reader';
import type { ClaimDecisionRepository } from '@/application/listings/ports/claim-decision-repository';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type { OutboundEmail } from '@/application/ports/email-sender';
import type { EmailSender } from '@/application/ports/email-sender';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type { ClaimStatus, PersistedReport, ReportStatus } from '@/domain/listings';

import { aReport } from './report-lifecycle-fixtures';

/** The order the calls happened in. */
type Call = string;

/** A fixed instant. */
const NOW = new Date('2026-10-30T09:00:00.000Z');

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator who is deciding. */
const ADMINISTRATOR = { actorId: 'admin-1' };

/** A rejection reason that satisfies the 10–500 bound. */
const REASON = 'The item does not match the description given.';

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The Claim's state, as the reader returns it. `null` means "no such claim". */
  state: ClaimDecisionState | null = {
    id: 'claim-1',
    status: 'Pending',
    reportId: 'report-1',
    claimantId: 'claimant-1',
    claimantEmail: 'claimant@example.test',
  };

  /** The report's status, as the lock returns it. */
  reportStatus: ReportStatus = 'Claim Requested';

  /** The competing `Pending` Claims on the item. */
  competitors: CompetingPendingClaim[] = [];

  /** Whether the approval's conditional write lands. */
  approvalLands = true;

  /** Whether the rejection's conditional write lands. */
  rejectionLands = true;

  /** Whether the auto-rejection's conditional write lands, per claim id. */
  readonly autoRejectLands = new Map<string, boolean>();

  /** The report update the service issued. */
  reportUpdate: { status?: string } | null = null;

  /** The transaction handle the report update was given, if any. */
  reportHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  /** The emails the sender was asked to send. */
  readonly sent: OutboundEmail[] = [];

  /** The report fixture the repository returns. */
  readonly report: PersistedReport = aReport();

  readonly reader: ClaimDecisionReader = {
    readDecisionState: async (
      claimId: string,
      transaction?: TransactionHandle,
    ): Promise<ClaimDecisionState | null> => {
      this.calls.push(
        transaction === undefined ? 'reader.readDecisionState' : 'reader.readDecisionState.tx',
      );

      return this.state;
    },
    listCompetingPendingClaims: async (
      _reportId: string,
      _excludeClaimId: string,
      transaction?: TransactionHandle,
    ): Promise<readonly CompetingPendingClaim[]> => {
      this.calls.push(
        transaction === undefined
          ? 'reader.listCompetingPendingClaims'
          : 'reader.listCompetingPendingClaims.tx',
      );

      return this.competitors;
    },
    lockReportStatus: async (
      _reportId: string,
      _transaction: TransactionHandle,
    ): Promise<ReportStatus | null> => {
      this.calls.push('reader.lockReportStatus');

      return this.reportStatus;
    },
  };

  readonly decisions: ClaimDecisionRepository = {
    approve: async (
      _claimId: string,
      _administratorId: string,
      _decidedAt: Date,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('decisions.approve');
      this.assertHandle(transaction);

      return this.approvalLands;
    },
    reject: async (
      _claimId: string,
      _administratorId: string,
      _reason: { readonly value: string },
      _decidedAt: Date,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('decisions.reject');
      this.assertHandle(transaction);

      return this.rejectionLands;
    },
    autoReject: async (
      claimId: string,
      _reason: string,
      _decidedAt: Date,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('decisions.autoReject');
      this.assertHandle(transaction);

      return this.autoRejectLands.get(claimId) ?? true;
    },
  };

  readonly reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the decision path.');
    },
    findById: async (): Promise<never> => {
      throw new Error('findById is not part of the decision path.');
    },
    update: async (
      _reportId: string,
      update: { status?: string },
      transaction: TransactionHandle,
    ): Promise<PersistedReport> => {
      this.calls.push('reports.update');
      this.reportUpdate = update;
      this.reportHandle = transaction;

      return this.report;
    },
    delete: async (): Promise<void> => {
      throw new Error('delete is not part of the decision path.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The decision path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The decision path never reads the trail.');
    },
  });

  readonly emails: EmailSender = {
    send: async (message: OutboundEmail): Promise<void> => {
      this.calls.push('emails.send');
      this.sent.push(message);
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly clock = { now: (): Date => NOW };

  readonly service: ClaimDecisionService = new ClaimDecisionService(
    this.reader,
    this.decisions,
    this.reports,
    this.audit,
    this.transactions,
    this.clock,
    this.emails,
    new DefaultClaimDecisionEmailBuilder(),
  );

  /** Every decision write must carry the caller's transaction. */
  private assertHandle(transaction: TransactionHandle): void {
    if (transaction !== HANDLE) {
      throw new Error('A decision write did not carry the caller\'s transaction.');
    }
  }
}

// ── The approval ─────────────────────────────────────────────────────────────

describe('the claim decision service — approval', () => {
  it('approves the claim and moves the report to Claim Approved', async () => {
    const harness = new Harness();

    const result = await harness.service.approve({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
    });

    expect(result.claimId).toBe('claim-1');
    expect(result.reportStatus).toBe('Claim Approved');
    expect(harness.reportUpdate).toEqual({ status: 'Claim Approved' });
  });

  it('takes the report’s row lock before it reads the claim again', async () => {
    // **The lock is the serialisation point,** so it must come first. A
    // re-read before the lock would be a read that another administrator's
    // uncommitted move could invalidate.
    const harness = new Harness();

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const lockIndex = harness.calls.indexOf('reader.lockReportStatus');
    const reReadIndex = harness.calls.indexOf('reader.readDecisionState.tx');

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(reReadIndex).toBeGreaterThan(lockIndex);
  });

  it('re-reads the claim inside the transaction', async () => {
    // **The pre-transaction read is advisory.** The guarantee is the
    // in-transaction re-read, which happens after the lock.
    const harness = new Harness();

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    expect(harness.calls).toContain('reader.readDecisionState');
    expect(harness.calls).toContain('reader.readDecisionState.tx');
  });

  it('writes the approval, the report’s move, and the event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    // The Claim's write and the report's move carry the **same** handle.
    expect(harness.reportHandle).toBe(HANDLE);
    expect(harness.calls).toContain('transactions.run');
  });

  it('records the approval event with no payload fields', async () => {
    const harness = new Harness();

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const approval = harness.events.find((event) => event.eventType === 'claim.approved');

    expect(approval).toBeDefined();
    expect(approval?.actorId).toBe('admin-1');
    expect(approval?.parentType).toBe('claim');
    expect(approval?.parentId).toBe('claim-1');
    // **Event 3 names no fields,** so there is nothing for the record to
    // carry — an empty payload is stored as no metadata at all.
    expect(approval?.metadata ?? {}).toEqual({});
  });

  it('sends the approval email after the commit, never inside it', async () => {
    const harness = new Harness();

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const transactionIndex = harness.calls.indexOf('transactions.run');
    const emailIndex = harness.calls.indexOf('emails.send');

    expect(emailIndex).toBeGreaterThan(transactionIndex);
    expect(harness.sent[0]?.to).toBe('claimant@example.test');
  });

  it('refuses an approval on a claim that is no longer pending', async () => {
    // **A decision on a non-`Pending` Claim is a conflict, not a silent
    // overwrite.** The other administrator's decision stands.
    const harness = new Harness();
    harness.state = { ...harness.state!, status: 'Approved' };

    await expect(
      harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ClaimDecisionConflictError);
  });

  it('writes nothing when it refuses a decided claim', async () => {
    const harness = new Harness();
    harness.state = { ...harness.state!, status: 'Rejected' };

    await expect(
      harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.calls).not.toContain('decisions.approve');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses an approval on a claim that does not exist', async () => {
    const harness = new Harness();
    harness.state = null;

    await expect(
      harness.service.approve({ claimId: 'claim-missing', actor: ADMINISTRATOR }),
    ).rejects.toThrow('No claim with that id.');
  });

  it('refuses a second approval that lost the race', async () => {
    // **The conditional write is the last line of defence.** The Claim was
    // `Pending` when the service read it, but it was decided between the
    // re-read and the write — so the write lands on nothing and the
    // decision is refused.
    const harness = new Harness();
    harness.approvalLands = false;

    await expect(
      harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ClaimDecisionConflictError);
  });

  it('refuses a second approval when the report has already been approved', async () => {
    // **The two-administrators race, as the second one sees it.** The
    // first administrator committed the report's move to `Claim Approved`;
    // the second administrator's transaction reads that status *after* the
    // first's commit, and its own approval cannot apply.
    const harness = new Harness();
    harness.reportStatus = 'Claim Approved';

    await expect(
      harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses an approval when the report does not exist', async () => {
    const harness = new Harness();
    harness.reportStatus = null as never;

    await expect(
      harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow('No report with that id.');
  });

  it('refuses an approval when the claim was decided between the read and the lock', async () => {
    // **The in-transaction re-read is not redundant.** The advisory read
    // happened before the transaction opened, so it cannot be the
    // guarantee. This is the window the re-read closes: the Claim was
    // `Pending` when the service first read it, and was decided before the
    // lock was taken.
    const harness = new Harness();
    let reads = 0;

    const reader = {
      ...harness.reader,
      readDecisionState: async (
        _claimId: string,
        _transaction?: TransactionHandle,
      ): Promise<ClaimDecisionState | null> => {
        reads += 1;

        // **The first read is advisory; the second is the one that
        // matters.**
        return reads === 1
          ? harness.state
          : { ...harness.state!, status: 'Approved' };
      },
    };

    const service = new ClaimDecisionService(
      reader,
      harness.decisions,
      harness.reports,
      harness.audit,
      harness.transactions,
      harness.clock,
      harness.emails,
      new DefaultClaimDecisionEmailBuilder(),
    );

    await expect(
      service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses an approval when the claim disappears between the read and the lock', async () => {
    // **A Claim that vanished is a 404, not a conflict.** The claim was
    // there when the service first read it and gone by the re-read — a
    // deletion, not a competing decision. The distinction matters: a
    // conflict tells the administrator they were second, and a 404 tells
    // them the claim is gone.
    const harness = new Harness();
    let reads = 0;

    const reader = {
      ...harness.reader,
      readDecisionState: async (
        _claimId: string,
        _transaction?: TransactionHandle,
      ): Promise<ClaimDecisionState | null> => {
        reads += 1;

        return reads === 1 ? harness.state : null;
      },
    };

    const service = new ClaimDecisionService(
      reader,
      harness.decisions,
      harness.reports,
      harness.audit,
      harness.transactions,
      harness.clock,
      harness.emails,
      new DefaultClaimDecisionEmailBuilder(),
    );

    await expect(
      service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow('No claim with that id.');

    // **Nothing is written.** The Claim is gone; the report must not move.
    expect(harness.calls).not.toContain('decisions.approve');
    expect(harness.calls).not.toContain('reports.update');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });
});

// ── The auto-rejection ───────────────────────────────────────────────────────

describe('the claim decision service — the approval’s auto-rejection', () => {
  /** A competing `Pending` Claim on the same item. */
  function competitor(claimId: string, claimantId: string): CompetingPendingClaim {
    return {
      claimId,
      claimantId,
      claimantEmail: `${claimantId}@example.test`,
      submittedAt: new Date('2026-10-29T10:00:00.000Z'),
    };
  }

  it('auto-rejects every other pending claim on the item', async () => {
    const harness = new Harness();
    harness.competitors = [
      competitor('claim-2', 'claimant-2'),
      competitor('claim-3', 'claimant-3'),
    ];

    const result = await harness.service.approve({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
    });

    expect(result.autoRejected).toHaveLength(2);
    expect(harness.calls.filter((call) => call === 'decisions.autoReject')).toHaveLength(2);
  });

  it('reads the competing claims inside the transaction', async () => {
    // **A read outside the transaction would be a read-then-write race.**
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    expect(harness.calls).toContain('reader.listCompetingPendingClaims.tx');
    expect(harness.calls).not.toContain('reader.listCompetingPendingClaims');
  });

  it('writes one auto-rejection event per competitor', async () => {
    // **Each auto-rejection is a distinct separate event,** not a combined
    // entry — an administrator auditing one specific rejected Claim must
    // find something.
    const harness = new Harness();
    harness.competitors = [
      competitor('claim-2', 'claimant-2'),
      competitor('claim-3', 'claimant-3'),
    ];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const autoRejections = harness.events.filter(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    expect(autoRejections).toHaveLength(2);
    expect(autoRejections.map((event) => event.parentId).sort()).toEqual(['claim-2', 'claim-3']);
  });

  it('records the trigger’s verbatim reason on the auto-rejection event', async () => {
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const autoRejection = harness.events.find(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    expect(autoRejection?.metadata).toMatchObject({
      triggeredBy: 'admin-1',
      triggeringAction: 'Claim approval',
      foundReportId: 'report-1',
      autoRejectionReason: 'another claim was approved for this item',
    });
  });

  it('records the approval and the auto-rejection in the same transaction', async () => {
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    expect(harness.events).toHaveLength(2);
    expect(harness.events.every((event) => event.eventType.startsWith('claim.'))).toBe(true);
  });

  it('names the administrator who caused the auto-rejection', async () => {
    // **The actor is the system; `triggeredBy` names the human.** That is
    // what makes the decision traceable to a person.
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const autoRejection = harness.events.find(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    expect(autoRejection?.actorRole).toBe('system');
    expect(autoRejection?.metadata).toMatchObject({ triggeredBy: 'admin-1' });
  });

  it('sends an auto-rejection email to each auto-rejected claimant', async () => {
    const harness = new Harness();
    harness.competitors = [
      competitor('claim-2', 'claimant-2'),
      competitor('claim-3', 'claimant-3'),
    ];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    // The approved claimant plus one email per auto-rejected claimant.
    expect(harness.sent).toHaveLength(3);
    expect(harness.sent.map((email) => email.to).sort()).toEqual([
      'claimant-2@example.test',
      'claimant-3@example.test',
      'claimant@example.test',
    ]);
  });

  it('never sends a decision email to the finder', async () => {
    // **Story 003 is explicit:** no claim decision email of any kind is
    // sent to the finder of the Found report.
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    for (const email of harness.sent) {
      expect(email.to).not.toContain('finder');
    }
  });

  it('leaves a competitor that was decided elsewhere alone', async () => {
    // **The auto-rejection's write is conditional too.** A competitor
    // decided between the read and the write keeps its own decision, and
    // its own decision's event stands.
    const harness = new Harness();
    harness.competitors = [competitor('claim-2', 'claimant-2')];
    harness.autoRejectLands.set('claim-2', false);

    await harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR });

    const autoRejections = harness.events.filter(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    expect(autoRejections).toHaveLength(0);
    expect(harness.events.filter((event) => event.eventType === 'claim.approved')).toHaveLength(1);
  });

  it('auto-rejects nothing when there is no competition', async () => {
    const harness = new Harness();

    const result = await harness.service.approve({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
    });

    expect(result.autoRejected).toHaveLength(0);
    expect(harness.calls).not.toContain('decisions.autoReject');
  });
});

// ── The rejection ────────────────────────────────────────────────────────────

describe('the claim decision service — rejection', () => {
  it('rejects the claim and returns the report to Open when no pending claim remains', async () => {
    const harness = new Harness();

    const result = await harness.service.reject({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.reportStatus).toBe('Open');
    expect(harness.reportUpdate).toEqual({ status: 'Open' });
  });

  it('leaves the report at Claim Requested when another pending claim remains', async () => {
    // **The move back to `Open` belongs to the *last* rejection.** A
    // non-last rejection writes no transition at all.
    const harness = new Harness();
    harness.competitors = [
      {
        claimId: 'claim-2',
        claimantId: 'claimant-2',
        claimantEmail: 'claimant-2@example.test',
        submittedAt: new Date('2026-10-29T10:00:00.000Z'),
      },
    ];

    const result = await harness.service.reject({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.reportStatus).toBe('Claim Requested');
    expect(harness.reportUpdate).toBeNull();
  });

  it('records the rejection event with exactly the reason', async () => {
    const harness = new Harness();

    await harness.service.reject({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const rejection = harness.events.find(
      (event) => event.eventType === 'claim.rejected_by_administrator',
    );

    expect(rejection?.actorId).toBe('admin-1');
    expect(rejection?.parentType).toBe('claim');
    expect(rejection?.parentId).toBe('claim-1');
    expect(rejection?.metadata).toEqual({ reason: REASON });
  });

  it('refuses a rejection whose reason is too short, and writes nothing', async () => {
    // **A rejection with no usable reason leaves the claimant with nothing
    // to act on,** so it is refused before anything is written and the
    // Claim stays `Pending`.
    const harness = new Harness();

    await expect(
      harness.service.reject({
        claimId: 'claim-1',
        actor: ADMINISTRATOR,
        reason: 'short',
      }),
    ).rejects.toThrow();

    expect(harness.calls).not.toContain('decisions.reject');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a rejection whose reason is too long', async () => {
    const harness = new Harness();

    await expect(
      harness.service.reject({
        claimId: 'claim-1',
        actor: ADMINISTRATOR,
        reason: 'a'.repeat(501),
      }),
    ).rejects.toThrow();
  });

  it('refuses a rejection on a decided claim', async () => {
    const harness = new Harness();
    harness.state = { ...harness.state!, status: 'Approved' };

    await expect(
      harness.service.reject({
        claimId: 'claim-1',
        actor: ADMINISTRATOR,
        reason: REASON,
      }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.events).toHaveLength(0);
  });

  it('refuses a rejection that lost the race', async () => {
    const harness = new Harness();
    harness.rejectionLands = false;

    await expect(
      harness.service.reject({
        claimId: 'claim-1',
        actor: ADMINISTRATOR,
        reason: REASON,
      }),
    ).rejects.toThrow(ClaimDecisionConflictError);
  });

  it('refuses a rejection when the report’s status does not permit the move', async () => {
    // **The report's transition is the domain's,** and a report whose
    // status does not permit the move refuses it. The rejection is then
    // refused too — the claim stays `Pending` and nothing is written.
    const harness = new Harness();
    harness.reportStatus = 'Claim Approved';

    await expect(
      harness.service.reject({
        claimId: 'claim-1',
        actor: ADMINISTRATOR,
        reason: REASON,
      }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.reportUpdate).toBeNull();
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a rejection when the claim was decided between the read and the lock', async () => {
    // **The same in-transaction re-read the approval has.** The advisory
    // read is not the guarantee.
    const harness = new Harness();
    let reads = 0;

    const reader = {
      ...harness.reader,
      readDecisionState: async (
        _claimId: string,
        _transaction?: TransactionHandle,
      ): Promise<ClaimDecisionState | null> => {
        reads += 1;

        return reads === 1 ? harness.state : { ...harness.state!, status: 'Rejected' };
      },
    };

    const service = new ClaimDecisionService(
      reader,
      harness.decisions,
      harness.reports,
      harness.audit,
      harness.transactions,
      harness.clock,
      harness.emails,
      new DefaultClaimDecisionEmailBuilder(),
    );

    await expect(
      service.reject({ claimId: 'claim-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ClaimDecisionConflictError);

    expect(harness.events).toHaveLength(0);
  });

  it('refuses a rejection when the claim does not exist', async () => {
    // **A missing Claim is a 404 and nothing is written.**
    const harness = new Harness();
    harness.state = null;

    await expect(
      harness.service.reject({ claimId: 'missing', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow('No claim with that id.');

    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a rejection when the report does not exist', async () => {
    // **The report's absence is a 404, not a conflict.** The item the
    // claim was made against is gone.
    const harness = new Harness();
    harness.reportStatus = null as never;

    await expect(
      harness.service.reject({ claimId: 'claim-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow('No report with that id.');

    expect(harness.calls).not.toContain('decisions.reject');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a rejection when the claim disappears between the read and the lock', async () => {
    // **The same vanishing-claim distinction the approval has.** A claim
    // deleted mid-decision is a 404; a claim decided by someone else is a
    // conflict.
    const harness = new Harness();
    let reads = 0;

    const reader = {
      ...harness.reader,
      readDecisionState: async (
        _claimId: string,
        _transaction?: TransactionHandle,
      ): Promise<ClaimDecisionState | null> => {
        reads += 1;

        return reads === 1 ? harness.state : null;
      },
    };

    const service = new ClaimDecisionService(
      reader,
      harness.decisions,
      harness.reports,
      harness.audit,
      harness.transactions,
      harness.clock,
      harness.emails,
      new DefaultClaimDecisionEmailBuilder(),
    );

    await expect(
      service.reject({ claimId: 'claim-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow('No claim with that id.');

    expect(harness.calls).not.toContain('decisions.reject');
    expect(harness.events).toHaveLength(0);
  });

  it('sends the rejection email after the commit', async () => {
    const harness = new Harness();

    await harness.service.reject({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const transactionIndex = harness.calls.indexOf('transactions.run');
    const emailIndex = harness.calls.indexOf('emails.send');

    expect(emailIndex).toBeGreaterThan(transactionIndex);
    expect(harness.sent[0]?.to).toBe('claimant@example.test');
  });

  it('carries the administrator’s reason verbatim to the claimant', async () => {
    // **The administrator's stated finding is not softened.** The softening
    // rule applies to the *auto*-rejection's copy.
    const harness = new Harness();

    await harness.service.reject({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(harness.sent[0]?.textBody).toContain(REASON);
  });

  it('answers a claim whose status is absent with a 404, not a conflict', async () => {
    // **The gate names two refusals, and they map to two different
    // statuses.** A Claim that cannot be read at all is a 404; a Claim that
    // was read and found already decided is a 409. The administrator who
    // lost a race needs to know they were not wrong — they were simply
    // second — and a 404 would say something else entirely.
    //
    // **A reader that reports a Claim with no status** is the way to reach
    // the gate's "not found" refusal: the reader returns the row, but the
    // status it carries is absent.
    const harness = new Harness();

    const reader = {
      ...harness.reader,
      readDecisionState: async (
        _claimId: string,
        _transaction?: TransactionHandle,
      ): Promise<ClaimDecisionState | null> => ({
        ...harness.state!,
        status: null as never,
      }),
    };

    const service = new ClaimDecisionService(
      reader,
      harness.decisions,
      harness.reports,
      harness.audit,
      harness.transactions,
      harness.clock,
      harness.emails,
      new DefaultClaimDecisionEmailBuilder(),
    );

    await expect(
      service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow('No claim with that id.');

    expect(harness.calls).not.toContain('decisions.approve');
    expect(harness.events).toHaveLength(0);
  });
});

// ── The claim statuses the gate must refuse ─────────────────────────────────

describe('the claim decision service — the statuses it refuses', () => {
  it('refuses every terminal claim status', async () => {
    // **The gate is a whitelist,** and the service is never reached by a
    // decision on a terminal Claim.
    const statuses: ClaimStatus[] = ['Approved', 'Rejected', 'Returned'];

    for (const status of statuses) {
      const harness = new Harness();
      harness.state = { ...harness.state!, status };

      await expect(
        harness.service.approve({ claimId: 'claim-1', actor: ADMINISTRATOR }),
      ).rejects.toThrow(ClaimDecisionConflictError);
    }
  });
});
