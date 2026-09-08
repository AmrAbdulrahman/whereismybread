import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, banks, tags } from './payments';
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
 *
 * `recurring` (month budgets only) marks it as an ongoing monthly series —
 * each calendar month gets its own row (its own reserved amount and its own
 * linked expenses), lazily created the next time the series is read past its
 * latest existing month. There's no separate "series" id: the latest
 * `recurring` row for a given name **is** the series' current state, and
 * turning `recurring` off on it is what stops the series continuing.
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
    recurring: boolean('recurring').notNull().default(false),
    /**
     * When set, the budget is "closed" for its period: no more expenses can be
     * logged against it and its unspent remainder is released back into the
     * plan's available ("left") figure instead of staying reserved.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),
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
    accountId: uuid('account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    bankId: uuid('bank_id').references(() => banks.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    date: date('date').notNull(),
    /**
     * The precise moment, when this expense came from an imported bank
     * transaction that carried a time. `null` for manually-added expenses —
     * the UI then shows the `date` alone.
     */
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    notes: text('notes'),
    /** The service / provider's website. */
    url: text('url'),
    /** Logo (data: URI) and brand colour fetched from `url`. */
    logoUrl: text('logo_url'),
    brandColor: text('brand_color'),
    ...audit,
  },
  (t) => [
    index('expenses_budget_idx').on(t.budgetId),
    index('expenses_user_date_idx').on(t.userId, t.date),
    index('expenses_account_idx').on(t.accountId),
    index('expenses_bank_idx').on(t.bankId),
  ],
);

/** Tags on an expense — same `tags` rows a payment uses. */
export const expenseTags = pgTable(
  'expense_tags',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.tagId] })],
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
export type ExpenseTag = typeof expenseTags.$inferSelect;
