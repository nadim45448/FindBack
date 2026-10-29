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
completed: 2026-10-29T10:00:00.000Z
current_stage: test
stages_completed:
  - name: implement
    completed: 2026-10-29T09:40:00.000Z
    artifact: source
  - name: test
    completed: 2026-10-29T10:00:00.000Z
    artifact: ddd-03-test-report.md

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