/**
 * The candidate image delivery service's suite.
 *
 * **The load-bearing assertions are the refusals, and the fact that a
 * refusal reads nothing.** A refused viewer must learn nothing about
 * whether the Response exists, whether it has an image, or who responded to
 * it — so every refusal is a `NotFoundError` with the same message, and the
 * blob reader is never called.
 *
 * **The order is asserted, not just the outcome.** The authorisation is
 * evaluated immediately before the blob read, so the test records the
 * sequence of events and asserts that no read happens for a refused viewer.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '@/lib/errors';

import { createActorContext } from '@/domain/accounts/actor-context';
import type { CandidateImageRelationship } from '@/domain/recovery';

import {
  ImageNotFoundError,
  ImageReadError,
  type ImageReader,
  type RetrievedImage,
} from './ports/image-reader';
import type { CandidateImageReader } from './ports/candidate-image-reader';
import { CandidateImageDeliveryService } from './candidate-image-delivery-service';

const RESPONDER_ID = '00000000-0000-4000-8000-000000000911';
const OTHER_RESPONDER_ID = '00000000-0000-4000-8000-000000000912';
const REPORT_OWNER_ID = '00000000-0000-4000-8000-000000000913';
const ADMIN_ID = '00000000-0000-4000-8000-000000000914';
const UNRELATED_ID = '00000000-0000-4000-8000-000000000915';

const IMAGE_BYTES = Buffer.from('a real image');

/** The events the collaborators recorded, in order. */
let events: string[] = [];

/** The image the reader will return. */
let imageOutcome: RetrievedImage | Error = {
  bytes: IMAGE_BYTES,
  contentType: 'image/jpeg',
};

/** The candidate image the reader will find. */
let storedImage:
  | {
      readonly image: { readonly path: string };
      readonly relationship: CandidateImageRelationship;
    }
  | null = null;

/** The candidate image reader. */
const candidateImages: CandidateImageReader = {
  loadCandidateImageForViewer: async (_responseId, _viewerId) => {
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

const service = new CandidateImageDeliveryService({ candidateImages, images });

/** An active member's actor context. */
function aMember(actorId: string, isAdministrator = false): ReturnType<typeof createActorContext> {
  return createActorContext({
    actorId,
    status: 'Active',
    isAdministrator,
    displayName: 'A Member',
  });
}

/** The relationship of the viewer who submitted the Response. */
function responderRelationship(): CandidateImageRelationship {
  return {
    responseId: 'response-1',
    reportId: 'report-1',
    responderId: RESPONDER_ID,
    reportOwnerId: REPORT_OWNER_ID,
    viewerId: RESPONDER_ID,
    isResponder: true,
  };
}

/** The relationship of a competing responder on the same report. */
function competingResponderRelationship(): CandidateImageRelationship {
  return {
    responseId: 'response-1',
    reportId: 'report-1',
    responderId: RESPONDER_ID,
    reportOwnerId: REPORT_OWNER_ID,
    viewerId: OTHER_RESPONDER_ID,
    isResponder: false,
  };
}

/** The relationship of the Lost report's owner. */
function ownerRelationship(): CandidateImageRelationship {
  return {
    responseId: 'response-1',
    reportId: 'report-1',
    responderId: RESPONDER_ID,
    reportOwnerId: REPORT_OWNER_ID,
    viewerId: REPORT_OWNER_ID,
    isResponder: false,
  };
}

/** The relationship of an unrelated member. */
function unrelatedRelationship(): CandidateImageRelationship {
  return {
    responseId: 'response-1',
    reportId: 'report-1',
    responderId: RESPONDER_ID,
    reportOwnerId: REPORT_OWNER_ID,
    viewerId: UNRELATED_ID,
    isResponder: false,
  };
}

/** A stored candidate image. */
function withImage(relationship: CandidateImageRelationship): void {
  storedImage = {
    image: { path: 'recovery-response-candidates/abc.jpg' },
    relationship,
  };
}

describe('the candidate image delivery service', () => {
  beforeEach(() => {
    events = [];
    imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/jpeg' };
    storedImage = null;
  });

  describe('the refusals', () => {
    it('refuses an anonymous viewer', async () => {
      withImage(unrelatedRelationship());

      await expect(service.deliver(null, 'response-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reads nothing for an anonymous viewer', async () => {
      // **The refusal precedes every read.** An anonymous viewer must not
      // cause the Response to be loaded, and must not cause the blob to be
      // fetched.
      withImage(unrelatedRelationship());

      await expect(service.deliver(null, 'response-1')).rejects.toBeInstanceOf(NotFoundError);

      expect(events).toEqual([]);
    });

    it('refuses an unrelated member', async () => {
      withImage(unrelatedRelationship());

      await expect(service.deliver(aMember(UNRELATED_ID), 'response-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('reads no blob for an unrelated member', async () => {
      withImage(unrelatedRelationship());

      await expect(service.deliver(aMember(UNRELATED_ID), 'response-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );

      expect(events).not.toContain('read-blob');
    });

    it('refuses a competing responder', async () => {
      // **The competing responder holds the same FR-39 column** — the
      // `recoveryResponder` column — and is still refused, because the
      // column says nothing about *which* response.
      withImage(competingResponderRelationship());

      await expect(
        service.deliver(aMember(OTHER_RESPONDER_ID), 'response-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reads no blob for a competing responder', async () => {
      withImage(competingResponderRelationship());

      await expect(
        service.deliver(aMember(OTHER_RESPONDER_ID), 'response-1'),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(events).not.toContain('read-blob');
    });

    it('refuses a Response with no image', async () => {
      storedImage = null;

      await expect(service.deliver(aMember(RESPONDER_ID), 'response-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('refuses a Response that does not exist', async () => {
      storedImage = null;

      await expect(service.deliver(aMember(RESPONDER_ID), 'missing')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('gives every refusal the same message', async () => {
      // **The refusals are indistinguishable.** An anonymous visitor, an
      // unrelated member, a competing responder, and a Response with no
      // image all receive the same answer, so none of them learns anything
      // about the others.
      const messages: string[] = [];

      const refusals: Array<Promise<unknown>> = [
        service.deliver(null, 'response-1'),
        service.deliver(aMember(UNRELATED_ID), 'response-1'),
      ];

      withImage(competingResponderRelationship());

      refusals.push(service.deliver(aMember(OTHER_RESPONDER_ID), 'response-1'));

      storedImage = null;
      refusals.push(service.deliver(aMember(RESPONDER_ID), 'response-1'));

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
    it('delivers to the responder who submitted the Response', async () => {
      withImage(responderRelationship());

      const delivered = await service.deliver(aMember(RESPONDER_ID), 'response-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
      expect(delivered.contentType).toBe('image/jpeg');
    });

    it('delivers to the Lost-report owner', async () => {
      // **The owner must evaluate and select from the responses,** so they
      // are granted every candidate image on their own Lost report.
      withImage(ownerRelationship());

      const delivered = await service.deliver(aMember(REPORT_OWNER_ID), 'response-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
    });

    it('delivers to the administrator', async () => {
      withImage(unrelatedRelationship());

      const delivered = await service.deliver(aMember(ADMIN_ID, true), 'response-1');

      expect(delivered.bytes).toEqual(IMAGE_BYTES);
    });

    it('reads the blob only after the authorisation', async () => {
      // **The order is the guarantee.** The Response is loaded first, and
      // the blob is read last — after the delivery rule has been applied.
      withImage(responderRelationship());

      await service.deliver(aMember(RESPONDER_ID), 'response-1');

      expect(events).toEqual(['load-image', 'read-blob']);
    });
  });

  describe('the served content type', () => {
    it('serves the type from the allowlist', async () => {
      withImage(responderRelationship());

      const delivered = await service.deliver(aMember(RESPONDER_ID), 'response-1');

      expect(delivered.contentType).toBe('image/jpeg');
    });

    it('refuses a type that is not in the allowlist', async () => {
      // **The allowlist is the last gate before the bytes reach a browser.**
      // The reader reports what the bytes *are*; a type outside the
      // allowlist means the image was stored without passing validation.
      imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/svg+xml' };

      withImage(responderRelationship());

      await expect(
        service.deliver(aMember(RESPONDER_ID), 'response-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reads the blob before refusing a type outside the allowlist', async () => {
      // **The refusal is a not-found, not a validation error.** A type
      // outside the allowlist means the image was stored without passing
      // validation — a defect in how it was stored, not a mistake by the
      // viewer.
      imageOutcome = { bytes: IMAGE_BYTES, contentType: 'image/svg+xml' };

      withImage(responderRelationship());

      await expect(
        service.deliver(aMember(RESPONDER_ID), 'response-1'),
      ).rejects.toBeInstanceOf(NotFoundError);

      // The bytes were read — the type is a property of the bytes, so it
      // cannot be known without reading them.
      expect(events).toContain('read-blob');
    });
  });

  describe('the read failures', () => {
    it('propagates a missing blob as a not-found', async () => {
      withImage(responderRelationship());
      imageOutcome = new ImageNotFoundError();

      await expect(service.deliver(aMember(RESPONDER_ID), 'response-1')).rejects.toBeInstanceOf(
        ImageNotFoundError,
      );
    });

    it('propagates a read failure', async () => {
      // **A read failure is never a partial or a wrong-type body**
      // (image-handling §5). The error propagates; the route answers 500.
      withImage(responderRelationship());
      imageOutcome = new ImageReadError();

      await expect(service.deliver(aMember(RESPONDER_ID), 'response-1')).rejects.toBeInstanceOf(
        ImageReadError,
      );
    });
  });
});
