---
standard: coding-standards
status: approved
created: 2026-10-23T11:28:55Z
updated: 2026-10-23T11:28:55Z
depends_on: tech-stack
posture: test-after, 80% line-coverage floor, CI before merge
---

# Coding Standards

## Overview

Conventions for the Construction agent. Format and lint are enforced by tooling in
CI, not by review comments.

## Code formatting

| | |
|---|---|
| Formatter | Prettier |
| Editor config | `editorconfig` + `.editorconfig`-driven trailing whitespace |
| Print width | 100 |
| Semicolons | Yes |
| Quotes | Single |
| Trailing comma | All |
| Indent | 2 spaces |

Prettier runs in CI; a formatting diff fails the build.

## Linting

| | |
|---|---|
| Linter | ESLint (flat config) + `typescript-eslint` |
| Type checking | `tsc --noEmit`, **required** |
| Rules | Recommended set, plus `no-unused-vars` as error, plus import hygiene |

Additional rule groups enabled because this codebase has specific failure modes:

- **No floating promises** — every async call is awaited or explicitly voided with a
  logged catch. PRD §10 requires that a failed background action is recorded.
- **`no-explicit-any` is an error.** The FR-39 visibility matrix depends on the
  compiler knowing the shape of every actor-scoped projection.
- **Exhaustive switches** over status unions. A non-exhaustive switch on a
  `ReportStatus` or `RecoveryResponseStatus` is a build error — this is the
  mechanical guard behind FR-41's canonical status set.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `recovery-response.ts` |
| Components | PascalCase | `ClaimReviewScreen.tsx` |
| Functions, variables | camelCase | `confirmReturned` |
| Types, interfaces | PascalCase | `VisibilityProjection` |
| Constants | SCREAMING_SNAKE_CASE | `RR_TERMINAL_STATUSES` |
| Database tables | snake_case, plural | `recovery_responses` |
| Prisma models | PascalCase singular | `RecoveryResponse` |

**Status literals are named after the PRD, verbatim.** `Match Confirmed` is
`MATCH_CONFIRMED`; `Completed — Report Returned` is `COMPLETED_REPORT_RETURNED`.
Never rename a status. The PRD, `EXPERIENCE.md` §4.2, and the audit events all use
these exact names.

## File and folder organization

```text
src/
├── app/                  # Next.js App Router — routes and route handlers only
│   ├── (public)/         # anonymous + auth-flow routes
│   ├── (member)/         # authenticated member routes
│   ├── (admin)/          # administrator routes
│   └── api/              # route handlers (image delivery, webhooks, cron)
├── domain/               # pure domain logic — NO I/O, NO framework imports
│   ├── reports/
│   ├── claims/
│   ├── recovery/
│   ├── accounts/
│   └── audit/
├── application/          # use cases orchestrating domain + ports
│   └── ports/            # interfaces the outside world implements
├── infrastructure/       # Prisma, Blob, email, session implementations
├── ui/                   # React components driven by DESIGN.md tokens
└── shared/               # cross-cutting helpers, error types, logging
```

Dependency rule, enforced by an ESLint boundary rule:

```text
domain  →  nothing
application → domain + ports
infrastructure → domain + application ports
app / ui → application
```

`domain/` must be importable and testable with no database, no network, and no
React. State machines (FR-41, FR-42, FR-22) live there as pure functions over
entities and events.

Route handlers stay thin: parse input, call an application use case, map the result
to a response. **No business rules in `app/`.**

## Testing strategy

| | |
|---|---|
| Methodology | **test-after** — implement the layer, then write and run its tests |
| Ordering | Per layer: domain → application → infrastructure → route handler |
| Unit tests | Vitest |
| Integration / component tests | Vitest + Testing Library |
| End-to-end | Playwright, covering UJ-1…UJ-5 |
| Coverage floor | **80% lines**, enforced in CI |
| Existing suite | Must stay green on every merge |

The PRD names five end-to-end journeys with named protagonists. Playwright specs
are written **against those journeys**, using Maya, Sam, Pat, Riley, Alex, and Quinn
as the fixtures, because `EXPERIENCE.md` §8 writes behaviour in terms of those
people.

Coverage is not the goal; the **PRD requirement matrix** is. Every FR-1…FR-53 must
have at least one test that would fail if the requirement were broken. The
requirements index at
`intents/001-findback-lost-and-found/requirements.md` is the checklist.

## Error handling

- Domain errors are **typed and expected** — `NotFoundError`, `PermissionDeniedError`,
  `IllegalTransitionError`, `TerminalStateError`, `QuotaExceededError`. These are
  business outcomes, not failures.
- Anything thrown that is not one of those is a genuine defect and is logged as one.
- Expected errors never produce a stack trace in the response and never surface raw
  text to a member. Copy comes from `EXPERIENCE.md` §4.9.
- **Illegal state transitions are a defect, not a graceful degradation.** FR-41 and
  FR-42 define legal transitions exhaustively; anything else throws and is reported.
- Error copy must match `EXPERIENCE.md` §4.9 exactly. Editing user-facing wording
  while writing code re-opens frozen UX and requires explicit approval.

## Logging

Structured JSON to stdout, one object per event:

```json
{
  "requestId": "…",
  "actorId": "…",
  "actorRole": "member | administrator | anonymous | system",
  "action": "claim.approved",
  "targetType": "claim",
  "targetId": "…",
  "outcome": "success | denied | error",
  "ts": "2026-10-23T11:28:55Z"
}
```

Rules:

- `requestId` on **every** line (PRD §10).
- **Never log** passwords, password-reset tokens, session tokens, Claim reasons,
  identifying details, thread message bodies, or any FR-37 sensitive value. Log
  the *fact* of the action, never its content.
- Audit-trail **reads** are logged separately with administrator ID, query, and
  timestamp (PRD §10) — and are written to the database, not only to stdout,
  because Vercel Hobby retains runtime logs for only 1 hour.

## Security coding rules

- Validate every input at the route boundary. Types are not validation.
- Enforce the FR-39 visibility matrix in the application layer on **every** read
  path, including image delivery. No exceptions, no "the UI hides it".
- Parameterize all queries. No string-concatenated SQL.
- CSRF token required on every state-changing request.
- Rate limits enforced server-side on: registration, login, Claim submission,
  Recovery Response submission, thread posting, and password reset (PRD §10).
- Constant-time comparison for tokens.

## Git

- Trunk-based on `main`, short-lived branches (org policy).
- Conventional commits referencing the FR or ADRs they implement, e.g.
  `feat(claims): atomic approve with competing rejection (FR-17)`.