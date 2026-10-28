/**
 * The HMAC-based reset-token hasher.
 *
 * **This is the first of the bolt's two keyed digests**, and it is keyed
 * with `AUTH_RESET_TOKEN_HASH_SECRET` — a secret of its own, separate from
 * `SESSION_SECRET` and from the rate-limit bucket's secret (ADR-19).
 *
 * **Why a keyed digest rather than a bare SHA-256.** The token's plaintext is
 * 256 bits of CSPRNG entropy, so a bare SHA-256 would **not** be
 * dictionary-reversible — the input space is not small and well known, the
 * way an email address's is. A keyed digest is used anyway because it costs
 * nothing (it is the same `createHmac` call the CSRF store already makes)
 * and it removes the "is the token high-entropy enough?" question from the
 * codebase entirely. It also keeps one hashing convention across the
 * codebase rather than two.
 *
 * **The comparison is constant-time**, per the coding standard.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { createResetTokenHash, type ResetTokenHash, type ResetTokenPlaintext } from '@/domain/accounts';

import type { ResetTokenHasher } from '@/application/accounts/ports/reset-token-hasher';

/** The HMAC-based reset-token hasher. */
export class HmacResetTokenHasher implements ResetTokenHasher {
  constructor(private readonly secret: string) {}

  /** The digest of a token's plaintext. */
  hash(plaintext: ResetTokenPlaintext): ResetTokenHash {
    return createResetTokenHash(
      createHmac('sha256', this.secret).update(plaintext.value, 'utf8').digest('hex'),
    );
  }

  /**
   * Verify a token's plaintext against its digest.
   *
   * **Constant-time.** The two buffers are compared with `timingSafeEqual`,
   * which requires equal lengths — so a length mismatch is reported first,
   * and the mismatch itself discloses nothing (a digest is a fixed length).
   */
  verify(plaintext: ResetTokenPlaintext, hash: ResetTokenHash): boolean {
    const expected = this.hash(plaintext).value;

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(hash.value, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
