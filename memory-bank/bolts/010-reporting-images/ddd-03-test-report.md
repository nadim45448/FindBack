---
id: 010-reporting-images
stage: 5
stage_name: test
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-29T10:00:00Z
completed: 2026-10-29T10:00:00Z
verification_command: "npm run verify"
---

# Bolt 010 — Stage 5: Test Report

## Overview

The verification of the `010-reporting-images` bolt: attaching an image to a
report, and — the part that actually matters — deciding who may receive the
image's **bytes**.

| Operation | Route | Story | Requirement |
|---|---|---|---|
| Image delivery | `GET /api/reports/[id]/image` | 013 | FR-8, FR-37, FR-39, FR-53 |
| Image attachment | `POST /api/reports` | 013 | FR-8, FR-37 |
| Administrator replacement | `PATCH /api/admin/reports/[id]/edit` | 013 | FR-53 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stages 2 (design) and 3 (ADR) were skipped by owner direction, so there is no
technical design artifact and no ADR artifact for this bolt. The design
decisions it would have carried are stated in the code's own doc comments and
in the governing standard, `memory-bank/standards/image-handling.md`, which is
the authority for every rule asserted below.

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
| Test | `vitest run` | ✅ **101 files, 1,710 tests, all passing** |
| Build | `next build` | ✅ clean, the image route registered |

The build registers the new route:

```
ƒ /api/reports/[id]/image
```

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 92.46 | 88.46 | 94.94 | 92.51 |
| `src/application` | 95.13 | 91.04 | 100 | 95.10 |

The global 80% line-coverage floor is met with margin.

### The bolt's own files

| File | % Lines | % Branch | Uncovered |
|---|---|---|---|
| `src/domain/listings/image-content-type.ts` | 100.0 | 100.0 | none |
| `src/domain/listings/image-delivery.ts` | 100.0 | 100.0 | none |
| `src/domain/listings/image-quota.ts` | 100.0 | 100.0 | none |
| `src/application/listings/report-image-delivery-service.ts` | 100.0 | 100.0 | none |
| `src/application/listings/ports/image-reader.ts` | 100.0 | 100.0 | none |
| `src/application/listings/ports/image-quota-reader.ts` | 100.0 | 50.0 | none |
| `src/application/listings/ports/report-image-reader.ts` | 100.0 | 100.0 | none (type-only) |
| `src/infrastructure/listings/blob-image-reader.ts` | 100.0 | 87.5 | none |
| `src/infrastructure/listings/blob-image-quota-reader.ts` | 100.0 | 83.3 | none |
| `src/infrastructure/listings/blob-image-store.ts` | 100.0 | 83.3 | none |
| `src/infrastructure/listings/prisma-report-image-reader.ts` | 100.0 | 75.0 | none |

**Every bolt-10 source file is at 100% line coverage.** The uncovered branches
are the default arms of the error-mapping and default-value expressions — a
missing `blob.size` fallback, a `contentType` the SDK did not echo back, the
`?? 'bin'` extension fallback, and the `hasMore` branch of the quota walk when
the store returns no `cursor`. None of them is a reachable business rule.

## The bolt's own test files

```bash
npx vitest run \
  src/domain/listings/image-delivery.test.ts \
  src/domain/listings/image-content-type.test.ts \
  src/domain/listings/image-quota.test.ts \
  src/application/listings/report-image-delivery-service.test.ts \
  src/application/listings/image-quota-enforcement.test.ts \
  src/infrastructure/listings/blob-image-reader.test.ts \
  src/infrastructure/listings/blob-image-quota-reader.test.ts \
  src/infrastructure/listings/prisma-report-image-reader.test.ts \
  src/app/api/reports/image-route.test.ts
```

**9 files, 123 tests, all passing.**

| File | Tests | Covers |
|---|---|---|
| `src/domain/listings/image-delivery.test.ts` | 13 | The per-image delivery rule |
| `src/domain/listings/image-content-type.test.ts` | 16 | The allowlist, the magic bytes, the headers |
| `src/domain/listings/image-quota.test.ts` | 17 | The quota arithmetic and its thresholds |
| `src/application/listings/report-image-delivery-service.test.ts` | 17 | The refusals, the deliveries, the served type |
| `src/application/listings/image-quota-enforcement.test.ts` | 15 | The quota on both write paths |
| `src/infrastructure/listings/blob-image-reader.test.ts` | 15 | The private read and every failure mode |
| `src/infrastructure/listings/blob-image-quota-reader.test.ts` | 7 | The usage walk |
| `src/infrastructure/listings/prisma-report-image-reader.test.ts` | 9 | **Live database** — the reader's SQL |
| `src/app/api/reports/image-route.test.ts` | 14 | The route's boundary and its four headers |

The `src/infrastructure/listings/prisma-report-image-reader.test.ts` file runs
against a **live PostgreSQL database**, not a mock. It skips when
`DATABASE_URL` is unset, so a checkout without a database still runs the rest
of the suite green.

## Success Criteria

Each criterion from `bolt.md`, and where it is verified.

| # | Criterion | Verified by | Result |
|---|---|---|---|
| 1 | Uploads are validated for type and size per `image-handling.md` | `blob-image-store.ts`, `image-content-type.test.ts` | ✅ |
| 2 | Images are stored privately and never publicly addressable | `blob-image-store.ts`, `blob-image-reader.test.ts` | ✅ |
| 3 | Authorization is evaluated server-side immediately before every blob read | `report-image-delivery-service.test.ts` | ✅ |
| 4 | No `s-maxage` is set on a private image response | `image-route.test.ts`, `image-content-type.test.ts` | ✅ |
| 5 | An unauthorized viewer receives a refusal, not the image | `report-image-delivery-service.test.ts`, `image-route.test.ts` | ✅ |
| 6 | Uploads are refused once Blob storage reaches its limit | `image-quota-enforcement.test.ts`, `blob-image-quota-reader.test.ts` | ✅ |
| 7 | Replacing an image releases the prior blob per the cleanup rule in `image-handling.md` §4 | `image-quota-enforcement.test.ts` | ✅ |

**All seven criteria are met.**

### Criterion 1 — validation before anything is stored

`BlobImageStore.validate()` runs before the bytes reach the store, and checks
four things in order: the declared content type is one of the three FR-8
types; the buffer is not empty; the **actual** byte length is within 5 MB —
the declared `Content-Length` is never trusted; and the magic bytes **match
the declared type**.

The last check is the one that matters. A `.jpg` that is actually an HTML or
SVG payload is exactly what `image-handling.md` §1 warns about, and the
domain's `detectImageContentType` is what decides. The store and the delivery
reader now call the **same** function — the magic-byte table has exactly one
implementation point.

### Criterion 2 — private, and only reachable through the route

The store passes `access: 'private'` and `addRandomSuffix: true` on every
upload. The `blob-image-reader.test.ts` suite asserts `access: 'private'` **on
the call**, not merely on the stored reference — a test that only checked the
stored reference would pass if the adapter had read it from the wrong place.

The pathname is built from the prefix and a random UUID. The original
filename is **discarded entirely**, so a hostile filename cannot escape the
prefix directory.

The stored reference is a **path**, never a URL. `toPath()` strips the scheme
and host from the blob URL, so the database does not accumulate a dependency on
one store's hostname, and a stored URL could not be used to fetch the blob
directly — it would bypass the authorisation that the delivery route performs.

### Criterion 3 — the order is asserted, not just the outcome

This is the criterion most worth the test. `report-image-delivery-service.test.ts`
records the **sequence** of collaborator calls and asserts:

- an anonymous viewer produces **no** calls at all — the refusal precedes the
  report load and the blob read;
- an unrelated member produces a `load-image` but **no** `read-blob`;
- a successful delivery produces exactly `['load-image', 'read-blob']`.

A service that read the blob and *then* checked would return the same
**answers** while leaking the bytes into memory on the way. A test that only
checked the outcome would not see the difference.

### Criterion 4 — never `s-maxage`

The route sets `Cache-Control: private, no-cache` and nothing else. The suite
asserts `response.headers.get('s-maxage')` is `null` — not merely that the
header is absent, but that the specific forbidden directive is absent, since a
header could carry `private` and `s-maxage` together.

The domain test additionally asserts the constant itself matches neither
`/s-maxage/i` nor `/public/i`, so the prohibition is pinned at the source and
not only at the response.

### Criterion 5 — the refusals are indistinguishable

Five situations produce a refusal: an anonymous viewer, an unrelated member, a
claimant, a recovery responder, and a report with no image. The suite asserts
that **all five carry the same message**, and that a report with no image
produces the same answer as a report the viewer may not have.

The reason is the one that makes the test worth having: the image's existence
is itself information. A 403 would confirm that the report exists, which is
exactly what a refused viewer must not learn. Every refusal is a
`NotFoundError` with the message *"That image could not be found."*

### Criterion 6 — the quota is a business outcome, not a crash

`image-quota-enforcement.test.ts` covers **both** write paths, because a quota
checked on only one of them would leave the other able to over-run the budget.

The creation path:

- the usage is read **before** the write — asserted by call order;
- an upload that exactly fills the remaining space is allowed;
- an upload **one byte** over is refused with a `ValidationError` whose field
  is `image`;
- nothing is stored on a refusal — no blob, no report row, no audit event;
- **no existing image is ever deleted to make room**;
- an **unmeasurable** budget refuses the upload. A quota reader that reported
  zero on a store failure would tell the domain there is room for an infinite
  upload, and the suite asserts the failure is an
  `ImageQuotaUnavailableError` and *not* a usage of zero.

The FR-53 replacement path carries the same rules, plus the ordering that
`image-handling.md` §4 requires: the old blob's delete is issued **after** the
database side has settled, so a delete inside a transaction about to roll back
would be undone by that rollback and orphan the blob. When the row write
fails, only the **new** blob is compensated away and the old one is untouched
— the report still points at the image it always pointed at.

### Criterion 7 — the old blob is released

The replacement path uploads a new blob and deletes the old one. The suite
asserts the order `store → reports.update → images.delete`, and asserts that
a refused replacement leaves both blobs alone — a refused replacement must
leave the report exactly as it was.

## The two grants are different questions

This is the design fact the bolt exists to establish, and it is worth stating
plainly because it is easy to get backwards.

**The FR-39 matrix grants the `image` *field*.** `report-field-set.ts` puts
`image` in the group that *"is present whenever the columns include any
authenticated column"* — so a claimant's and a recovery responder's projection
carries the image **reference**.

**The per-image rule grants the *bytes*.** `image-delivery.ts` narrows that to
the report owner and the administrator, and refuses the claimant and the
responder.

Both are correct, and neither replaces the other. The field grant answers
*"may this viewer see that a report has an image?"*; the delivery rule answers
*"may this viewer receive the image's bytes?"* The narrower one is the one
that matters for the bytes, because `image-handling.md` §2 is explicit that
*"an image is not ownership evidence"* for a claimant, and that a recovery
responder *"must not see another candidate's image."*

`report-image-delivery-service.test.ts` pins the difference directly: it builds
a claimant's relationship — one that the field matrix grants `image` — and
asserts the delivery is refused and that **no blob was read**.

## The content type is derived from the bytes

`image-handling.md` §3 requires a **server-set** `Content-Type` from a
server-side allowlist, *"never from user input or the blob's stored
metadata."*

The schema's field set is closed — `prisma/schema.prisma` states that *"no
column may be added without the PRD naming it"* — so there is no place to
persist a content type. The resolution is to derive it from the image's own
**bytes** at read time, which satisfies the rule more literally than storing
it would: the served type is a property of what was actually uploaded, not a
claim made at upload time.

The consequences are tested:

- PNG bytes are reported as `image/png` **even when the stored path ends in
  `.jpg`** — the magic bytes are the fact; the extension is a claim;
- an HTML payload wearing a JPEG extension detects as nothing;
- a buffer too short to carry a signature detects as nothing, rather than as
  a guess at which type it was meant to be;
- a type outside the allowlist is **refused**, not coerced to another type.

The refusal for an out-of-allowlist type is a `NotFoundError`, not a
validation error. A 400 would tell the viewer their request was wrong, which
it was not; a 500 would disclose that *something* is stored at that path. The
not-found says only what every other refusal says.

## Every failure mode stays distinguishable

`blob-image-reader.test.ts` distinguishes the failures that §5 requires to
stay apart:

| Failure | Result | Why |
|---|---|---|
| `BlobNotFoundError` | `ImageNotFoundError` → 404 | The blob is gone; the report still points at it |
| A generic store failure | `ImageReadError` → 500 | The store is unavailable |
| A mid-stream failure | `ImageReadError` → 500 | Never a partial body |
| A 304 with no body | `ImageReadError` → 500 | A failed read, not an empty image |

The missing-blob check is by error **name** rather than `instanceof`, because
a class-identity check that quietly stopped matching would turn a missing
image into a 500 — and the suite asserts the two are distinct, so a regression
that collapsed them would fail.

A 304 is a read failure, not an empty image. Serving an empty body under an
image's content type is precisely the *"partial or wrong-type body"* §5
forbids.

## The reader's SQL resolves against the real schema

`prisma-report-image-reader.test.ts` runs against a live PostgreSQL database
and proves two things a mock could not:

1. **It resolves against the real schema.** The reader's physical column
   names are asserted against `information_schema`. A wrong column name would
   fail at runtime, in production, on the first request.
2. **The `LEFT JOIN` really does return a row for an unrelated member.** An
   `INNER JOIN` would return zero rows — indistinguishable from *"the report
   does not exist"* — and the difference between the two is exactly what a
   mocked test cannot see.

The security-relevant assertion is the `IS NOT NULL` filter: a report with no
image produces **no row**, so the service's refusal is the same one a viewer
without permission receives. Without the filter, the reader would return a row
with a null path and the service would have to decide what a null path means —
a decision it should never be asked for.

## Owner items

### 1 - The database's time zone must be set to UTC (carried from bolt 007)

**Unchanged and still outstanding.** The validator's "today" is UTC and
`CURRENT_DATE` is the session's time zone — a session ahead of UTC would
reject a report dated today as tomorrow. The migration's `SET TIME ZONE 'UTC'`
is commented out with a note that the deployment must set it, because
`ALTER DATABASE` cannot run inside a transaction block.

### 2 - A pre-existing flaky test in bolt 001's code

**Not caused by this bolt.**
`src/infrastructure/accounts/reset-deactivation-acceptance.test.ts` — *"criterion
4: the timing of the two paths is within the tolerance"* — failed in roughly
**1 of 3** consecutive full-suite runs. The test asserts two request paths
complete within a 100 ms tolerance of each other, which is ADR-18's
timing-oracle tolerance. The flake is a property of the timing assertion, not
of the image code. The remedy — widen the tolerance or replace the wall-clock
comparison with an observable ordering assertion — belongs to bolt `001`.

### 3 - The quota's ceiling is a deployment configuration value

`image-handling.md` §4 names the 1 GB budget as an Operations config value,
and `quotaBytesFromEnv` reads it from the environment with a default of
1 GiB — the verified free-tier limit the deployment is actually on. A
deployment on a different plan must set the variable; the default is not a
policy.

### 4 - The blob-delete retry queue is a port, not yet a queue

**The delete itself is wired; the retry mechanism is not.** Bolt `008`'s
`ReportDeletionService` deletes the report's blob after the commit — as a
**compensating** delete, because a blob store cannot join a PostgreSQL
transaction — and a failed delete is handed to a `ReportDeletionLogger` port
whose method is `recordBlobDeleteFailure(path, error)`.

`image-handling.md` §5 requires that failure to be *"recorded in a retry queue;
do not silently leak. Retries are idempotent by pathname."* The **port**
exists, the failure is not swallowed, and the current composition writes it to
the operational log as a `report.image_delete_failed` event carrying the path
and the error's **name** only — never the error's message, which could carry a
blob URL. But a log line is not a **queue**: nothing re-reads it and nothing
retries the delete. The requirement is therefore satisfied at the **contract**
level and not yet at the **mechanism** level.

This is a bolt-`008` obligation surfaced here, not work this bolt
introduced. It is recorded rather than left silent, because §5's rule is
about a blob that leaks — and a leaked blob on a deleted report is exactly
the kind of thing a privacy-boundary bolt should not leave unstated.

## Notes

### The route is thin, and the decision lives next to the read

The route resolves the actor from the session cookie and hands it to the
service. It never reads the blob, never inspects a path, and never decides
whether a viewer may have the image. `image-handling.md` §2 requires the check
to happen *"immediately adjacent to the blob read"* and forbids relying on
middleware or the CDN for it — so the decision and the read live together,
inside the delivery service, and the route is the thin thing that maps the
outcome to a response.

The actor is derived from the **session**, never from the request body or
query. A body-supplied actor is ignored. The route suite asserts the actor
and the report id are handed to the use case as a pair, and that an
anonymous request produces a `null` actor — the route does not refuse
anonymous itself; the **service** does, and the route simply maps the
service's refusal to a 404.

### The delivery response carries bytes and nothing else

No wrapper, no JSON, no base64 — a delivered image is the image. The
`Content-Length` is the buffer's own length.

### Not verified here, by design

The bolt does not build:

- the report screens that would render an `<img>` — the report UI bolt
- the Recovery Response candidate image (FR-44) — a later bolt
- the quota's administrator-facing reporting surface (current bytes,
  operation counts, remaining headroom) — `image-handling.md` §4's last row
- the blob-delete retry queue — recorded above as owner item 4

### The smoke test is a smoke test, not a suite

The acceptance criteria are proven by the suites under `src/`. A live
`npm run dev` smoke test for this path would require a browser-capable
client to assert what a member actually sees rendered, and the report screens
that would render it do not exist yet — they are a later bolt. The route
suite asserts the bytes, the content type, and all four headers at the HTTP
boundary, which is the boundary this bolt owns.

## Verdict

**READY**

The bolt's seven success criteria are met, its story is implemented, the full
verification command passes, the coverage floor is exceeded, every one of the
bolt's own source files is at 100% line coverage, and the live-database
suite proves the reader's SQL resolves against the real schema.

The design fact the bolt establishes — that the **field** grant and the
**bytes** grant are different questions, and the narrower one governs the
bytes — is asserted directly by the tests rather than left as a comment.

Two owner items are outstanding and neither is blocking this bolt: the
database's time zone must be set to UTC explicitly by the deployment, and a
pre-existing timing-flaky test in bolt `001`'s code should be widened or
re-expressed. Two more are recorded above: the quota's ceiling is a
deployment configuration value, and the FR-10 blob-delete failure is logged
but not yet retried, because the retry queue behind the port is not built.

---

## Addendum — the criteria audit and the gaps it closed (2026-10-30)

The bolt closed on 2026-10-29 with the verdict above. This addendum records
what happened **after** that closure, because the report above was written
before the story's criteria had been audited one by one.

### Why the audit was worth running

The Stage 5 report verified the bolt's **seven success criteria** against the
**tests that existed at the time**. It did not verify that each of story
`013`'s **25 acceptance criteria** had a named test behind it. Those are
different questions: a bolt's success criteria are the bolt's own summary,
while a story's criteria are the requirement's own wording, and a criterion
can be satisfied by behaviour that exists but is **not asserted** anywhere.

The distinction matters because an unasserted criterion is not protected. It
reads as done, it ticks as done, and the next refactor can remove the
behaviour with no test failing.

### What the audit found

**Three criteria were implemented but unbacked** — the behaviour existed and
was correct, but no test would fail if it regressed:

| Criterion | Closed by |
|---|---|
| The byte count comes from the stream, not from `Content-Length` | `parse-report-request.test.ts` → "counts the bytes it actually read, not the size the part claims" |
| A non-`Active` member's upload is refused | `reports-route.test.ts` → "refuses a Pending actor's upload with a 403", "stores nothing when it refuses a Pending actor's upload" |
| The check does not rely on the CDN or middleware | `image-route.test.ts` → "never reads the blob itself" |

**Three requirements of the governing standard had no implementation at all:**

1. **The 40 MP pixel cap** — `image-handling.md` §1 requires a *pixel* cap,
   decoded from the header. The store validated the byte length and the magic
   bytes but never decoded the header, so a decompression bomb passed
   validation. The header is now decoded (JPEG's SOF marker, PNG's IHDR,
   WebP's VP8X) and the count rejected before any full decode.

2. **The administrator's image-replacement route** — FR-53's replacement was
   implemented and tested in the service and **unreachable in production**,
   because the route read JSON only. The multipart reader was extracted so
   the edit path reuses the create path's ceiling and type rules, and the
   edit path's one distinction — a missing image part is a valid text-only
   edit — is stated in the parser itself.

3. **The entity-scoped blob prefix** — `reports/{reportId}/` could not be
   reached while the id was database-generated, because the upload precedes
   the row write. The id is now minted in the application layer and threaded
   through the repository port, so it stays server-derived.

**And one requirement had no surface at all:** the 70% and 90% warnings and
the administrator's view of the budget. `classifyQuota` was called by no
service. The budget now has its own page at `/admin/storage` — a page and not
a fifth dashboard tile, because §15.1 freezes the dashboard at four and the
story's criteria name the absences as load-bearing.

### The new tests

| File | Tests | Covers |
|---|---|---|
| `src/domain/administration/storage-usage.test.ts` | 21 | The view, the headline, the thresholds, the byte formatting |
| `src/application/administration/storage-usage-query.test.ts` | 6 | The authorisation, the failed read, the no-number rule |
| `src/ui/admin-storage-surface.test.tsx` | 12 | The headline, the numbers, the named lines, the error state |
| `src/app/api/reports/parse-report-request.test.ts` | 10 | The multipart parse and the counted bytes |
| `src/app/api/admin/reports/[id]/edit/route.test.ts` | 24 | The replacement route end to end |

Plus the three added cases in `reports-route.test.ts` and the one added in
`image-route.test.ts`, and the two added to `blob-image-store.test.ts` and
`report-creation-service.test.ts` ("never asks for public access, on any
upload"; "sends no notification when the upload succeeds" / "…fails").

### The threshold assertion is the one worth keeping

`storage-usage.test.ts` asserts `STORAGE_WARNING_PERCENT` **against the
domain's `QUOTA_WARNING_THRESHOLD`**, and separately asserts that the value
is `70`. Both assertions are needed: the first is what stops the two places
from drifting apart, and the second is what stops the constant from being
moved without someone deciding to. A test that asserted only `70` would let
the write path's threshold change silently; a test that asserted only the
relationship would let the pair drift together.

### Verification

Typecheck clean. The bolt's own suites and the suites touched by the audit
are green: **39 tests** across the three storage-usage suites, **54** across
the three route and parser suites, and **43** across the re-run quota and
notification suites. The full suite was not run, by owner direction.

**Three pre-existing failures are unrelated to this bolt** and were confirmed
so by stashing `src/` and re-running: the `description_withheld` and
`image_withheld` column expectations, and the `report-listing-filter` "narrows
nothing" test. Stashing produced **four** failures against **three** with
these changes — the three are pre-existing.

---
