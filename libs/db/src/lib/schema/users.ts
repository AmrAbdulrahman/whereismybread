import {
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Auth.js Credentials owns these tables. JWT sessions mean there is no
 * `sessions` or `accounts` table. `password_changed_at` is bumped on every
 * password change so older JWTs stop validating (see libs/auth, Phase 1).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  /** IANA zone. `null` → detect from the browser (a `wib-tz` cookie). */
  timezone: text('timezone'),
  /** Currency new payments default to. */
  defaultCurrency: text('default_currency').notNull().default('EUR'),
  /** Currency every amount is shown converted into. */
  displayCurrency: text('display_currency').notNull().default('EUR'),
  /** How income is worked out: a flat monthly figure, or hours × a rate. */
  incomeMode: text('income_mode').notNull().default('fixed'),
  /** Currency the income / hourly-rate figures are in. */
  incomeCurrency: text('income_currency').notNull().default('EUR'),
  /** Monthly take-home income (fixed mode), in `income_currency` minor units. */
  incomeMinor: integer('income_minor').notNull().default(0),
  /** Pay per hour (hourly mode), in `income_currency` minor units. */
  hourlyRateMinor: integer('hourly_rate_minor').notNull().default(0),
  /** Usual hours worked per month (hourly mode) — the default each month starts from. */
  monthlyHours: doublePrecision('monthly_hours').notNull().default(0),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-month override of the user's income, keyed `YYYY-MM`. Carries either an
 * explicit `amountMinor` (fixed mode) or the `hours` worked that month (hourly
 * mode) — never both. A missing row means "use the global figure".
 */
export const monthIncomes = pgTable(
  'month_incomes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    /** Explicit amount for the month, in `currency` minor units. */
    amountMinor: integer('amount_minor'),
    /** Currency of `amount_minor` — null falls back to the user's income currency. */
    currency: text('currency'),
    /** Hours worked this month (hourly mode) — resolved against `hourly_rate_minor`. */
    hours: doublePrecision('hours'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MonthIncome = typeof monthIncomes.$inferSelect;
