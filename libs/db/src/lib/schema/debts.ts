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
 * A debt basket: one direction, one date, one description, held against a
 * person. The amounts owed live in `debt_lines` (one row per denomination);
 * repayments live in `debt_entries` (free-form, each carrying its own
 * denomination). `settledAt` is the manual "this is done" flag.
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
    description: text('description').notNull().default(''),
    notes: text('notes'),
    /** `YYYY-MM-DD` — when the debt was incurred. */
    incurredOn: date('incurred_on')
      .notNull()
      .default(sql`CURRENT_DATE`),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /**
     * What the whole debt was worth when it was lent, in money — optional,
     * always the owner's own estimate. Used only to show how that value has
     * drifted against today's recalculated value (`principalEquivalentMinor`).
     */
    originalValueMinor: integer('original_value_minor'),
    originalValueCurrency: text('original_value_currency'),
    ...audit,
  },
  (t) => [
    index('debts_user_idx').on(t.userId),
    index('debts_person_idx').on(t.personId),
  ],
);

/**
 * A user-defined denomination — a watch, a non-standard gold type, anything
 * counted in its own units. `valueMinor` / `valueCurrency` is a per-unit
 * reference price, used only for the app-currency `≈` equivalent.
 */
export const debtThings = pgTable(
  'debt_things',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** A downscaled `data:image/...` URI, or null. */
    logoUrl: text('logo_url'),
    /** `'g'` or `'piece'`. */
    unit: text('unit').notNull().default('piece'),
    /** Per-unit reference value, in minor units of `valueCurrency`. */
    valueMinor: integer('value_minor').notNull().default(0),
    valueCurrency: text('value_currency').notNull().default('EUR'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit,
  },
  (t) => [
    index('debt_things_user_idx').on(t.userId),
    uniqueIndex('debt_things_user_name_idx').on(
      t.userId,
      sql`lower(${t.name})`,
    ),
  ],
);

/** Denomination fields, shared by principal rows and repayments. */
const denomCols = {
  /** `'money'` (uses `currency`), `'gold'` (uses `gold_*`), `'thing'` (uses `thing_*`). */
  denomKind: text('denom_kind').notNull().default('money'),
  currency: text('currency').notNull().default('EUR'),
  /** A `@wib/domain` gold catalogue key. Null for money / thing. */
  goldType: text('gold_type'),
  /** Legacy: a custom-gold label. Superseded by `debt_things` — always null now. */
  goldLabel: text('gold_label'),
  /** `'g'` or `'piece'` — the unit for a gold or thing denomination. */
  goldUnit: text('gold_unit'),
  /** The `debt_things` row when `denom_kind = 'thing'` (kept on delete, name below). */
  thingId: uuid('thing_id').references(() => debtThings.id, {
    onDelete: 'set null',
  }),
  /** Denormalised thing name — survives the thing being deleted. */
  thingName: text('thing_name'),
};

/**
 * One principal row of a debt basket: a quantity in one denomination.
 * `amount_minor` is minor currency units for money, thousandths of a gram /
 * piece for gold.
 */
export const debtLines = pgTable(
  'debt_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...denomCols,
    amountMinor: integer('amount_minor').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('debt_lines_debt_idx').on(t.debtId)],
);

/**
 * A free-form repayment logged against a debt, carrying its own denomination.
 * Not tied to a `debt_lines` row — the app nets these against the lines to get
 * a running balance per denomination.
 */
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
    ...denomCols,
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

/**
 * A file (image / PDF / text) attached to a debt or one of its repayments,
 * stored in Vercel Blob. `entry_id` null = attached to the debt itself;
 * set = attached to that repayment. Shown to both parties.
 */
export const debtAttachments = pgTable(
  'debt_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => debtEntries.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    url: text('url').notNull(),
    pathname: text('pathname').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('debt_attachments_debt_idx').on(t.debtId)],
);

export type DebtPerson = typeof debtPeople.$inferSelect;
export type NewDebtPerson = typeof debtPeople.$inferInsert;
export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtThing = typeof debtThings.$inferSelect;
export type NewDebtThing = typeof debtThings.$inferInsert;
export type DebtLine = typeof debtLines.$inferSelect;
export type NewDebtLine = typeof debtLines.$inferInsert;
export type DebtEntry = typeof debtEntries.$inferSelect;
export type NewDebtEntry = typeof debtEntries.$inferInsert;
export type DebtOtp = typeof debtOtps.$inferSelect;
export type DebtGrant = typeof debtGrants.$inferSelect;
export type DebtAttachment = typeof debtAttachments.$inferSelect;
export type NewDebtAttachment = typeof debtAttachments.$inferInsert;
