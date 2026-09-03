'use server';

import {
  createEmailVerificationToken,
  createPasswordResetToken,
  createUser,
  deleteUserEmailVerificationTokens,
  deleteUserPasswordResetTokens,
  findLiveEmailVerificationToken,
  findLivePasswordResetToken,
  findUserByEmail,
  findUserById,
  markEmailVerificationTokenUsed,
  markEmailVerified,
  markPasswordResetTokenUsed,
  updateUserPassword,
  updateUserPreferences,
  updateUserProfile,
} from '@wib/db';
import { parseMoneyInput } from '@wib/domain';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, signIn, signOut } from './auth';
import { sendPasswordResetEmail, sendVerificationEmail } from './email';
import type { FormState } from './form-state';
import { hashPassword, isPasswordPwned, verifyPassword } from './password';
import { rateLimit } from './rate-limit';
import {
  changePasswordSchema,
  fieldErrors,
  preferencesSchema,
  requestResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type NewPasswordInput,
  type PreferencesInput,
  type RequestResetInput,
  type SignInInput,
  type SignUpInput,
  type UpdateProfileInput,
} from './schemas';
import {
  RESET_TOKEN_TTL_MS,
  VERIFY_TOKEN_TTL_MS,
  expiryFromNow,
  generateToken,
  hashToken,
} from './tokens';

/**
 * Actions take typed objects (react-hook-form + zodResolver validate on the
 * client) and re-validate with the same schema here — the client is never
 * trusted. `fieldErrors` maps back onto the form via `setError`.
 */

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

const PWNED_MESSAGE =
  'That password showed up in a data breach — please choose another';

function safeNext(value: string | undefined): string {
  const next = value ?? '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/plan';
}

// --- log in ----------------------------------------------------------------

export async function loginAction(
  input: SignInInput,
  next?: string,
): Promise<FormState> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const limit = rateLimit(
    `login:${await clientIp()}:${parsed.data.email}`,
    8,
    15 * 60 * 1000,
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: 'Too many attempts. Try again in a few minutes.',
    };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeNext(next),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: 'Email or password is incorrect.' };
    }
    throw error; // NEXT_REDIRECT on success
  }
  return { ok: false, error: 'Something went wrong. Try again.' };
}

// --- sign up -----------------------------------------------------------------

export async function registerAction(
  input: SignUpInput,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { name, email, password } = parsed.data;

  const limit = rateLimit(`signup:${await clientIp()}`, 20, 60 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, error: 'Too many attempts. Try again later.' };
  }

  if (await findUserByEmail(email)) {
    return {
      ok: false,
      fieldErrors: { email: ['That email is already registered'] },
    };
  }
  if (await isPasswordPwned(password)) {
    return { ok: false, fieldErrors: { password: [PWNED_MESSAGE] } };
  }

  let user;
  try {
    user = await createUser({
      name,
      email,
      passwordHash: await hashPassword(password),
    });
  } catch (error) {
    // Unique-violation race between the check above and the insert.
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return {
        ok: false,
        fieldErrors: { email: ['That email is already registered'] },
      };
    }
    throw error;
  }

  const { token, tokenHash } = generateToken();
  await createEmailVerificationToken(
    user.id,
    tokenHash,
    expiryFromNow(VERIFY_TOKEN_TTL_MS),
  );
  await sendVerificationEmail(user.email, token);

  try {
    await signIn('credentials', { email, password, redirectTo: '/plan' });
  } catch (error) {
    if (error instanceof AuthError) redirect('/login');
    throw error; // NEXT_REDIRECT on success
  }
  redirect('/plan');
}

// --- forgot / reset --------------------------------------------------------

const RESET_REQUEST_OK: FormState = {
  ok: true,
  message: 'If an account exists for that email, a reset link is on its way.',
};

export async function requestPasswordResetAction(
  input: RequestResetInput,
): Promise<FormState> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { email } = parsed.data;

  const limit = rateLimit(
    `reset:${await clientIp()}:${email}`,
    3,
    15 * 60 * 1000,
  );
  if (!limit.ok) return RESET_REQUEST_OK;

  const user = await findUserByEmail(email);
  if (user) {
    await deleteUserPasswordResetTokens(user.id);
    const { token, tokenHash } = generateToken();
    await createPasswordResetToken(
      user.id,
      tokenHash,
      expiryFromNow(RESET_TOKEN_TTL_MS),
    );
    await sendPasswordResetEmail(user.email, token);
  }
  return RESET_REQUEST_OK;
}

export async function resetPasswordAction(
  token: string,
  input: NewPasswordInput,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({ token, ...input });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { password } = parsed.data;

  const row = await findLivePasswordResetToken(hashToken(parsed.data.token));
  if (!row) {
    return {
      ok: false,
      error: 'That reset link is invalid or has expired. Request a new one.',
    };
  }
  if (await isPasswordPwned(password)) {
    return { ok: false, fieldErrors: { password: [PWNED_MESSAGE] } };
  }

  await updateUserPassword(row.userId, await hashPassword(password));
  await markPasswordResetTokenUsed(row.id);
  await deleteUserPasswordResetTokens(row.userId);

  redirect('/login?reset=1');
}

// --- email verification ---------------------------------------------------

export async function verifyEmailAction(
  token: string,
): Promise<{ ok: boolean }> {
  const row = await findLiveEmailVerificationToken(hashToken(token));
  if (!row) return { ok: false };
  await markEmailVerified(row.userId);
  await markEmailVerificationTokenUsed(row.id);
  await deleteUserEmailVerificationTokens(row.userId);
  return { ok: true };
}

export async function resendVerificationAction(): Promise<FormState> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { ok: false, error: 'Sign in first.' };

  const user = await findUserById(id);
  if (!user || user.emailVerifiedAt) {
    return { ok: true, message: 'Your email is already confirmed.' };
  }

  await deleteUserEmailVerificationTokens(user.id);
  const { token, tokenHash } = generateToken();
  await createEmailVerificationToken(
    user.id,
    tokenHash,
    expiryFromNow(VERIFY_TOKEN_TTL_MS),
  );
  await sendVerificationEmail(user.email, token);
  return { ok: true, message: 'Confirmation email sent.' };
}

// --- profile -------------------------------------------------------------

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<FormState> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { ok: false, error: 'Sign in first.' };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  await updateUserProfile(id, parsed.data);
  revalidatePath('/account');
  return { ok: true, message: 'Profile saved.' };
}

export async function updatePreferencesAction(
  input: PreferencesInput,
): Promise<FormState> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { ok: false, error: 'Sign in first.' };

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const { income, hourlyRate, monthlyHours, timezone, ...prefs } = parsed.data;
  const num = (v: string) => Number(String(v).replace(/[, ]/g, '') || '0');
  const toMinor = (v: string) => {
    try {
      return parseMoneyInput(v || '0', prefs.incomeCurrency).minorUnits;
    } catch {
      return null;
    }
  };

  const incomeMinor = toMinor(income);
  const hourlyRateMinor = toMinor(hourlyRate);
  if (incomeMinor == null || hourlyRateMinor == null) {
    return {
      ok: false,
      fieldErrors:
        incomeMinor == null
          ? { income: ['Not a valid amount'] }
          : { hourlyRate: ['Not a valid amount'] },
    };
  }

  await updateUserPreferences(id, {
    ...prefs,
    // Empty → auto-detect from the browser.
    timezone: timezone.trim() || null,
    incomeMinor,
    hourlyRateMinor,
    monthlyHours: num(monthlyHours),
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Preferences saved.' };
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<FormState> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { ok: false, error: 'Sign in first.' };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await findUserById(id);
  if (!user) return { ok: false, error: 'Sign in first.' };

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    return {
      ok: false,
      fieldErrors: { currentPassword: ['That’s not your current password'] },
    };
  }
  if (await isPasswordPwned(newPassword)) {
    return { ok: false, fieldErrors: { newPassword: [PWNED_MESSAGE] } };
  }

  await updateUserPassword(id, await hashPassword(newPassword));
  await deleteUserPasswordResetTokens(id);
  return {
    ok: true,
    message:
      'Password changed. Other devices stay signed in until their session expires.',
  };
}

// --- sign out ----------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect('/login');
}
