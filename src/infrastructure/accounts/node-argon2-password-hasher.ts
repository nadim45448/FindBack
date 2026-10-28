/**
 * The Argon2id password hasher, using Node's built-in `crypto.argon2`.
 *
 * **No native dependency** (ADR-12). The alternative — `argon2` or
 * `@node-rs/argon2` — would put a native build on every deploy and add a
 * supply-chain dependency to a security-critical path, in exchange for
 * avoiding a Node version floor. The floor is the better trade: it is a
 * one-time project setting rather than a permanent operational cost.
 *
 * **The parameters are embedded in the stored hash**, alongside the salt.
 * That is what makes the hashing genuinely *adaptive*: raising the work
 * factors is a configuration change with no data migration and no
 * invalidation of existing credentials, because verification reads the
 * parameters **from the stored hash** rather than from the current
 * configuration. Old and new hashes coexist safely.
 *
 * The encoding is the PHC string format, assembled here because Node's
 * `argon2Sync` returns the raw tag rather than a self-describing value:
 *
 * ```text
 * $argon2id$v=19$m=65536,t=3,p=1$<base64 salt>$<base64 tag>
 * ```
 *
 * **A note on the parameter names.** Node's `Argon2Parameters` calls the
 * iteration count `passes`, not `iterations` — and `passes` is the one that
 * reaches the algorithm. Passing an `iterations` key is silently ignored, so
 * a hash created with one would be **weaker than it claimed**: the work
 * factor would be 1 pass rather than 3. The option is named `iterations`
 * here, because that is the vocabulary the PHC format and the rest of the
 * industry use, and it is translated to `passes` at the one call site.
 */

import { argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

import { createPasswordHash, type PasswordHash } from '@/domain/accounts';
import { PasswordHashVerificationError } from '@/domain/accounts';

import type { PasswordHasher } from '@/application/accounts/ports/password-hasher';

/** The algorithm. Fixed, not configurable — the unit brief names Argon2id. */
const ALGORITHM = 'argon2id';

/** The Argon2 version. */
const VERSION = 19;

/** The salt length in bytes. */
const SALT_BYTES = 16;

/** The tag length in bytes — a 256-bit output. */
const TAG_BYTES = 32;

/** The work factors, as configuration with these defaults (ADR-12). */
export interface Argon2Options {
  /** Memory in KiB. */
  readonly memory: number;
  /** Passes over memory. */
  readonly iterations: number;
  /** Lanes. */
  readonly parallelism: number;
}

/**
 * The default work factors.
 *
 * 64 MiB / 3 passes is the OWASP second option, measured at ~160 ms on the
 * reference host — comfortably inside the PRD's 1 s write NFR.
 *
 * `parallelism = 1` over 4, even though the 4-lane form measured ~69 ms
 * faster: a 4-lane hash needs roughly 4× the memory per concurrent request,
 * and on a serverless runtime memory is the scarcer resource.
 *
 * The option is named `iterations` because that is the vocabulary the PHC
 * format uses; it is translated to Node's `passes` at the call site.
 */
export const DEFAULT_ARGON2_OPTIONS: Argon2Options = {
  memory: 65536,
  iterations: 3,
  parallelism: 1,
};

/**
 * Read the work factors from the environment, falling back to the defaults.
 *
 * The work factors are **configured, not hardcoded** — the unit brief
 * requires it, and it is what lets the factors be raised in production
 * without a deploy.
 *
 * The parameter is a plain record rather than `NodeJS.ProcessEnv`, so a test
 * can pass a small object without having to supply `NODE_ENV`.
 */
export function readArgon2Options(
  env: Record<string, string | undefined> = process.env,
): Argon2Options {
  const memory = readPositiveInt(env.AUTH_ARGON2_MEMORY_KIB);
  const iterations = readPositiveInt(env.AUTH_ARGON2_ITERATIONS);
  const parallelism = readPositiveInt(env.AUTH_ARGON2_PARALLELISM);

  return {
    memory: memory ?? DEFAULT_ARGON2_OPTIONS.memory,
    iterations: iterations ?? DEFAULT_ARGON2_OPTIONS.iterations,
    parallelism: parallelism ?? DEFAULT_ARGON2_OPTIONS.parallelism,
  };
}

/** Parse a positive integer from the environment, or null. */
function readPositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/** The parsed parts of an encoded hash. */
interface ParsedHash {
  readonly memory: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly salt: Buffer;
  readonly tag: Buffer;
}

/**
 * Parse an encoded hash.
 *
 * @throws {PasswordHashVerificationError} when the encoded hash is not in
 * the expected shape. A malformed stored hash is a **defect**, not a failed
 * login — it must be visible rather than hidden behind a generic refusal.
 */
function parseHash(encoded: string): ParsedHash {
  const parts = encoded.split('$');

  // ['', 'argon2id', 'v=19', 'm=...,t=...,p=...', salt, tag]
  if (parts.length !== 6) {
    throw new PasswordHashVerificationError(
      'The stored password hash is not in the expected format.',
    );
  }

  const [, algorithm, version, parameters, saltPart, tagPart] = parts;

  if (algorithm !== ALGORITHM) {
    throw new PasswordHashVerificationError(
      `The stored password hash uses an unexpected algorithm: ${algorithm}.`,
    );
  }

  if (version !== `v=${VERSION}`) {
    throw new PasswordHashVerificationError(
      `The stored password hash uses an unexpected version: ${version}.`,
    );
  }

  const parsedParameters = new Map<string, string>();

  for (const parameter of (parameters ?? '').split(',')) {
    const [key, value] = parameter.split('=');

    if (key !== undefined && value !== undefined) {
      parsedParameters.set(key, value);
    }
  }

  const memory = Number(parsedParameters.get('m'));
  const iterations = Number(parsedParameters.get('t'));
  const parallelism = Number(parsedParameters.get('p'));

  if (
    !Number.isInteger(memory) ||
    !Number.isInteger(iterations) ||
    !Number.isInteger(parallelism)
  ) {
    throw new PasswordHashVerificationError(
      'The stored password hash is missing its work factors.',
    );
  }

  const salt = Buffer.from(saltPart ?? '', 'base64');
  const tag = Buffer.from(tagPart ?? '', 'base64');

  if (salt.length === 0 || tag.length === 0) {
    throw new PasswordHashVerificationError('The stored password hash is missing its salt or tag.');
  }

  return { memory, iterations, parallelism, salt, tag };
}

/** Node's Argon2id password hasher. */
export class NodeArgon2PasswordHasher implements PasswordHasher {
  constructor(private readonly options: Argon2Options = DEFAULT_ARGON2_OPTIONS) {}

  /**
   * Hash a plaintext password.
   *
   * The salt is generated per hash, so two identical passwords produce
   * different hashes — which is what stops a stolen table from showing
   * which accounts share a password.
   */
  async hash(plaintext: string): Promise<PasswordHash> {
    const salt = randomBytes(SALT_BYTES);

    const tag = argon2Sync(ALGORITHM, {
      message: Buffer.from(plaintext, 'utf8'),
      nonce: salt,
      parallelism: this.options.parallelism,
      tagLength: TAG_BYTES,
      memory: this.options.memory,
      passes: this.options.iterations,
    });

    const encoded = [
      '',
      ALGORITHM,
      `v=${VERSION}`,
      `m=${this.options.memory},t=${this.options.iterations},p=${this.options.parallelism}`,
      salt.toString('base64'),
      tag.toString('base64'),
    ].join('$');

    return createPasswordHash(encoded);
  }

  /**
   * Verify a candidate password against a stored hash.
   *
   * **The stored hash's own parameters are used**, not the current
   * configuration — so a hash created under different work factors still
   * verifies. The comparison is constant-time.
   */
  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    const parsed = parseHash(hash.value);

    const candidate = argon2Sync(ALGORITHM, {
      message: Buffer.from(plaintext, 'utf8'),
      nonce: parsed.salt,
      parallelism: parsed.parallelism,
      tagLength: parsed.tag.length,
      memory: parsed.memory,
      passes: parsed.iterations,
    });

    if (candidate.length !== parsed.tag.length) {
      return false;
    }

    return timingSafeEqual(candidate, parsed.tag);
  }
}
