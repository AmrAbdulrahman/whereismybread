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
