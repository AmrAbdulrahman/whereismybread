import 'server-only';

import { requireUserId } from '@wib/auth/server';
import {
  getBankConnection,
  listBankAccounts,
  listPendingBankTransactions,
  listStatementImports,
} from '@wib/db';

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

export interface BankConnectionAccountView {
  name: string | null;
  currency: string;
  lastSyncedAt: string | null;
}

export interface BankConnectionView {
  status: 'pending' | 'active' | 'expired' | 'error';
  aspspName: string;
  aspspCountry: string;
  lastSyncedAt: string | null;
  consentExpiresAt: string | null;
  lastError: string | null;
  accounts: BankConnectionAccountView[];
}

/** Safe (no secrets) view of the user's live bank connection, or null. */
export async function getBankConnectionData(): Promise<BankConnectionView | null> {
  const userId = await requireUserId();
  const connection = await getBankConnection(userId);
  if (!connection) return null;
  const accounts =
    connection.status === 'pending'
      ? []
      : await listBankAccounts(connection.id);
  return {
    status: connection.status as BankConnectionView['status'],
    aspspName: connection.aspspName,
    aspspCountry: connection.aspspCountry,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    consentExpiresAt: connection.consentExpiresAt?.toISOString() ?? null,
    lastError: connection.lastError,
    accounts: accounts.map((a) => ({
      name: a.name,
      currency: a.currency,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    })),
  };
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
