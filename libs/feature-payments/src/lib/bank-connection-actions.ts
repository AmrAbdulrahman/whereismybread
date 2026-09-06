'use server';

import { randomUUID } from 'node:crypto';
import { decryptSecret, requireUserId } from '@wib/auth/server';
import { serverEnv } from '@wib/config';
import {
  deleteBankConnection,
  getBankConnection,
  upsertPendingConnection,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import {
  deleteSession,
  isEnableBankingConfigured,
  listAspsps,
  startAuthorization,
} from './enablebanking-client';
import { syncUserConnection } from './bank-sync';

// Wise is not offered for GB via Enable Banking — only ~27 EEA countries.
// Wise Europe SA/NV is Belgium-based, so BE is the natural pick; any EEA
// country resolves to the same Wise consent screen.
const DEFAULT_ASPSP = { name: 'Wise', country: 'BE' };
/** Wise allows 180 days; stay just under. */
const MAX_CONSENT_DAYS = 179;
const CALLBACK_PATH = '/api/bank-sync/enable-banking/callback';

export interface BankOption {
  name: string;
  country: string;
}

/** Wise variants Enable Banking exposes for this app, for the connect picker. */
export async function listBankOptionsAction(): Promise<BankOption[]> {
  await requireUserId();
  if (!isEnableBankingConfigured()) return [];
  try {
    const all = await listAspsps(DEFAULT_ASPSP.country);
    const wise = all.filter((a) => /wise|transferwise/i.test(a.name));
    return (wise.length > 0 ? wise : [DEFAULT_ASPSP]).map((a) => ({
      name: a.name,
      country: a.country,
    }));
  } catch {
    return [DEFAULT_ASPSP];
  }
}

export interface StartConnectResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function startBankConnectionAction(
  choice?: BankOption,
): Promise<StartConnectResult> {
  const userId = await requireUserId();
  if (!isEnableBankingConfigured()) {
    return { ok: false, error: 'Bank sync is not configured on this server.' };
  }

  const aspsp = choice ?? DEFAULT_ASPSP;
  const state = randomUUID();
  const redirectUrl = `${serverEnv().APP_URL}${CALLBACK_PATH}`;

  // Respect the ASPSP's own consent ceiling when we can see it.
  let validDays = MAX_CONSENT_DAYS;
  try {
    const list = await listAspsps(aspsp.country);
    const match = list.find(
      (a) => a.name === aspsp.name && a.country === aspsp.country,
    );
    if (match?.maximum_consent_validity) {
      validDays = Math.min(
        MAX_CONSENT_DAYS,
        Math.floor(match.maximum_consent_validity / 86400),
      );
    }
  } catch {
    /* fall back to MAX_CONSENT_DAYS */
  }
  const validUntil = new Date(
    Date.now() + validDays * 24 * 60 * 60 * 1000,
  );

  await upsertPendingConnection(userId, {
    aspspName: aspsp.name,
    aspspCountry: aspsp.country,
    authState: state,
  });

  try {
    const res = await startAuthorization({
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      state,
      redirectUrl,
      validUntil,
      psuType: 'personal',
    });
    return { ok: true, url: res.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not start authorization.',
    };
  }
}

export async function disconnectBankAction(): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const connection = await getBankConnection(userId);
  if (connection?.sessionIdEnc) {
    try {
      await deleteSession(decryptSecret(connection.sessionIdEnc));
    } catch {
      /* best effort */
    }
  }
  await deleteBankConnection(userId);
  revalidatePath('/account');
  revalidatePath('/transactions');
  return { ok: true };
}

export interface SyncNowResult {
  ok: boolean;
  imported?: number;
  error?: string;
}

export async function syncNowAction(): Promise<SyncNowResult> {
  const userId = await requireUserId();
  const res = await syncUserConnection(userId);
  revalidatePath('/transactions');
  revalidatePath('/plan');
  revalidatePath('/account');
  return res.ok
    ? { ok: true, imported: res.imported }
    : { ok: false, error: res.error };
}
