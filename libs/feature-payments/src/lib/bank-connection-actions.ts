'use server';

import { randomUUID } from 'node:crypto';
import { decryptSecret, requireUserId } from '@wib/auth/server';
import { serverEnv } from '@wib/config';
import {
  deleteBankConnection,
  getBankConnectionById,
  setConnectionBank,
  setConnectionIgnorePatterns,
  upsertPendingConnection,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import {
  deleteSession,
  isEnableBankingConfigured,
  listAspsps,
  startAuthorization,
} from './enablebanking-client';
import {
  CONNECTABLE_BANKS,
  connectableForBankName,
} from './connectable-banks';
import { reapplyIgnoreRules, syncConnectionById } from './bank-sync';

/** Most ASPSPs cap consent at 180 days — stay just under. */
const MAX_CONSENT_DAYS = 179;
const CALLBACK_PATH = '/api/bank-sync/enable-banking/callback';

export interface StartConnectResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function startBankConnectionAction(choice: {
  aspspName?: string;
  bankName?: string;
}): Promise<StartConnectResult> {
  const userId = await requireUserId();
  if (!isEnableBankingConfigured()) {
    return { ok: false, error: 'Bank sync is not configured on this server.' };
  }

  const target = choice.aspspName
    ? CONNECTABLE_BANKS.find((b) => b.aspspName === choice.aspspName)
    : choice.bankName
      ? connectableForBankName(choice.bankName)
      : undefined;
  if (!target) {
    return { ok: false, error: "This bank can't be connected automatically." };
  }

  const state = randomUUID();
  const redirectUrl = `${serverEnv().APP_URL}${CALLBACK_PATH}`;

  // Respect the ASPSP's own consent ceiling when we can see it.
  let validDays = MAX_CONSENT_DAYS;
  try {
    const list = await listAspsps(target.aspspCountry);
    const match = list.find(
      (a) => a.name === target.aspspName && a.country === target.aspspCountry,
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
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  await upsertPendingConnection(userId, {
    aspspName: target.aspspName,
    aspspCountry: target.aspspCountry,
    authState: state,
  });

  try {
    const res = await startAuthorization({
      aspspName: target.aspspName,
      aspspCountry: target.aspspCountry,
      state,
      redirectUrl,
      validUntil,
      psuType: target.psuType,
    });
    return { ok: true, url: res.url };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Could not start authorization.',
    };
  }
}

export async function disconnectBankAction(
  connectionId: string,
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const connection = await getBankConnectionById(userId, connectionId);
  if (connection?.sessionIdEnc) {
    try {
      await deleteSession(decryptSecret(connection.sessionIdEnc));
    } catch {
      /* best effort */
    }
  }
  if (connection) await deleteBankConnection(userId, connection.id);
  revalidatePath('/settings');
  revalidatePath('/integrations');
  return { ok: true };
}

export interface SyncNowResult {
  ok: boolean;
  imported?: number;
  error?: string;
}

export async function syncNowAction(
  connectionId: string,
): Promise<SyncNowResult> {
  const userId = await requireUserId();
  const res = await syncConnectionById(userId, connectionId);
  revalidatePath('/integrations');
  revalidatePath('/plan');
  revalidatePath('/settings');
  return res.ok
    ? { ok: true, imported: res.imported }
    : { ok: false, error: res.error };
}

/** Set (or clear, with null) the bank a connection's transactions are tagged with. */
export async function setConnectionBankAction(
  connectionId: string,
  bankId: string | null,
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const connection = await getBankConnectionById(userId, connectionId);
  if (!connection) return { ok: false };
  await setConnectionBank(
    connection.id,
    bankId && bankId.length > 0 ? bankId : null,
  );
  revalidatePath('/settings');
  revalidatePath('/integrations');
  return { ok: true };
}

export async function setIgnorePatternsAction(
  connectionId: string,
  patterns: string,
): Promise<{ ok: boolean; ignored?: number }> {
  const userId = await requireUserId();
  const connection = await getBankConnectionById(userId, connectionId);
  if (!connection) return { ok: false };
  const trimmed = patterns.trim();
  await setConnectionIgnorePatterns(
    connection.id,
    trimmed.length > 0 ? patterns : '',
  );
  const ignored = await reapplyIgnoreRules(userId, connection.id);
  revalidatePath('/settings');
  revalidatePath('/integrations');
  revalidatePath('/plan');
  return { ok: true, ignored };
}
