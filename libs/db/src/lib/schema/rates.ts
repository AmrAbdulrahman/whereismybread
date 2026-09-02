import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Cached FX rates, one row per base currency. Refreshed from a free API. */
export const exchangeRateSnapshots = pgTable('exchange_rate_snapshots', {
  base: text('base').primaryKey(),
  rates: jsonb('rates').$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
