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
 * A live Open Banking connection (Enable Banking AISP). One row per user —
 * the connection covers every account/currency-balance the user consented
 * to. `sessionIdEnc` is the Enable Banking session id, AES-256-GCM encrypted
 * (it is a bearer credential to account data). `status`:
 *   - `pending`  authorization link issued, user not back yet
 *   - `active`   session created, syncing
 *   - `expired`  consent lapsed (~90 days) — user must reconnect
 *   - `error`    last sync failed for another reason (`lastError`)
 */
export const bankConnections = pgTable(
  'bank_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('enablebanking'),
    /** ASPSP name as Enable Banking knows it, e.g. "Wise". */
    aspspName: text('aspsp_name').notNull(),
    /** ASPSP country code, e.g. "GB". */
    aspspCountry: text('aspsp_country').notNull(),
    /** Opaque `state` we round-trip through the auth redirect (CSRF guard). */
    authState: text('auth_state'),
    /** Enable Banking session id, AES-256-GCM encrypted. Null while pending. */
    sessionIdEnc: text('session_id_enc'),
    psuIdHash: text('psu_id_hash'),
    status: text('status').notNull().default('pending'),
    consentExpiresAt: timestamp('consent_expires_at', { withTimezone: true }),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastError: text('last_error'),
    ...audit,
  },
  (t) => [uniqueIndex('bank_connections_user_idx').on(t.userId)],
);

/**
 * One account / currency-balance exposed by a connection. `uid` is the
 * Enable Banking account uid used in `/accounts/{uid}/transactions`.
 */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    uid: text('uid').notNull(),
    name: text('name'),
    currency: text('currency').notNull(),
    /** IBAN / sort-code+number / other, whatever the ASPSP returns. */
    identification: text('identification'),
    cashAccountType: text('cash_account_type'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    ...audit,
  },
  (t) => [uniqueIndex('bank_accounts_connection_uid_idx').on(t.connectionId, t.uid)],
);

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
    /** Set when the row came from a live sync rather than a CSV upload. */
    accountId: uuid('account_id').references(() => bankAccounts.id, {
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
export type BankConnection = typeof bankConnections.$inferSelect;
export type NewBankConnection = typeof bankConnections.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
