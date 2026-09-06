import 'server-only';

import { createSign } from 'node:crypto';
import { serverEnv } from '@wib/config';

/**
 * Thin client for the Enable Banking AIS API.
 * Docs: https://enablebanking.com/docs/api/reference/
 *
 * Auth is a short-lived RS256 JWT signed with the application's RSA private
 * key; `kid` is the application id. We cache the JWT for ~23h.
 */

const API_URL = () =>
  serverEnv().ENABLE_BANKING_API_URL ?? 'https://api.enablebanking.com';

export class EnableBankingError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'EnableBankingError';
    this.status = status;
    this.body = body;
  }
}

/** A 401/403 that means the consent/session is gone — user must reconnect. */
export function isConsentError(err: unknown): boolean {
  return (
    err instanceof EnableBankingError &&
    (err.status === 401 || err.status === 403)
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function privateKeyPem(): string {
  const raw = serverEnv().ENABLE_BANKING_PRIVATE_KEY;
  if (!raw) throw new Error('ENABLE_BANKING_PRIVATE_KEY is not set.');
  if (raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  return Buffer.from(raw, 'base64').toString('utf8');
}

let cachedJwt: { token: string; exp: number } | null = null;

function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - now > 120) return cachedJwt.token;

  const appId = serverEnv().ENABLE_BANKING_APP_ID;
  if (!appId) throw new Error('ENABLE_BANKING_APP_ID is not set.');

  const exp = now + 23 * 60 * 60;
  const header = b64url(
    JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }),
  );
  const payload = b64url(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: now,
      exp,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKeyPem());
  const token = `${signingInput}.${b64url(signature)}`;
  cachedJwt = { token, exp };
  return token;
}

async function ebFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(API_URL() + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v != null) url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${appJwt()}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new EnableBankingError(
      `Enable Banking request failed: ${(err as Error).message}`,
      0,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { error?: string } | null)?.error ??
      res.statusText;
    throw new EnableBankingError(
      `Enable Banking ${res.status}: ${detail}`,
      res.status,
      body,
    );
  }
  return body as T;
}

// --- Types ---------------------------------------------------------------

export interface EbAspsp {
  name: string;
  country: string;
  psu_types?: string[];
  maximum_consent_validity?: number;
}

export interface EbAccount {
  uid: string;
  name?: string | null;
  currency: string;
  account_id?: { iban?: string; other?: { identification?: string } } | null;
  cash_account_type?: string | null;
}

export interface EbAmount {
  currency: string;
  amount: string;
}

export interface EbTransaction {
  transaction_id?: string | null;
  entry_reference?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator?: string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  balance_after_transaction?: EbAmount | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  bank_transaction_code?: {
    code?: string | null;
    description?: string | null;
  } | null;
  note?: string | null;
  [k: string]: unknown;
}

// --- Endpoints ----------------------------------------------------------

export async function listAspsps(country: string): Promise<EbAspsp[]> {
  const res = await ebFetch<{ aspsps: EbAspsp[] }>('/aspsps', {
    query: { country },
  });
  return res.aspsps ?? [];
}

export interface StartAuthInput {
  aspspName: string;
  aspspCountry: string;
  state: string;
  redirectUrl: string;
  validUntil: Date;
  psuType?: 'personal' | 'business';
}

export async function startAuthorization(input: StartAuthInput): Promise<{
  url: string;
  authorization_id: string;
  psu_id_hash?: string;
}> {
  return ebFetch('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: input.validUntil.toISOString() },
      aspsp: { name: input.aspspName, country: input.aspspCountry },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: input.psuType ?? 'personal',
    }),
  });
}

export interface EbSession {
  session_id: string;
  accounts: EbAccount[];
  aspsp: { name: string; country: string };
  access: { valid_until?: string };
  status?: string;
  psu_id_hash?: string;
}

export async function createSession(code: string): Promise<EbSession> {
  return ebFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function getSession(sessionId: string): Promise<EbSession> {
  return ebFetch(`/sessions/${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await ebFetch(`/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {
    /* best effort */
  });
}

/**
 * All transactions for an account from `dateFrom` onward, following
 * `continuation_key` pagination. Capped at 40 pages as a safety valve.
 */
export async function fetchAllTransactions(
  accountUid: string,
  dateFrom: string,
): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let continuationKey: string | undefined;
  for (let page = 0; page < 40; page += 1) {
    const res = await ebFetch<{
      transactions: EbTransaction[];
      continuation_key?: string | null;
    }>(`/accounts/${accountUid}/transactions`, {
      query: {
        date_from: dateFrom,
        continuation_key: continuationKey,
      },
    });
    out.push(...(res.transactions ?? []));
    if (!res.continuation_key) break;
    continuationKey = res.continuation_key;
  }
  return out;
}

export function isEnableBankingConfigured(): boolean {
  const env = serverEnv();
  return Boolean(
    env.ENABLE_BANKING_APP_ID && env.ENABLE_BANKING_PRIVATE_KEY,
  );
}
