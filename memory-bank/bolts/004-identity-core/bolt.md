---
id: 004-identity-core
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-self-registration
  - 002-administrator-review-of-registrations
  - 003-login-with-active-account
  - 005-logout-revokes-session
  - 006-pending-member-restricted-access
  - 007-owner-rejects-registration
created: 2026-10-23T13:06:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
enables_bolts:
  - 005-identity-security
  - 007-reporting-core
  - 012-web-public
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 004-identity-core

## Overview

The account lifecycle and the `ActorContext` every other unit consumes.

## Objective

Deliver registration, administrator review, login, logout, and the restricted
state of a `Pending` account, so that every later unit has an actor to act as.

## Stories Included

- **001-self-registration**: register into `Pending`, no email sent (Must)
- **002-administrator-review-of-registrations**: approve or reject, approval sends FR-27 email (Must)
- **003-login-with-active-account**: login, with one generic message for every inactive status (Must)
- **005-logout-revokes-session**: session row revoked, cookie cleared (Must)
- **006-pending-member-restricted-access**: a `Pending` account can do nothing except wait (Must)
- **007-owner-rejects-registration**: rejection reason audited, never shown (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): every lifecycle action writes an audit record

### Enables
- 005-identity-security
- 007-reporting-core
- 020-web-profile

## Success Criteria

- [ ] Registration creates a `Pending` account and sends no email
- [ ] Approval activates the account and fires FR-27; rejection does not send email
- [ ] `Pending`, `Rejected`, and `Deactivated` all produce the same generic login message
- [ ] A `Pending` account cannot report, claim, respond, message, or reach an admin surface
- [ ] `ActorContext` carries status so downstream units do not re-derive it
- [ ] Sessions are database rows, revocable server-side
- [ ] The rejection reason is visible in audit and absent from every user-facing response

## Notes

Six stories is at the upper limit of the 5–6 grouping rule. They stay together
because login is untestable without registration and approval, and because the
generic-message anti-enumeration requirement can only be verified against all
four inactive paths at once.

Deactivation is deliberately excluded and sits in the next bolt with the
security work, since its defining property is session revocation.