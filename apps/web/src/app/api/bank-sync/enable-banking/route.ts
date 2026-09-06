import { serverEnv } from '@wib/config';
import { syncAllConnections } from '@wib/feature-payments/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Daily bank sync, triggered by Vercel Cron (see `vercel.json`). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is
 * set. Also callable manually with the same header.
 */
async function run(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const result = await syncAllConnections();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
