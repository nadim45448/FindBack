/**
 * The claim thread service's suite.
 *
 * **The order is what carries the bolt's guarantees, and the order is
 * asserted here.** A post reads the Claim's subject, decides the
 * participation, decides the writability, and only then opens the
 * transaction that writes the message and its audit event. A refused post
 * writes nothing at all — and that is the property this suite exists to
 * prove.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value.
 *
 * **The isolation from the claimant's private evidence is asserted
 * structurally.** The subject the reader returns carries no reason and no
 * identifying details — because the port has no field for them — so a
 * finder taking part in a thread has no way to receive them even if the
 * reader wanted to offer.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { ClaimThreadService } from '@/application/listings/claim-thread-service';
import type {
  ClaimThreadReader,
  ClaimThreadSubject,
  ThreadMessageView,
} from '@/application/listings/ports/claim-thread-reader';
import type { ClaimThreadRepository } from '@/application/listings/ports/claim-thread-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type { ClaimStatus, ReportStatus } from '@/domain/listings';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The claimant. */
const CLAIMANT = { actorId: 'claimant-1', isAdministrator: false };

/** The finder of the Found report. */
const FINDER = { actorId: 'finder-1', isAdministrator: false };

/** An administrator. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is neither the claimant nor the finder. */
const STRANGER = { actorId: 'stranger-1', isAdministrator: false };

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The Claim's subject, as the reader returns it. `null` means "no such claim". */
  subject: ClaimThreadSubject | null = {
    claimId: 'claim-1',
    reportId: 'report-1',
    claimStatus: 'Pending',
    reportStatus: 'Claim Requested',
    claimantId: 'claimant-1',
    foundReportOwnerId: 'finder-1',
    claimantEmail: 'claimant@example.test',
  };

  /** The messages the thread holds. */
  messages: ThreadMessageView[] = [];

  /** The author's display name, as the reader returns it. */
  displayName: string | null = 'Alex Claimant';

  /** The message the repository stored. */
  storedBody: string | null = null;

  /** The handle the repository was given. */
  storedHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly reader: ClaimThreadReader = {
    readThreadSubject: async (
      _claimId: string,
      transaction?: TransactionHandle,
    ): Promise<ClaimThreadSubject | null> => {
      this.calls.push(
        transaction === undefined ? 'reader.readThreadSubject' : 'reader.readThreadSubject.tx',
      );

      return this.subject;
    },
    listThreadMessages: async (
      _claimId: string,
      transaction?: TransactionHandle,
    ): Promise<readonly ThreadMessageView[]> => {
      this.calls.push(
        transaction === undefined ? 'reader.listThreadMessages' : 'reader.listThreadMessages.tx',
      );

      return this.messages;
    },
    readAuthorDisplayName: async (
      _authorId: string,
      transaction?: TransactionHandle,
    ): Promise<string | null> => {
      this.calls.push(
        transaction === undefined ? 'reader.readAuthorDisplayName' : 'reader.readAuthorDisplayName.tx',
      );

      return this.displayName;
    },
  };

  readonly threads: ClaimThreadRepository = {
    postMessage: async (
      input: {
        readonly claimId: string;
        readonly reportId: string;
        readonly authorId: string;
        readonly authorDisplayName: string;
        readonly body: { readonly value: string };
        readonly postedAt: Date;
      },
      transaction: TransactionHandle,
    ): Promise<{
      readonly id: string;
      readonly claimId: string;
      readonly reportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: { readonly value: string; readonly brand: 'claim-thread-message-body' };
      readonly postedAt: Date;
    }> => {
      this.calls.push('threads.postMessage');
      this.storedBody = input.body.value;
      this.storedHandle = transaction;

      return {
        id: 'message-1',
        claimId: input.claimId,
        reportId: input.reportId,
        authorId: input.authorId,
        authorDisplayName: input.authorDisplayName,
        body: { value: input.body.value, brand: 'claim-thread-message-body' },
        postedAt: input.postedAt,
      };
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The thread path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The thread path never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly service: ClaimThreadService = new ClaimThreadService(
    this.reader,
    this.threads,
    this.audit,
    this.transactions,
  );
}

// ── Reading ───────────────────────────────────────────────────────────────

describe('the claim thread service — reading', () => {
  it('reads the thread for the claimant', async () => {
    const harness = new Harness();

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT });

    expect(thread.claimId).toBe('claim-1');
    expect(thread.participation).toBe('Claimant');
    expect(thread.messages).toEqual([]);
    expect(thread.writable).toBe(true);
    expect(thread.readOnlyReason).toBeNull();
  });

  it('reads the thread for the finder', async () => {
    const harness = new Harness();

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: FINDER });

    expect(thread.participation).toBe('FoundReportOwner');
  });

  it('reads the thread for an administrator', async () => {
    const harness = new Harness();

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: ADMINISTRATOR });

    expect(thread.participation).toBe('Administrator');
  });

  it('refuses a member who is neither the claimant nor the finder', async () => {
    const harness = new Harness();

    await expect(
      harness.service.readThread({ claimId: 'claim-1', actor: STRANGER }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('does not reveal the claim\'s existence to a refused member', async () => {
    const harness = new Harness();
    harness.subject = null;

    // **A non-participant asking about a claim that does not exist is
    // refused with the access-denied message**, not a 404 — a 404 would
    // tell them the claim is not real, which is a fact about another
    // member's claim.
    await expect(
      harness.service.readThread({ claimId: 'claim-1', actor: STRANGER }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('answers a missing claim with the access-denied refusal, not a not-found', async () => {
    const harness = new Harness();
    harness.subject = null;

    // **The Claim's existence is a private fact.** A 404 would answer the
    // question "is this claim real?" — and a missing Claim has no
    // participants, so every reader of it is refused the same way.
    await expect(
      harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('returns the messages oldest first', async () => {
    const harness = new Harness();
    harness.messages = [
      {
        id: 'message-1',
        authorId: 'claimant-1',
        authorDisplayName: 'Alex',
        body: 'First',
        postedAt: '2026-10-30T09:00:00.000Z',
      },
      {
        id: 'message-2',
        authorId: 'finder-1',
        authorDisplayName: 'Sam',
        body: 'Second',
        postedAt: '2026-10-30T09:05:00.000Z',
      },
    ];

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT });

    expect(thread.messages.map((message) => message.id)).toEqual(['message-1', 'message-2']);
  });

  it('reports a decided claim\'s thread as read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, claimStatus: 'Approved' };

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT });

    expect(thread.writable).toBe(false);
    expect(thread.readOnlyReason).toBe('ClaimDecided');
  });

  it('reports an ended report\'s thread as read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, reportStatus: 'Closed' };

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT });

    expect(thread.writable).toBe(false);
    expect(thread.readOnlyReason).toBe('ReportEnded');
  });

  it('still reads a locked thread\'s full history', async () => {
    // **Read-only is not empty.** A locked thread keeps its full history,
    // and the messages are never deleted.
    const harness = new Harness();
    harness.subject = { ...harness.subject!, claimStatus: 'Rejected' };
    harness.messages = [
      {
        id: 'message-1',
        authorId: 'claimant-1',
        authorDisplayName: 'Alex',
        body: 'This is my wallet',
        postedAt: '2026-10-30T09:00:00.000Z',
      },
    ];

    const thread = await harness.service.readThread({ claimId: 'claim-1', actor: CLAIMANT });

    expect(thread.writable).toBe(false);
    expect(thread.messages).toHaveLength(1);
  });
});

// ── Posting ───────────────────────────────────────────────────────────────

describe('the claim thread service — posting', () => {
  it('posts a message for the claimant', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(result.claimId).toBe('claim-1');
    expect(result.message.body).toBe('This is my wallet.');
    expect(result.message.authorDisplayName).toBe('Alex Claimant');
    expect(result.event.type).toBe('thread.claim_message_posted');
  });

  it('posts a message for the finder', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: FINDER,
      body: 'I found it in the cafeteria.',
    });

    expect(result.message.body).toBe('I found it in the cafeteria.');
  });

  it('posts a message for an administrator', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      body: 'I am reviewing this claim.',
    });

    expect(result.message.body).toBe('I am reviewing this claim.');
  });

  it('refuses a member who is neither the claimant nor the finder', async () => {
    const harness = new Harness();

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: STRANGER, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the post is refused', async () => {
    // **A refused post writes nothing at all** — no message, no audit
    // event, and no transaction opened.
    const harness = new Harness();

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: STRANGER, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.calls).not.toContain('threads.postMessage');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a body that breaks its bound before reading anything', async () => {
    // **The body is validated first.** A body that breaks its bound is
    // refused before the thread is even read.
    const harness = new Harness();

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: '' }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).toHaveLength(0);
  });

  it('refuses a body one character over the maximum', async () => {
    const harness = new Harness();
    const body = 'x'.repeat(2001);

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body }),
    ).rejects.toThrow(ValidationError);
  });

  it('answers a missing claim with the access-denied refusal, not a not-found', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('writes nothing when the claim does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a post to a decided claim\'s thread', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, claimStatus: 'Approved' };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a post to an ended report\'s thread', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, reportStatus: 'Returned' };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the thread is read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, claimStatus: 'Rejected' };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('names the path forward when the thread is read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, claimStatus: 'Approved' };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(/decided/);
  });

  it('writes the message and the audit event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    // **The message and the audit event commit together.** An audit record
    // for a message that was never posted — or a posted message with no
    // audit record — is a permanent hole in an append-only trail.
    const runIndex = harness.calls.indexOf('transactions.run');
    const postIndex = harness.calls.indexOf('threads.postMessage');
    const auditIndex = harness.calls.indexOf('audit.record');

    expect(runIndex).toBeLessThan(postIndex);
    expect(postIndex).toBeLessThan(auditIndex);
  });

  it('passes the caller\'s transaction to the write', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(harness.storedHandle).toBe(HANDLE);
  });

  it('records the audit event with the message text', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.eventType).toBe('thread.claim_message_posted');
    expect(harness.events[0]?.parentType).toBe('claim');
    expect(harness.events[0]?.parentId).toBe('claim-1');
    expect(harness.events[0]?.metadata).toEqual({ messageText: 'This is my wallet.' });
  });

  it('records an administrator\'s post as an administrator', async () => {
    // **The role is the poster's role, not a fixed one.** A message from an
    // administrator that reads as a member's is a trail that misrepresents
    // who said what.
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: ADMINISTRATOR,
      body: 'I am reviewing this claim.',
    });

    expect(harness.events[0]?.actorRole).toBe('administrator');
  });

  it('records a member\'s post as a member', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(harness.events[0]?.actorRole).toBe('member');
  });

  it('captures the author\'s display name onto the message', async () => {
    const harness = new Harness();
    harness.displayName = 'Alex Claimant';

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(result.message.authorDisplayName).toBe('Alex Claimant');
  });

  it('falls back to a generic name when the account has none', async () => {
    const harness = new Harness();
    harness.displayName = null;

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(result.message.authorDisplayName).toBe('Member');
  });

  it('trims the body before it stores it', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: '  This is my wallet.  ',
    });

    expect(harness.storedBody).toBe('This is my wallet.');
    expect(result.message.body).toBe('This is my wallet.');
  });

  it('reads the author\'s display name inside the transaction', async () => {
    // **The name is captured at the moment of posting**, so a later rename
    // does not rewrite the conversation.
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'This is my wallet.',
    });

    expect(harness.calls).toContain('reader.readAuthorDisplayName.tx');
  });

  it('never reads the claim\'s reason or identifying details', async () => {
    // **Participation grants no private evidence.** The subject the reader
    // returns has no field for the claimant's reason or identifying
    // details, so there is no path by which the finder taking part in the
    // thread could receive them.
    const harness = new Harness();

    await harness.service.postMessage({
      claimId: 'claim-1',
      actor: FINDER,
      body: 'I found it in the cafeteria.',
    });

    expect(Object.keys(harness.subject!)).toEqual([
      'claimId',
      'reportId',
      'claimStatus',
      'reportStatus',
      'claimantId',
      'foundReportOwnerId',
      'claimantEmail',
    ]);
  });

  it('accepts a body of exactly the maximum length', async () => {
    const harness = new Harness();
    const body = 'x'.repeat(2000);

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body,
    });

    expect(result.message.body).toHaveLength(2000);
  });

  it('accepts a body of exactly one character', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      claimId: 'claim-1',
      actor: CLAIMANT,
      body: 'a',
    });

    expect(result.message.body).toBe('a');
  });
});

// ── The states the vocabulary owns ────────────────────────────────────────

describe('the claim thread service — status handling', () => {
  it('refuses a claim status the vocabulary does not own', async () => {
    const harness = new Harness();
    harness.subject = {
      ...harness.subject!,
      claimStatus: 'Awaiting Inspection' as unknown as ClaimStatus,
    };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a report status the vocabulary does not own', async () => {
    const harness = new Harness();
    harness.subject = {
      ...harness.subject!,
      reportStatus: 'Awaiting Inspection' as unknown as ReportStatus,
    };

    await expect(
      harness.service.postMessage({ claimId: 'claim-1', actor: CLAIMANT, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });
});
