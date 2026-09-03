import { serverEnv } from '@wib/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; sql: postgres.Sql } | undefined;

/**
 * A single Drizzle client for the process. `prepare: false` is mandatory: the
 * Supabase pooler runs in transaction mode and cannot hold prepared statements.
 */
export function getDb(): Db {
  return (cached ??= create()).db;
}

/** The raw postgres.js handle, for health checks and one-off SQL. */
export function getSql(): postgres.Sql {
  return (cached ??= create()).sql;
}

function create() {
  const sql = postgres(serverEnv().POSTGRES_URL, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
  });
  // Set WIB_DB_PERF=1 to log one line per query — handy for spotting N+1s and
  // duplicate reads while tuning. No-op otherwise.
  const logger = process.env['WIB_DB_PERF'] === '1';
  return { db: drizzle(sql, { schema, logger }), sql };
}
