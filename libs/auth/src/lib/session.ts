// Phase 1 adds `import 'server-only'` here (with the matching vitest resolve
// condition) once this module actually touches request state.

/**
 * The shape every feature reads off the session.
 *
 * PHASE 0 STUB — there is no auth yet, so `getCurrentUser()` always resolves
 * to `null` and the app shell redirects to `/login`. Phase 1 replaces the body
 * with an Auth.js v5 (Credentials, JWT) lookup; the signature stays.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  defaultCurrency: string;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  return user;
}
