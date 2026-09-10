import type { DebtDirection } from '@wib/domain';
import type { StoredAttachment } from '@wib/ui';

/** Client-safe view models — no DB rows, no server-only imports. */

export type { StoredAttachment };

export interface PersonView {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  shareId: string;
  /** How many debts reference this person (people manager / delete guard). */
  debtCount: number;
}

export interface DebtEntryView {
  id: string;
  amountMinor: number;
  note: string | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  createdAt: string;
  attachments: StoredAttachment[];
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
  /** `YYYY-MM-DD` — when the debt was incurred. */
  incurredOn: string;
  createdAt: string;
  person: PersonView;
  entryCount: number;
}

export interface DebtDetail extends DebtView {
  entries: DebtEntryView[];
  /** Debt-level attachments. */
  attachments: StoredAttachment[];
}

export interface DebtsData {
  debts: DebtView[];
  people: PersonView[];
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
    incurredOn: string;
    attachments: StoredAttachment[];
    entries: DebtEntryView[];
  }>;
}
