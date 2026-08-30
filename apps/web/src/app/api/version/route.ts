import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Identity of the live deployment. Always runs on the current deployment, so
 * its answer is by definition the latest — the client compares it to the
 * build id baked into its bundle (see @wmm/updates).
 */
export function GET() {
  return NextResponse.json(
    {
      buildId:
        process.env['NEXT_PUBLIC_BUILD_ID'] ??
        process.env['VERCEL_DEPLOYMENT_ID'] ??
        'dev',
      commit: process.env['VERCEL_GIT_COMMIT_SHA'] ?? null,
      builtAt: process.env['BUILD_TIMESTAMP'] ?? new Date(0).toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
