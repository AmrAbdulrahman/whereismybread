import { cache } from 'react';
import { cookies } from 'next/headers';
import { findUserById } from '@wib/db';
import { auth } from './auth';
import type { SessionUser } from './types';

export type { SessionUser };

/** Name of the cookie the browser writes its detected IANA zone into. */
export const TZ_COOKIE = 'wib-tz';

/** A string that `Intl` accepts as a time zone, or `null`. */
function validTimeZone(value: string | undefined): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

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

  // `null` in the DB → auto: use the zone the browser reported via the cookie,
  // falling back to UTC only if we have nothing.
  const detected = validTimeZone((await cookies()).get(TZ_COOKIE)?.value);
  const timezone = user.timezone ?? detected ?? 'UTC';

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone,
    timezoneAuto: user.timezone == null,
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
