---
id: 006-operational-logging-and-quota
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:53:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-31]
---

# Story: 006-operational-logging-and-quota

User Story

**As the owner**
I want structured logs and honest quota monitoring
**So that** I can tell what happened and know before a free-tier limit stops the app

Acceptance Criteria

- [ ] **Given** any logged operation, **When** the log line is emitted, **Then** it carries requestId, actorId, action, and targetId in a structured format
- [ ] **Given** any log line, **When** it is inspected, **Then** no secret, password hash, or token appears in it
- [ ] **Given** any log line or audit record, **When** it is inspected, **Then** no claim reason, identifying detail, exact place, or thread body appears in it
- [ ] **Given** Vercel Blob storage usage, **When** it reaches 70% or 90% of the 1 GB limit, **Then** a warning is surfaced
- [ ] **Given** Vercel Blob storage is at its 1 GB limit, **When** a new upload is attempted, **Then** the upload is refused
- [ ] **Given** Blob simple operations, advanced operations, data transfer, fast origin transfer, function invocations, or database storage, **When** usage reaches 70% or 90% of its limit, **Then** a warning is surfaced
- [ ] **Given** any quota warning, **When** it is surfaced, **Then** the response is to inform, never to trigger a purchase or a plan upgrade
- [ ] **Given** the project budget of zero dollars, **When** dependencies are evaluated, **Then** no logging, analytics, or APM vendor is added

Technical Notes

- Verified Vercel Hobby limits: Blob 1 GB storage, 10,000 simple ops/month, 2,000 advanced ops/month, 10 GB data transfer/month, 10 GB fast origin transfer/month, 1,000,000 function invocations/month, 1 GB database.
- Refusing uploads at the storage limit is the only automated action. Everything else warns. Surfacing the condition is the whole response, because a $0 budget makes every escalation path a purchase.
- The no-vendor rule is a budget constraint expressed as architecture, not a preference.

Dependencies

Requires
- 001-append-only-audit-writes

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A quota warning repeats on every request | Logged once per threshold crossing, not on every request |
| Upload refused at the storage limit | Member receives a clear refusal; the existing reports remain intact |
| Log volume grows with traffic | No paid tier appears as a consequence |

Out of Scope

- APM, error-tracking, or analytics services
- Automatic scaling or capacity planning
- Any paid Vercel plan