import { cache } from 'react';
import { findUserById } from '@wib/db';
import { auth } from './auth';
import type { SessionUser } from './types';

export type { SessionUser };

/**
 * The signed-in user, re-read from the DB so profile edits show immediately.
 * `cache()`-wrapped: the calendar page, the board query and the context query
 * each ask for the user in one render — this collapses that to one round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
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
    displayCurrency: user.displayCurrency,
    incomeMode: user.incomeMode === 'hourly' ? 'hourly' : 'fixed',
    incomeCurrency: user.incomeCurrency,
    incomeMinor: user.incomeMinor,
    hourlyRateMinor: user.hourlyRateMinor,
    monthlyHours: user.monthlyHours,
    emailVerified: user.emailVerifiedAt != null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/**
 * Just the signed-in user's id, straight from the session token — no DB read.
 * Use in write actions that only need to scope a query to the owner.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('UNAUTHENTICATED');
  return id;
}
