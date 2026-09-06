import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const bankTransactionStatusEnum = pgEnum('bank_transaction_status', [
  'pending',
  'categorized',
  'ignored',
]);
export const bankTransactionResultTypeEnum = pgEnum(
  'bank_transaction_result_type',
  ['expense', 'payment'],
);

const audit = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * One uploaded bank statement (CSV). Kept as an audit trail and as the
 * per-source high-water mark — `source` groups statements from the same
 * account, and `latestOccurredAt` / `latestExternalId` are the "last synced"
 * hint shown in the UI. The real dedup guard is the unique key on each
 * transaction, not this.
 */
export const statementImports = pgTable('statement_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  /** Detected bank / account label, e.g. "Wise" — groups related statements. */
  source: text('source').notNull().default('Statement'),
  /** Parser that handled it: 'wise', 'monzo', 'revolut', 'starling', 'generic'. */
  format: text('format').notNull(),
  rowsParsed: integer('rows_parsed').notNull().default(0),
  rowsImported: integer('rows_imported').notNull().default(0),
  rowsSkipped: integer('rows_skipped').notNull().default(0),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  latestOccurredAt: timestamp('latest_occurred_at', { withTimezone: true }),
  latestExternalId: text('latest_external_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A raw imported transaction, awaiting categorization. `dedupKey` is unique
 * per user — the bank's own transaction id when the statement has one, a
 * content hash otherwise — so re-uploading an overlapping statement inserts
 * only the genuinely new rows. `resultId` deliberately has no foreign key —
 * it points at `expenses.id` or `payments.id` depending on `resultType`,
 * resolved in application code rather than the schema.
 */
export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    importId: uuid('import_id').references(() => statementImports.id, {
      onDelete: 'set null',
    }),
    dedupKey: text('dedup_key').notNull(),
    source: text('source').notNull().default('Statement'),
    /** The bank's own transaction id, when the statement format carries one. */
    externalId: text('external_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** Whether `occurredAt` carries a real time-of-day (vs a midnight fallback). */
    occurredHasTime: boolean('occurred_has_time').notNull().default(false),
    description: text('description').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    rawType: text('raw_type'),
    runningBalanceMinor: integer('running_balance_minor'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    status: bankTransactionStatusEnum('status').notNull().default('pending'),
    resultType: bankTransactionResultTypeEnum('result_type'),
    resultId: uuid('result_id'),
    ...audit,
  },
  (t) => [
    uniqueIndex('bank_transactions_user_dedup_idx').on(t.userId, t.dedupKey),
    index('bank_transactions_user_status_idx').on(
      t.userId,
      t.status,
      t.occurredAt,
    ),
  ],
);

export type StatementImport = typeof statementImports.$inferSelect;
export type NewStatementImport = typeof statementImports.$inferInsert;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;
