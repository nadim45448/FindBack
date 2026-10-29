/**
 * `GET /api/reports/[id]/image` — the authorised image delivery.
 *
 * **This is the only path to a stored image's bytes.** The blob is private
 * and its URL is not publicly fetchable (ADR-2), so this route *is* the
 * delivery mechanism — and therefore *is* the authorisation boundary.
 *
 * **The route resolves the actor and hands it to the service; the service
 * decides.** The route never reads the blob, never inspects a path, and
 * never decides whether a viewer may have the image. `image-handling.md` §2
 * requires the check to happen "immediately adjacent to the blob read" and
 * forbids relying on middleware or the CDN for it — so the decision and the
 * read live together, inside the delivery service, and the route is the
 * thin thing that maps the outcome to a response.
 *
 * **A refusal is a 404, not a 403.** An unrelated member, a claimant, a
 * recovery responder, an anonymous visitor, and a report with no image all
 * receive the same answer. A 403 would confirm that the report exists —
 * which is exactly what a refused viewer must not learn.
 *
 * **The headers are not decoration; each one is a control.**
 *
 * | Header | Why |
 * |---|---|
 * | `X-Content-Type-Options: nosniff` | stops the browser second-guessing the server-set type |
 * | `Content-Disposition: inline` | renders in place, and keeps it out of an executable context |
 * | `Content-Type` | **server-set**, from the allowlist — never the upload's declared type |
 * | `Cache-Control: private, no-cache` | keeps it out of shared caches, but forces revalidation |
 *
 * **Never `s-maxage`.** A shared cache keyed on the URL would serve one
 * member's image to another member, and no header combination can undo that
 * once the bytes are cached (`image-handling.md` §3, ADR-2).
 */

import { NextResponse } from 'next/server';

import { NotFoundError } from '@/lib/errors';

import {
  IMAGE_CACHE_CONTROL,
  IMAGE_CONTENT_DISPOSITION,
  IMAGE_CONTENT_TYPE_OPTIONS,
} from '@/domain/listings';

import { ImageNotFoundError, ImageReadError } from '@/application/listings/ports/image-reader';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { errorResponse, log, readRequestId, readSessionCookie } from '@/app/api/_helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Read a report's image. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const requestId = await readRequestId();
  const action = 'report.image';

  try {
    const { id } = await context.params;
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **The actor is derived from the session**, never from the request's
    // body or query. An anonymous request has no actor, and the delivery
    // service refuses it before anything is loaded.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    // ── The use case ───────────────────────────────────────────────────────
    //
    // **The service reads the blob.** The authorisation and the read are
    // adjacent inside it, and the route receives bytes it never had to
    // authorise.
    const delivered = await listings.imageDelivery.deliver(actor, id);

    log(requestId, action, 'success', {
      actorId: actor?.actorId,
      actorRole: actor?.isAdministrator ? 'administrator' : actor ? 'member' : 'anonymous',
      targetType: 'report',
      targetId: id,
    });

    return imageResponse(delivered.bytes, delivered.contentType);
  } catch (error) {
    return imageErrorResponse(error, requestId, action);
  }
}

/**
 * The image response, with the four delivery headers.
 *
 * **The `Content-Type` is the server-set one** the service resolved from the
 * image's own bytes. It is never the upload's declared type and never the
 * blob store's metadata.
 *
 * **The body is the bytes and nothing else.** No wrapper, no JSON, no
 * base64 — a delivered image is the image.
 */
function imageResponse(bytes: Buffer, contentType: string): Response {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': IMAGE_CONTENT_TYPE_OPTIONS,
      'Content-Disposition': IMAGE_CONTENT_DISPOSITION,
      'Cache-Control': IMAGE_CACHE_CONTROL,
    },
  });
}

/**
 * Map a thrown error to a response.
 *
 * **Three refusals, deliberately distinguishable from each other in the
 * *server's* logs but not in the *client's*.** A viewer who may not have the
 * image gets the same 404 as a report with no image. A missing blob is also
 * a 404 — the image the report points at is not there, which from the
 * viewer's side is the same fact. A read failure is a 500 with a neutral
 * message: `image-handling.md` §5 forbids a partial or wrong-type body, so
 * there is nothing to serve but an error.
 */
function imageErrorResponse(error: unknown, requestId: string, action: string): Response {
  if (error instanceof NotFoundError || error instanceof ImageNotFoundError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: 'That image could not be found.' }, { status: 404 });
  }

  if (error instanceof ImageReadError) {
    // **A read failure is a server-side failure**, and it says so in the
    // log. The client gets a neutral message — an internal error's detail
    // could disclose the store's hostname or a path.
    log(requestId, action, 'error');

    return NextResponse.json(
      { error: 'The image could not be read. Please try again later.' },
      { status: 500 },
    );
  }

  return errorResponse(error, requestId);
}
