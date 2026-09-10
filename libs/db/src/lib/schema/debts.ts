import type { DebtDirection } from '@wib/domain';
import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
 * A person the user tracks debts with. There is no account for them — they get
 * a read-only view of their debts at `/d/<share_id>` after a one-time email
 * code (see `debt_otps` / `debt_grants`). `share_id` is an unguessable slug.
 */
export const debtPeople = pgTable(
  'debt_people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    /** A downscaled `data:image/...` URI, or null. */
    photoUrl: text('photo_url'),
    /** The slug in the shared-page URL. */
    shareId: uuid('share_id').notNull().defaultRandom().unique(),
    ...audit,
  },
  (t) => [
    index('debt_people_user_idx').on(t.userId),
    uniqueIndex('debt_people_user_email_idx').on(t.userId, sql`lower(${t.email})`),
  ],
);

/**
 * One debt in one direction for a fixed principal. `settledAt` is set when the
 * remainder hits zero (explicitly or by the last repayment). Repayments live in
 * `debt_entries` and are always in this row's `currency`.
 */
export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => debtPeople.id, { onDelete: 'cascade' }),
    direction: text('direction').$type<DebtDirection>().notNull(),
    principalMinor: integer('principal_minor').notNull(),
    currency: text('currency').notNull().default('EUR'),
    description: text('description').notNull().default(''),
    notes: text('notes'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index('debts_user_idx').on(t.userId),
    index('debts_person_idx').on(t.personId),
  ],
);

/** A repayment against a debt, in the debt's currency. */
export const debtEntries = pgTable(
  'debt_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    note: text('note'),
    /** `YYYY-MM-DD` — when the money actually moved. */
    occurredOn: date('occurred_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('debt_entries_debt_idx').on(t.debtId)],
);

/**
 * A pending one-time code emailed to a person so they can unlock their shared
 * page. Only the SHA-256 hash is stored. Short-lived; five bad tries burns it.
 */
export const debtOtps = pgTable(
  'debt_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => debtPeople.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('debt_otps_person_idx').on(t.personId)],
);

/**
 * A verified external "session": the `wib_debt` cookie carries the raw token,
 * only the hash is stored here. Scoped to one person (all their debts).
 */
export const debtGrants = pgTable(
  'debt_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => debtPeople.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('debt_grants_person_idx').on(t.personId)],
);

export type DebtPerson = typeof debtPeople.$inferSelect;
export type NewDebtPerson = typeof debtPeople.$inferInsert;
export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtEntry = typeof debtEntries.$inferSelect;
export type NewDebtEntry = typeof debtEntries.$inferInsert;
export type DebtOtp = typeof debtOtps.$inferSelect;
export type DebtGrant = typeof debtGrants.$inferSelect;
