import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { expenses } from '../schema/budgets';
import {
  bankAccounts,
  bankConnections,
  bankTransactions,
  statementImports,
  type BankAccount,
  type BankConnection,
  type BankTransaction,
  type StatementImport,
} from '../schema/bank-sync';

export async function createStatementImport(
  userId: string,
  input: { filename: string; source: string; format: string },
): Promise<StatementImport> {
  const rows = await getDb()
    .insert(statementImports)
    .values({
      userId,
      filename: input.filename,
      source: input.source,
      format: input.format,
    })
    .returning();
  if (!rows[0]) throw new Error('createStatementImport: no row');
  return rows[0];
}

export async function finalizeStatementImport(
  id: string,
  input: {
    rowsParsed: number;
    rowsImported: number;
    rowsSkipped: number;
    periodStart: Date | null;
    periodEnd: Date | null;
    latestOccurredAt: Date | null;
    latestExternalId: string | null;
  },
): Promise<void> {
  await getDb()
    .update(statementImports)
    .set(input)
    .where(eq(statementImports.id, id));
}

export async function latestStatementImport(
  userId: string,
  source?: string,
): Promise<StatementImport | null> {
  const rows = await getDb()
    .select()
    .from(statementImports)
    .where(
      source
        ? and(
            eq(statementImports.userId, userId),
            eq(statementImports.source, source),
          )
        : eq(statementImports.userId, userId),
    )
    .orderBy(desc(statementImports.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listStatementImports(
  userId: string,
  limit = 10,
): Promise<StatementImport[]> {
  return getDb()
    .select()
    .from(statementImports)
    .where(eq(statementImports.userId, userId))
    .orderBy(desc(statementImports.createdAt))
    .limit(limit);
}

export interface ImportedTransactionInput {
  dedupKey: string;
  source: string;
  externalId: string | null;
  occurredAt: Date;
  occurredHasTime: boolean;
  description: string;
  amountMinor: number;
  currency: string;
  rawType: string | null;
  runningBalanceMinor: number | null;
  rawPayload: Record<string, unknown>;
  /** Defaults to `pending`; a live sync passes `ignored` for rule matches. */
  status?: 'pending' | 'ignored';
}

/**
 * Bulk-insert parsed statement rows, skipping any already seen for this user
 * (`onConflictDoNothing` on the `(userId, dedupKey)` unique index). Returns
 * how many were genuinely new. Chunked so a huge statement stays one query
 * per chunk rather than one per row.
 */
export async function insertImportedTransactions(
  userId: string,
  importId: string,
  rows: ImportedTransactionInput[],
  bankId?: string | null,
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(bankTransactions)
      .values(
        slice.map((r) => ({
          userId,
          importId,
          bankId: bankId ?? null,
          dedupKey: r.dedupKey,
          source: r.source,
          externalId: r.externalId,
          occurredAt: r.occurredAt,
          occurredHasTime: r.occurredHasTime,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          rawType: r.rawType,
          runningBalanceMinor: r.runningBalanceMinor,
          rawPayload: r.rawPayload,
        })),
      )
      .onConflictDoNothing({
        target: [bankTransactions.userId, bankTransactions.dedupKey],
      })
      .returning({ id: bankTransactions.id });
    inserted += result.length;
  }
  return inserted;
}

/**
 * Bulk-insert transactions pulled from a live sync (Enable Banking), skipping
 * any already seen (`onConflictDoNothing` on `(userId, dedupKey)`). Returns
 * the count of genuinely-new rows. Mirrors `insertImportedTransactions` but
 * stamps `accountId` instead of `importId`.
 */
export async function insertSyncedTransactions(
  userId: string,
  accountId: string,
  rows: ImportedTransactionInput[],
  bankId?: string | null,
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(bankTransactions)
      .values(
        slice.map((r) => ({
          userId,
          accountId,
          bankId: bankId ?? null,
          dedupKey: r.dedupKey,
          source: r.source,
          externalId: r.externalId,
          occurredAt: r.occurredAt,
          occurredHasTime: r.occurredHasTime,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          rawType: r.rawType,
          runningBalanceMinor: r.runningBalanceMinor,
          rawPayload: r.rawPayload,
          status: r.status ?? 'pending',
        })),
      )
      .onConflictDoNothing({
        target: [bankTransactions.userId, bankTransactions.dedupKey],
      })
      .returning({ id: bankTransactions.id });
    inserted += result.length;
  }
  return inserted;
}

// --- Live connections (Enable Banking) -----------------------------------

export async function getBankConnection(
  userId: string,
): Promise<BankConnection | null> {
  const rows = await getDb()
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export interface PendingConnectionInput {
  aspspName: string;
  aspspCountry: string;
  authState: string;
}

/**
 * Create or reset the user's connection to a fresh `pending` row for a new
 * authorization attempt. One connection per user — an existing row (any
 * status) is overwritten.
 */
export async function upsertPendingConnection(
  userId: string,
  input: PendingConnectionInput,
): Promise<BankConnection> {
  const db = getDb();
  const existing = await getBankConnection(userId);
  const patch = {
    provider: 'enablebanking',
    aspspName: input.aspspName,
    aspspCountry: input.aspspCountry,
    authState: input.authState,
    sessionIdEnc: null,
    psuIdHash: null,
    status: 'pending' as const,
    consentExpiresAt: null,
    authorizedAt: null,
    lastError: null,
    updatedAt: new Date(),
  };
  const rows = existing
    ? await db
        .update(bankConnections)
        .set(patch)
        .where(eq(bankConnections.id, existing.id))
        .returning()
    : await db
        .insert(bankConnections)
        .values({ userId, ...patch })
        .returning();
  if (!rows[0]) throw new Error('upsertPendingConnection: no row');
  return rows[0];
}

export async function activateConnection(
  id: string,
  input: {
    sessionIdEnc: string;
    psuIdHash: string | null;
    consentExpiresAt: Date | null;
  },
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({
      sessionIdEnc: input.sessionIdEnc,
      psuIdHash: input.psuIdHash,
      consentExpiresAt: input.consentExpiresAt,
      status: 'active',
      authorizedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(bankConnections.id, id));
}

export async function setConnectionStatus(
  id: string,
  status: 'pending' | 'active' | 'expired' | 'error',
  lastError?: string | null,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({
      status,
      lastError: lastError ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankConnections.id, id));
}

export async function setConnectionBank(
  userId: string,
  bankId: string | null,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ bankId, updatedAt: new Date() })
    .where(eq(bankConnections.userId, userId));
}

export async function setConnectionIgnorePatterns(
  userId: string,
  patterns: string | null,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ ignorePatterns: patterns, updatedAt: new Date() })
    .where(eq(bankConnections.userId, userId));
}

/** Set the connection's bank only if it doesn't have one yet (connect-time). */
export async function setConnectionBankIfUnset(
  id: string,
  bankId: string,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ bankId, updatedAt: new Date() })
    .where(and(eq(bankConnections.id, id), isNull(bankConnections.bankId)));
}

export async function markConnectionSynced(id: string): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(bankConnections.id, id));
}

/** Every connection the cron job should attempt. */
export async function listSyncableConnections(): Promise<BankConnection[]> {
  return getDb()
    .select()
    .from(bankConnections)
    .where(inArray(bankConnections.status, ['active', 'error']));
}

export async function deleteBankConnection(userId: string): Promise<void> {
  await getDb()
    .delete(bankConnections)
    .where(eq(bankConnections.userId, userId));
}

export interface BankAccountInput {
  uid: string;
  name: string | null;
  currency: string;
  identification: string | null;
  cashAccountType: string | null;
}

/**
 * Reconcile the accounts under a connection: upsert the ones we got back,
 * delete the ones that disappeared. Delete-missing is safe — a
 * `bank_transactions.account_id` FK is `on delete set null`, so history
 * survives the ~90-day reconsent cycle.
 */
export async function replaceBankAccounts(
  connectionId: string,
  userId: string,
  accounts: BankAccountInput[],
): Promise<BankAccount[]> {
  const db = getDb();
  const current = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connectionId));

  const keepUids = new Set(accounts.map((a) => a.uid));
  const stale = current.filter((c) => !keepUids.has(c.uid));
  if (stale.length > 0) {
    await db.delete(bankAccounts).where(
      inArray(
        bankAccounts.id,
        stale.map((s) => s.id),
      ),
    );
  }

  const out: BankAccount[] = [];
  for (const a of accounts) {
    const existing = current.find((c) => c.uid === a.uid);
    const rows = existing
      ? await db
          .update(bankAccounts)
          .set({
            name: a.name,
            currency: a.currency,
            identification: a.identification,
            cashAccountType: a.cashAccountType,
            updatedAt: new Date(),
          })
          .where(eq(bankAccounts.id, existing.id))
          .returning()
      : await db
          .insert(bankAccounts)
          .values({
            connectionId,
            userId,
            uid: a.uid,
            name: a.name,
            currency: a.currency,
            identification: a.identification,
            cashAccountType: a.cashAccountType,
          })
          .returning();
    if (rows[0]) out.push(rows[0]);
  }
  return out;
}

export async function listBankAccounts(
  connectionId: string,
): Promise<BankAccount[]> {
  return getDb()
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connectionId))
    .orderBy(bankAccounts.currency);
}

export async function markBankAccountSynced(id: string): Promise<void> {
  await getDb()
    .update(bankAccounts)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(bankAccounts.id, id));
}

export async function listPendingBankTransactions(
  userId: string,
): Promise<BankTransaction[]> {
  return getDb()
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.userId, userId),
        eq(bankTransactions.status, 'pending'),
      ),
    )
    .orderBy(desc(bankTransactions.occurredAt));
}

export async function markBankTransactionCategorized(
  userId: string,
  id: string,
  resultType: 'expense' | 'payment',
  resultId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .update(bankTransactions)
    .set({ status: 'categorized', resultType, resultId, updatedAt: new Date() })
    .where(
      and(eq(bankTransactions.id, id), eq(bankTransactions.userId, userId)),
    )
    .returning({
      occurredAt: bankTransactions.occurredAt,
      hasTime: bankTransactions.occurredHasTime,
    });

  // Carry the transaction's precise time onto the expense it became, so the
  // list can show it (a manually-added expense has no time).
  const txn = rows[0];
  if (resultType === 'expense' && txn?.hasTime) {
    await db
      .update(expenses)
      .set({ occurredAt: txn.occurredAt })
      .where(and(eq(expenses.id, resultId), eq(expenses.userId, userId)));
  }
}

export async function markBankTransactionIgnored(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .update(bankTransactions)
    .set({ status: 'ignored', updatedAt: new Date() })
    .where(
      and(eq(bankTransactions.id, id), eq(bankTransactions.userId, userId)),
    );
}

export async function markBankTransactionsIgnored(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await getDb()
    .update(bankTransactions)
    .set({ status: 'ignored', updatedAt: new Date() })
    .where(
      and(
        eq(bankTransactions.userId, userId),
        inArray(bankTransactions.id, ids),
        eq(bankTransactions.status, 'pending'),
      ),
    )
    .returning({ id: bankTransactions.id });
  return rows.length;
}

/**
 * Stamp `bankId` onto this user's transactions for the given bank accounts
 * that don't have one yet — a one-time backfill so rows synced before the
 * connection had a bank still land in the right tab.
 */
export async function backfillTransactionsBank(
  userId: string,
  bankId: string,
  accountIds: string[],
): Promise<void> {
  if (accountIds.length === 0) return;
  await getDb()
    .update(bankTransactions)
    .set({ bankId })
    .where(
      and(
        eq(bankTransactions.userId, userId),
        inArray(bankTransactions.accountId, accountIds),
        isNull(bankTransactions.bankId),
      ),
    );
}
