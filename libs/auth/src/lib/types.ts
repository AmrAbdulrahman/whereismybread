/** Client-safe types shared across the auth surface. */
export type { FormState } from './form-state';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  defaultCurrency: string;
  emailVerified: boolean;
}
