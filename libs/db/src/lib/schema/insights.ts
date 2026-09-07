import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Per-user arrangement of the Insights page cards — the drag order and the
 * resize (column span) of each card. One row per user; the whole layout is a
 * single jsonb blob, upserted on every change. Card ids not present fall back
 * to their natural order / span 1.
 */
export interface InsightsLayoutData {
  /** Card id order, per section key ("comingUp" / "attention"). */
  order: Record<string, string[]>;
  /** Card id → column span. */
  spans: Record<string, number>;
}

export const insightsLayouts = pgTable('insights_layouts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<InsightsLayoutData>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InsightsLayout = typeof insightsLayouts.$inferSelect;
