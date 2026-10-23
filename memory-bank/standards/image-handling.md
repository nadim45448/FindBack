---
standard: image-handling
status: approved
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
decided_by: user
scope: FR-8 image field, FR-37 sensitive fields, FR-39 visibility, FR-53 replacement, FR-10 cleanup, OQ-2
---

# Image Handling

The PRD allows an **optional image** per report (FR-8) and marks it a
**Sensitive Field** governed by FR-37/FR-39. The hosting choice is **Vercel Blob
Private Storage within verified free-tier limits only**. This standard defines how
that is done without leaking an image and without exceeding 1 GB.

---

## 1. Validation (before anything is stored)

Validate server-side. Client-side checks are UX affordances only and are never
trusted.

| Check | Rule | On failure |
|---|---|---|
| Declared size | ≤ 5 MB (FR-8) | Reject with the FR-8 error copy |
| Actual byte length | Read the stream and count; do not trust `Content-Length` | Reject, do not truncate |
| MIME type | JPEG, PNG, WebP only (FR-8) | Reject |
| Magic bytes | Sniff the file header and **require it to match the declared type** | Reject |
| Dimensions | Decode header; reject absurd pixel counts (> 40 MP) to bound decode cost | Reject |
| Filename | Discard entirely — never used in a pathname | n/a |

**Why magic bytes:** a `.jpg` that is actually an HTML or SVG payload can execute in
the origin of whatever serves it. Content sniffing is the control that closes that.

**Decompression-bomb defense:** the pixel-count check must run before any decode of
full image data.

**Moderation:** PRD A3 states image moderation is the administrator's manual review
only (FR-36). There is **no automated scanning**, and none may be added — that would
be scope expansion against a frozen PRD.

## 2. Authorization (who may upload, who may read)

**Upload** is allowed only to an **Active Member**, and only in the two places the
PRD defines:

- creating a Lost or Found report (FR-6, FR-7) as that member
- submitting a Recovery Response's candidate image (FR-44)
- replacing an image as an Administrator under FR-53 — **non-terminal reports only**,
  recorded as a `Report edited by Administrator` audit record

**Read** is decided by the FR-39 visibility matrix, evaluated at the API layer
(PRD §10 Security), then resolved per image:

| Viewer | Image visibility |
|---|---|
| Anonymous | **Never** — anonymous users see summary listings only (FR-12, FR-38) |
| Unrelated Active member | **Never** |
| Report owner | Own report image: yes |
| Claimant on that Found report | No (image is not ownership evidence; FR-37) |
| Recovery responder | **Never** — a responder must not see another candidate's image |
| Lost-report owner | Yes, for **their own** Lost report |
| Administrator | Yes — moderation (FR-36) and verification (FR-45) require it |

Enforcement rule: **never rely on the CDN or middleware for this check.** A cached
private response served to the wrong viewer is a data leak. Auth is verified in the
route handler immediately adjacent to the blob read.

## 3. Private access and delivery

- Store with `access: 'private'`. **Access mode is immutable after store creation** —
  this decision cannot be reversed later.
- The blob URL is `https://<store-id>.private.blob.vercel-storage.com/<path>`. It is
  **not publicly fetchable**; a bare URL hit returns 403.
- Serve through a dedicated authenticated route handler that:
  1. resolves the requester,
  2. loads the owning entity,
  3. applies the FR-39 matrix for that entity,
  4. **only then** calls `get(path, { access: 'private' })`,
  5. streams the result with `X-Content-Type-Options: nosniff`,
     `Content-Disposition: inline`, and a **server-set** `Content-Type` from a
     server-side allowlist — never from user input or the blob's stored metadata.
- Response headers: `Cache-Control: private, no-cache`. This keeps browser
  revalidation (so auth runs every request) while allowing cheap 304s via
  `If-None-Match`. **Never** set `s-maxage` on a private image response.
- Do not support user-supplied SVG or any active content type.

## 4. Cost discipline (the 1 GB ceiling)

Blob metering averages 15-minute snapshots across the month, so the budget must be
enforced continuously, not checked at month end.

| Measure | Mechanism |
|---|---|
| Storage bytes | Track cumulative blob bytes per deployment; compare against a configured quota on **every upload**, before writing |
| Over-quota | **Reject the upload** with a clear administrator-visible error. Never silently accept, never auto-upgrade, never auto-delete an existing image |
| Report/Recovery Response images | Stored under `reports/{entityId}/` and `recovery-responses/{rrId}/` prefixes so usage is attributable per entity |
| FR-10 hard delete | Delete the blob **in the same operation** as the row delete. This is the PRD's own retention rule and the main mechanism that frees space |
| Delete operation | Blob deletes are **free of charge** — deleting is always preferable to retaining |
| Immutable blobs | Upload with `addRandomSuffix`; never overwrite. FR-53 replacement uploads a new blob and deletes the old one |
| Reporting | Surface current bytes, this month's Simple/Advanced operation counts, and remaining headroom to administrators |

Warn at 70% and 90% of quota. Refuse at 100%.

## 5. Failure handling

| Failure | Behavior |
|---|---|
| Validation rejects | 400 with the FR-8 field error. Nothing stored |
| Blob upload fails | **The owning record is not created.** Upload is part of the write, not a follow-up |
| Blob delete fails on FR-10 hard delete | Record the orphan in a retry queue; do not silently leak. Retries are idempotent by pathname |
| Blob read fails mid-stream | 500 with a neutral message; never a partial or wrong-type body |
| Quota exceeded | 429-style business rejection with administrator-visible detail |
| Region mismatch | Store region must match the database region. **Region cannot be changed after creation** — this is a one-time setup decision |

**Email is never blocked by image failure** (PRD §10 Reliability: email send failures
are logged and never block the triggering action). The same principle is applied
here — a storage failure must not leave a half-created report.

---

## Traceability

| Requirement | Covered by |
|---|---|
| FR-8 field set, ≤ 5 MB, JPEG/PNG/WebP | §1 |
| FR-37 sensitive field treatment | §2, §3 |
| FR-39 visibility matrix | §2 |
| FR-36 manual moderation only | §1 (explicit no-automation note) |
| FR-44 Recovery Response candidate image | §2 |
| FR-53 administrator image replacement | §2, §4 |
| FR-10 hard delete | §4, §5 |
| OQ-2 image budget and cleanup | §4 — cleanup answered; byte quota is an Operations config value |