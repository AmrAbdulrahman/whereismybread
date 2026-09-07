import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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

/**
 * The chart kinds the Stats dashboard can show. `month_spend_line` is the
 * per-day spend chart — it renders as **bars**; the name is kept for the rows
 * already stored with it.
 */
export type DashboardChartKind =
  | 'month_spend_line'
  | 'account_pie'
  | 'tag_pie'
  | 'category_bar';

/**
 * Per-chart settings. The month and the planned/expenses source toggle are NOT
 * stored here — the whole dashboard shares one month picker (`?m=`) and one
 * source filter (`?src=`).
 */
export interface DashboardChartConfig {
  /** account_pie: accounts to leave out of the chart. */
  excludeAccountIds?: string[];
  /** tag_pie: tags to include (`undefined`/absent = all). */
  includeTagIds?: string[];
  /** category_bar: which dimension to rank. */
  dimension?: 'account' | 'tag';
  /** How many grid columns the card spans (1–2). Absent = 1. */
  span?: number;
}

/**
 * One card on the Stats dashboard. Ordered by `sortOrder`. `config` holds the
 * chart-kind-specific settings.
 */
export const dashboardCharts = pgTable(
  'dashboard_charts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<DashboardChartKind>().notNull(),
    title: text('title').notNull(),
    config: jsonb('config').$type<DashboardChartConfig>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('dashboard_charts_user_idx').on(t.userId, t.sortOrder)],
);

export type DashboardChart = typeof dashboardCharts.$inferSelect;
export type NewDashboardChart = typeof dashboardCharts.$inferInsert;
