/** Client-safe types shared across the auth surface. */
export type { FormState } from './form-state';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  /** The effective IANA zone — the stored override, else browser-detected, else UTC. */
  timezone: string;
  /** True when no explicit override is stored (the zone is auto-detected). */
  timezoneAuto: boolean;
  defaultCurrency: string;
  displayCurrency: string;
  /** 'fixed' → a flat monthly figure; 'hourly' → hours × a rate. */
  incomeMode: 'fixed' | 'hourly';
  /** Currency the income / hourly-rate figures are in. */
  incomeCurrency: string;
  /** Flat monthly income (fixed mode), in `incomeCurrency` minor units. */
  incomeMinor: number;
  /** Pay per hour (hourly mode), in `incomeCurrency` minor units. */
  hourlyRateMinor: number;
  /** Usual hours worked per month (hourly mode). */
  monthlyHours: number;
  emailVerified: boolean;
}
