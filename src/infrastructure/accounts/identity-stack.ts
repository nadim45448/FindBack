/**
 * The identity stack's composition root.
 *
 * **One place where the concrete implementations are wired together.** The
 * route handlers depend on the use cases, and the use cases depend on the
 * ports — so this is the only module that knows both sides.
 *
 * The wiring is built **per request** rather than at module load, because
 * the Prisma client is resolved lazily: a module that imported the singleton
 * would construct it at import time, before a script had loaded its
 * environment file, and would fail with "DATABASE_URL is not set".
 */

import { AuditWriter } from '@/application/audit-writer';

import { Authenticate } from '@/application/accounts/authenticate';
import { AccountDeactivationService } from '@/application/accounts/account-deactivation-service';
import { ActorContextResolver } from '@/application/accounts/actor-context-resolver';
import { Logout } from '@/application/accounts/logout';
import { MemberProfileService } from '@/application/accounts/member-profile-service';
import { PasswordResetCompletionService } from '@/application/accounts/password-reset-completion-service';
import { PasswordResetRequestService } from '@/application/accounts/password-reset-request-service';
import { RegisterAccount } from '@/application/accounts/register-account';
import { RegistrationQueueQuery } from '@/application/accounts/registration-queue-query';
import { ReviewRegistration } from '@/application/accounts/review-registration';
import { SessionService } from '@/application/accounts/session-service';

import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';

import { DatabaseRateLimiter } from '@/infrastructure/accounts/database-rate-limiter';
import {
  NodeArgon2PasswordHasher,
  readArgon2Options,
} from '@/infrastructure/accounts/node-argon2-password-hasher';
import { PrismaAccountRepository } from '@/infrastructure/accounts/prisma-account-repository';
import { PrismaPasswordResetTokenRepository } from '@/infrastructure/accounts/prisma-password-reset-token-repository';
import { PrismaSessionRepository } from '@/infrastructure/accounts/prisma-session-repository';
import { SessionTokenStore } from '@/infrastructure/accounts/cookie-session-store';
import { HmacCsrfTokenValidator } from '@/infrastructure/accounts/csrf-token-store';
import { HmacRateLimitBucketKey } from '@/infrastructure/accounts/rate-limit-bucket-key';
import { HmacResetTokenHasher } from '@/infrastructure/accounts/reset-token-hasher';
import {
  generateResetToken,
  readAppBaseUrl,
} from '@/infrastructure/accounts/reset-token-generator';
import { readSmtpConfig, SmtpEmailSender } from '@/infrastructure/accounts/smtp-email-sender';
import {
  readRateLimitConfig,
  type RateLimitConfig,
} from '@/infrastructure/accounts/rate-limit-config';
import {
  readResetBucketHashSecret,
  readResetConfig,
  readResetTokenHashSecret,
  type ResetConfig,
} from '@/infrastructure/accounts/reset-config';

import type { EmailSender } from '@/application/ports/email-sender';
import type { RateLimiter } from '@/application/ports/rate-limiter';
import type { CSRFTokenValidator } from '@/application/ports/csrf-token-validator';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { ResetTokenHasher } from '@/application/accounts/ports/reset-token-hasher';

/** The identity stack, assembled. */
export interface IdentityStack {
  readonly accounts: RegisterAccount;
  readonly review: ReviewRegistration;
  readonly authenticate: Authenticate;
  readonly sessions: SessionService;
  readonly resolver: ActorContextResolver;
  readonly logout: Logout;
  readonly queue: RegistrationQueueQuery;
  readonly audit: AuditWriter;
  readonly transactions: TransactionFactory;
  readonly rateLimiter: RateLimiter;
  readonly rateLimits: RateLimitConfig;
  readonly csrf: CSRFTokenValidator;
  readonly email: EmailSender | null;
  readonly tokens: SessionTokenStore;

  // ── Bolt 005: deactivation, password reset, and the member profile ──────
  readonly deactivation: AccountDeactivationService;
  readonly resetRequest: PasswordResetRequestService;
  readonly resetCompletion: PasswordResetCompletionService;
  readonly profile: MemberProfileService;
  readonly resetConfig: ResetConfig;
  readonly resetTokenHasher: ResetTokenHasher;
  /** The keyed digest for the reset flow's email rate-limit bucket. */
  readonly bucketKeys: HmacRateLimitBucketKey;
  /** The deployment's base URL, for building the reset link. */
  readonly appBaseUrl: string;
}

/**
 * The session secret.
 *
 * The CSRF token is keyed by it, so a missing secret is a **hard failure** —
 * a deployment without one could not validate a CSRF token, and failing
 * loudly at the first request is better than failing silently.
 */
function readSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is not set, or is shorter than 32 characters. The CSRF token is keyed by it.',
    );
  }

  return secret;
}

/**
 * The inactivity window, in days (FR-4).
 */
function readInactivityDays(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.SESSION_INACTIVITY_DAYS);

  return Number.isInteger(configured) && configured > 0 ? configured : 14;
}

/**
 * The activity-refresh threshold, in minutes (ADR-16).
 */
function readRefreshThresholdMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.SESSION_ACTIVITY_REFRESH_MINUTES);

  return Number.isInteger(configured) && configured > 0 ? configured : 60;
}

/**
 * The overrides a test may supply when building the stack.
 *
 * **Only the two seams that are genuinely untestable from the outside are
 * exposed**: the reset token's generator (the plaintext token exists only in
 * the email, so a test that must complete a reset needs to know it) and the
 * email sender (so a test can capture the message without an SMTP server).
 *
 * Everything else is wired the same way in every environment — a seam that
 * is not needed is a seam that can be used wrongly.
 */
export interface IdentityStackOverrides {
  /**
   * The reset token's generator.
   *
   * Defaults to the CSPRNG generator. A test supplies a deterministic one so
   * it can complete the reset it requested.
   */
  readonly generateResetToken?: () => string;
  /** The email sender. Defaults to the SMTP sender, or null when unconfigured. */
  readonly emailSender?: EmailSender | null;
}

/**
 * Build the identity stack.
 *
 * The `env` parameter exists so a test can supply its own configuration
 * without mutating `process.env`. The `overrides` parameter exists for the
 * same reason, for the two seams that need one.
 */
export function buildIdentityStack(
  env: NodeJS.ProcessEnv = process.env,
  overrides: IdentityStackOverrides = {},
): IdentityStack {
  const accountRepository = new PrismaAccountRepository(prisma);
  const sessionRepository = new PrismaSessionRepository(prisma);
  const hasher = new NodeArgon2PasswordHasher(readArgon2Options(env));
  const tokens = new SessionTokenStore();
  const transactions = new PrismaTransactionFactory(prisma);
  const audit = new AuditWriter(new PrismaAuditEventRepository(prisma));

  const sessions = new SessionService(sessionRepository, accountRepository, transactions, {
    inactivityDays: readInactivityDays(env),
    refreshThresholdMinutes: readRefreshThresholdMinutes(env),
    hashToken: (token) => tokens.hashToken(token),
    generateToken: () => tokens.generateToken(),
  });

  const smtp = readSmtpConfig(env);

  // ── Bolt 005's pieces ───────────────────────────────────────────────────
  //
  // **The two secrets are required, and a missing one fails the build
  // loudly** (ADR-19). They are read here rather than lazily inside the
  // request path, so a deployment without them fails at startup rather than
  // at the first reset request — and an unkeyed fallback is never a
  // possibility.
  const resetConfig = readResetConfig(env);
  const resetTokenHasher = new HmacResetTokenHasher(readResetTokenHashSecret(env));
  const bucketKeys = new HmacRateLimitBucketKey(readResetBucketHashSecret(env));

  const resetTokenRepository = new PrismaPasswordResetTokenRepository(prisma);

  return {
    accounts: new RegisterAccount(accountRepository, hasher, audit),
    review: new ReviewRegistration(accountRepository, audit),
    authenticate: new Authenticate(accountRepository, hasher),
    sessions,
    resolver: new ActorContextResolver(sessions),
    logout: new Logout(sessionRepository),
    queue: new RegistrationQueueQuery(accountRepository),
    audit,
    transactions,
    rateLimiter: new DatabaseRateLimiter(prisma),
    rateLimits: readRateLimitConfig(env),
    csrf: new HmacCsrfTokenValidator(readSessionSecret(env)),
    // The email sender is null when SMTP is not configured — which is the
    // case in local development, where the provider is not available (CP-4).
    // An override takes precedence, so a test can capture the message.
    email:
      overrides.emailSender !== undefined
        ? overrides.emailSender
        : smtp
          ? new SmtpEmailSender(smtp)
          : null,
    tokens,

    deactivation: new AccountDeactivationService(accountRepository, sessionRepository, audit),
    resetRequest: new PasswordResetRequestService(
      accountRepository,
      resetTokenRepository,
      hasher,
      resetTokenHasher,
      {
        tokenLifetimeSeconds: resetConfig.tokenLifetimeSeconds,
        minResponseMs: resetConfig.minResponseMs,
        generateToken: overrides.generateResetToken ?? generateResetToken,
      },
    ),
    resetCompletion: new PasswordResetCompletionService(
      accountRepository,
      resetTokenRepository,
      hasher,
      resetTokenHasher,
    ),
    profile: new MemberProfileService(accountRepository, audit),
    resetConfig,
    resetTokenHasher,
    bucketKeys,
    appBaseUrl: readAppBaseUrl(env),
  };
}
