import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import type { ActorContext } from '@/domain/accounts';

import {
  buildPage,
  type ReportListingFilter,
  type ReportListingRow,
} from '@/domain/listings';
import type { ListingPage } from '@/domain/listings/report-listing-result';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaCampusAreaReader } from '@/infrastructure/listings/prisma-campus-area-reader';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { listingFilterFromParams, listingPageFromParams } from '@/ui/listings-query';
import { ListingsSurface, type ListingPage as AnonymousListingPage } from '@/ui/listings-surface';
import { BrowseMemberSurface } from '@/ui/browse-member-surface';

import { readCampusAreaLabels } from '../my/_campus-area-labels';
import { MEMBER_READ_FAILED } from '../my/_member-page';

export const metadata: Metadata = {
  title: 'Lost & Found',
};

/**
 * The Browse page — `/listings`.
 *
 * ## One route, two surfaces
 *
 * §9.4: *"Browse (`/listings`). Same surface as anonymous listings but
 * with richer view."* So the route serves **both** — and which surface it
 * serves is decided by **whether a member is signed in**, not by the URL.
 *
 * **The anonymous visitor gets the `public` partition** and the member
 * gets the `browse` partition. The partition is resolved by the use case
 * from the actor, so the two cannot be confused: an anonymous request
 * naming `browse` still gets the public listing.
 *
 * ## A member's own report never appears in their own Browse
 *
 * The `browse` partition **carries the member's id in the partition
 * itself**, so the exclusion is in the query's predicate. There is no
 * post-filter that could be forgotten, and no client-side filter that
 * would hide a leak rather than fix one.
 *
 * ## There is no `/listings/:id` route for an anonymous visitor
 *
 * Story 002's criterion: *"no anonymous detail page exists"*. The detail
 * route refuses an anonymous reader before any query runs — see
 * `src/app/listings/[id]/page.tsx`.
 */
export default async function ListingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const filter = listingFilterFromParams(params);
  const pageNumber = listingPageFromParams(params);
  const actor = await resolveActor();

  if (actor) {
    return <MemberBrowse actor={actor} filter={filter} pageNumber={pageNumber} />;
  }

  const [page, campusAreas] = await Promise.all([
    readAnonymousListing(filter, pageNumber),
    readCampusAreas(),
  ]);

  return (
    <ListingsSurface
      page={page.data}
      error={page.error}
      filter={filter}
      campusAreas={campusAreas}
    />
  );
}

/**
 * The member Browse.
 *
 * **The partition is `browse`.** It is the partition that excludes the
 * member's own reports, and it is the only partition a member's Browse
 * may use.
 */
async function MemberBrowse({
  actor,
  filter,
  pageNumber,
}: {
  readonly actor: ActorContext;
  readonly filter: ReportListingFilter;
  readonly pageNumber: number;
}): Promise<React.JSX.Element> {
  const [page, campusAreas, campusAreaLabels] = await Promise.all([
    readBrowse(actor, filter, pageNumber),
    readCampusAreas(),
    readCampusAreaLabels(),
  ]);

  return (
    <BrowseMemberSurface
      page={page}
      filter={filter}
      campusAreas={campusAreas}
      campusAreaLabels={campusAreaLabels}
      error={page ? undefined : MEMBER_READ_FAILED}
    />
  );
}

/**
 * Read the member's Browse rows.
 *
 * @returns the rows, or `null` when the read failed.
 */
async function readBrowse(
  actor: ActorContext,
  filter: ReportListingFilter,
  pageNumber: number,
): Promise<ListingPage<ReportListingRow> | null> {
  try {
    const stack = buildListingsStack();

    const result = await stack.listings.list({
      actor,
      partition: 'browse',
      filter,
      page: buildPage(pageNumber, 50),
    });

    return {
      rows: result.rows as readonly ReportListingRow[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  } catch {
    return null;
  }
}

/**
 * The acting member, or `null` for an anonymous visitor.
 *
 * **The actor comes from the session cookie, never from the request.**
 */
async function resolveActor(): Promise<ActorContext | null> {
  try {
    const identity = buildIdentityStack();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    return token ? await identity.resolver.resolve(token) : null;
  } catch {
    return null;
  }
}

/**
 * Read the public listing.
 *
 * **A failure is a rendered error, not a thrown one.** The listing is a
 * discovery surface, and a surface that 500s because the database is down
 * tells the visitor nothing. The error message is §4.9's server-error copy.
 */
async function readAnonymousListing(
  filter: ReportListingFilter,
  pageNumber: number,
): Promise<{
  data: AnonymousListingPage | null;
  error?: string;
}> {
  try {
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const actor = token ? await identity.resolver.resolve(token) : null;

    const result = await listings.listings.list({
      actor,
      partition: null,
      filter,
      page: buildPage(pageNumber, 20),
    });

    return {
      data: {
        rows: result.rows as AnonymousListingPage['rows'],
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  } catch {
    return {
      data: null,
      error: 'Something went wrong on our side. Try again, or come back in a moment.',
    };
  }
}

/**
 * The campus areas the filter can name.
 *
 * **A read failure is an empty list, not a crashed listing.** The listing
 * is still useful without the location dropdown.
 */
async function readCampusAreas(): Promise<readonly { value: string; label: string }[]> {
  try {
    const areas = await new PrismaCampusAreaReader(prisma).listActive();

    return areas.map((area) => ({ value: area.value, label: area.label }));
  } catch {
    return [];
  }
}
