---
id: 012-web-public
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: complete
stories:
  - 001-design-foundations-and-theme
  - 002-public-and-authentication-surfaces
created: 2026-10-23T13:10:30Z
started: 2026-10-29T13:00:00Z
completed: 2026-10-29T18:45:00Z
current_stage: test
stages_completed:
  - implement
  - test

requires_bolts:
  - 004-identity-core
  - 005-identity-security
  - 009-reporting-search
enables_bolts:
  - 014-web-threads
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 012-web-public

## Overview

Design foundations, theme switching, and the ten public and authentication surfaces.

## Objective

Stand up the application shell from `DESIGN.md` and render every anonymous and
authentication surface exactly as `EXPERIENCE.md` specifies.

## Stories Included

- **001-design-foundations-and-theme**: tokens, layout, System/Light/Dark (Must)
- **002-public-and-authentication-surfaces**: landing, login, register, pending, rejected, deactivated, forgot password (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [x] **1. plan**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [x] **2. implement**: ✅ complete → source
- [x] **3. test**: ✅ complete → `test-walkthrough.md`

## Dependencies

### Requires
- **004-identity-core** (required): login, register, and account states
- **005-identity-security** (required): the password reset surfaces
- **009-reporting-search** (required): the anonymous summary listing

### Enables
- 013-web-member
- 014-web-threads
- 021-web-admin

## Success Criteria

- [x] All ten public and authentication surfaces render per `EXPERIENCE.md` §9.3, §9.3a, §16
- [x] User-facing copy is verbatim from the spines — error copy from §4.9, status labels from §4.2
- [x] Theme selection persists and respects the System preference
- [x] Reduced motion is honoured
- [x] No administrator surface is reachable from any public route

## Notes

The spines are the contract. If a surface reveals that a spine is ambiguous, stop
and raise it rather than resolving the ambiguity by inventing behaviour — changing
a spine needs explicit owner approval.

### The tokens are written down twice, and a test makes the second copy honest

`src/ui/tokens.ts` holds the values as typed constants; `src/app/globals.css`
holds the same values as CSS custom properties. **A CSS variable cannot be
read from TypeScript, and a token cannot be read by the browser** — so the
values must be written down twice, and `src/ui/tokens.test.ts` is what keeps
the second copy honest. It reads the CSS file from disk and compares every
property against the typed constants.

### The theme menu's rows carry `data-theme-option`, not `data-theme`

The rows are labelled "Light" and "Dark", and the tokens are bound to
`[data-theme='light']` and `[data-theme='dark']`. A row carrying `data-theme`
would **re-theme itself**. The rows carry `data-theme-option` instead, and a
test asserts every row has `data-theme-option` and no `data-theme`.

### The no-flash script is the only thing that can prevent a flash

The theme script is inlined into `<head>` and runs before the browser's first
paint. A React effect runs *after* paint — which is precisely the flash the
requirement forbids.

### A stale-state bug broke the "error clears when the value becomes valid" rule

All three forms re-validated their field from **component state** inside the
change handler. React has not re-rendered at that point, so the re-validation
checked the value the visitor had just *replaced*, and the error never
cleared. The next value is now passed into the re-validation and substituted
over the current values.

**The existing suites could not have caught it**, because they asserted that
the error was *shown* — never that it *cleared*. The three new regression
tests are the ones that would have.

### Three strings are not fixed word-for-word by the spines

The landing paragraph, the registration-confirmation heading, and the
reset-password heading are asserted against the *rule* each serves rather
than against `EXPERIENCE.md`, because the document does not write them. The
story's criterion says *"every user-facing string is taken verbatim from
`EXPERIENCE.md`"*, so these three need either a line in the spines or an
explicit note that they are the spines' delegated wording. **This is recorded
as an owner item in the test report, because it needs the spines' owner — not
a test's decision.**