/**
 * The rate-limit bucket key for an email address.
 *
 * **This is the second of the bolt's two keyed digests**, and it is keyed
 * with `AUTH_RESET_BUCKET_HASH_SECRET` — a secret of its own, separate from
 * `SESSION_SECRET` and from the reset token's hashing secret (ADR-19).
 *
 * **Why the email bucket's key must be a keyed digest, and a bare SHA-256 is
 * forbidden.** An email address is drawn from a **small and well-known
 * address space**. The set of addresses at a university, at a company, and
 * the set of plausible addresses generally are all enumerable by a machine,
 * and rainbow tables for them are a commodity. An **unsalted** SHA-256 of an
 * email address is therefore **trivially reversible**: an attacker with read
 * access to the counter table enumerates candidate addresses, hashes each,
 * and recovers the plaintext key. The digest buys nothing against this
 * threat, because the input space is the weakness.
 *
 * **With a per-deployment secret, the digest cannot be reversed without the
 * secret** — so the counter table cannot be turned into a list of addresses
 * even by someone with full database read access.
 *
 * **Why this matters at all.** The counter table is operational data, and
 * operational data is read by whoever administers the deployment and whoever
 * has database credentials — including backups, replicas, and
 * connection-pooled access. On the login path that reader learns which
 * addresses have *failed* to log in, which is a nuisance. On the reset path
 * the same reader learns **which addresses have accounts that someone tried
 * to recover** — a targeted account list, and the enumeration FR-51 forbids,
 * one layer down.
 *
 * **The IP bucket's key is the plaintext IP address**, because an IP is not
 * an account attribute and reveals nothing about whether an account exists.
 * The rule is not "hash every key"; it is "do not let the counter table
 * disclose account attributes".
 */

import { createHmac } from 'node:crypto';

/**
 * The keyed digest of a normalized email address.
 *
 * The digest is hexadecimal, so it is safe to use as a bucket-key suffix
 * without any escaping.
 */
export class HmacRateLimitBucketKey {
  constructor(private readonly secret: string) {}

  /**
   * The bucket key for an email address.
   *
   * The address is expected to be **normalized** by the caller — trimmed and
   * lower-cased — so `Jane@Example.org` and `jane@example.org` share one
   * bucket and cannot be used to double the allowance.
   */
  keyFor(normalizedAddress: string): string {
    const digest = createHmac('sha256', this.secret)
      .update(normalizedAddress, 'utf8')
      .digest('hex');

    return digest;
  }
}
