import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { expenses } from '../schema/budgets';
import { accounts, paymentMethods } from '../schema/payments';
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

/** What a bulk insert of transactions actually created. */
export interface InsertedTransactions {
  /** How many rows were genuinely new (not deduped away). */
  inserted: number;
  /** The ids of those new rows — for downstream processing (automations). */
  ids: string[];
}

/**
 * Bulk-insert parsed statement rows, skipping any already seen for this user
 * (`onConflictDoNothing` on the `(userId, dedupKey)` unique index). Returns
 * the genuinely-new rows. Chunked so a huge statement stays one query per
 * chunk rather than one per row.
 */
export async function insertImportedTransactions(
  userId: string,
  importId: string,
  rows: ImportedTransactionInput[],
  bankId?: string | null,
): Promise<InsertedTransactions> {
  if (rows.length === 0) return { inserted: 0, ids: [] };
  const db = getDb();
  const CHUNK = 500;
  const ids: string[] = [];
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
    for (const row of result) ids.push(row.id);
  }
  return { inserted: ids.length, ids };
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
): Promise<InsertedTransactions> {
  if (rows.length === 0) return { inserted: 0, ids: [] };
  const db = getDb();
  const CHUNK = 500;
  const ids: string[] = [];
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
    for (const row of result) ids.push(row.id);
  }
  return { inserted: ids.length, ids };
}

// --- Live connections (Enable Banking) -----------------------------------

/** Every bank connection the user has, newest first. */
export async function listBankConnections(
  userId: string,
): Promise<BankConnection[]> {
  return getDb()
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId))
    .orderBy(desc(bankConnections.createdAt));
}

export async function getBankConnectionById(
  userId: string,
  id: string,
): Promise<BankConnection | null> {
  const rows = await getDb()
    .select()
    .from(bankConnections)
    .where(
      and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getConnectionByBank(
  userId: string,
  bankId: string,
): Promise<BankConnection | null> {
  const rows = await getDb()
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.userId, userId),
        eq(bankConnections.bankId, bankId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getConnectionByAuthState(
  userId: string,
  authState: string,
): Promise<BankConnection | null> {
  const rows = await getDb()
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.userId, userId),
        eq(bankConnections.authState, authState),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface PendingConnectionInput {
  aspspName: string;
  aspspCountry: string;
  authState: string;
}

/**
 * Create (or reset to `pending`) the connection for a given ASPSP so a new
 * authorization attempt can run. Keyed on `(user, aspspName, aspspCountry)`.
 */
export async function upsertPendingConnection(
  userId: string,
  input: PendingConnectionInput,
): Promise<BankConnection> {
  const db = getDb();
  const existing = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.userId, userId),
        eq(bankConnections.aspspName, input.aspspName),
        eq(bankConnections.aspspCountry, input.aspspCountry),
      ),
    )
    .limit(1);
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
  const rows = existing[0]
    ? await db
        .update(bankConnections)
        .set(patch)
        .where(eq(bankConnections.id, existing[0].id))
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
  id: string,
  bankId: string | null,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ bankId, updatedAt: new Date() })
    .where(eq(bankConnections.id, id));
}

export async function setConnectionIgnorePatterns(
  id: string,
  patterns: string | null,
): Promise<void> {
  await getDb()
    .update(bankConnections)
    .set({ ignorePatterns: patterns, updatedAt: new Date() })
    .where(eq(bankConnections.id, id));
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

export async function deleteBankConnection(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(bankConnections)
    .where(
      and(eq(bankConnections.id, id), eq(bankConnections.userId, userId)),
    );
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

  // An empty payload means "we didn't get the account list this time", never
  // "the user closed every account". Enable Banking sometimes omits `accounts`
  // from a fresh session response; reconciling against that would delete the
  // connection's working accounts and silently stop every future sync. Keep
  // what we have and let the next attempt refresh it.
  if (accounts.length === 0) return current;

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

/** Full transaction rows by id, scoped to the user. Order is not guaranteed. */
export async function getBankTransactionsByIds(
  userId: string,
  ids: string[],
): Promise<BankTransaction[]> {
  if (ids.length === 0) return [];
  return getDb()
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.userId, userId),
        inArray(bankTransactions.id, ids),
      ),
    );
}

export interface BankTransactionEnrichment {
  accountId?: string | null;
  methodId?: string | null;
  url?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  nameOverride?: string | null;
  notesOverride?: string | null;
  /** Tag names (replaces the stored list). */
  tags?: string[];
}

/**
 * Stamp a pending transaction with triage hints — set by an automation or the
 * "edit details" modal, inherited into the payment/expense form on triage.
 * Only the keys present in `patch` are written. `accountId` is ownership-guarded.
 */
export async function updateBankTransactionEnrichment(
  userId: string,
  id: string,
  patch: BankTransactionEnrichment,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ('accountId' in patch) {
    if (patch.accountId) {
      const owned = await getDb()
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(eq(accounts.id, patch.accountId), eq(accounts.userId, userId)),
        )
        .limit(1);
      set['triageAccountId'] = owned[0] ? patch.accountId : null;
    } else {
      set['triageAccountId'] = null;
    }
  }
  if ('methodId' in patch) {
    if (patch.methodId) {
      const owned = await getDb()
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.id, patch.methodId),
            eq(paymentMethods.userId, userId),
          ),
        )
        .limit(1);
      set['triageMethodId'] = owned[0] ? patch.methodId : null;
    } else {
      set['triageMethodId'] = null;
    }
  }
  if ('url' in patch) set['url'] = patch.url ?? null;
  if ('logoUrl' in patch) set['logoUrl'] = patch.logoUrl ?? null;
  if ('brandColor' in patch) set['brandColor'] = patch.brandColor ?? null;
  if ('nameOverride' in patch) set['nameOverride'] = patch.nameOverride ?? null;
  if ('notesOverride' in patch)
    set['notesOverride'] = patch.notesOverride ?? null;
  if ('tags' in patch) set['tags'] = patch.tags ?? [];

  await getDb()
    .update(bankTransactions)
    .set(set)
    .where(
      and(eq(bankTransactions.id, id), eq(bankTransactions.userId, userId)),
    );
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
