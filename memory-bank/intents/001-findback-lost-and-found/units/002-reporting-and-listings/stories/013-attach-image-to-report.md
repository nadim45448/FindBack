---
id: 013-attach-image-to-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 010-reporting-images
implemented: true
traces_to: [FR-8]
---

# Story: 013-attach-image-to-report

User Story

**As a** member or administrator
**I want** an image attached to a report and delivered privately
**So that** an item can be recognised without exposing photos to the wrong viewers

Acceptance Criteria

- [x] **Given** an `Active` member creating a Lost or Found report, **When** they attach an image, **Then** the image is stored with the report under the `reports/{reportId}/` prefix
      — *`report-creation-service.test.ts` → "mints the report id before the upload, and namespaces the blob by it"*
- [x] **Given** an uploaded image whose declared size exceeds 5 MB, **When** it is validated, **Then** it is rejected with the FR-8 error copy and nothing is stored
      — *`blob-image-store.test.ts` → "refuses an image larger than 5 MB"*
- [x] **Given** an uploaded image whose MIME type is not JPEG, PNG, or WebP, **When** it is validated, **Then** it is rejected and nothing is stored
      — *`blob-image-store.test.ts` → "refuses a content type the PRD does not name"*; also `admin/reports/[id]/edit/route.test.ts` → "refuses an image part of a type the PRD does not name with a 400"
- [x] **Given** an uploaded image, **When** it is validated, **Then** its magic bytes are sniffed and the sniffed type must match the declared type, otherwise it is rejected
      — *`blob-image-store.test.ts` → "refuses a file whose bytes disagree with its declared type"*, "refuses a file whose bytes match no image signature"*
- [x] **Given** an uploaded image, **When** its actual byte length is determined, **Then** it is counted from the stream rather than trusted from `Content-Length`
      — *`parse-report-request.test.ts` → "counts the bytes it actually read, not the size the part claims"*
- [x] **Given** an uploaded image declaring a valid type, **When** the bytes turn out not to match that type, **Then** the file is rejected rather than truncated or coerced
      — *`blob-image-store.test.ts` → "refuses a file whose bytes disagree with its declared type"*
- [x] **Given** an uploaded image with a pixel count above 40 MP, **When** its header is decoded, **Then** it is rejected before any full image data is decoded
      — *`blob-image-store.test.ts` → "refuses an image with more than forty megapixels"*, "refuses a decompression bomb in every format"*
- [x] **Given** any uploaded image, **When** its filename is received, **Then** the filename is discarded entirely and is never used in a pathname
      — *`blob-image-store.test.ts` → "discards the original filename entirely"*
- [x] **Given** an upload from a member who is not `Active`, **When** the upload is attempted, **Then** it is refused
      — *`reports-route.test.ts` → "refuses a Pending actor's upload with a 403"*, "stores nothing when it refuses a Pending actor's upload"*
- [x] **Given** an upload that would exceed the configured blob storage quota, **When** the quota is checked before writing, **Then** the upload is rejected with a clear administrator-visible error
      — *`image-quota-enforcement.test.ts` → "refuses an upload one byte over the remaining space"*; the administrator's view is `storage-usage.test.ts` → "says uploads are being refused when the budget is spent"
- [x] **Given** an upload that would exceed the configured blob storage quota, **When** the rejection occurs, **Then** no existing image is auto-deleted and no upgrade is performed silently
      — *`image-quota-enforcement.test.ts` → "never deletes an existing image to make room"*; also `domain/listings/image-quota.test.ts` → "never deletes an existing image to make room"*
- [x] **Given** a blob upload that fails, **When** the write is in progress, **Then** the owning report record is not created, because the upload is part of the write
      — *`report-creation-compensation.test.ts` → "creates no report when the upload fails"*
- [x] **Given** a stored report image, **When** an anonymous visitor requests it, **Then** the request is refused
      — *`report-image-delivery-service.test.ts` → "refuses an anonymous viewer"*, "reads nothing for an anonymous viewer"*
- [x] **Given** a stored report image, **When** an unrelated `Active` member requests it, **Then** the request is refused
      — *`report-image-delivery-service.test.ts` → "refuses an unrelated member"*, "reads no blob for an unrelated member"*
- [x] **Given** a stored image on a Found report, **When** the claimant on that report requests it, **Then** the request is refused, because an image is not ownership evidence
      — *`report-image-delivery-service.test.ts` → "refuses a claimant, whose column grants the image field"*; also `domain/listings/image-delivery.test.ts` → "refuses a claimant, even though their column grants the image field"*
- [x] **Given** a stored image on a Lost report, **When** a recovery responder requests it, **Then** the request is refused, because a responder must not see another candidate's image
      — *`report-image-delivery-service.test.ts` → "refuses a recovery responder"*; also `domain/listings/image-delivery.test.ts` → "refuses a recovery responder, even though their column grants the image field"*
- [x] **Given** a stored image on a report, **When** the member who authored that report requests it, **Then** the image is delivered
      — *`report-image-delivery-service.test.ts` → "delivers to the member who authored the report"*
- [x] **Given** a stored image on a report, **When** an administrator requests it, **Then** the image is delivered for moderation and verification
      — *`report-image-delivery-service.test.ts` → "delivers to the administrator"*
- [x] **Given** any image read request, **When** the route handler runs, **Then** the requester is resolved, the owning entity is loaded, and the FR-39 matrix is applied immediately before the blob read
      — *`report-image-delivery-service.test.ts` → "reads the blob only after the authorisation"* (asserts the event order `['load-image', 'read-blob']`)*
- [x] **Given** an image read request, **When** authorization is evaluated, **Then** the check does not rely on CDN or middleware behaviour and runs in the route handler adjacent to the blob read
      — *`image-route.test.ts` → "never reads the blob itself"*; the route's only seam is the use case, and the check sits inside it, immediately before the read — `report-image-delivery-service.test.ts` → "reads the blob only after the authorisation"*
- [x] **Given** a delivered image, **When** it is streamed, **Then** the response carries `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and a `Content-Type` taken from a server-side allowlist rather than from user input or stored blob metadata
      — *`image-route.test.ts` → "sets nosniff", "sets inline disposition", "serves the server-set content type"*; the type comes from the bytes via `blob-image-reader.test.ts` → "reports a type the bytes carry, not one the store recorded"*
- [x] **Given** a delivered image, **When** response headers are set, **Then** `Cache-Control` is `private, no-cache` and no `s-maxage` is set on the private response
      — *`image-route.test.ts` → "sets a private, no-cache cache control", "never sets s-maxage"*; also `domain/listings/image-content-type.test.ts` → "never sets s-maxage"*
- [x] **Given** a stored blob, **When** it is addressed directly by URL, **Then** it is not publicly fetchable and access mode is private and immutable after store creation
      — *`blob-image-store.test.ts` → "never asks for public access, on any upload"* (asserts `access: 'private'` on every upload). The *immutability* half is a store-level platform property of Vercel Blob's access mode, fixed at store creation; it is configuration, not code, and has no runtime assertion.*
- [x] **Given** an administrator replacing an image on a non-terminal report, **When** the replacement is uploaded, **Then** a new blob is written, the old blob is deleted, and the replacement is recorded as a `Report edited by Administrator` audit record
      — *`report-administrator-edit-service.test.ts` → "stores the new blob and writes its path", "deletes the replaced blob after the commit", "names the image replacement in the audit record"*; the route is `admin/reports/[id]/edit/route.test.ts` → "hands the replacement image to the use case", "replaces the image without changing any text field"*
- [x] **Given** an image upload, **When** the upload completes, **Then** no email is sent, because an image failure never blocks email and an image success never triggers a notification
      — *`report-creation-service.test.ts` → "sends no notification when the upload succeeds", "sends no notification when the upload fails"*

### The administrator's view of the budget (image-handling §4)

image-handling §4 says to *"Warn at 70% and 90% of quota. Refuse at 100%"*, and to *"Surface current bytes … and remaining headroom to administrators"*. The refusal lives on the write path; the warnings needed a surface an administrator opens, so the budget has **its own page** — `/admin/storage` — rather than a fifth dashboard tile, because §15.1 freezes the dashboard at four and the story's criteria name the absences as load-bearing.

- [x] The administrator can see the current bytes, the remaining headroom, and the percentage — `storage-usage.test.ts` → "reports the bytes used, the bytes remaining, and the budget"; `admin-storage-surface.test.ts` → "shows the bytes used, the bytes remaining, and the budget"
- [x] The warning bands are the write path's bands, asserted against the domain's constants rather than against literals — `storage-usage.test.ts` → "names the warning threshold as the write path names it", "names the critical threshold as the write path names it", "names seventy and ninety percent"
- [x] The page names where the lines are, so "92% used" is interpretable — `admin-storage-surface.test.ts` → "names the warning and critical lines"
- [x] A non-administrator is refused before anything is read — `storage-usage-query.test.ts` → "refuses a non-administrator before the reader runs"
- [x] A failed read is a rendered error, and the page never shows a number it did not read — `storage-usage-query.test.ts` → "reports a failed read as an error rather than throwing", "never reports a number it did not read"; `admin-storage-surface.test.ts` → "shows no number at all when the read failed"

Technical Notes

- This story implements the FR-8 image field and follows `standards/image-handling.md` in full: validation, FR-39 authorization, private delivery, quota, and failure handling.
- Upload is allowed only to an `Active` member creating a Lost or Found report, to an `Active` member submitting a Recovery Response candidate image (FR-44, Unit 004), or to an administrator replacing an image on a non-terminal report under FR-53.
- Validation is server-side and rejects rather than truncates. Magic-byte sniffing must match the declared MIME type; a `.jpg` that is actually HTML or SVG would execute in the origin of whatever serves it.
- The pixel-count check runs before any full decode, bounding decompression-bomb cost.
- Authorization is enforced in the route handler immediately adjacent to the blob read, never delegated to the CDN or middleware. A cached private response served to the wrong viewer is a data leak.
- Private responses set `Cache-Control: private, no-cache` so browser revalidation runs auth on every request while allowing cheap 304s. `s-maxage` is never set on a private image response.
- Storage is attributed per entity via the `reports/{entityId}/` and `recovery-responses/{rrId}/` prefixes, supporting the FR-10 cleanup rule where the blob is deleted in the same operation as the row.
- Blobs are uploaded with `addRandomSuffix` and never overwritten. Quota is checked before writing on every upload; administrators are warned at 70% and 90% and refused at 100%.
- There is no automated image moderation. Moderation is the administrator's manual review only (FR-36, A3); adding scanning would expand scope against a frozen PRD.
- The blob store region must match the database region and cannot be changed after creation.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report
- 010-visibility-matrix-by-actor

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| File named `photo.jpg` containing HTML | Rejected by magic-byte mismatch |
| Declared 1 MB but streams 8 MB | Rejected; the stream is counted, not the header |
| Image of 45 MP | Rejected at header decode before full decode |
| SVG or any active content type | Rejected; not supported |
| Anonymous user holds the direct blob URL | Refused; the blob is not publicly fetchable |
| Correct viewer revalidates with `If-None-Match` | Cheap 304 after auth runs on the request |
| Quota exceeded mid-upload | Rejected before writing; existing images are untouched |
| Blob read fails mid-stream | 500 with a neutral message; no partial or wrong-type body |
| Administrator replaces an image on a `Closed` report | Blocked; replacement follows the FR-53 non-terminal rule |
| Recovery Response candidate image requested by a competing responder | Refused |

Out of Scope

- Automated image content moderation (FR-36 — manual administrator review only)
- Proof-of-ownership uploads (PRD constraint)
- Image processing beyond decode-bound checks
- Delivery of Recovery Response candidate images (Unit 004) beyond the shared authorization and storage rules
- Blob store region configuration (one-time setup)
