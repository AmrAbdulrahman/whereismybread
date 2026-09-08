import { timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@wib/config';
import { syncAllConnections } from '@wib/feature-payments/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

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

/** Run the sync and shape the response. Shared by both entry points. */
async function runSync(): Promise<Response> {
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

/**
 * Manual trigger. Protected by the shared `CRON_SECRET`; also used by the
 * fallback `bank-sync` GitHub Actions workflow (`workflow_dispatch`).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<app-url>/api/bank-sync/enable-banking
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return runSync();
}

/**
 * Scheduled trigger. Driven by a QStash cron schedule (every 5 minutes — see
 * `scripts/qstash-schedule.mjs`). QStash signs every request with an
 * `Upstash-Signature` JWT which we verify against the rotating signing-key
 * pair. Retries use QStash's default policy.
 */
let verifiedPost: ((request: Request) => Promise<Response>) | undefined;

export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.QSTASH_CURRENT_SIGNING_KEY && !env.QSTASH_NEXT_SIGNING_KEY) {
    return Response.json(
      { error: 'QStash signing keys not configured' },
      { status: 503 },
    );
  }
  verifiedPost ??= verifySignatureAppRouter(() => runSync(), {
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
  return verifiedPost(request);
}
