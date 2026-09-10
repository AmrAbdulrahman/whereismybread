import 'server-only';
import { cookies } from 'next/headers';
import { hashToken } from '@wib/auth/server';
import { findLiveDebtGrant, touchDebtGrant } from '@wib/db';

/** The cookie carrying the raw external-access token. */
export const DEBT_GRANT_COOKIE = 'wib_debt';
export const DEBT_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * `true` when the current request carries a live grant for `personId` — i.e.
 * this browser has verified an OTP for that person. Refreshes `lastSeenAt`.
 */
export async function hasDebtGrant(personId: string): Promise<boolean> {
  const raw = (await cookies()).get(DEBT_GRANT_COOKIE)?.value;
  if (!raw) return false;
  const grant = await findLiveDebtGrant(hashToken(raw));
  if (!grant || grant.personId !== personId) return false;
  await touchDebtGrant(grant.id);
  return true;
}
