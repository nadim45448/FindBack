/**
 * The Recovery Response thread service's suite.
 *
 * **The order is what carries the bolt's guarantees, and the order is
 * asserted here.** A post reads the Response's subject, decides the
 * participation, decides the writability, and only then opens the
 * transaction that writes the message and its audit event. A refused post
 * writes nothing at all — and that is the property this suite exists to
 * prove.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value.
 *
 * **The isolation from the responder's private evidence is asserted
 * structurally.** The subject the reader returns carries no where-found, no
 * observed identifying details, and no date found — because the port has no
 * field for them — so an owner taking part in a thread has no way to
 * receive them even if the reader wanted to offer.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { RecoveryResponseThreadService } from '@/application/listings/recovery-response-thread-service';
import type {
  RecoveryResponseThreadMessageView,
  RecoveryResponseThreadReader,
  RecoveryResponseThreadSubject,
} from '@/application/listings/ports/recovery-response-thread-reader';
import type { RecoveryResponseThreadRepository } from '@/application/listings/ports/recovery-response-thread-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type { ReportStatus } from '@/domain/listings';
import type { RecoveryResponseStatus } from '@/domain/recovery';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The responder who made the response. */
const RESPONDER = { actorId: 'responder-1', isAdministrator: false };

/** The owner of the Lost report. */
const OWNER = { actorId: 'owner-1', isAdministrator: false };

/** An administrator. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is neither the responder nor the owner. */
const STRANGER = { actorId: 'stranger-1', isAdministrator: false };

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The Response's subject, as the reader returns it. `null` means "no such response". */
  subject: RecoveryResponseThreadSubject | null = {
    recoveryResponseId: 'response-1',
    lostReportId: 'report-1',
    responseStatus: 'Submitted',
    reportStatus: 'Open',
    responderId: 'responder-1',
    lostReportOwnerId: 'owner-1',
  };

  /** The messages the thread holds. */
  messages: RecoveryResponseThreadMessageView[] = [];

  /** The author's display name, as the reader returns it. */
  displayName: string | null = 'Alex Responder';

  /** The message the repository stored. */
  storedBody: string | null = null;

  /** The handle the repository was given. */
  storedHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly reader: RecoveryResponseThreadReader = {
    readThreadSubject: async (
      _responseId: string,
      transaction?: TransactionHandle,
    ): Promise<RecoveryResponseThreadSubject | null> => {
      this.calls.push(
        transaction === undefined ? 'reader.readThreadSubject' : 'reader.readThreadSubject.tx',
      );

      return this.subject;
    },
    listThreadMessages: async (
      _responseId: string,
      transaction?: TransactionHandle,
    ): Promise<readonly RecoveryResponseThreadMessageView[]> => {
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

  readonly threads: RecoveryResponseThreadRepository = {
    postMessage: async (
      input: {
        readonly recoveryResponseId: string;
        readonly lostReportId: string;
        readonly authorId: string;
        readonly authorDisplayName: string;
        readonly body: { readonly value: string };
        readonly postedAt: Date;
      },
      transaction: TransactionHandle,
    ): Promise<{
      readonly id: string;
      readonly recoveryResponseId: string;
      readonly lostReportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: {
        readonly value: string;
        readonly brand: 'recovery-response-thread-message-body';
      };
      readonly postedAt: Date;
    }> => {
      this.calls.push('threads.postMessage');
      this.storedBody = input.body.value;
      this.storedHandle = transaction;

      return {
        id: 'message-1',
        recoveryResponseId: input.recoveryResponseId,
        lostReportId: input.lostReportId,
        authorId: input.authorId,
        authorDisplayName: input.authorDisplayName,
        body: { value: input.body.value, brand: 'recovery-response-thread-message-body' },
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

  readonly service: RecoveryResponseThreadService = new RecoveryResponseThreadService(
    this.reader,
    this.threads,
    this.audit,
    this.transactions,
    new LostSideEventFactory(this.audit),
  );
}

// ── Reading ───────────────────────────────────────────────────────────────

describe('the recovery response thread service — reading', () => {
  it('reads the thread for the responder', async () => {
    const harness = new Harness();

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: RESPONDER });

    expect(thread.recoveryResponseId).toBe('response-1');
    expect(thread.participation).toBe('Responder');
    expect(thread.messages).toEqual([]);
    expect(thread.writable).toBe(true);
    expect(thread.readOnlyReason).toBeNull();
  });

  it('reads the thread for the Lost report\'s owner', async () => {
    const harness = new Harness();

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: OWNER });

    expect(thread.participation).toBe('LostReportOwner');
  });

  it('reads the thread for an administrator', async () => {
    // **An administrator sees every response's thread, standby included** —
    // a response nobody has selected yet is still a thread they may read.
    const harness = new Harness();

    const thread = await harness.service.readThread({
      responseId: 'response-1',
      actor: ADMINISTRATOR,
    });

    expect(thread.participation).toBe('Administrator');
  });

  it('refuses a member who is neither the responder nor the owner', async () => {
    const harness = new Harness();

    await expect(
      harness.service.readThread({ responseId: 'response-1', actor: STRANGER }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a competing responder on the same report', async () => {
    // **A per-report thread would hand every candidate the conversation of
    // every other candidate.** The competing responder is not a participant
    // here, and the rule has no way to name them.
    const harness = new Harness();
    const competitor = { actorId: 'responder-2', isAdministrator: false };

    await expect(
      harness.service.readThread({ responseId: 'response-1', actor: competitor }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('does not reveal the response\'s existence to a refused member', async () => {
    const harness = new Harness();
    harness.subject = null;

    // **The Response's existence is itself a private fact.** A 404 would
    // answer the question "is this response real?".
    await expect(
      harness.service.readThread({ responseId: 'response-1', actor: STRANGER }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('answers a missing response with the access-denied refusal, not a not-found', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.readThread({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('returns the messages oldest first', async () => {
    const harness = new Harness();
    harness.messages = [
      {
        id: 'message-1',
        authorId: 'responder-1',
        authorDisplayName: 'Alex',
        body: 'First',
        postedAt: '2026-10-30T09:00:00.000Z',
      },
      {
        id: 'message-2',
        authorId: 'owner-1',
        authorDisplayName: 'Sam',
        body: 'Second',
        postedAt: '2026-10-30T09:05:00.000Z',
      },
    ];

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: RESPONDER });

    expect(thread.messages.map((message) => message.id)).toEqual(['message-1', 'message-2']);
  });

  it('reports a terminal response\'s thread as read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, responseStatus: 'Not a Match' };

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: RESPONDER });

    expect(thread.writable).toBe(false);
    expect(thread.readOnlyReason).toBe('ResponseEnded');
  });

  it('reports an ended report\'s thread as read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, reportStatus: 'Closed' };

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: RESPONDER });

    expect(thread.writable).toBe(false);
    expect(thread.readOnlyReason).toBe('ReportEnded');
  });

  it('still reads a locked thread\'s full history', async () => {
    // **Read-only is not empty.** A locked thread keeps its full history, and
    // the messages are never deleted.
    const harness = new Harness();
    harness.subject = { ...harness.subject!, responseStatus: 'Withdrawn' };
    harness.messages = [
      {
        id: 'message-1',
        authorId: 'responder-1',
        authorDisplayName: 'Alex',
        body: 'It is by the fountain.',
        postedAt: '2026-10-30T09:00:00.000Z',
      },
    ];

    const thread = await harness.service.readThread({ responseId: 'response-1', actor: RESPONDER });

    expect(thread.writable).toBe(false);
    expect(thread.messages).toHaveLength(1);
  });
});

// ── Posting ───────────────────────────────────────────────────────────────

describe('the recovery response thread service — posting', () => {
  it('posts a message for the responder', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(result.recoveryResponseId).toBe('response-1');
    expect(result.message.body).toBe('It is by the fountain.');
    expect(result.message.authorDisplayName).toBe('Alex Responder');
  });

  it('posts a message for the Lost report\'s owner', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: OWNER,
      body: 'When can you collect it?',
    });

    expect(result.message.body).toBe('When can you collect it?');
  });

  it('posts a message for an administrator', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: ADMINISTRATOR,
      body: 'I am reviewing this response.',
    });

    expect(result.message.body).toBe('I am reviewing this response.');
  });

  it('refuses a member who is neither the responder nor the owner', async () => {
    const harness = new Harness();

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: STRANGER, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a competing responder on the same report', async () => {
    const harness = new Harness();
    const competitor = { actorId: 'responder-2', isAdministrator: false };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: competitor, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the post is refused', async () => {
    // **A refused post writes nothing at all** — no message, no audit
    // event, and no transaction opened.
    const harness = new Harness();

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: STRANGER, body: 'Hello' }),
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
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: '' }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).toHaveLength(0);
  });

  it('refuses a body one character over the maximum', async () => {
    const harness = new Harness();
    const body = 'x'.repeat(2001);

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body }),
    ).rejects.toThrow(ValidationError);
  });

  it('answers a missing response with the access-denied refusal, not a not-found', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow('You do not have access to this.');
  });

  it('writes nothing when the response does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a post to a terminal response\'s thread', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, responseStatus: 'Not a Match' };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a post to an ended report\'s thread', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, reportStatus: 'Returned' };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the thread is read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, responseStatus: 'Withdrawn' };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('names the path forward when the thread is read-only', async () => {
    const harness = new Harness();
    harness.subject = { ...harness.subject!, responseStatus: 'Not a Match' };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(/closed/);
  });

  it('writes the message and the audit event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
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
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(harness.storedHandle).toBe(HANDLE);
  });

  it('records the audit event with the message text', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    // **Event 16's one field is `messageText`,** and the PRD names it — so
    // it is on the administrator-visible trail only, and never in an
    // operational log.
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.eventType).toBe('recovery_response.thread_message_posted');
    expect(harness.events[0]?.parentType).toBe('recovery_response_thread_message');
    expect(harness.events[0]?.parentId).toBe('message-1');
    expect(harness.events[0]?.metadata).toEqual({
      recoveryResponseId: 'response-1',
      messageText: 'It is by the fountain.',
    });
  });

  it('records an administrator\'s post as an administrator', async () => {
    // **The role is the poster's role, not a fixed one.** A message from an
    // administrator that reads as a member's is a trail that misrepresents
    // who said what.
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: ADMINISTRATOR,
      body: 'I am reviewing this response.',
    });

    expect(harness.events[0]?.actorRole).toBe('administrator');
  });

  it('records a member\'s post as a member', async () => {
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(harness.events[0]?.actorRole).toBe('member');
  });

  it('captures the author\'s display name onto the message', async () => {
    const harness = new Harness();
    harness.displayName = 'Alex Responder';

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(result.message.authorDisplayName).toBe('Alex Responder');
  });

  it('falls back to a generic name when the account has none', async () => {
    const harness = new Harness();
    harness.displayName = null;

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(result.message.authorDisplayName).toBe('Member');
  });

  it('trims the body before it stores it', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: '  It is by the fountain.  ',
    });

    expect(harness.storedBody).toBe('It is by the fountain.');
    expect(result.message.body).toBe('It is by the fountain.');
  });

  it('reads the author\'s display name inside the transaction', async () => {
    // **The name is captured at the moment of posting**, so a later rename
    // does not rewrite the conversation.
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'It is by the fountain.',
    });

    expect(harness.calls).toContain('reader.readAuthorDisplayName.tx');
  });

  it('never reads the response\'s where-found or identifying details', async () => {
    // **Participation grants no private evidence.** The subject the reader
    // returns has no field for the responder's where-found, their observed
    // identifying details, or their date found — so there is no path by
    // which the owner taking part in the thread could receive them.
    const harness = new Harness();

    await harness.service.postMessage({
      responseId: 'response-1',
      actor: OWNER,
      body: 'When can you collect it?',
    });

    expect(Object.keys(harness.subject!)).toEqual([
      'recoveryResponseId',
      'lostReportId',
      'responseStatus',
      'reportStatus',
      'responderId',
      'lostReportOwnerId',
    ]);
  });

  it('accepts a body of exactly the maximum length', async () => {
    const harness = new Harness();
    const body = 'x'.repeat(2000);

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body,
    });

    expect(result.message.body).toHaveLength(2000);
  });

  it('accepts a body of exactly one character', async () => {
    const harness = new Harness();

    const result = await harness.service.postMessage({
      responseId: 'response-1',
      actor: RESPONDER,
      body: 'a',
    });

    expect(result.message.body).toBe('a');
  });
});

// ── The states the vocabulary owns ────────────────────────────────────────

describe('the recovery response thread service — status handling', () => {
  it('refuses a response status the vocabulary does not own', async () => {
    const harness = new Harness();
    harness.subject = {
      ...harness.subject!,
      responseStatus: 'Awaiting Inspection' as unknown as RecoveryResponseStatus,
    };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a report status the vocabulary does not own', async () => {
    const harness = new Harness();
    harness.subject = {
      ...harness.subject!,
      reportStatus: 'Awaiting Inspection' as unknown as ReportStatus,
    };

    await expect(
      harness.service.postMessage({ responseId: 'response-1', actor: RESPONDER, body: 'Hello' }),
    ).rejects.toThrow(ConflictError);
  });
});
