---
bolt: 005-identity-security
created: 2026-10-28T15:40:00Z
status: accepted
superseded_by: null
---

# ADR-17: Set the reset token's lifetime to 1 hour, exposed as configuration

## Context

FR-51 requires a password-reset token that is single-use and time-limited, and
it lists the **duration** among the architecture-owned implementation details:

> - Reset-token expiry duration

So the value is legitimately Architecture's to choose, and the PRD does not
name one.

What makes it more than an internal constant is that **the reset email states
the lifetime**. A member reading the email has to be told how long the link
they are about to click remains valid — otherwise the token's window is
invisible to the person it governs. That makes the duration a
**product-visible** value, and therefore a value the owner should accept rather
than one Architecture should slip in unremarked.

The constraint is a genuine trade-off in both directions:

- A **short** lifetime limits the window in which a stolen link is usable. It
  is also harsh on a member who does not check email promptly — a token
  expiring while they are in a meeting is a reset they must start over.
- A **long** lifetime is comfortable to use, and it widens the window in which
  a link captured from an inbox, a proxy log, or a forwarded message remains
  live.

There is no value that is simply correct. The decision is a judgement about
which failure is worse for this system's users.

## Decision

**The reset token's lifetime is 1 hour**, exposed as configuration with that
value as the default:

```text
AUTH_RESET_TOKEN_TTL_SECONDS = 3600
```

**A malformed, non-positive, or non-numeric value falls back to the default**
rather than failing the request — the same convention ADR-15's rate limits
and ADR-12's Argon2id parameters already use, and the same convention the
owner approved for this value.

**The email renders the configured value, not a constant.** If the lifetime is
configured to 1800, the email says 30 minutes. The member is told the truth
about the window they actually have, and the email cannot contradict the
server's behaviour.

The value is applied at issue time to produce the token's `expires_at`.
**Expiry is enforced on read**, not by a sweeper — a token is dead the moment
its window elapses, whether or not any cleanup job has run. The daily sweep
removes expired rows for storage only and has no effect on correctness.

## Rationale

**The owner chose 1 hour on 2026-10-28.** The question was put to the owner
with the trade-off stated on both sides, and 1 hour was selected.

The reasoning behind that choice, for the record:

- **1 hour is enough for the intended use.** The reset flow exists for a
  member who cannot sign in right now. They request a link, and they use it
  within the hour. A member who wants to reset a password is present at their
  inbox; they are not deferring it.
- **It is short enough to limit a stolen link.** The realistic threat to a
  reset link is not a targeted attacker but an inbox that is later read by
  someone else, or a link captured in a shared or forwarded message. One hour
  contains that exposure to a working day rather than a multi-day window.
- **It is long enough to be usable.** A shorter value — 15 minutes, for
  instance — would expire for a member who reads the email on their phone but
  wants to type the password on their laptop, or who steps away for a meeting.
  The failure mode of an expiring token is a member who cannot recover at all,
  which is the failure this whole flow exists to prevent.
- **It is generous enough to survive a second attempt.** A member who mistypes
  a new password does not need a second email; the same token is still valid.
  This is a real benefit of not choosing an aggressive expiry — the flow has
  no "start over" cost for an ordinary mistake.

**A constant is rejected for the same reason every other value in this
codebase is configuration.** ADR-15's rate limits and ADR-12's Argon2id work
factors are both configured with a chosen default, for the same reason: an
operator must be able to change a value per environment without a code change,
and a future change must be a deliberate configuration edit rather than a
source edit that could drift out of step with the email's text.

**A missing or malformed value falls back rather than failing.** The reset
request is an anti-enumeration endpoint: every well-formed request returns the
same response. A configuration error must not become a distinguishable
outcome — and more practically, a typo in a deployment's environment
variables should not take password recovery down. The fallback is the ADR's
own value, so the safe behaviour is the documented behaviour.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| A shorter lifetime (15 minutes) | Smallest stolen-link window | A member who steps away must restart the whole flow; the token's usability is sensitive to small delays | The failure mode — a member who cannot recover — is worse than the threat it mitigates. The owner did not choose it. |
| A longer lifetime (24 hours) | Most forgiving for the member | A captured link stays live for a full day; the email's stated window is long enough to be ignored | Comfortably outweighs the risk for a low-stakes recovery flow. The owner did not choose it. |
| A hardcoded constant | One less thing to configure | Cannot be tuned per environment; a change is a source edit, and the email's text and the server's behaviour could drift apart | Every comparable value in this codebase is configuration. Consistency, and the drift risk, decide it. |
| The email does not state the lifetime | The value stays internal; the copy is simpler | The member cannot judge urgency, and cannot tell whether a link they just received still works | FR-51 requires the email to carry the reset instructions, and the owner decided the duration is product-visible. An unstated window is a worse experience than a stated one. |
| Failing the request on a malformed configured value | No silent fallback | A configuration typo takes password recovery down for every member, and produces a distinguishable failure | The same argument as ADR-15 and ADR-12. Fall back to the documented default. |

## Consequences

### Positive

- A stolen reset link is usable for **at most an hour**, which contains the
  realistic exposure — a later read of an inbox — to a working day.
- The email tells the member the **real, configured** duration, so the number
  in the message is always the number the server enforces.
- The value can be tuned per environment without a code change — a deployment
  with unusually slow mail delivery could lengthen it, and one with a tighter
  threat model could shorten it.
- A configuration typo degrades to the documented behaviour instead of taking
  recovery down.
- The same token survives an ordinary mistake, because a member who mistypes
  their new password does not need to request another email.

### Negative

- A member who does not act within the hour must request another link, which
  costs them another email and another round trip.
- The email's copy must render the configured duration rather than a fixed
  string, so the lifetime's presentation is slightly more complex than a
  constant would be.

### Risks

- **The email's stated duration could drift from the server's actual
  behaviour** if the copy were ever hardcoded. *Mitigation:* the email
  renders the value from the same configuration object the server uses, and
  Stage 4 must implement it that way — there is exactly one source for the
  number.
- **A deployment could configure a value so long that the security benefit
  disappears.** *Mitigation:* the value is configuration with a safe default,
  and this ADR records the reasoning so that lengthening it is a deliberate
  act with a stated trade-off, not an incidental edit.

## Related

- **Stories**: 008-reset-request-never-discloses-account, 009-reset-password
- **Requirements**: FR-51
- **Standards**: `memory-bank/standards/tech-stack.md` (configuration discipline), `memory-bank/standards/coding-standards.md` (no secret in a log)
- **Previous ADRs**: ADR-12 (Argon2id work factors are configuration with a chosen default), ADR-15 (rate limits are configuration with a chosen default), ADR-16 (expiry is enforced on read, not by a sweeper)
- **Related artifacts**: `memory-bank/bolts/005-identity-security/ddd-01-domain-model.md` (Open item 1), `memory-bank/bolts/005-identity-security/ddd-02-technical-design.md` (Configuration, NFR Implementation)
