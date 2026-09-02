import { PAYMENT_METHOD_KINDS, RECURRENCES } from '@wib/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const recurrenceEnum = pgEnum('recurrence', RECURRENCES);
export const paymentMethodKindEnum = pgEnum(
  'payment_method_kind',
  PAYMENT_METHOD_KINDS,
);
export const paymentEventStatusEnum = pgEnum('payment_event_status', [
  'paid',
  'skipped',
]);

const audit = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6321d6'),
    ...audit,
  },
  (t) => [uniqueIndex('tags_user_name_uq').on(t.userId, sql`lower(${t.name})`)],
);

/** What a payment is "for" — a company, a household bill group, taxes… */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6321d6'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit,
  },
  (t) => [
    uniqueIndex('accounts_user_name_uq').on(t.userId, sql`lower(${t.name})`),
  ],
);

/** A bank behind a direct-debit / card payment method. */
export const banks = pgTable(
  'banks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6321d6'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit,
  },
  (t) => [
    uniqueIndex('banks_user_name_uq').on(t.userId, sql`lower(${t.name})`),
  ],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: paymentMethodKindEnum('kind').notNull(),
    iconKey: text('icon_key').notNull().default('wallet'),
    /** An uploaded image (data: URI) used instead of `icon_key` when set. */
    logoUrl: text('logo_url'),
    color: text('color').notNull().default('#6321d6'),
    reference: text('reference'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit,
  },
  (t) => [
    uniqueIndex('payment_methods_user_name_uq').on(
      t.userId,
      sql`lower(${t.name})`,
    ),
  ],
);

/** How money reaches the recipient of a manual payment — Wise, PayPal, cash… */
export const recipientMethods = pgTable(
  'recipient_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    iconKey: text('icon_key').notNull().default('transfer'),
    /** An uploaded image (data: URI) used instead of `icon_key` when set. */
    logoUrl: text('logo_url'),
    color: text('color').notNull().default('#6321d6'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit,
  },
  (t) => [
    uniqueIndex('recipient_methods_user_name_uq').on(
      t.userId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /**
   * `fixed`   → `amount_minor` is the charge.
   * `per_unit` → `amount_minor` is the price of one `unit_name`; the charge is
   *              `amount_minor × units` (units per occurrence, default `default_units`).
   */
  amountKind: text('amount_kind').notNull().default('fixed'),
  amountMinor: integer('amount_minor').notNull(),
  /** e.g. "session", "visit", "hour" — set when `amount_kind = 'per_unit'`. */
  unitName: text('unit_name'),
  /** Units assumed for an occurrence with no explicit override. */
  defaultUnits: doublePrecision('default_units').notNull().default(1),
  /**
   * A surcharge added on top of the amount and rolled into the total.
   * `none` | `fixed` (fee_fixed_minor) | `percent` (fee_percent, e.g. 2.5 = 2.5%).
   */
  feeKind: text('fee_kind').notNull().default('none'),
  feeFixedMinor: integer('fee_fixed_minor').notNull().default(0),
  feePercent: doublePrecision('fee_percent').notNull().default(0),
  currency: text('currency').notNull().default('EUR'),
  methodId: uuid('method_id').references(() => paymentMethods.id, {
    onDelete: 'set null',
  }),
  accountId: uuid('account_id').references(() => accounts.id, {
    onDelete: 'set null',
  }),
  bankId: uuid('bank_id').references(() => banks.id, {
    onDelete: 'set null',
  }),
  /** How this manual payment is sent to the recipient. */
  recipientMethodId: uuid('recipient_method_id').references(
    () => recipientMethods.id,
    { onDelete: 'set null' },
  ),
  recurrence: recurrenceEnum('recurrence').notNull(),
  anchorDate: date('anchor_date').notNull(),
  dayOfMonth: integer('day_of_month'),
  endsOn: date('ends_on'),
  /** The service / provider's website. */
  url: text('url'),
  /** Logo (data: URI) and brand colour fetched from `url`. */
  logoUrl: text('logo_url'),
  brandColor: text('brand_color'),
  isSubscription: boolean('is_subscription').notNull().default(false),
  notes: text('notes'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...audit,
});

export const paymentTags = pgTable(
  'payment_tags',
  {
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.tagId] })],
);

/** Per-occurrence override for a single due date (amount, method, notes…). */
export interface PaymentOverrides {
  amountMinor?: number;
  /** Units for this occurrence (per-unit payments only). */
  units?: number | null;
  currency?: string;
  name?: string;
  methodId?: string | null;
  accountId?: string | null;
  bankId?: string | null;
  recipientMethodId?: string | null;
  notes?: string | null;
}

/**
 * One row per occurrence the user has touched — marked paid/skipped, and/or
 * given a per-month override. `status` is null when the row only carries an
 * override.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    dueDate: date('due_date').notNull(),
    status: paymentEventStatusEnum('status'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    amountMinor: integer('amount_minor'),
    overrides: jsonb('overrides').$type<PaymentOverrides>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_events_payment_due_uq').on(t.paymentId, t.dueDate),
  ],
);

export type Tag = typeof tags.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Bank = typeof banks.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type RecipientMethod = typeof recipientMethods.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
