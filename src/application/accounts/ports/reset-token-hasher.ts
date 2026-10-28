/**
 * The reset-token hasher port.
 *
 * **This bolt has two keyed digests, and they are not the same thing.**
 *
 * | Digest | Input | Purpose |
 * |--------|-------|---------|
 * | **The reset token's hash** | The token's **random** plaintext | Lets the server find the token row by presenting the token |
 * | **The rate-limit bucket key** | The **email address** | Stops the counter table becoming a list of addresses |
 *
 * They are separate ports with separate secrets, because they have separate
 * purposes, separate blast radii, and separate rotation schedules (ADR-19).
 * Conflating them would couple the reset flow's security to the rate
 * limiter's, for no gain.
 *
 * This port is the **first** one. The second — the bucket key — is a
 * separate concern and lives with the rate limiter's configuration.
 */

import type { ResetTokenHash, ResetTokenPlaintext } from '@/domain/accounts';

/** Hashes a reset token, and verifies one against its hash. */
export interface ResetTokenHasher {
  /**
   * The digest of a token's plaintext.
   *
   * **Keyed, not a bare SHA-256.** The token's plaintext is 256 bits of
   * CSPRNG entropy, so a bare SHA-256 would not be dictionary-reversible —
   * but a keyed digest costs nothing (it is the same `createHmac` call the
   * CSRF store already makes) and it removes the "is the token high-entropy
   * enough?" question from the codebase entirely.
   */
  hash(plaintext: ResetTokenPlaintext): ResetTokenHash;

  /**
   * Verify a token's plaintext against its digest.
   *
   * The comparison is **constant-time**, per the coding standard.
   */
  verify(plaintext: ResetTokenPlaintext, hash: ResetTokenHash): boolean;
}
