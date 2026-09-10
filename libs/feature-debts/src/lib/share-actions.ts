'use server';

import { fieldErrors, type FormState } from '@wib/auth';
import {
  generateToken,
  hashToken,
  rateLimit,
  sendDebtOtpEmail,
} from '@wib/auth/server';
import {
  bumpDebtOtpAttempts,
  consumeDebtOtp,
  createDebtGrant,
  createDebtOtp,
  deletePersonDebtOtps,
  findLiveDebtOtp,
  findUserById,
  getDebtPersonByShareId,
} from '@wib/db';
import { cookies, headers } from 'next/headers';
import { DEBT_GRANT_COOKIE, DEBT_GRANT_TTL_MS } from './grant';
import {
  otpRequestSchema,
  otpVerifySchema,
  type OtpRequestValues,
  type OtpVerifyValues,
} from './schema';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const E2E = process.env['AUTH_E2E'] === '1';

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Email a fresh 6-digit code to the person behind `shareId`, but only when the
 * submitted email matches theirs. Always resolves `ok:true` (no account
 * enumeration). `devCode` is returned only under `AUTH_E2E`.
 */
export async function requestDebtOtpAction(
  shareId: string,
  values: OtpRequestValues,
): Promise<FormState & { devCode?: string }> {
  const parsed = otpRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const limit = rateLimit(
    `debt-otp:${await clientIp()}:${shareId}`,
    5,
    15 * 60 * 1000,
  );
  if (!limit.ok) {
    return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
  }

  const person = await getDebtPersonByShareId(shareId);
  const OK: FormState = {
    ok: true,
    message: 'If that email is on this debt, a code is on its way.',
  };
  if (!person || !sameEmail(parsed.data.email, person.email)) return OK;

  await deletePersonDebtOtps(person.id);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await createDebtOtp(
    person.id,
    person.email,
    hashToken(code),
    new Date(Date.now() + OTP_TTL_MS),
  );
  const owner = await findUserById(person.userId);
  await sendDebtOtpEmail(person.email, code, owner?.name?.trim() || 'Someone');

  return E2E ? { ...OK, devCode: code } : OK;
}

/**
 * Check the code, and on success mint a 30-day grant cookie for this browser.
 * The client reloads the page afterwards.
 */
export async function verifyDebtOtpAction(
  shareId: string,
  values: OtpVerifyValues,
): Promise<FormState> {
  const parsed = otpVerifySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const person = await getDebtPersonByShareId(shareId);
  if (!person || !sameEmail(parsed.data.email, person.email)) {
    return { ok: false, error: 'That code is invalid or has expired.' };
  }

  const otp = await findLiveDebtOtp(person.id);
  if (!otp || otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: 'That code is invalid or has expired.' };
  }
  if (hashToken(parsed.data.code) !== otp.codeHash) {
    const attempts = await bumpDebtOtpAttempts(otp.id);
    return {
      ok: false,
      error:
        attempts >= MAX_OTP_ATTEMPTS
          ? 'Too many wrong codes. Request a new one.'
          : 'That code is not right.',
    };
  }

  await consumeDebtOtp(otp.id);
  const { token, tokenHash } = generateToken();
  await createDebtGrant(
    person.id,
    person.email,
    tokenHash,
    new Date(Date.now() + DEBT_GRANT_TTL_MS),
  );
  (await cookies()).set(DEBT_GRANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    // `/` so it also reaches `/api/attachments` when the shared page loads a
    // private blob — not just `/d/*`.
    path: '/',
    maxAge: Math.floor(DEBT_GRANT_TTL_MS / 1000),
  });
  return { ok: true };
}
