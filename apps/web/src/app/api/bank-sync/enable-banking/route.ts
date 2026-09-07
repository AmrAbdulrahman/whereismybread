import { timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@wib/config';
import { syncAllConnections } from '@wib/feature-payments/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Constant-time string compare that never short-circuits on length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Periodic bank sync, triggered by the `bank-sync` GitHub Actions workflow
 * (`.github/workflows/bank-sync.yml`), which calls this endpoint every 15
 * minutes with `Authorization: Bearer <CRON_SECRET>`. Also callable manually
 * with the same header.
 */
async function run(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${secret}`)) {
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
