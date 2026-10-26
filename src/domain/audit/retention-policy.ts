/**
 * The audit retention policy.
 *
 * Retention follows the parent entity's rule (PRD §10, `data-stack.md`):
 *
 * - A report's trail follows the report's lifetime.
 * - The FR-10 hard delete of an interaction-free `Open` report removes its
 *   trail with it — **the only deletion path in the system**.
 * - A `Returned` or `Closed` report retains its trail indefinitely.
 * - An account's trail follows the account's lifetime, and accounts are
 *   retained indefinitely including after deactivation.
 *
 * Pure — no I/O, no framework imports.
 */

/** What happens to a trail entry when its parent goes away. */
export type RetentionAction =
  /** The entry is kept forever. The parent reached a terminal status. */
  | 'retain'
  /** The entry is removed, as part of the FR-10 hard delete. */
  | 'removeWithParent';

/** The parent's lifecycle status, as far as retention cares. */
export type RetentionStatus =
  'Open' | 'Claim Requested' | 'Claim Approved' | 'Verification Pending' | 'Returned' | 'Closed';

/** The parent type, as far as retention cares. */
export type RetentionParentType = 'report' | 'account';

/** The result of evaluating the policy. */
export interface RetentionDecision {
  readonly action: RetentionAction;
  /** Why the decision was made — useful in the FR-10 path and in tests. */
  readonly reason: string;
}

/**
 * Decide what happens to a trail entry.
 *
 * The FR-10 rule is narrow: only an `Open` report that has no interaction —
 * no Claim for a Found report, no Recovery Response for a Lost report — can
 * be hard-deleted, and its trail goes with it. Any other report keeps its
 * trail, whatever its status.
 *
 * `isInteractionFree` is passed in rather than derived here: this module does
 * not know what a Claim or a Recovery Response is, and the audit context has
 * no knowledge of the reports context's rules (the boundary rule in the
 * domain model). The caller evaluates FR-10 and passes the result.
 */
export function decideRetention(
  parentType: RetentionParentType,
  status: RetentionStatus,
  isInteractionFree: boolean,
): RetentionDecision {
  if (parentType === 'account') {
    return {
      action: 'retain',
      reason: 'Account trails are retained indefinitely, including after deactivation (PRD §10).',
    };
  }

  if (status === 'Open' && isInteractionFree) {
    return {
      action: 'removeWithParent',
      reason:
        'The report is interaction-free and Open, so the FR-10 hard delete removes the report and its trail together.',
    };
  }

  if (status === 'Returned' || status === 'Closed') {
    return {
      action: 'retain',
      reason: `A ${status} report's trail is retained indefinitely (PRD §10).`,
    };
  }

  return {
    action: 'retain',
    reason:
      'Only an interaction-free Open report can be hard-deleted; every other report retains its trail.',
  };
}

/**
 * True when the report is eligible for the FR-10 hard delete.
 *
 * The single source of truth for the rule, so the delete path and the
 * retention decision cannot drift apart.
 */
export function isHardDeletable(
  status: RetentionStatus,
  hasClaim: boolean,
  hasRecoveryResponse: boolean,
): boolean {
  if (status !== 'Open') {
    return false;
  }
  return !hasClaim && !hasRecoveryResponse;
}
