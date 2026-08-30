import { findUserById } from '@wib/db';
import { auth } from './auth';
import type { SessionUser } from './types';

export type { SessionUser };

/** The signed-in user, re-read from the DB so profile edits show immediately. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await findUserById(id);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    defaultCurrency: user.defaultCurrency,
    emailVerified: user.emailVerifiedAt != null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
