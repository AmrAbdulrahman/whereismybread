// Client-safe surface. Server actions ('use server') are safe to import into
// client components; the runtime graph behind them never enters the browser
// bundle. Node-only exports live in `@wib/auth/server`.

export type { FormState, SessionUser } from './lib/types';

export {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  verifyEmailAction,
  resendVerificationAction,
  updateProfileAction,
  updatePreferencesAction,
  changePasswordAction,
  signOutAction,
} from './lib/actions';

export {
  signUpSchema,
  signInSchema,
  requestResetSchema,
  newPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  preferencesSchema,
  changePasswordSchema,
  fieldErrors,
  type SignUpInput,
  type SignInInput,
  type RequestResetInput,
  type NewPasswordInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type PreferencesInput,
  type ChangePasswordInput,
} from './lib/schemas';
