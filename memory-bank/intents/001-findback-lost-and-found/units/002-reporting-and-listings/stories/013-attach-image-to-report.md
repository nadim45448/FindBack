---
id: 013-attach-image-to-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-8]
---

# Story: 013-attach-image-to-report

User Story

**As a** member or administrator
**I want** an image attached to a report and delivered privately
**So that** an item can be recognised without exposing photos to the wrong viewers

Acceptance Criteria

- [ ] **Given** an `Active` member creating a Lost or Found report, **When** they attach an image, **Then** the image is stored with the report under the `reports/{reportId}/` prefix
- [ ] **Given** an uploaded image whose declared size exceeds 5 MB, **When** it is validated, **Then** it is rejected with the FR-8 error copy and nothing is stored
- [ ] **Given** an uploaded image whose MIME type is not JPEG, PNG, or WebP, **When** it is validated, **Then** it is rejected and nothing is stored
- [ ] **Given** an uploaded image, **When** it is validated, **Then** its magic bytes are sniffed and the sniffed type must match the declared type, otherwise it is rejected
- [ ] **Given** an uploaded image, **When** its actual byte length is determined, **Then** it is counted from the stream rather than trusted from `Content-Length`
- [ ] **Given** an uploaded image declaring a valid type, **When** the bytes turn out not to match that type, **Then** the file is rejected rather than truncated or coerced
- [ ] **Given** an uploaded image with a pixel count above 40 MP, **When** its header is decoded, **Then** it is rejected before any full image data is decoded
- [ ] **Given** any uploaded image, **When** its filename is received, **Then** the filename is discarded entirely and is never used in a pathname
- [ ] **Given** an upload from a member who is not `Active`, **When** the upload is attempted, **Then** it is refused
- [ ] **Given** an upload that would exceed the configured blob storage quota, **When** the quota is checked before writing, **Then** the upload is rejected with a clear administrator-visible error
- [ ] **Given** an upload that would exceed the configured blob storage quota, **When** the rejection occurs, **Then** no existing image is auto-deleted and no upgrade is performed silently
- [ ] **Given** a blob upload that fails, **When** the write is in progress, **Then** the owning report record is not created, because the upload is part of the write
- [ ] **Given** a stored report image, **When** an anonymous visitor requests it, **Then** the request is refused
- [ ] **Given** a stored report image, **When** an unrelated `Active` member requests it, **Then** the request is refused
- [ ] **Given** a stored image on a Found report, **When** the claimant on that report requests it, **Then** the request is refused, because an image is not ownership evidence
- [ ] **Given** a stored image on a Lost report, **When** a recovery responder requests it, **Then** the request is refused, because a responder must not see another candidate's image
- [ ] **Given** a stored image on a report, **When** the member who authored that report requests it, **Then** the image is delivered
- [ ] **Given** a stored image on a report, **When** an administrator requests it, **Then** the image is delivered for moderation and verification
- [ ] **Given** any image read request, **When** the route handler runs, **Then** the requester is resolved, the owning entity is loaded, and the FR-39 matrix is applied immediately before the blob read
- [ ] **Given** an image read request, **When** authorization is evaluated, **Then** the check does not rely on CDN or middleware behaviour and runs in the route handler adjacent to the blob read
- [ ] **Given** a delivered image, **When** it is streamed, **Then** the response carries `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and a `Content-Type` taken from a server-side allowlist rather than from user input or stored blob metadata
- [ ] **Given** a delivered image, **When** response headers are set, **Then** `Cache-Control` is `private, no-cache` and no `s-maxage` is set on the private response
- [ ] **Given** a stored blob, **When** it is addressed directly by URL, **Then** it is not publicly fetchable and access mode is private and immutable after store creation
- [ ] **Given** an administrator replacing an image on a non-terminal report, **When** the replacement is uploaded, **Then** a new blob is written, the old blob is deleted, and the replacement is recorded as a `Report edited by Administrator` audit record
- [ ] **Given** an image upload, **When** the upload completes, **Then** no email is sent, because an image failure never blocks email and an image success never triggers a notification

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
