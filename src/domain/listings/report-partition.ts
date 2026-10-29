/**
 * The FR-49 view partition — the four disjoint member views.
 *
 * **A partition decides *which* reports a listing enumerates.** It is a
 * different question from the one bolt `006` answers: the FR-39 projection
 * decides *which fields* a viewer may see of a report they have reached,
 * and this module decides *which reports* they reach in the first place.
 * The two compose, and neither substitutes for the other.
 *
 * **The four views are disjoint, and that is the property worth stating.**
 * FR-49 names four member views — `My Reports`, `Browse`, `My Claims`, and
 * `My Recovery Responses` — and a report authored by a member appears in
 * `mine` and must **never** appear in their own `browse`, under any filter
 * combination. A report a member has claimed on appears in `claims` and in
 * no other partition.
 *
 * **The disjointness is enforced by construction, not by a filter applied
 * afterwards.** `browse` carries the exclusion as part of its own
 * definition — the member's own id is *in* the partition — so there is no
 * code path where the exclusion is forgotten. A listing that "loads browse
 * and then filters out my own reports" would be the load-then-filter defect
 * FR-39 names, applied to the partition rather than to a field.
 *
 * **The default partition for an authenticated request is `browse`,** not
 * `mine` — so that self-exposure does not occur by accident. An anonymous
 * request has no partition at all: it gets the public summary listing, which
 * spans Lost and Found reports of all members and is **not** partitioned
 * (FR-49 governs the member views only).
 *
 * **The participation partitions are views over *other* members' reports.**
 * `claims` holds the Claims a member submitted on other members' Found
 * reports, and `recovery_responses` holds the Recovery Responses they
 * submitted on other members' Lost reports. The word "other" is load-bearing:
 * a member's own report is in `mine`, and a claim on one's own report is not
 * a thing (FR-15 forbids claiming on your own report), so the exclusion is
 * belt-and-braces against the same report appearing twice.
 *
 * **There is no automatic Lost-to-Found linkage.** The combined pool is a
 * **search pool**, not a pairing mechanism (PRD constraint: no automatic
 * matching). Nothing in this module, and nothing in the product, pairs a
 * Lost report with a Found report.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The member view partitions.
 *
 * `public` is the **anonymous** partition — the unpartitioned summary
 * listing. It is named here so that the accepted values of the `partition`
 * parameter are one closed set, and so an anonymous request's "no partition"
 * and an explicit `public` are the same thing rather than two paths.
 */
export const REPORT_PARTITIONS = [
  'mine',
  'browse',
  'claims',
  'recovery_responses',
  'public',
] as const;

/** One of the partitions. */
export type ReportPartition = (typeof REPORT_PARTITIONS)[number];

/** True when `value` is one of the partitions. */
export function isReportPartition(value: string): value is ReportPartition {
  return (REPORT_PARTITIONS as readonly string[]).includes(value);
}

/**
 * The partitions a **member** may request.
 *
 * `public` is excluded: an authenticated member asking for `public` gets
 * the public summary listing, which is the anonymous column's field set —
 * a **narrower** view than any member partition. The partition parameter
 * names a member view; the anonymous listing is not one of them.
 */
export const MEMBER_PARTITIONS: readonly ReportPartition[] = Object.freeze([
  'mine',
  'browse',
  'claims',
  'recovery_responses',
]);

/**
 * The default partition for an **authenticated** request.
 *
 * **`browse`, not `mine`.** The default is the one that cannot expose a
 * member to themselves by accident: `browse` excludes their own reports
 * entirely, so a request that names no partition never shows a member
 * something they wrote unless they asked for it.
 */
export const DEFAULT_MEMBER_PARTITION: ReportPartition = 'browse';

/**
 * The partition an **anonymous** request gets.
 *
 * The public summary listing. It is **not** partitioned — it spans Lost and
 * Found reports of all members, because FR-49 governs the member views and
 * anonymous viewing is governed by FR-12 and FR-38 (story 007).
 */
export const DEFAULT_ANONYMOUS_PARTITION: ReportPartition = 'public';

/**
 * True when the partition enumerates the viewer's **own** reports.
 *
 * Only `mine` does. `browse` is the complement — it enumerates *other*
 * members' reports — and the two are disjoint by construction, because a
 * report's `reporterId` is either the viewer's or it is not.
 */
export function partitionsOverOwnReports(partition: ReportPartition): boolean {
  return partition === 'mine';
}

/**
 * True when the partition enumerates **other** members' reports.
 *
 * `browse` does, and `browse` is the only member partition that does. The
 * participation partitions enumerate Claims and Recovery Responses, not
 * reports — they are views *over* other members' reports, but the rows they
 * return are the participation records, not the reports.
 */
export function partitionsOverOtherReports(partition: ReportPartition): boolean {
  return partition === 'browse';
}

/**
 * True when the partition is the **unpartitioned public listing**.
 *
 * **`public` is its own kind.** It enumerates reports of **all** members —
 * the viewer's own included — which is neither the own-reports partition
 * nor the other-reports partition. It is unpartitioned by design: FR-49
 * governs the four *member* views, and anonymous viewing is governed by
 * FR-12 and FR-38 (story 007), which span Lost and Found reports of all
 * members.
 *
 * So `public` overlaps `mine` and `browse` **deliberately** — the
 * disjointness FR-49 requires is between the four member views, and the
 * public listing is not one of them.
 */
export function partitionsOverAllReports(partition: ReportPartition): boolean {
  return partition === 'public';
}

/**
 * True when the partition enumerates the viewer's **participation**.
 *
 * `claims` and `recovery_responses` do. These partitions' rows are
 * participation records rather than reports, which is why they carry a
 * different row shape — a Claim's status, the related report's summary
 * fields, the submission timestamp, and a link to the per-Claim thread.
 */
export function partitionsOverParticipation(partition: ReportPartition): boolean {
  return partition === 'claims' || partition === 'recovery_responses';
}

/**
 * The participation kind a partition enumerates.
 *
 * `null` for the partitions that do not enumerate participation.
 */
export function participationKindFor(
  partition: ReportPartition,
): 'claim' | 'recoveryResponse' | null {
  if (partition === 'claims') {
    return 'claim';
  }

  if (partition === 'recovery_responses') {
    return 'recoveryResponse';
  }

  return null;
}
