import 'server-only';

import { requireUserId } from '@wib/auth/server';
import { listPendingBankTransactions, listStatementImports } from '@wib/db';

export interface BankTransactionRow {
  id: string;
  occurredAt: string;
  /** Whether `occurredAt` carries a real time-of-day. */
  hasTime: boolean;
  description: string;
  amountMinor: number;
  currency: string;
  rawType: string | null;
  balanceName: string | null;
}

export interface StatementImportSummary {
  id: string;
  filename: string;
  source: string;
  format: string;
  rowsImported: number;
  rowsSkipped: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export interface BankTransactionsData {
  pending: BankTransactionRow[];
  imports: StatementImportSummary[];
}

export async function getBankTransactionsData(): Promise<BankTransactionsData> {
  const userId = await requireUserId();
  const transactions = await listPendingBankTransactions(userId);
  const imports = await listStatementImports(userId, 5);

  return {
    pending: transactions.map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt.toISOString(),
      hasTime: t.occurredHasTime,
      description: t.description,
      amountMinor: t.amountMinor,
      currency: t.currency,
      rawType: t.rawType,
      balanceName: t.source,
    })),
    imports: imports.map((i) => ({
      id: i.id,
      filename: i.filename,
      source: i.source,
      format: i.format,
      rowsImported: i.rowsImported,
      rowsSkipped: i.rowsSkipped,
      periodStart: i.periodStart?.toISOString() ?? null,
      periodEnd: i.periodEnd?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}
