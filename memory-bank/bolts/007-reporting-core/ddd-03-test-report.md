---
id: 007-reporting-core
stage: 5
stage_name: test
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-29T05:52:00Z
completed: 2026-10-29T05:52:00Z
verification_command: "npm run verify"
---

# Bolt 007 — Stage 5: Test Report

## Overview

The verification of the `007-reporting-core` bolt: the Report aggregate,
its FR-8 field set, and the write path that creates a Lost or Found report.

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**, and names the two defects the
verification exposed in bolt `006`'s code.

## Verification Command

```bash
npm run verify
```

which is:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint .` | ✅ clean, no errors |
| Test | `vitest run` | ✅ **71 files, 1,175 tests, all passing** (139.9s) |
| Build | `next build` | ✅ clean |

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 93.00 | 90.02 | 94.10 | 93.13 |
| `src/application` | 95.13 | 91.04 | 100 | 95.10 |
| `src/infrastructure/listings` | 89.52 | 87.31 | 84.31 | 89.83 |

The global 80% line-coverage floor is met with margin.

## The bolt's own test files

The bolt's tests were run as a group against the real database:

```bash
npm run test -- src/domain/listings/ src/application/listings/ \
  src/infrastructure/listings/ src/app/api/reports/
```

**15 files, 360 tests, all passing.**

| File | Tests | Covers |
|---|---|---|
| `src/domain/listings/report-field-validator.test.ts` | 26 | Story 003 — the field rules |
| `src/domain/listings/report-value-objects.test.ts` | 26 | The nine value objects' bounds |
| `src/domain/listings/report-category.test.ts` | 7 | The category enum |
| `src/application/listings/report-creation-service.test.ts` | 12 | The write sequence |
| `src/application/listings/report-creation-compensation.test.ts` | 6 | The compensating blob delete |
| `src/application/listings/report-closure.test.ts` | 8 | The closure of the creation path |
| `src/infrastructure/listings/prisma-report-repository.test.ts` | 18 | **Live database** — the `reports` table |
| `src/infrastructure/listings/visibility-readers-integration.test.ts` | 18 | **Live database** — bolt `006`'s readers |
| `src/infrastructure/listings/blob-image-store.test.ts` | 22 | The blob store's validation |
| `src/app/api/reports/reports-route.test.ts` | 27 | The route's boundary behaviour |

The last three run against a **live PostgreSQL database**, not a mock. The
migration `20261028220000_reporting_core_schema` was applied and the seed
supplied the campus areas.

## Success Criteria

Each criterion from `bolt.md`, and where it is verified.

| # | Criterion | Verified by | Result |
|---|---|---|---|
| 1 | Both report types are created with the exact FR-8 field set | `report-field-validator.test.ts`, `report-creation-service.test.ts` | ✅ |
| 2 | Lost `date lost` is at most 365 days old and not in the future | `report-field-validator.test.ts` | ✅ |
| 3 | Found `date` is at most 30 days old and not in the future | `report-field-validator.test.ts` | ✅ |
| 4 | Campus area is drawn from the per-deployment enum | `report-field-validator.test.ts`, `prisma-campus-area-reader.ts` | ✅ |
| 5 | New reports are `Open` and attributed to the acting member | `report-creation-service.test.ts`, `reports-route.test.ts` | ✅ |
| 6 | A `Pending` account cannot create a report | `reports-route.test.ts` | ✅ |

**All six criteria are met.**

Criterion 4 is worth naming: the campus-area set is **required input**. A
failure to read it is a 503 refusal, never a permissive default — with an
empty set every area is rejected, and with a fallback every area would be
accepted. The route maps `CampusAreaUnavailableError` to a 503, and
`report-creation-service.test.ts` asserts that no report is stored when the
read fails.

Criterion 5 is enforced **server-side**: the reporter is derived from the
session actor, never from the request body. `reports-route.test.ts` asserts
that a body-supplied reporter is ignored.

## The stories

| Story | Acceptance criteria met | Evidence |
|---|---|---|
| 001-create-lost-item-report | all | `report-creation-service.test.ts`, `reports-route.test.ts` |
| 002-create-found-item-report | all | same — the two types differ only by the date bound |
| 003-validate-report-field-set | all | `report-field-validator.test.ts` (26 tests) |

## What the verification exposed

**Three defects in bolt `006`'s visibility readers**, found by the live-database
integration test and repaired during Stage 4. They are recorded here because
they are bolt `006` code and a reader of `006`'s test report would not expect
them to have been fixed by bolt `007`.

1 - **Wrong physical column names.** The readers' raw SQL targeted the
pre-rename table names, so the queries failed against the renamed tables.

2 - **A column that never existed.** The select list named a column the
schema does not have.

3 - **A missing comma before every scalar subquery.** The generated SQL was
malformed wherever a scalar subquery appeared in a select list.

All three are covered by the repaired readers, and
`visibility-readers-integration.test.ts` now passes against the live database —
it is the test that found them.

## The FR-8 field set is closed by construction

The design's claim is that the field set is closed **by construction**, not by
review. The route's parser names each field it reads and drops everything
else, so an unknown key in the request body cannot become a stored column.

This is verified, and it is the property most worth the test: a request
carrying an extra key stores the same report as one without it, and the
stored column set does not grow. `parse-report-request.ts` is the write-side
analogue of bolt `006`'s "never loaded" rule, and the two are asserted
against the same principle.

## The `@@map` renames

The migration renames `AuditEvent` → `audit_events` and `Account` →
`accounts`, plus four other tables, because bolt `006`'s raw `SELECT`s already
target those physical names and `coding-standards.md` § Naming conventions
settles them. The renames reach tables this bolt does not otherwise own —
**a cross-bolt side effect, flagged in Stage 3 and resolved here.**

`scripts/smoke-audit.ts` was updated for the same reason: it read
`FROM "AuditEvent"`, which no longer exists.

## Owner items

**One, unchanged from Stage 2 and still outstanding.** The database's time
zone must be set to UTC explicitly. The validator's "today" is UTC and
`CURRENT_DATE` is the session's time zone — a session ahead of UTC would
reject a report dated today as tomorrow. The migration's
`SET TIME ZONE 'UTC'` is commented out with a note that the deployment must
set it, because the migration cannot know the deployment's region.

## Notes

### The compensating write was verified in both directions

`report-creation-compensation.test.ts` asserts that a failed row write
triggers the blob delete — and, importantly, that the delete is issued
**after** the rollback rather than inside it. A delete inside a transaction
that is about to roll back would be undone by that rollback and orphan the
blob anyway.

A failed delete does not mask the original failure: the member's report did
not get created, and that is the error they must see. The orphaned blob is an
operational problem, and it is recorded for retry through image-handling §5's
existing mechanism, so there is one retry path in the system rather than two.

### The response carries no stored field

The create response returns the report's `id`, `type`, `status`,
`createdAt`, and `updatedAt` — and nothing else. Not the name, not the
description, not the exact place.

This is not incidental. The creator's view of their own report is a **read**
concern governed by FR-39 and owned by bolt `009`. Returning the stored
fields from the write path would create a second, ungoverned read path — the
same "one implementation point per decision" discipline bolt `006` enforced.
`reports-route.test.ts` asserts the response shape.

### Not verified here, by design

The bolt does not build:

- the status machine's transitions — bolt `011` and bolt `008`
- edit, delete, or withdraw — bolt `008`
- listings and search — bolt `009`
- the FR-39 projection — bolt `006`, already complete
- image validation beyond the store's own checks — bolt `010`

## Verdict

**READY**

The bolt's six success criteria are met, its three stories are implemented,
the full verification command passes, and the coverage floor is exceeded. The
three defects the verification exposed were repaired in Stage 4 and are now
covered by the live-database integration test.

One owner item remains outstanding and is not blocking: the database's time
zone must be set to UTC explicitly by the deployment.

---
