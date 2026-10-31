/**
 * The shared server-side reading for the administrator pages.
 *
 * ## The authorisation is checked here, once
 *
 * Every `/admin/*` page resolves the actor through this module and reads
 * the administration stack only when the actor is an administrator. A
 * non-administrator gets the **access screen** (§15.6) and **no content
 * from the administrator stack** — not a count, not a row, not a heading
 * that names a queue.
 *
 * The application layer refuses a non-administrator too, so there are two
 * gates: this one keeps the data out of the response, and the use case's
 * one keeps it out of the database. A caller that reaches the stack
 * directly still gets a refusal.
 */

import { cookies } from 'next/headers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';
import { buildAdministrationStack } from '@/infrastructure/administration/administration-stack';

import { ADMIN_ACCESS_MESSAGE } from '@/ui/admin-copy';

/** The error the administrator surfaces show when a read fails. */
export const ADMIN_READ_FAILED =
  'Something went wrong on our side. Try again, or come back in a moment.';

/**
 * The resolved administrator, or the refusal.
 */
export type AdminPageAccess =
  | {
      readonly allowed: true;
      readonly userId: string;
      readonly displayName: string | null;
    }
  | {
      readonly allowed: false;
      /** The message the access screen shows. */
      readonly message: string;
    };

/**
 * Resolve the actor for an administrator page.
 *
 * **A signed-out visitor is refused, not treated as an administrator.**
 * The access screen's message is the same one a signed-in member sees —
 * §15.6 names one message for the restricted state, and the fact that the
 * visitor is signed out is not information the page needs to carry.
 */
export async function resolveAdminAccess(): Promise<AdminPageAccess> {
  try {
    const identity = buildIdentityStack();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const actor = token ? await identity.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      return { allowed: false, message: ADMIN_ACCESS_MESSAGE };
    }

    return { allowed: true, userId: actor.actorId, displayName: actor.displayName ?? null };
  } catch {
    return { allowed: false, message: ADMIN_ACCESS_MESSAGE };
  }
}

/**
 * The administration stack.
 *
 * **Built per request,** like every other stack — the Prisma client is
 * resolved lazily and must not be constructed at module load.
 */
export function buildAdminStack(): ReturnType<typeof buildAdministrationStack> {
  return buildAdministrationStack();
}
