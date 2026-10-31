/**
 * The shared reading for the four member views — §9.4.
 *
 * ## The partition is the view
 *
 * PRD FR-49's four views are **disjoint**, and the disjointness is
 * structural: the partition is part of the query's predicate, so a member's
 * own report cannot appear in their own Browse, and a Claim cannot appear
 * in `My Reports`. **The route names the partition and the use case
 * resolves it** — the route never filters rows itself.
 *
 * ## A member's own report never appears in their own Browse
 *
 * The `browse` partition **carries the member's id in the partition
 * itself**, so the exclusion is in the `WHERE` clause. There is no code
 * path where a member's own report reaches their Browse, and no
 * client-side filter that would hide a leak rather than fix one.
 *
 * ## The tabs are filters, and the filter's shape depends on the tab
 *
 * §9.4 gives `My Reports` the tabs `Lost`, `Found`, `Closed`; `My Claims`
 * the tabs `Pending`, `Approved`, `Rejected`; and `My Recovery Responses`
 * tabs by canonical RR status. **The Claim and Recovery Response tabs are
 * status filters.** The `My Reports` tabs are **not all status filters** —
 * `Lost` and `Found` are *type* filters, and only `Closed` is a status.
 *
 * So the read takes a **filter**, not a status list, and the route builds
 * the filter its tab means.
 */

import type { ActorContext } from '@/domain/accounts';

import {
  buildPage,
  emptyFilter,
  type ClaimListingRow,
  type ListingPage,
  type RecoveryResponseListingRow,
  type ReportListingFilter,
  type ReportListingRow,
  type ReportPartition,
} from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MEMBER_READ_FAILED } from './_member-page';

/**
 * The result of a member view's read.
 *
 * **The three row shapes are separate fields, not a union,** so a view can
 * only carry the rows its surface renders.
 */
export type MemberViewResult =
  | { readonly kind: 'Reports'; readonly rows: readonly ReportListingRow[] }
  | { readonly kind: 'Claims'; readonly rows: readonly ClaimListingRow[] }
  | { readonly kind: 'RecoveryResponses'; readonly rows: readonly RecoveryResponseListingRow[] }
  | { readonly kind: 'Failed' };

/**
 * Read one of the four member views.
 *
 * **The partition is named here and nowhere else.** The route passes the
 * partition it serves; the use case resolves it, and the reader's
 * predicate carries it.
 *
 * **The filter is the route's, because the tab's meaning is the route's.**
 * The route knows that `My Reports`'s `Lost` tab means "type is Lost" and
 * that `My Claims`'s `Pending` tab means "status is Pending"; the use case
 * only knows how to apply a filter.
 */
export async function readMemberView(
  actor: ActorContext,
  partition: ReportPartition,
  filter: ReportListingFilter = emptyFilter(),
): Promise<MemberViewResult> {
  try {
    const stack = buildListingsStack();

    const result = await stack.listings.list({
      actor,
      partition,
      filter,
      page: buildPage(1, 50),
    });

    if (partition === 'claims') {
      return { kind: 'Claims', rows: (result as ListingPage<ClaimListingRow>).rows };
    }

    if (partition === 'recovery_responses') {
      return {
        kind: 'RecoveryResponses',
        rows: (result as ListingPage<RecoveryResponseListingRow>).rows,
      };
    }

    return { kind: 'Reports', rows: (result as ListingPage<ReportListingRow>).rows };
  } catch {
    return { kind: 'Failed' };
  }
}

/**
 * The error a failed read shows.
 */
export { MEMBER_READ_FAILED };
