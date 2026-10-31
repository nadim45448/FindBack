/**
 * The report image delivery service's suite.
 *
 * **The load-bearing assertions are the refusals, and the fact that a
 * refusal reads nothing.** A refused viewer must learn nothing about
 * whether the report exists, whether it has an image, or who owns it — so
 * every refusal is a `NotFoundError` with the same message, and the blob
 * reader is never called.
 *
 * **The order is asserted, not just the outcome.** The authorisation is
 * evaluated immediately before the blob read, so the test records the
 * sequence of events and asserts that no read happens for a refused
 * viewer. A service that read the blob and then checked would return the
 * same *answers* while leaking the bytes into memory on the way — and a
 * test that only checked the outcome would not see the difference.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '@/lib/errors';

import { createActorContext } from '@/domain/accounts/actor-context';
import { createReportRelationship, type ReportRelationship } from '@/domain/listings';

import {
  ImageNotFoundError,
  ImageReadError,
  type ImageReader,
  type RetrievedImage,
} from './ports/image-reader';
import type { ReportImageReader } from './ports/report-image-reader';
import { ReportImageDeliveryService } from './report-image-delivery-service';

const REPORTER_ID = '00000000-0000-4000-8000-000000000811';
const VIEWER_ID = '00000000-0000-4000-8000-000000000812';
const ADMIN_ID = '00000000-0000-4000-8000-000000000813';

const IMAGE_BYTES = Buffer.from('a real image');

/** The events the collaborators recorded, in order. */
let events: string[] = [];

/** The image the reader will return. */
let imageOutcome: RetrievedImage | Error = {
  bytes: IMAGE_BYTES,
  contentType: 'image/jpeg',
};

/** The report image the reader will find. */
let storedImage:
  | { readonly image: { readonly path: string }; readonly relationship: ReportRelationship }
  | null = null;

/** The report image reader. */
const reportImages: ReportImageReader = {
  loadImageForViewer: async (_reportId, _viewerId) => {
    events.push('load-image');

    return storedImage;
  },
};

/** The blob reader. */
const images: ImageReader = {
  read: async (_path) => {
    events.push('read-blob');

    if (imageOutcome instanceof Error) {
      throw imageOutcome;
    }

    return imageOutcome;
  },
};

const service = new ReportImageDeliveryService({ reportImages, images });

/** An active member's actor context. */
function aMember(actorId = VIEWER_ID): ReturnType<typeof createActorContext> {
  return createActorContext({
    actorId,
    status: 'Active',
    isAdministrator: false,
    displayName: 'A Member',
  });
}

/** An administrator's actor context. */
function anAdministrator(): ReturnType<typeof createActorContext> {
  return createActorContext({
    actorId: ADMIN_ID,
    status: 'Active',
    isAdministrator: true,
    displayName: 'An Administrator',
  });
}

/** The relationship of a viewer who did not author the report. */
function unrelatedRelationship(): ReportRelationship {
  return createReportRelationship({
    reportId: 'report-1',
    reportType: 'Found',
    reporterId: REPORTER_ID,
    viewerId: VIEWER_ID,
  });
}

/** The relationship of the report's author. */
function authorsRelationship(): ReportRelationship {
  return createReportRelationship({
    reportId: 'report-1',
    reportType: 'Found',
    reporterId: VIEWER_ID,
    viewerId: VIEWER_ID,
  });
}

/** A stored image on a report. */
function withImage(relationship: ReportRelationship): void {
  storedImage = {
    image: { path: 'reports/report-1/abc.jpg' },
    relationship,
  };
}

describe('the report image delivery service', () => {
  beforeEach(() => {
    events = [];
    imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/jpeg' };
    storedImage = null;
  });

  describe('the refusals', () => {
    it('refuses an anonymous viewer', async () => {
      withImage(unrelatedRelationship());

      await expect(service.deliver(null, 'report-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reads nothing for an anonymous viewer', async () => {
      // **The refusal precedes every read.** An anonymous viewer must not
      // cause the report to be loaded, and must not cause the blob to be
      // fetched.
      withImage(unrelatedRelationship());

      await expect(service.deliver(null, 'report-1')).rejects.toBeInstanceOf(NotFoundError);

      expect(events).toEqual([]);
    });

    it('delivers to an unrelated member browsing the report', async () => {
      withImage(unrelatedRelationship());

      const delivered = await service.deliver(aMember(), 'report-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
      expect(events).toEqual(['load-image', 'read-blob']);
    });

    it('refuses a claimant, whose column grants the image field', async () => {
      // **An image is not ownership evidence.** The claimant's projection
      // carries the image reference; the bytes are refused.
      const relationship = createReportRelationship({
        reportId: 'report-1',
        reportType: 'Found',
        reporterId: REPORTER_ID,
        viewerId: VIEWER_ID,
        claimId: 'claim-1',
      });

      withImage(relationship);

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(NotFoundError);

      expect(events).not.toContain('read-blob');
    });

    it('refuses a recovery responder', async () => {
      // **A responder must not see another candidate's image.**
      const relationship = createReportRelationship({
        reportId: 'report-1',
        reportType: 'Lost',
        reporterId: REPORTER_ID,
        viewerId: VIEWER_ID,
        recoveryResponseId: 'response-1',
      });

      withImage(relationship);

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(NotFoundError);

      expect(events).not.toContain('read-blob');
    });

    it('refuses a report with no image', async () => {
      storedImage = null;

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses a report that does not exist', async () => {
      storedImage = null;

      await expect(service.deliver(aMember(), 'missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('gives every refusal the same message', async () => {
      const messages: string[] = [];

      const refusals: Array<Promise<unknown>> = [service.deliver(null, 'report-1')];

      withImage(
        createReportRelationship({
          reportId: 'report-1',
          reportType: 'Found',
          reporterId: REPORTER_ID,
          viewerId: VIEWER_ID,
          claimId: 'claim-1',
        }),
      );

      refusals.push(service.deliver(aMember(), 'report-1'));

      storedImage = null;
      refusals.push(service.deliver(aMember(), 'report-1'));

      for (const refusal of refusals) {
        try {
          await refusal;
        } catch (error) {
          messages.push((error as Error).message);
        }
      }

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('the deliveries', () => {
    it('delivers to the member who authored the report', async () => {
      withImage(authorsRelationship());

      const delivered = await service.deliver(aMember(), 'report-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
      expect(delivered.contentType).toBe('image/jpeg');
    });

    it('delivers to the administrator', async () => {
      withImage(unrelatedRelationship());

      const delivered = await service.deliver(anAdministrator(), 'report-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
    });

    it('reads the blob only after the authorisation', async () => {
      // **The order is the guarantee.** The report is loaded first, and the
      // blob is read last — after the delivery rule has been applied.
      withImage(authorsRelationship());

      await service.deliver(aMember(), 'report-1');

      expect(events).toEqual(['load-image', 'read-blob']);
    });
  });

  describe('the served content type', () => {
    it('serves the type from the allowlist', async () => {
      withImage(authorsRelationship());

      const delivered = await service.deliver(aMember(), 'report-1');

      expect(delivered.contentType).toBe('image/jpeg');
    });

    it('refuses a type that is not in the allowlist', async () => {
      // **The allowlist is the last gate before the bytes reach a browser.**
      // The reader reports what the bytes *are*; a type outside the
      // allowlist means the image was stored without passing validation.
      //
      // The reader's report is the only source of the type — there is no
      // stored column and no blob metadata in the decision — so a type the
      // reader reports outside the allowlist is refused here.
      imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/svg+xml' };

      withImage(authorsRelationship());

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reads the blob before refusing a type outside the allowlist', async () => {
      // **The refusal is a not-found, not a validation error.** A type
      // outside the allowlist means the image was stored without passing
      // validation — a defect in how it was stored, not a mistake by the
      // viewer. A 400 would tell the viewer their request was wrong.
      imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/svg+xml' };

      withImage(authorsRelationship());

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(NotFoundError);

      // The bytes were read — the type is a property of the bytes, so it
      // cannot be known without reading them.
      expect(events).toContain('read-blob');
    });
  });

  describe('the read failures', () => {
    it('propagates a missing blob as a not-found', async () => {
      withImage(authorsRelationship());
      imageOutcome = new ImageNotFoundError();

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(
        ImageNotFoundError,
      );
    });

    it('propagates a read failure', async () => {
      // **A read failure is never a partial or a wrong-type body**
      // (image-handling §5). The error propagates; the route answers 500.
      withImage(authorsRelationship());
      imageOutcome = new ImageReadError();

      await expect(service.deliver(aMember(), 'report-1')).rejects.toBeInstanceOf(ImageReadError);
    });
  });
});
