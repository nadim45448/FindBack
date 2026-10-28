/**
 * The report visibility service — the use case that assembles a projection.
 *
 * The sequence is fixed, and the order is the mechanism:
 *
 * 1. **Resolve the viewer** from the `ActorContext`.
 * 2. **Refuse an anonymous viewer.** FR-38 provides no anonymous detail
 *    page, so there is no anonymous projection to build. The refusal is a
 *    `NotFoundError`, not a 403 — a 403 on a report id would confirm the
 *    report exists, which discloses something to a viewer who was never
 *    granted sight of it.
 * 3. **Load the relationship.** Two existence facts plus two ids.
 * 4. **Resolve the columns.** A pure function of the viewer and the
 *    relationship.
 * 5. **Read, passing the columns.** Every reader receives the column set,
 *    never the viewer — so the queries are shaped by the authorisation
 *    decision.
 * 6. **Assemble the projection.**
 *
 * **The order is what makes the guarantee.** The columns are resolved
 * *before* any content is read, so the reads are shaped by them. A service
 * that loaded first and resolved the columns afterwards would be the
 * load-then-filter defect FR-39 names.
 */

import { NotFoundError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  projectAuditTrail,
  projectClaims,
  projectRecoveryResponses,
  projectReport,
  projectThreads,
  relatedRecordGrantsFor,
  reportFieldsFor,
  resolveColumns,
  viewerFromActorContext,
  visibleClaimIds,
  visibleResponseIds,
  type ClaimRow,
  type ProjectionColumn,
  type RecoveryResponseRow,
  type ReportRelationship,
  type ReportRow,
  type ThreadMessageRow,
  type Viewer,
  type VisibilityProjection,
} from '@/domain/listings';
import type {
  AuditTrailVisibilityReader,
  ClaimVisibilityReader,
  RecoveryResponseVisibilityReader,
  ReportVisibilityReader,
  ThreadVisibilityReader,
} from './ports';

/** The collaborators the service sequences. */
export interface ReportVisibilityDependencies {
  readonly reports: ReportVisibilityReader;
  readonly claims: ClaimVisibilityReader;
  readonly responses: RecoveryResponseVisibilityReader;
  readonly threads: ThreadVisibilityReader;
  readonly trail: AuditTrailVisibilityReader;
}

/**
 * Reads a report through the FR-39 visibility projection.
 */
export class ReportVisibilityService {
  constructor(private readonly dependencies: ReportVisibilityDependencies) {}

  /**
   * Project a report for an actor.
   *
   * @throws {NotFoundError} when the report does not exist, or when the actor
   * is not a member. The two are deliberately indistinguishable — a
   * non-member asking for a report's detail learns nothing about whether it
   * exists.
   */
  async projectReport(actor: ActorContext | null, reportId: string): Promise<VisibilityProjection> {
    const viewer = viewerFromActorContext(actor);

    // FR-38: "There is NO anonymous report-detail page in FindBack." There is
    // no anonymous projection to build, so the request is refused before any
    // query runs — and the refusal does not disclose existence.
    if (viewer.kind === 'anonymous') {
      throw new NotFoundError('That report could not be found.');
    }

    const relationship = await this.dependencies.reports.loadRelationship(
      reportId,
      viewer.accountId,
    );

    if (!relationship) {
      throw new NotFoundError('That report could not be found.');
    }

    const columns = resolveColumns(viewer, relationship);

    return this.assemble(viewer, relationship, columns);
  }

  /**
   * Assemble the projection from an already-resolved column set.
   *
   * Exposed separately so that a caller which has already resolved the
   * columns — bolt `009`'s listing path, which resolves them per row — can
   * reuse the assembly without re-resolving.
   */
  async assemble(
    viewer: Viewer,
    relationship: ReportRelationship,
    columns: readonly ProjectionColumn[],
  ): Promise<VisibilityProjection> {
    const grants = relatedRecordGrantsFor(columns);

    const report = await this.dependencies.reports.loadReportForViewer(
      relationship.reportId,
      columns,
    );

    if (!report) {
      throw new NotFoundError('That report could not be found.');
    }

    // The Claims and the Recovery Responses are read with their **already
    // scoped** id sets, so a viewer who may see no Claims issues no Claim
    // query at all — rather than issuing one and filtering its result.
    const claimRows = grants.claims
      ? await this.dependencies.claims.loadClaimsForViewer(
          relationship.reportId,
          columns,
          this.claimScope(relationship, columns),
        )
      : [];

    const responseRows = grants.recoveryResponses
      ? await this.dependencies.responses.loadResponsesForViewer(
          relationship.reportId,
          columns,
          this.responseScope(relationship, columns),
        )
      : [];

    const scopedClaimIds = grants.claims
      ? visibleClaimIds(claimRows, columns, relationship.claimId)
      : [];

    const scopedResponseIds = grants.recoveryResponses
      ? visibleResponseIds(responseRows, columns, relationship.recoveryResponseId)
      : [];

    // A thread is loaded only for a parent the viewer may see. The scope is
    // the **already-scoped** parent set, so the reader cannot widen it.
    const threadRows =
      grants.threads && (scopedClaimIds.length > 0 || scopedResponseIds.length > 0)
        ? await this.dependencies.threads.loadThreadsForViewer(
            scopedClaimIds,
            scopedResponseIds,
            columns,
          )
        : [];

    const trail = grants.auditTrail
      ? await this.dependencies.trail.loadTrailForViewer(relationship.reportId, columns)
      : null;

    return {
      reportId: relationship.reportId,
      viewerId: viewer.accountId,
      columns,
      reportFields: reportFieldsFor(columns),
      report: projectReport(report, columns),
      claims: projectClaims(claimRows, columns, relationship.claimId),
      recoveryResponses: projectRecoveryResponses(
        responseRows,
        columns,
        relationship.recoveryResponseId,
      ),
      threads: projectThreads(threadRows, columns, {
        claimIds: scopedClaimIds,
        responseIds: scopedResponseIds,
      }),
      // An explicit `null`, never an empty array: "forbidden" must be
      // distinguishable from "empty" (ADR-8).
      auditTrail: projectAuditTrail(trail ?? [], columns),
    };
  }

  /**
   * The Claim ids the viewer may see.
   *
   * The Claimant column sees only their own Claim. The Found-report owner
   * column sees every Claim on their own Found report — the scope is the
   * report's Claims, so the reader filters by report id and the viewer's own
   * claim id, and never by anything else.
   *
   * `null` means "every Claim on this report". An **empty array** means "no
   * Claims are visible" — the two must not be confused, so the sentinel is
   * `null` rather than a magic string.
   */
  private claimScope(
    relationship: ReportRelationship,
    columns: readonly ProjectionColumn[],
  ): readonly string[] | null {
    if (columns.includes('administrator') || columns.includes('foundReportOwner')) {
      return null;
    }

    if (columns.includes('claimant') && relationship.claimId !== null) {
      return [relationship.claimId];
    }

    return [];
  }

  /**
   * The Recovery Response ids the viewer may see.
   *
   * The Recovery-responder column sees only their own response. The
   * Lost-report owner column sees every response on their own Lost report.
   *
   * `null` means "every response on this report"; an empty array means none.
   */
  private responseScope(
    relationship: ReportRelationship,
    columns: readonly ProjectionColumn[],
  ): readonly string[] | null {
    if (columns.includes('administrator') || columns.includes('lostReportOwner')) {
      return null;
    }

    if (columns.includes('recoveryResponder') && relationship.recoveryResponseId !== null) {
      return [relationship.recoveryResponseId];
    }

    return [];
  }
}

export type { ClaimRow, RecoveryResponseRow, ReportRow, ThreadMessageRow };
