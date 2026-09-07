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
 * The tile kinds the Stats dashboard can show.
 *  - `custom` — the current builder output: `config.groupBy` + `measure` + `display`.
 *  - `stat` — a user-built single-value tile.
 *  - `month_spend_line` / `account_pie` / `tag_pie` / `category_bar` — legacy
 *    presets; still rendered (mapped onto the custom pipeline), no longer created.
 */
export type DashboardChartKind =
  | 'custom'
  | 'stat'
  | 'month_spend_line'
  | 'account_pie'
  | 'tag_pie'
  | 'category_bar';

/** What a custom chart groups its rows by. */
export type ChartGroupBy =
  | 'account'
  | 'tag'
  | 'method'
  | 'bank'
  | 'source'
  | 'budgeted'
  | 'day'
  | 'weekday';

/** How a custom chart draws its groups. */
export type ChartDisplay = 'bar' | 'pie';

/**
 * A faceted filter over spend rows (recorded expenses + planned payment
 * occurrences), mirroring the payments-list filter. Groups AND together;
 * values within an id list OR. All fields optional — absent = no constraint.
 */
export interface SpendFilterConfig {
  /** Case-insensitive substring over name / notes / account / tag / method / bank. */
  search?: string;
  accountIds?: string[];
  tagIds?: string[];
  methodIds?: string[];
  bankIds?: string[];
  /** 'planned' | 'expense' — absent = both. */
  source?: 'planned' | 'expense';
  /** Expense-with-a-budget filter — absent = either. */
  budgeted?: boolean;
  /** Inclusive bounds in display-currency **minor** units. */
  amountMinMinor?: number;
  amountMaxMinor?: number;
}

/** How a `stat` tile reduces its filtered rows to one number. */
export type StatMeasure = 'sum' | 'count' | 'avg' | 'min' | 'max';

/**
 * Per-tile settings. The month and the planned/expenses source toggle are NOT
 * stored here — the whole dashboard shares one month picker (`?m=`) and one
 * source filter (`?src=`); a `stat` tile's own `filter.source` overrides it.
 */
export interface DashboardChartConfig {
  /** How many grid columns the card spans (1–2). Absent = 1. */
  span?: number;
  /** stat + custom chart: which rows to include. */
  filter?: SpendFilterConfig;
  /** stat: how to reduce to one number (default 'sum'). custom chart: 'sum' | 'count'. */
  measure?: StatMeasure;
  /** stat tile: show a delta against the previous month. */
  compare?: 'prev_month';
  /** custom chart: what to group rows by. */
  groupBy?: ChartGroupBy;
  /** custom chart: bar or pie (default 'bar'). */
  display?: ChartDisplay;
  /** custom chart: keep the top N groups, roll the rest into "Other". */
  limit?: number;

  // --- legacy preset settings (read-only; new charts don't write these) ---
  /** account_pie: accounts to leave out. */
  excludeAccountIds?: string[];
  /** tag_pie: tags to include (`undefined` = all). */
  includeTagIds?: string[];
  /** category_bar: dimension to rank. */
  dimension?: 'account' | 'tag';
}

/**
 * One tile on the Stats dashboard. Ordered by `sortOrder`. `config` holds the
 * tile-kind-specific settings.
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
