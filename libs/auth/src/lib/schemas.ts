import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');
const name = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(80, 'That name is too long');

export const signUpSchema = z.object({ name, email, password });
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.input<typeof signInSchema>;

export const requestResetSchema = z.object({ email });
export type RequestResetInput = z.input<typeof requestResetSchema>;

/** Client form for the reset screen — the token comes from the route. */
export const newPasswordSchema = z.object({ password });
export type NewPasswordInput = z.input<typeof newPasswordSchema>;

/** Server payload for the reset action. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({ name });
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

const currencyCode = z.string().trim().toUpperCase().length(3);

/** A non-negative number as typed, e.g. "3,200", "3200.50", "" → 0. */
const nonNegNumber = z
  .string()
  .trim()
  .default('0')
  .refine(
    (v) => v === '' || Number.isFinite(Number(v.replace(/[, ]/g, ''))),
    'Not a number',
  )
  .refine(
    (v) => Number(v.replace(/[, ]/g, '') || '0') >= 0,
    'Cannot be negative',
  );

export const preferencesSchema = z.object({
  timezone: z.string().trim().min(1).max(64),
  defaultCurrency: currencyCode,
  displayCurrency: currencyCode,
  /** How income is worked out. */
  incomeMode: z.enum(['fixed', 'hourly']).default('fixed'),
  /** Currency for the income / hourly-rate figures. */
  incomeCurrency: currencyCode,
  /** Flat monthly income (fixed mode). */
  income: nonNegNumber,
  /** Pay per hour (hourly mode). */
  hourlyRate: nonNegNumber,
  /** Usual hours worked per month (hourly mode). */
  monthlyHours: nonNegNumber,
});
export type PreferencesInput = z.input<typeof preferencesSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/** Flatten a ZodError into the { field: [messages] } shape forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
