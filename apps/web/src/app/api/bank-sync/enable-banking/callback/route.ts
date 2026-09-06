import { requireUserId } from '@wib/auth/server';
import { completeConnection } from '@wib/feature-payments/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Redirect target for the Enable Banking authorization flow. The browser
 * carries the user's session cookie, so `requireUserId()` works here. On
 * success we exchange `?code` for a session and run a first backfill, then
 * bounce to the Sync-bank page.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const base = url.origin;
  const done = (status: string) =>
    Response.redirect(`${base}/transactions?bank=${status}`, 303);

  const error = url.searchParams.get('error');
  if (error) return done('error');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return done('error');

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return Response.redirect(`${base}/login`, 303);
  }

  try {
    const res = await completeConnection(userId, code, state);
    return done(res.ok ? 'connected' : 'error');
  } catch {
    return done('error');
  }
}
