---
bolt: 005-identity-security
created: 2026-10-28T15:45:00Z
status: accepted
superseded_by: null
---

# ADR-19: Key the reset rate-limit bucket's email address with an HMAC, while the login bucket keeps the plaintext address

## Context

ADR-15 settled **where** the rate-limit counters live: a database-backed
fixed-window counter behind a `RateLimiter` port, with the bucket key stored in
a plaintext `bucketKey` column. Bolt `004`'s login route therefore uses

```text
login:email:${emailBucket}
```

— the **plaintext normalized address** — as the key. That is what ADR-15
records, and it was the right call there.

The reset flow needs a second email-scoped bucket, and it needs it to be
different. The reason is FR-51, which this bolt implements:

> - the response must not disclose whether the email is registered, whether the
>   account exists, or the account's status.

### Why the login precedent does not transfer unchanged

ADR-15's own reasoning for keeping the plaintext address on the login path
was explicitly situational:

> Bolt `004`'s login route uses `login:email:${emailBucket}` — the **plaintext
> address** — as the key. That is acceptable there because the counter table is
> an operational table, not a disclosure surface to the caller.

The reset flow's defining requirement is stricter in kind. It is not only that
the **caller** must not learn whether an account exists; the requirement is
that **nothing observable** reveals it. The counter table is not returned to
the caller — that is true on the login path too — but the counter table is
**reachable by anyone with database read access**, and a readable list of "which
addresses were requested" is precisely the enumeration FR-51 forbids, one
layer down.

Stage 1 made this the model's rule:

> **The email-scoped reset bucket's key is a hash of the normalized address,
> never the address itself.** The IP bucket's key is the IP address, because an
> IP is not an account attribute and reveals nothing about whether an account
> exists.

### The constraint that rules out an ordinary hash

The obvious implementation — `createHash('sha256')(address)` — is **not
adequate**, and this is the part worth recording carefully.

An email address is drawn from a **small and well-known address space**. The
set of addresses at a university, the set of addresses at a company, and the
set of plausible addresses generally are all enumerable by a machine, and
rainbow tables for them are a commodity. An **unsalted** SHA-256 of an email
address is therefore **trivially reversible**: an attacker with read access to
the counter table enumerates candidate addresses, hashes each, and recovers
the plaintext key. The digest buys nothing against this threat, because the
input space is the weakness.

**A keyed digest (HMAC) is the minimum.** With a per-deployment secret the
digest cannot be reversed without the secret, so the counter table cannot be
turned into a list of addresses even by someone with full read access.

## Decision

**The reset flow's email-scoped rate-limit bucket key is an HMAC of the
normalized address, keyed with a dedicated per-deployment secret:**

```text
bucketKey = `reset:email:${hmacSha256(normalizedAddress, AUTH_RESET_BUCKET_HASH_SECRET)}`
```

**The secret is required and its absence fails loudly at startup.** A missing
or empty `AUTH_RESET_BUCKET_HASH_SECRET` is a startup failure — it does not
fall back to an unkeyed digest, because an unkeyed fallback would silently
downgrade exactly the property the key exists to provide. A deployment that
appears to be protected but is not is worse than one that fails to start.

**The secret is separate from every other secret in the system.** It is not
`SESSION_SECRET`, and it is not the reset token's hashing secret. Deriving one
from another couples their rotation schedules for no security gain, and the
reset flow should survive a session-secret rotation without invalidating
outstanding reset tokens.

**The IP bucket's key remains the plaintext IP address**, because an IP is not
an account attribute and reveals nothing about whether an account exists.

**The login path is unchanged.** Its email bucket keeps the plaintext address,
as ADR-15 recorded. This ADR does not revisit that decision — it records the
one place where the two paths differ, and why the difference is deliberate.

### A note on the reset token's own digest

This bolt introduces a **second** keyed digest, with a **different** key and a
**different** purpose. They must not be conflated:

| Digest | Input | Key | Purpose |
|--------|-------|-----|---------|
| **Reset token hash** | The token's **random** plaintext | `AUTH_RESET_TOKEN_HASH_SECRET` | Lets the server find the token row by presenting the token |
| **Bucket key** | The **email address** | `AUTH_RESET_BUCKET_HASH_SECRET` | Stops the counter table becoming a list of addresses |

The token's plaintext is 256 bits of CSPRNG entropy, so a bare SHA-256 of it
would not be dictionary-reversible — but a keyed digest is used anyway,
because it costs nothing (`createHmac('sha256', …)` is the same call the CSRF
store already makes) and it removes the "is the token high-entropy enough?"
question from the codebase entirely. **The bucket key has no such luxury**:
its input is small and well-known, and it *must* be keyed.

## Rationale

**The threat is specific and realistic.** The counter table is operational
data, and operational data is read by whoever administers the deployment and
whoever has database credentials — including backups, replicas, and
connection-pooled access. On the login path that reader learns which addresses
have *failed* to log in, which is a nuisance. On the reset path the same
reader learns **which addresses have accounts that someone tried to recover**,
which is a targeted account list, and — combined with a successful reset
request for a known address — an account-existence oracle for the whole
deployment's membership.

**The distinction is one of degree, and it is the degree that matters.**
Neither key reaches the *caller*. But the login path's key discloses a
**failed authentication**, which is a fact about an attempt; the reset path's
key discloses a **registered account**, which is a fact about the account
itself. The second is the enumeration FR-51 names. The difference is not
cosmetic, and it is why the departure from ADR-15's precedent is deliberate
rather than an inconsistency.

**A keyed digest is the minimum that actually works here.** The reasoning
above — the small, well-known input space — is what rules out the unsalted
hash. It is worth stating in the ADR because the failure mode is subtle: an
unsalted digest *looks* like it protects the address, because the address is
not readable in the table, and the protection evaporates against exactly the
attacker it was meant to stop.

**Failing loudly at startup is the right behaviour for a missing secret.**
Every other configuration value in this codebase falls back to a documented
default — ADR-15's rate limits, ADR-12's work factors, ADR-17's token
lifetime. The difference here is that there is **no safe default**. The
fallback for a missing bucket-key secret would be an unkeyed digest, and an
unkeyed digest is the thing this ADR exists to forbid. A startup failure is
loud, immediate, and impossible to mistake for working protection.

**The two secrets are separate so their rotation schedules are independent.**
The bucket key protects *operational* data; the token key protects
*credentials*. They have different blast radii and different reasons to
rotate. A shared secret would rotate them together and couple them for no
gain.

**The IP bucket is left in plaintext deliberately.** An IP address is not an
account attribute — it does not identify a member, and it is not derived from
anything in the account table — so hashing it would protect nothing while
making the counter table harder to operate. The rule is not "hash every key";
it is "**do not let the counter table disclose account attributes**".

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Plaintext address in the bucket key** — the ADR-15 login precedent | Simple; no secret to manage; the counter table stays human-readable | The counter table becomes a list of "which addresses were reset" — the enumeration FR-51 forbids, one layer down | Accepted on the login path where the key discloses a *failed attempt*; rejected here where it discloses *registered accounts*. |
| **An unsalted SHA-256 of the address** | No secret to manage; the address is not readable in the table | **Trivially reversible.** The address space is small and well known, so the digest can be reversed by dictionary attack — the protection evaporates against exactly the attacker it was meant to stop | The subtlety is the point: an unsalted digest *looks* protective and is not. |
| **A per-deployment salt** rather than a key | Prevents precomputation across deployments | A salt is **public by definition** — it is stored alongside the digests — so it does not stop a dictionary attack; it only stops cross-deployment rainbow tables | A salt cannot do a key's job. The threat here is a dictionary attack, not a precomputation. |
| **A password KDF (Argon2id) over the address** | Very strong against dictionary attack | ~81 ms per rate-limit check, on a path that must itself be timing-equalised — and the KDF's salt is public, so it is still a dictionary attack against a known candidate set, just slower | The wrong tool. HMAC with a secret key is the standard answer for keyed lookup keys, and it is fast enough that the timing equaliser absorbs it. |
| **An opaque random bucket id, mapped to the address in a protected table** | The counter table holds no address at all | A second table, a second transaction, and a lookup that is itself keyed — the same mechanism wearing more machinery, and a new thing to get wrong | An HMAC achieves the same property in one column, with no additional state. |
| **Key the login bucket too, for consistency** | One convention across the codebase | Changes a working, tested path for no security gain, and changes ADR-15's recorded decision | Consistency is not a reason to change a decision whose reasoning is still sound. This ADR records the difference instead. |

## Consequences

### Positive

- The counter table **cannot be reversed into a list of addresses**, even by
  someone with full database read access, because the digest is keyed with a
  secret that is not stored alongside it.
- The deployment has **one** place where the account-existence property is
  enforced on operational data, and it is enforced by a mechanism whose
  failure mode is loud rather than silent.
- The reset token's digest and the bucket key use **independent secrets**, so
  either can be rotated without invalidating the other — and rotating the
  bucket key does **not** invalidate outstanding reset tokens.
- The IP bucket stays readable, so the counter table remains operable for the
  operational work ADR-15's daily sweep and any future inspection.
- The departure from ADR-15's login precedent is **recorded**, so a future
  reader who finds two different key shapes does not have to re-derive the
  reasoning or assume one of them is a mistake.

### Negative

- The reset bucket key is **not human-readable**, so an operator reading the
  counter table cannot see which address a row belongs to. The daily sweep
  and the counter's own behaviour are unaffected; only manual inspection is
  harder.
- One more **required secret** to provision, rotate, and keep out of the
  database — and its absence **stops the application from starting**, which
  is a deliberate availability trade for a security property.
- The reset and login rate-limit buckets now have **different key shapes**,
  which is a small amount of cognitive overhead in the codebase.

### Risks

- **The secret could end up in the repository or in a log.** *Mitigation:* the
  coding standards forbid secrets in logs and the construction phase guardrails
  forbid hardcoded secrets; the secret is an environment variable, and it is
  **not** derived from `SESSION_SECRET`, so a leak of one does not expose the
  other. It must be in the deployment's secret store and in `.env.example` as
  a **commented placeholder only**, never a real value.
- **A deployment could provision a weak or shared secret.** *Mitigation:* the
  secret is documented as per-deployment and required — a missing one fails
  startup, and there is no default that a careless operator would inherit
  without noticing.
- **The bucket key changes if the secret is rotated**, which resets the
  counter's bucketing — a member who has just hit the limit could request
  again. *Mitigation:* the consequence is a rate limit that is briefly
  forgotten, which is the safe direction (the limit is a throttle, not an
  authorisation), and rotation is rare. The existing counters' rows become
  inert and are removed by the daily sweep.
- **A future developer could "simplify" the key back to the plaintext
  address for consistency with the login path.** *Mitigation:* this ADR
  exists for exactly that reader, and it states the reason the two paths
  differ rather than leaving the difference to look like an oversight.

## Related

- **Stories**: 008-reset-request-never-discloses-account
- **Requirements**: FR-51
- **Standards**: `memory-bank/standards/tech-stack.md` ($0 hard ceiling; no paid service), `memory-bank/standards/coding-standards.md` (no secret in a log; constant-time comparison), `memory-bank/standards/data-stack.md` (the counter table's role)
- **Previous ADRs**: ADR-15 (the database-backed rate limiter and the plaintext bucket key on the login path), ADR-14 (the shared `EmailSender` port and the rate limiter's shared-port status)
- **Related artifacts**: `memory-bank/bolts/005-identity-security/ddd-01-domain-model.md` ("The rate-limit key is a hash"), `memory-bank/bolts/005-identity-security/ddd-02-technical-design.md` ("The two keyed digests, and why they are different")
