/**
 * The Argon2id password hasher's tests.
 *
 * The property that matters most is the **embedded parameters**: a hash
 * created under one set of work factors must still verify after the
 * configuration changes. That is what makes the hashing genuinely adaptive
 * — raising the factors is a configuration change with no data migration.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARGON2_OPTIONS,
  NodeArgon2PasswordHasher,
  readArgon2Options,
} from './node-argon2-password-hasher';
import { PasswordHashVerificationError } from '@/domain/accounts';

/** The hasher under test, at the cheapest settings that still exercise the code. */
function aHasher(overrides: Partial<typeof DEFAULT_ARGON2_OPTIONS> = {}) {
  return new NodeArgon2PasswordHasher({
    memory: 19456,
    iterations: 2,
    parallelism: 1,
    ...overrides,
  });
}

describe('the Argon2id hasher', () => {
  it('verifies the right password', async () => {
    const hasher = aHasher();
    const hash = await hasher.hash('correct horse 1');

    expect(await hasher.verify('correct horse 1', hash)).toBe(true);
  });

  it('refuses the wrong password', async () => {
    const hasher = aHasher();
    const hash = await hasher.hash('correct horse 1');

    expect(await hasher.verify('wrong horse 1', hash)).toBe(false);
  });

  it('encodes the algorithm, version, and work factors', async () => {
    const hasher = aHasher({ memory: 19456, iterations: 2, parallelism: 1 });
    const hash = await hasher.hash('correct horse 1');

    expect(hash.value).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
  });

  it('produces a different hash for the same password each time', async () => {
    // A per-hash salt: two identical passwords must not produce identical
    // hashes, or a stolen table would show which accounts share a password.
    const hasher = aHasher();

    const first = await hasher.hash('correct horse 1');
    const second = await hasher.hash('correct horse 1');

    expect(first.value).not.toBe(second.value);
  });

  it('never stores the plaintext', async () => {
    const hasher = aHasher();
    const hash = await hasher.hash('correct horse 1');

    expect(hash.value).not.toContain('correct horse 1');
  });

  it('verifies a hash made with different work factors', async () => {
    // The parameters are read from the **stored hash**, not from the
    // current configuration. This is what makes the hashing adaptive.
    const weak = aHasher({ memory: 19456, iterations: 2 });
    const strong = aHasher({ memory: 65536, iterations: 3 });

    const hash = await weak.hash('correct horse 1');

    expect(await strong.verify('correct horse 1', hash)).toBe(true);
  });

  it('throws on a malformed stored hash rather than returning false', async () => {
    // A corrupt hash is a **defect**, not a failed login. It must be
    // visible rather than hidden behind a generic refusal.
    const hasher = aHasher();

    await expect(hasher.verify('correct horse 1', { value: 'not-a-hash' })).rejects.toThrow(
      PasswordHashVerificationError,
    );
  });

  it('throws on a hash with an unexpected algorithm', async () => {
    const hasher = aHasher();

    await expect(
      hasher.verify('correct horse 1', {
        value: '$argon2i$v=19$m=19456,t=2,p=1$c2FsdA$tag',
      }),
    ).rejects.toThrow(PasswordHashVerificationError);
  });
});

describe('the Argon2 configuration', () => {
  it('defaults to the OWASP second option', () => {
    const options = readArgon2Options({});

    expect(options).toEqual({
      memory: 65536,
      iterations: 3,
      parallelism: 1,
    });
  });

  it('reads the work factors from the environment', () => {
    // The work factors are **configured, not hardcoded** — the unit brief
    // requires it.
    const options = readArgon2Options({
      AUTH_ARGON2_MEMORY_KIB: '131072',
      AUTH_ARGON2_ITERATIONS: '4',
      AUTH_ARGON2_PARALLELISM: '2',
    });

    expect(options).toEqual({
      memory: 131072,
      iterations: 4,
      parallelism: 2,
    });
  });

  it('ignores an invalid configured value and uses the default', () => {
    const options = readArgon2Options({ AUTH_ARGON2_MEMORY_KIB: 'lots' });

    expect(options.memory).toBe(65536);
  });

  it('ignores a non-positive configured value', () => {
    const options = readArgon2Options({ AUTH_ARGON2_ITERATIONS: '0' });

    expect(options.iterations).toBe(3);
  });
});
