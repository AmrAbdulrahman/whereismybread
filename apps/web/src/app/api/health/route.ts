import { NextResponse } from 'next/server';
import { checkDatabase } from '@wmm/db';

export const dynamic = 'force-dynamic';

/** Phase 0 smoke check — proves the app can reach Postgres. */
export async function GET() {
  const db = await checkDatabase();
  return NextResponse.json(
    { status: db.ok ? 'ok' : 'degraded', db },
    { status: db.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
