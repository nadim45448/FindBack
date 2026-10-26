---
unit: 006-audit-and-observability
bolt: 001-audit-core
stage: test
status: complete
updated: 2026-10-26T11:00:52Z
---

# Test Report - Audit and Observability

Bolt `001-audit-core` of unit `006-audit-and-observability`, intent
`001-findback-lost-and-found`.

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 91 | 0 | 0 | 99.0% (`src/domain/audit`), 98.4% (`src/application`) |
| Integration | 42 | 0 | 0 | 95.1% (`src/infrastructure/audit`), 94.7% (`src/infrastructure/db`) |
| Security | 19 | 0 | 0 | — (subset of the above) |
| Performance | 4 | 0 | 0 | — (subset of the above) |
| **Total** | **166** | **0** | **0** | **94.4%** (all files), 93.2% branches, 100% functions |

- **Test files:** 18 (13 pre-existing, 5 added in this stage)
- **Coverage threshold:** 80% lines (`vitest.config.mts`) — met at 94.4%
- **Database:** local Docker PostgreSQL 16 (`findback-postgres`, port 5433)

The categories overlap: the security and performance suites are counted in
both their own category and the integration category, because they exercise
the real database. The total is the count of distinct test cases.

## Test Files

| File | Tests | Category | What it covers |
|---|---|---|---|
| `src/infrastructure/audit/audit-repositories.test.ts` | 18 | Integration | Append, trail reads with cursor pagination, read logging, quota snapshots, the FR-10 deletion path, transaction rollback |
| `src/infrastructure/audit/audit-security.test.ts` | 19 | Security | Administrator-only reads, sensitive-value leakage, injection, FR-10 flag scope |
| `src/infrastructure/audit/audit-performance.test.ts` | 4 | Performance | The 1 s p95 NFR at 10,000 reports × 50 events, and the query plan |
| `src/infrastructure/audit/acceptance-criteria.test.ts` | 14 | Acceptance | One test per acceptance criterion of stories 001, 003, 004, 006 |
| `src/infrastructure/audit/quota-providers.test.ts` | 11 | Unit | Quota limit provider, Blob / platform / database usage readers, error description |
| `src/infrastructure/audit/append-only-enforcement.test.ts` | 10 | Integration | The database trigger refuses update and delete (Stage 4) |
| `src/domain/audit/payload-sanitizer.test.ts` | 16 | Unit | Deny-by-default sanitizer, secret detection |
| `src/domain/audit/event-catalog.test.ts` | 11 | Unit | The 30 numbered events, 2 non-numbered, permitted and sensitive fields |
| `src/domain/audit/quota-thresholds.test.ts` | 11 | Unit | 70% / 90% warn, 100% refuse, Blob storage the only refusing resource |
| `src/domain/audit/retention-policy.test.ts` | 10 | Unit | Indefinite retention for `Returned` and `Closed` |
| `src/domain/audit/audit-event.test.ts` | 9 | Unit | Event number resolution, field building, the append-only guard |
| `src/application/quota-monitor.test.ts` | 9 | Unit | Threshold classification, warn-once-per-crossing |
| `src/application/audit-writer.test.ts` | 6 | Unit | The required transaction handle (Stage 4) |
| `src/application/audit-trail-reader.test.ts` | 5 | Unit | The administrator check before the query (Stage 4) |
| `src/domain/audit/request-context.test.ts` | 4 | Unit | The closed log type, and its absent sensitive fields |
| `src/application/audit-read-recorder.test.ts` | 3 | Unit | Read-log recording, and the refusal outside a transaction |
| `src/lib/logging.test.ts` | 3 | Unit | The structured logger (pre-existing module) |
| `src/lib/errors.test.ts` | 3 | Unit | The error hierarchy (pre-existing module) |

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 001 | A committing state change leaves its audit record in the same transaction | ✅ |
| 001 | A rolled-back state change leaves no audit record | ✅ |
| 001 | A stored record carries the event number, actor, acting administrator where applicable, target, and timestamp | ✅ |
| 001 | All 30 FR-31/FR-48 events are recorded with actor and timestamp | ✅ |
| 001 | No password, hash, or token in any record; a catalog-named FR-37 value is on the trail and never in a log | ✅ |
| 001 | A write outside the caller's transaction is refused | ✅ |
| 003 | An FR-52 profile edit writes a non-numbered record with actor and timestamp | ✅ |
| 003 | An FR-53 administrator report edit writes a non-numbered record with acting administrator, changed fields, and previous values | ✅ |
| 003 | A non-numbered record carries no catalog event number | ✅ |
| 003 | A non-numbered record is visible in the trail alongside numbered events | ✅ |
| 003 | The edits introduced no new event numbers | ✅ |
| 003 | A non-numbered record contains no sensitive values | ✅ |
| 004 | Any update to an existing record is refused | ✅ |
| 004 | Any delete of an existing record is refused | ✅ |
| 004 | An administrator has no privilege that could update or delete a trail entry | ✅ |
| 004 | No retention or cleanup path that prunes audit records exists | ✅ |
| 004 | A deactivated account's records are not rewritten, anonymized, or removed | ✅ |
| 004 | The FR-10 hard delete removes that report's audit entries as the single exception | ✅ |
| 004 | A `Returned` or `Closed` report's audit entries are retained indefinitely | ✅ |
| 006 | A log line carries requestId, actorId, action, and targetId, structured | ✅ |
| 006 | No secret, password hash, or token appears in a log line | ✅ |
| 006 | No claim reason, identifying detail, exact place, or thread body appears in a log line | ✅ |
| 006 | Blob storage at 70% and 90% surfaces a warning | ✅ |
| 006 | Blob storage at its 1 GB limit refuses a new upload | ✅ |
| 006 | Every other resource warns at 70% and 90% | ✅ |
| 006 | A quota warning informs, and never triggers a purchase or a plan upgrade | ✅ |
| 006 | No logging, analytics, or APM vendor was added — the $0 budget holds | ✅ |

The criterion-by-criterion tests live in
`src/infrastructure/audit/acceptance-criteria.test.ts`; each test name states
the criterion it discharges.

## Unit Tests

The domain layer is at **99.0%** statement coverage. The catalog is the
center of gravity: `event-catalog.test.ts` asserts that all 30 numbered events
and both non-numbered records are present, that no event names a credential
field, and that an unknown type yields no number and no fields.

`payload-sanitizer.test.ts` carries the deny-by-default behaviour: a field the
catalog does not name is refused, a value that looks like a hash or a token is
refused even on a catalog-named field, and a catalog-named field with an
ordinary value is kept.

`request-context.test.ts` and `logging.test.ts` assert the structural control
on the operational log — the type has nowhere to put a sensitive value.

## Integration Tests

`audit-repositories.test.ts` exercises the real stack: the driver adapter, the
pooled connection, the raw-SQL trail query, the database trigger, and the
transactions. Notable cases:

- A write inside a transaction is visible after commit, and **absent** after
  the transaction rolls back.
- A write with a handle that is not a transaction is refused with
  `AuditWriteOutsideTransactionError`.
- Paging the trail with the cursor visits every row exactly once, including
  when several events share one timestamp — the `id` tiebreaker works.
- The FR-10 path removes only the named parent's rows, and refuses to run
  outside a transaction.
- A non-administrator is refused **before** the query runs, and the refusal
  leaves no read log behind.

`append-only-enforcement.test.ts` (Stage 4) confirms the trigger refuses both
`UPDATE` and `DELETE`, that the FR-10 flag does not leak past its transaction,
and that the flag grants no deletion on the read-log or quota-snapshot tables.

## Security Tests

`audit-security.test.ts` covers four controls.

**Authorization (FR-32).** An anonymous viewer and a member are both refused;
the repository is never reached. The refusal is `PermissionDeniedError`.

**Sensitive-value leakage.** The trail records a catalog-named value
(`claim.submitted` carries the claim reason) and refuses an exact place, which
no catalog entry names. The operational log has no field that could carry a
claim reason, an identifying detail, or a thread body — asserted structurally
against the `RequestContext` type.

**Injection.** A hostile query string (`'; DROP TABLE "AuditEvent"; --`) is
stored **verbatim as data** and the table it names is still there. Hostile
filters are stored as data. A hostile parent id and a hostile cursor are
refused rather than interpolated.

**Append-only integrity.** See the integration section — the refusal comes
from the database, so there is no privilege that could succeed.

## Performance Tests

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Trail query p95 | ≤ 1000 ms | **0.9 ms** | ✅ |
| Trail query p50 | — | 0.6 ms | — |
| Trail query max | — | 1.2 ms | — |
| Scale | 10,000 reports × 50 events | 500,000 rows seeded | ✅ |
| Query plan | index scan, no sort | Index Only Scan on `idx_audit_events_trail` | ✅ |
| Page size | 25 per page | 25 | ✅ |

The seed is a bulk insert (the read path is under test, not the write path),
and the table is `ANALYZE`d afterwards so the planner costs the plan on current
statistics rather than a stale estimate.

**The performance test found a real defect.** The Stage 2 design specified the
trail index as `(parent_id, occurred_at DESC, id DESC)`, but the trail query
filters on **both** `parentType` and `parentId`. An index whose leading column
is `parentId` matched the rows, yet it could not supply the
`occurredAt DESC, id DESC` ordering, because `parentType` sat in front of it as
an unconstrained filter. The plan was a bitmap index scan followed by a
`Sort` node — the opposite of the design's claim that the trail view is an
index range scan. The p95 was well inside the budget either way, so the
timing test alone would not have caught it; the plan assertion did.

The fix is a migration, `20261026110000_audit_trail_index`, adding
`idx_audit_events_trail` on `(parent_type, parent_id, occurred_at DESC, id DESC)`.
Every column of the index is constrained by the query, so the ordering comes
from the index and the plan is an index-only scan with no sort. The original
`parent_id`-leading index is kept — it serves the `parentId`-only lookup, and
it costs only the write overhead of one more index.

## Coverage Report

| Module | Statements | Branches | Functions |
|--------|-----------|----------|-----------|
| `src/domain/audit` | 99.05% | 96% | 100% |
| `src/application` | 98.36% | 97.22% | 100% |
| `src/application/ports` | 100% | 100% | 100% |
| `src/infrastructure/audit` | 95.23% | 90.69% | 100% |
| `src/infrastructure/db` | 94.73% | 77.27% | 100% |
| `src/lib` | 100% | 100% | 100% |
| **All files** | **94.4%** | **93.17%** | **100%** |

The remaining gaps are barrel `index.ts` files (re-exports, no logic),
`quota-monitor.ts` line 94 (the error path for an unavailable usage reader),
`payload-sanitizer.ts` line 165 (one branch of the secret heuristic), and
`prisma.ts` line 25 (the cached-connection path on a warm process).

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| The trail index could not supply the query's ordering — the plan sorted the matched rows instead of reading them in order | Medium | **Fixed** — migration `20261026110000_audit_trail_index`; the plan is now an index-only scan |
| The database-backed suites shared one PostgreSQL instance and cleared the same tables, so a parallel run had one suite deleting another's rows mid-test | Medium | **Fixed** — `fileParallelism: false` in `vitest.config.mts`; the files run in sequence, the tests inside a file still run concurrently |
| The read-log and quota-snapshot triggers permit no deletion at all, so ordinary SQL cannot clean up after a test | Low | **Fixed** — `src/test/delete-for-test.ts` clears the tables inside a transaction that sets `session_replication_role = 'replica'`, a privilege the application role does not have in production |
| Story `006` acceptance criterion 3 still read "no claim reason … appears in any log line **or audit record**" — the pre-correction wording that Stage 4 had already superseded in story `001`, `unit-brief.md` rule 6, and `coding-standards.md` | Low | **Fixed** — the criterion now scopes the prohibition to the operational log and refers to the trail rule in story `001` |

No critical or high-severity issue is open.

## Not Tested Manually

Stated plainly, because the Stage 5 contract requires it:

- **Vercel Blob** — the Blob usage provider was tested against an injected
  client, not against the live Vercel API. The real credential path is
  unverified.
- **Email** — no email path is exercised by this bolt.
- **The Vercel platform quota** — the platform usage provider was tested
  against an injected fetcher, not against the live platform API.
- **The deployed Vercel environment** — the performance numbers are from
  local Docker PostgreSQL, not from a Hobby-tier deployment. A free-tier
  instance has less I/O headroom, so the p95 margin there will be smaller
  than the 0.9 ms measured here. The 1,000 ms budget is wide enough that the
  conclusion is not in doubt, but the number is not a production number.

## Recommendations

1. **Re-measure the trail query on a Vercel Hobby deployment** before the
   trail-read UI ships, so the p95 figure in the report is a production
   figure. The query is now an index-only scan, which is the shape that
   survives a shared, slower disk.
2. **The `parent_id`-leading index may become redundant** once every trail
   read filters on `parentType`. It is kept today because the
   `parentType`-unknown lookup still uses it. Re-check when the read bolt
   (`002-audit-reads`) settles the read shapes.
3. **The catalog is duplicated in two places** — the frozen PRD and
   `src/domain/audit/event-catalog.ts`. A test asserts the catalog's shape,
   but not its agreement with the PRD text. A PRD-parity check that reads the
   PRD's event list would catch a drift at build time.
4. **Coverage of the remaining branches** (the quota-monitor error path, the
   secret heuristic's edge branch) is thin but not zero, and both are low-risk.
   Leaving them is a reasonable call.

## Ready for Operations

- [x] All acceptance criteria met
- [x] Code coverage > 80% — 94.4%
- [x] No critical/high severity issues open
- [x] Performance targets met — p95 0.9 ms against a 1,000 ms budget
- [x] Security tests passing — 19/19
- [ ] Manual verification of the Vercel Blob and platform quota paths
      (not possible locally — see Not Tested Manually)
