import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const budgetPeriodEnum = pgEnum('budget_period', ['month', 'week']);

const audit = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * A spending envelope for a fixed span of time — the whole month, or one
 * Monday–Sunday week within it. `startDate`/`endDate` are the resolved,
 * inclusive range (a week may spill a few days into the neighbouring month);
 * `period` is kept alongside just to label the UI correctly.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    period: budgetPeriodEnum('period').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    color: text('color').notNull().default('#6321d6'),
    ...audit,
  },
  (t) => [index('budgets_user_range_idx').on(t.userId, t.startDate, t.endDate)],
);

/**
 * A single spend, on its own date. Assigning it to a budget is optional —
 * budgeted expenses are tracked against that budget's reserved amount and
 * excluded from the day/month totals (the budget already counts once);
 * unbudgeted ones count directly, like a one-time payment.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').references(() => budgets.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    date: date('date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    notes: text('notes'),
    ...audit,
  },
  (t) => [
    index('expenses_budget_idx').on(t.budgetId),
    index('expenses_user_date_idx').on(t.userId, t.date),
  ],
);

/** A file (image / PDF / text) attached to an expense, stored in Vercel Blob. */
export const expenseAttachments = pgTable(
  'expense_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    url: text('url').notNull(),
    pathname: text('pathname').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('expense_attachments_expense_idx').on(t.expenseId)],
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseAttachment = typeof expenseAttachments.$inferSelect;
