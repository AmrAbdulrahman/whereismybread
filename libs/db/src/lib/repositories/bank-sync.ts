import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { expenses } from '../schema/budgets';
import {
  bankTransactions,
  statementImports,
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
