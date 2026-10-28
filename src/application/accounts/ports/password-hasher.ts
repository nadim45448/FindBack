/**
 * The password-hasher port.
 *
 * The domain owns the *contract*; the infrastructure owns the algorithm. The
 * implementation is Node's built-in Argon2id (ADR-12), but the domain does
 * not import `node:crypto` and does not know it — which is what keeps
 * `domain/` importable with no Node runtime.
 *
 * The port is **not** in the shared directory: only the accounts module
 * hashes passwords.
 */

import type { PasswordHash } from '@/domain/accounts';

/** Hashes and verifies passwords. */
export interface PasswordHasher {
  /**
   * Hash a plaintext password.
   *
   * The plaintext must not be retained, logged, or audited by the caller.
   */
  hash(plaintext: string): Promise<PasswordHash>;

  /**
   * Verify a candidate password against a stored hash.
   *
   * Returns false for a wrong password. A **malformed** stored hash is a
   * defect rather than a failed login, and the implementation throws rather
   * than returning false — a corrupt hash must be visible, not hidden behind
   * a generic refusal.
   */
  verify(plaintext: string, hash: PasswordHash): Promise<boolean>;
}
