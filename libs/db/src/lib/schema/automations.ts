import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
} from '@wib/domain';
import { users } from './users';

const audit = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * A user-defined rule: when `trigger` fires, if every one of `conditions`
 * matches (AND), run `actions` in order. Evaluated per user in `sortOrder`;
 * `ignore` / `log_expense` / `create_payment` consume a review-expense so
 * later rules don't also act on it. `lastRunAt` / `runCount` are bookkeeping.
 */
export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    trigger: text('trigger').$type<AutomationTrigger>().notNull(),
    conditions: jsonb('conditions')
      .$type<AutomationCondition[]>()
      .notNull()
      .default([]),
    actions: jsonb('actions').$type<AutomationAction[]>().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    runCount: integer('run_count').notNull().default(0),
    ...audit,
  },
  (t) => [index('automations_user_idx').on(t.userId, t.sortOrder)],
);

/**
 * An in-app notice. Written by the automations engine (`automationId` set) and
 * potentially other sources later. `readAt` null = unread; `href` is an
 * in-app deep link the row navigates to.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    href: text('href'),
    automationId: uuid('automation_id').references(() => automations.id, {
      onDelete: 'set null',
    }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt),
  ],
);

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
