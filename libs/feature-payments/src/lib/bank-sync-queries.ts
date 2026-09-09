import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { requireUserId } from '@wib/auth/server';
import {
  listBankAccounts,
  listBankConnections,
  listBanks,
  listPendingBankTransactions,
  listProviders,
  listStatementImports,
  type BankConnection,
} from '@wib/db';
import { cleanMerchant } from '@wib/domain';

import {
  isEnableBankingConfigured,
  listAspspNames,
} from './enablebanking-client';
import { CONNECTABLE_BANKS } from './connectable-banks';

/** Per-request memo — `getBankTransactionsData` and `getSyncTargets` both need
 * the connection list on a single `/plan` render. */
const connectionsFor = cache((userId: string): Promise<BankConnection[]> =>
  listBankConnections(userId),
);

export interface BankTransactionRow {
  id: string;
  occurredAt: string;
  /** Whether `occurredAt` carries a real time-of-day. */
  hasTime: boolean;
  /** The raw bank description, verbatim. */
  description: string;
  /** Best-effort shop/service name pulled out of `description`. */
  merchant: string;
  /** What to show / prefill — `nameOverride` if set, else `merchant`. */
  displayName: string;
  amountMinor: number;
  currency: string;
  rawType: string | null;
  balanceName: string | null;
  /** The bank this transaction belongs to. */
  bankId: string | null;
  // --- Triage enrichment (automation- or modal-set) ---
  /** Notes override — prefilled instead of the raw description. */
  notesOverride: string | null;
  /** Spending account to prefill / assign. */
  accountId: string | null;
  /** Payment method to prefill (when triaged into a payment). */
  methodId: string | null;
  /** Tag names to prefill. */
  tags: string[];
  /** The reusable service provider to prefill / assign. */
  providerId: string | null;
  /** The resolved provider, for display in the triage rows / modals. */
  provider: {
    id: string;
    name: string;
    logoUrl: string | null;
    color: string | null;
  } | null;
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

export interface BankConnectionBankOption {
  id: string;
  name: string;
  color: string;
  iconKey: string | null;
  logoUrl: string | null;
}

export interface BankConnectionView {
  /** The connection row id. */
  id: string;
  status: 'pending' | 'active' | 'expired' | 'error';
  aspspName: string;
  aspspCountry: string;
  lastSyncedAt: string | null;
  consentExpiresAt: string | null;
  lastError: string | null;
  accounts: BankConnectionAccountView[];
  /** The bank synced transactions are tagged with (null = none). */
  bankId: string | null;
  /** Newline-separated auto-ignore rules. */
  ignorePatterns: string;
}

/** A bank the app can connect automatically (serializable subset). */
export interface ConnectableBankOption {
  key: string;
  label: string;
  aspspName: string;
  aspspCountry: string;
}

/** Every live bank connection the user has (no secrets). */
export async function getBankConnectionsData(): Promise<BankConnectionView[]> {
  const userId = await requireUserId();
  const connections = await connectionsFor(userId);
  const out: BankConnectionView[] = [];
  for (const c of connections) {
    const accounts = c.status === 'pending' ? [] : await listBankAccounts(c.id);
    out.push({
      id: c.id,
      status: c.status as BankConnectionView['status'],
      aspspName: c.aspspName,
      aspspCountry: c.aspspCountry,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      consentExpiresAt: c.consentExpiresAt?.toISOString() ?? null,
      lastError: c.lastError,
      accounts: accounts.map((a) => ({
        name: a.name,
        currency: a.currency,
        lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      })),
      bankId: c.bankId,
      ignorePatterns: c.ignorePatterns ?? '',
    });
  }
  return out;
}

/** Banks the app can auto-connect that this Enable Banking app can reach. */
export async function getConnectableBanks(): Promise<ConnectableBankOption[]> {
  await requireUserId();
  if (!isEnableBankingConfigured()) return [];
  let available = CONNECTABLE_BANKS;
  try {
    const names = await listAspspNames();
    available = CONNECTABLE_BANKS.filter((b) =>
      names.some((n) => n.name === b.aspspName && n.country === b.aspspCountry),
    );
  } catch {
    /* fall back to the full catalog */
  }
  return available.map((b) => ({
    key: b.key,
    label: b.label,
    aspspName: b.aspspName,
    aspspCountry: b.aspspCountry,
  }));
}

export type SyncTarget = BankConnectionBankOption & { connectionId: string };

/**
 * Banks the user can trigger a sync for right now — a live integration that
 * isn't `pending`. Each carries its connection id.
 */
export async function getSyncTargets(): Promise<SyncTarget[]> {
  const userId = await requireUserId();
  const [connections, banks] = await Promise.all([
    connectionsFor(userId),
    listBanks(userId),
  ]);
  const targets: SyncTarget[] = [];
  for (const c of connections) {
    if (c.status === 'pending' || !c.bankId) continue;
    const bank = banks.find((b) => b.id === c.bankId);
    if (!bank) continue;
    targets.push({
      connectionId: c.id,
      id: bank.id,
      name: bank.name,
      color: bank.color,
      iconKey: bank.iconKey,
      logoUrl: bank.logoUrl,
    });
  }
  return targets;
}

export async function getBankTransactionsData(): Promise<BankTransactionsData> {
  const userId = await requireUserId();
  return unstable_cache(
    () => loadBankTransactionsData(userId),
    ['bank-transactions-data', userId],
    { tags: [`user-data:${userId}`], revalidate: 60 },
  )();
}

async function loadBankTransactionsData(
  userId: string,
): Promise<BankTransactionsData> {
  const transactions = await listPendingBankTransactions(userId);
  const imports = await listStatementImports(userId, 5);
  const connections = await connectionsFor(userId);
  const connBankByAccountConn = connections[0]?.bankId ?? null;
  const providerById = new Map(
    (await listProviders(userId)).map((p) => [p.id, p]),
  );

  return {
    pending: transactions.map((t) => {
      const merchant = cleanMerchant(t.description, t.rawType);
      return {
        id: t.id,
        occurredAt: t.occurredAt.toISOString(),
        hasTime: t.occurredHasTime,
        description: t.description,
        merchant,
        displayName: t.nameOverride ?? merchant,
        amountMinor: t.amountMinor,
        currency: t.currency,
        rawType: t.rawType,
        balanceName: t.source,
        // Prefer the row's own bank; fall back to the (single) connection's
        // for older synced rows that predate the column.
        bankId: t.bankId ?? (t.accountId ? connBankByAccountConn : null),
        notesOverride: t.notesOverride,
        accountId: t.triageAccountId,
        methodId: t.triageMethodId,
        tags: t.tags,
        providerId: t.providerId,
        provider: (() => {
          const p = t.providerId
            ? providerById.get(t.providerId)
            : undefined;
          return p
            ? { id: p.id, name: p.name, logoUrl: p.logoUrl, color: p.color }
            : null;
        })(),
      };
    }),
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
