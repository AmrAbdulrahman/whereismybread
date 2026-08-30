import { sql } from 'drizzle-orm';
import { getDb } from './client';

export interface DbHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** Runs `select 1` so a route can prove the app can reach Postgres. */
export async function checkDatabase(): Promise<DbHealth> {
  const started = performance.now();
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
