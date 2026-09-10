import type { DebtDirection } from '@wib/domain';

/** Client-safe view models — no DB rows, no server-only imports. */

export interface PersonView {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  shareId: string;
}

export interface DebtEntryView {
  id: string;
  amountMinor: number;
  note: string | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  createdAt: string;
}

export interface DebtView {
  id: string;
  direction: DebtDirection;
  currency: string;
  principalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  progress: number;
  settled: boolean;
  description: string;
  notes: string | null;
  createdAt: string;
  person: PersonView;
  entryCount: number;
}

export interface DebtDetail extends DebtView {
  entries: DebtEntryView[];
}

export interface DebtsData {
  debts: DebtView[];
  people: PersonView[];
  /** Currencies already in use, to prime the amount field's picker. */
  usedCurrencies: string[];
  defaultCurrency: string;
  /** `YYYY-MM-DD` in the user's timezone. */
  today: string;
  /** Absolute origin for building share links (`${appUrl}/d/<shareId>`). */
  appUrl: string;
}

/** What the OTP-verified shared page renders for one person. */
export interface SharedView {
  personName: string;
  ownerName: string;
  debts: Array<{
    id: string;
    direction: DebtDirection;
    currency: string;
    principalMinor: number;
    paidMinor: number;
    remainingMinor: number;
    progress: number;
    settled: boolean;
    description: string;
    entries: DebtEntryView[];
  }>;
}
