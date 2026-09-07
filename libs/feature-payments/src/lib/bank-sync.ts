import 'server-only';

import { encryptSecret } from '@wib/auth/server';
import {
  activateConnection,
  backfillTransactionsBank,
  createBank,
  getBankConnection,
  listBankAccounts,
  listPendingBankTransactions,
  listSyncableConnections,
  markBankAccountSynced,
  markBankTransactionsIgnored,
  markConnectionSynced,
  replaceBankAccounts,
  setConnectionBankIfUnset,
  setConnectionIgnorePatterns,
  setConnectionStatus,
  insertSyncedTransactions,
  type BankAccountInput,
  type BankConnection,
} from '@wib/db';
import {
  createSession,
  fetchAllTransactions,
  isConsentError,
  type EbAccount,
} from './enablebanking-client';
import { mapEbTransaction } from './enablebanking-map';
import {
  DEFAULT_IGNORE_PATTERNS,
  parseIgnorePatterns,
  shouldIgnore,
} from './ignore-patterns';

/** How far back to look on the first sync of an account. */
const FIRST_SYNC_DAYS = 30;
/** Overlap window so a transaction that books late isn't missed. */
const OVERLAP_MS = 2 * 60 * 60 * 1000;

export interface SyncResult {
  ok: boolean;
  imported: number;
  error?: string;
  expired?: boolean;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function accountLabel(name: string | null, currency: string): string {
  return name ? `${name} · ${currency}` : `Wise · ${currency}`;
}

/**
 * Pull new transactions for one connection into `bank_transactions`
 * (status `pending`), ready for triage. Handles consent expiry by flipping
 * the connection to `expired` so the UI can prompt a reconnect.
 */
export async function syncConnection(
  connection: BankConnection,
): Promise<SyncResult> {
  if (!connection.sessionIdEnc) {
    return { ok: false, imported: 0, error: 'Connection not authorized.' };
  }
  if (
    connection.consentExpiresAt &&
    connection.consentExpiresAt.getTime() < Date.now()
  ) {
    await setConnectionStatus(
      connection.id,
      'expired',
      'Bank access expired — reconnect to keep syncing.',
    );
    return { ok: false, imported: 0, expired: true, error: 'Consent expired.' };
  }

  // Seed the auto-ignore rules on connections that predate the feature.
  let ignorePatterns = connection.ignorePatterns;
  if (ignorePatterns == null) {
    await setConnectionIgnorePatterns(connection.userId, DEFAULT_IGNORE_PATTERNS);
    ignorePatterns = DEFAULT_IGNORE_PATTERNS;
  }

  // Ensure the connection has a bank (predates the feature, or was cleared)
  // so synced + triaged transactions get tagged and land in the right tab.
  let bankId = connection.bankId;
  if (!bankId) {
    const bank = await createBank(connection.userId, {
      name: connection.aspspName || 'Wise',
      color: '#37e2b8',
    }).catch(() => null);
    if (bank) {
      await setConnectionBankIfUnset(connection.id, bank.id);
      bankId = bank.id;
    }
  }

  // Enable Banking binds each account uid to its session server-side, so
  // data calls only need the app JWT — the stored session id is for
  // `GET/DELETE /sessions/{id}` (status checks, disconnect).
  const accounts = await listBankAccounts(connection.id);
  if (accounts.length === 0) {
    await markConnectionSynced(connection.id);
    return { ok: true, imported: 0 };
  }

  // One-time backfill: tag any pre-existing rows for these accounts.
  if (bankId) {
    await backfillTransactionsBank(
      connection.userId,
      bankId,
      accounts.map((a) => a.id),
    );
  }

  const ignoreMatchers = parseIgnorePatterns(ignorePatterns);

  let imported = 0;
  try {
    for (const account of accounts) {
      const since = account.lastSyncedAt
        ? new Date(account.lastSyncedAt.getTime() - OVERLAP_MS)
        : new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);

      const raw = await fetchAllTransactions(account.uid, ymd(since));
      const label = accountLabel(account.name, account.currency);
      const rows = raw
        .map((t) => mapEbTransaction(t, label))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) =>
          shouldIgnore(ignoreMatchers, r.description, r.rawType)
            ? { ...r, status: 'ignored' as const }
            : r,
        );

      if (rows.length > 0) {
        imported += await insertSyncedTransactions(
          connection.userId,
          account.id,
          rows,
          bankId,
        );
      }
      await markBankAccountSynced(account.id);
    }
  } catch (err) {
    if (isConsentError(err)) {
      await setConnectionStatus(
        connection.id,
        'expired',
        'Bank access expired — reconnect to keep syncing.',
      );
      return {
        ok: false,
        imported,
        expired: true,
        error: 'Consent expired.',
      };
    }
    const message = err instanceof Error ? err.message : 'Sync failed.';
    await setConnectionStatus(connection.id, 'error', message);
    return { ok: false, imported, error: message };
  }

  // Retro-apply the ignore rules to anything still pending (rules that were
  // added, or defaults just seeded, after those rows first came in).
  if (ignoreMatchers.length > 0) {
    const pending = await listPendingBankTransactions(connection.userId);
    const stale = pending
      .filter(
        (t) =>
          (bankId == null || t.bankId === bankId) &&
          shouldIgnore(ignoreMatchers, t.description, t.rawType),
      )
      .map((t) => t.id);
    if (stale.length > 0)
      await markBankTransactionsIgnored(connection.userId, stale);
  }

  await markConnectionSynced(connection.id);
  if (connection.status !== 'active') {
    await setConnectionStatus(connection.id, 'active');
  }
  return { ok: true, imported };
}

function ebAccountToInput(a: EbAccount): BankAccountInput {
  return {
    uid: a.uid,
    name: a.name ?? null,
    currency: (a.currency ?? 'GBP').toUpperCase(),
    identification:
      a.account_id?.iban ??
      a.account_id?.other?.identification ??
      null,
    cashAccountType: a.cash_account_type ?? null,
  };
}

export interface CompleteResult {
  ok: boolean;
  error?: string;
  imported?: number;
}

/**
 * Exchange the auth `code` from the redirect for a session, store it, record
 * the accounts, and run a first backfill. `state` must match what we issued.
 */
export async function completeConnection(
  userId: string,
  code: string,
  state: string,
): Promise<CompleteResult> {
  const connection = await getBankConnection(userId);
  if (!connection) return { ok: false, error: 'No pending connection.' };
  if (!connection.authState || connection.authState !== state) {
    return { ok: false, error: 'Authorization state mismatch.' };
  }

  let session;
  try {
    session = await createSession(code);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not create session.';
    await setConnectionStatus(connection.id, 'error', message);
    return { ok: false, error: message };
  }

  const validUntil = session.access?.valid_until
    ? new Date(session.access.valid_until)
    : connection.consentExpiresAt ?? null;

  await activateConnection(connection.id, {
    sessionIdEnc: encryptSecret(session.session_id),
    psuIdHash: session.psu_id_hash ?? connection.psuIdHash ?? null,
    consentExpiresAt: validUntil,
  });

  await replaceBankAccounts(
    connection.id,
    userId,
    (session.accounts ?? []).map(ebAccountToInput),
  );

  // `syncConnection` (below) associates the bank and seeds ignore rules.
  const fresh = await getBankConnection(userId);
  if (!fresh) return { ok: true, imported: 0 };
  const res = await syncConnection(fresh);
  return { ok: true, imported: res.imported, error: res.error };
}

/**
 * Retroactively apply the ignore rules to transactions still `pending` for
 * this user's connection bank — so editing the rules (or seeding the
 * defaults) also cleans up what's already in the inbox. Returns how many
 * were newly ignored.
 */
export async function reapplyIgnoreRules(userId: string): Promise<number> {
  const connection = await getBankConnection(userId);
  if (!connection) return 0;
  const matchers = parseIgnorePatterns(connection.ignorePatterns);
  if (matchers.length === 0) return 0;
  const pending = await listPendingBankTransactions(userId);
  const ids = pending
    .filter(
      (t) =>
        (connection.bankId == null || t.bankId === connection.bankId) &&
        shouldIgnore(matchers, t.description, t.rawType),
    )
    .map((t) => t.id);
  return markBankTransactionsIgnored(userId, ids);
}

/** Sync the signed-in user's connection on demand. */
export async function syncUserConnection(userId: string): Promise<SyncResult> {
  const connection = await getBankConnection(userId);
  if (!connection) return { ok: false, imported: 0, error: 'No bank connected.' };
  if (connection.status === 'pending') {
    return { ok: false, imported: 0, error: 'Finish connecting your bank first.' };
  }
  return syncConnection(connection);
}

/**
 * Cron entry point: every syncable connection, one at a time (the Supabase
 * pooler can't take parallel DB-heavy work — see project notes).
 */
export async function syncAllConnections(): Promise<{
  connections: number;
  imported: number;
}> {
  const connections = await listSyncableConnections();
  let imported = 0;
  for (const connection of connections) {
    try {
      const res = await syncConnection(connection);
      imported += res.imported;
    } catch {
      // syncConnection already records per-connection errors; keep going.
    }
  }
  return { connections: connections.length, imported };
}
