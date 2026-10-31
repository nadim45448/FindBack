---
id: 010-reporting-images
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 013-attach-image-to-report
created: 2026-10-23T13:09:30Z
started: 2026-10-29T08:30:00Z
completed: 2026-10-30T19:30:00.000Z
current_stage: complete
stages_completed:
  - name: implement
    completed: 2026-10-29T09:40:00.000Z
    artifact: source
  - name: test
    completed: 2026-10-29T10:00:00.000Z
    artifact: ddd-03-test-report.md
  - name: audit
    completed: 2026-10-30T19:30:00.000Z
    artifact: source
    note: >-
      Story 013's 25 acceptance criteria audited against the code; three
      unbacked criteria closed with real tests, and three implementation gaps
      closed (40 MP pixel cap, the administrator image-replacement route, the
      entity-scoped blob prefix, and the administrator's storage page).

requires_bolts:
  - 001-audit-core
  - 006-reporting-visibility
  - 007-reporting-core
enables_bolts:
  - 022-web-audit-accessibility
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 010-reporting-images

## Overview

Image attachment and — more importantly — authorized delivery.

## Objective

Attach an image to a report and serve it only to actors the FR-39 projection
permits, under the quota rules in `image-handling.md`.

## Stories Included

- **013-attach-image-to-report**: validate, store privately, authorize on every read (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [ ] **2. design**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [x] **3. implement**: ✅ 2026-10-29 → source
- [x] **4. test**: ✅ 2026-10-29 → `ddd-03-test-report.md`
- [x] **5. audit**: ✅ 2026-10-30 → source — the story's 25 criteria audited against the code; three unbacked criteria closed with real tests and three implementation gaps closed

## Dependencies

### Requires
- **001-audit-core** (required): quota refusals are surfaced and logged
- **006-reporting-visibility** (required): image access follows the same matrix as fields
- **007-reporting-core** (required): images attach to reports

### Enables
- 022-web-audit-accessibility

## Success Criteria

- [x] Uploads are validated for type and size per `image-handling.md`
- [x] Images are stored privately and never publicly addressable
- [x] Authorization is evaluated server-side immediately before every blob read
- [x] No `s-maxage` is set on a private image response
- [x] An unauthorized viewer receives a refusal, not the image
- [x] Uploads are refused once Blob storage reaches its limit
- [x] Replacing an image releases the prior blob per the cleanup rule in `image-handling.md` §4

## Notes

One story, its own bolt: image authorization is a privacy boundary, and it is the
only place in this unit where an authorization check happens on a read of
externally stored bytes rather than on a database query.

### The field grant and the bytes grant are different questions

The bolt's central design fact, and the one most easily got backwards.

**The FR-39 matrix grants the `image` *field*.** `report-field-set.ts` puts
`image` in the group that *"is present whenever the columns include any
authenticated column"* — so a claimant's and a recovery responder's projection
carries the image **reference**.

**The per-image rule grants the *bytes*.** `image-delivery.ts` narrows that to
the report owner and the administrator.

Both are correct, and neither replaces the other. The field grant answers
*"may this viewer see that a report has an image?"*; the delivery rule answers
*"may this viewer receive the image's bytes?"* The narrower one governs the
bytes, because `image-handling.md` §2 is explicit that an image is not
ownership evidence for a claimant, and that a recovery responder must not see
another candidate's image.

### The content type is derived from the bytes, not stored

`image-handling.md` §3 requires a **server-set** `Content-Type` from a
server-side allowlist, *"never from user input or the blob's stored
metadata."* The schema's field set is closed, so there is nowhere to persist
a content type — and deriving it from the image's own bytes at read time
satisfies the rule more literally than storing it would: the served type is a
property of what was actually uploaded, not a claim made at upload time.

The magic-byte table therefore lives in the domain, once. The store calls it
to validate an upload; the reader calls it to serve one. They can never
disagree about what an acceptable image is.

### A refusal is a not-found, never a 403

The image's existence is itself information. An unrelated member, a claimant,
a recovery responder, an anonymous visitor, and a report with no image all
receive the same answer — *"That image could not be found."* A 403 would
confirm that the report exists, which is exactly what a refused viewer must
not learn.

## The audit and the gaps it closed (2026-10-30)

The bolt closed on 2026-10-29 with a READY test report. A subsequent audit of
story `013`'s **25 acceptance criteria** against the code — criterion by
criterion, each checked for a *named test* that would fail if the behaviour
regressed — found that three criteria were implemented but **unbacked**, and
that three requirements of the governing standard had **no implementation at
all**. Both sets are now closed.

### Three criteria that were implemented but unbacked

A criterion verified by reading the code is verified *today*. It is not
verified against tomorrow's refactor. Each of these was closed with a real
test rather than by re-reading the code and declaring it satisfied.

| Criterion | What was missing | Closed by |
|---|---|---|
| The byte count comes from the stream, not from `Content-Length` | The parser checks the real byte length after reading, but no test lied about the declared size — so the second check could be deleted and nothing would fail | `parse-report-request.test.ts` → "counts the bytes it actually read, not the size the part claims" |
| A non-`Active` member's upload is refused | The gate is correct and sits *before* the body is read, but the only `Pending` case sent a JSON body — so no upload was ever attempted | `reports-route.test.ts` → "refuses a Pending actor's upload with a 403", "stores nothing when it refuses a Pending actor's upload" |
| The check does not rely on the CDN or middleware | The ordering was asserted in the service, but nothing asserted that the *route* has no blob read of its own — so a second, unchecked read could have been added to the route | `image-route.test.ts` → "never reads the blob itself" |

### Three requirements with no implementation at all

**The 40 MP pixel cap.** `image-handling.md` §1 requires *"Dimensions | Decode
header; reject absurd pixel counts (> 40 MP)"* — a **pixel** cap, not a byte
cap. The store validated the byte length and the magic bytes but never
decoded the header, so a 5 MB decompression bomb passed validation and the
decompression cost was unbounded. The header is now decoded (JPEG's SOF
marker, PNG's IHDR, WebP's VP8X) and the pixel count rejected **before any
full image data is decoded**.

**The administrator's image replacement.** FR-53's replacement was fully
implemented and fully tested in the service — and **unreachable in
production**, because the route read JSON only. A `multipart/form-data` body
was a 400. The multipart reader was extracted from the create path into
`readMultipartForm` and `readImagePart`, so the edit path reuses the *same*
5 MB ceiling, the *same* allowed types, and the *same* declared-then-actual
size checks — one rule, two callers. The distinction the edit path needed and
the create path did not: **a missing image part is a valid text-only edit**
here, because an edit is a partial submission, while it is a malformed
request there.

**The entity-scoped blob prefix.** `image-handling.md` §4 names the prefix
`reports/{entityId}/`, so storage usage is attributable per entity. It could
not be reached, because the report's id was **database-generated** and the
upload happens *before* the row is written — the id did not exist yet when
the path had to be built. The id is now **minted in the application layer**
(`crypto.randomUUID()`) before the upload and threaded through the repository
port, which writes it as given. This keeps the id **server-derived**: a
member still cannot assert one, and the route has no way to pass one in.

### The administrator's view of the budget

`image-handling.md` §4 also says to *"Surface current bytes … and remaining
headroom to administrators"* and to *"Warn at 70% and 90% of quota."* The
**refusal** at 100% was implemented on the write path, where it had to be;
the **warnings** had nowhere to live, and `classifyQuota` was called by no
service at all. The budget now has **its own page**, `/admin/storage`.

**It is a page, not a fifth dashboard tile.** §15.1 freezes the dashboard at
four tiles, and the story's criteria name the absences — *"no `Reports to
edit` tile"*, *"no audit tile"* — as load-bearing. A storage tile would break
a frozen contract.

**The warning bands are the write path's bands.** The view imports
`QUOTA_WARNING_THRESHOLD` and `QUOTA_CRITICAL_THRESHOLD` from the domain and
calls the same `classifyQuota` the write path uses. The thresholds are
**asserted against those constants, not against the literals `70` and `90`** —
so a change to the write path's bands fails this suite rather than silently
leaving the administrator's warning in one place and the refusal in another.

**A failed read shows no number.** The blob store may be unreachable. The
page renders a calm error state; it never renders *"0 bytes used"*, because
zero is a fact about the budget and a failed read is not a fact.