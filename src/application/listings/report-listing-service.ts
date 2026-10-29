/**
 * The report listing service — FR-14's search pool and FR-49's partitions.
 *
 * **The sequence is the mechanism:**
 *
 * 1. **Resolve the viewer** from the `ActorContext`.
 * 2. **Resolve the partition.** An anonymous viewer's partition is
 *    `public`; an authenticated viewer's is `browse` unless they named one.
 * 3. **Resolve the status view.** The partition and the viewer's role decide
 *    the default statuses; an explicit filter overrides it.
 * 4. **Validate the combination.** A status that cannot occur on the
 *    selected type is refused — *before* any query runs.
 * 5. **Read**, with the partition, the filter, the statuses, and the
 *    viewer's id.
 *
 * **The anonymous listing carries the FR-38 field set and nothing more.**
 * The rows are the listing's own row shape — the summary fields — so an
 * anonymous viewer never receives a description, an image reference, an
 * exact place, an identifying detail, or a reporter identity. That is not a
 * filter applied to a fuller row: the row shape *is* the FR-38 set.
 *
 * **The listing does not resolve the per-row FR-39 projection.** The
 * listing row is a summary for every viewer; the *detail* view is where the
 * viewer's own columns apply. Resolving a column set per row would mean a
 * query per row to find out whether the viewer had claimed on that report —
 * and the listing row does not carry the Claim or the Response, so the
 * column set would not change what the row shows anyway.
 *
 * **The participation partitions return participation rows.** A member's
 * Claims and Recovery Responses are their own records, and the row carries
 * the Claim's status, the related report's summary fields, the submission
 * timestamp, and the thread link.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { NotFoundError, ValidationError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  DEFAULT_ANONYMOUS_PARTITION,
  DEFAULT_MEMBER_PARTITION,
  assertTypeStatusCombination,
  isReportPartition,
  resolveStatusView,
  viewerFromActorContext,
  type ClaimListingRow,
  type ListingPage,
  type RecoveryResponseListingRow,
  type ReportListingFilter,
  type ReportListingRow,
  type ReportPage,
  type ReportPartition,
} from '@/domain/listings';

import type { ReportListingReader } from './ports/report-listing-reader';

/** What the caller supplies. */
export interface ListReportsRequest {
  /** The actor, or `null` for an anonymous visitor. */
  readonly actor: ActorContext | null;
  /** The partition the caller asked for, or `null` for the default. */
  readonly partition: ReportPartition | null;
  /** The resolved filter. */
  readonly filter: ReportListingFilter;
  /** The page to return. */
  readonly page: ReportPage;
}

/** What the service returns. */
export type ListReportsResult =
  | ListingPage<ReportListingRow>
  | ListingPage<ClaimListingRow>
  | ListingPage<RecoveryResponseListingRow>;

/** The collaborators the service sequences. */
export interface ReportListingDependencies {
  readonly listings: ReportListingReader;
}

/**
 * Reads the report pool.
 */
export class ReportListingService {
  constructor(private readonly dependencies: ReportListingDependencies) {}

  /**
   * List the reports of a partition.
   *
   * @throws {ValidationError} when the filter's type and status combination
   * cannot occur.
   */
  async list(request: ListReportsRequest): Promise<ListReportsResult> {
    const viewer = viewerFromActorContext(request.actor);

    const partition = this.resolvePartition(viewer.kind, request.partition);

    const statuses = resolveStatusView(
      partition,
      viewer.isAdministrator,
      request.filter.statuses,
    );

    // **The combination is checked before the query.** A caller who asked
    // for `Found` with `Verification Pending` is told which field was
    // wrong, rather than receiving an empty page that looks like "nothing
    // matched".
    assertTypeStatusCombination(request.filter.type, request.filter.statuses);

    const viewerId = viewer.kind === 'member' ? viewer.accountId : null;

    if (partition === 'claims') {
      return this.dependencies.listings.listClaims(
        this.requireMemberId(viewerId),
        request.filter,
        statuses,
        request.page,
      );
    }

    if (partition === 'recovery_responses') {
      return this.dependencies.listings.listRecoveryResponses(
        this.requireMemberId(viewerId),
        request.filter,
        statuses,
        request.page,
      );
    }

    return this.dependencies.listings.listReports(
      partition,
      request.filter,
      statuses,
      viewerId,
      request.page,
    );
  }

  /**
   * Resolve the partition.
   *
   * **An anonymous visitor gets `public` whatever they asked for.** The
   * story says so: "an anonymous request supplying an authenticated-only
   * partition" is "not served as an authenticated partition; the public
   * listing applies". So `mine`, `browse`, `claims`, and
   * `recovery_responses` are all answered with the public listing for an
   * anonymous caller — never with a member partition's rows.
   */
  private resolvePartition(
    viewerKind: 'anonymous' | 'member',
    requested: ReportPartition | null,
  ): ReportPartition {
    if (viewerKind === 'anonymous') {
      return DEFAULT_ANONYMOUS_PARTITION;
    }

    if (requested === null) {
      return DEFAULT_MEMBER_PARTITION;
    }

    // **A member naming `public` gets the public listing.** It is the
    // narrowest field set, and the caller asked for it by name.
    return requested;
  }

  /**
   * The member's own id.
   *
   * @throws {NotFoundError} when the viewer is not a member.
   *
   * **The refusal is a 404, not a 403.** The participation partitions
   * disclose nothing about whether the viewer has any participation, and a
   * 403 would say "you are not allowed to see your own Claims" — which
   * would be strange, and would confirm that the request was understood.
   */
  private requireMemberId(viewerId: string | null): string {
    if (viewerId === null) {
      throw new NotFoundError('That report could not be found.');
    }

    return viewerId;
  }
}

/**
 * Parse a submitted partition.
 *
 * @throws {ValidationError} when the value is not one of the five.
 */
export function parsePartition(value: string | null): ReportPartition | null {
  if (value === null || value.trim() === '') {
    return null;
  }

  if (isReportPartition(value)) {
    return value;
  }

  throw new ValidationError('partition', 'Choose one of the available views.');
}
