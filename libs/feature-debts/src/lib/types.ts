import type { DebtDenomination, DebtDirection } from '@wib/domain';
import type { StoredAttachment } from '@wib/ui';

/** Client-safe view models — no DB rows, no server-only imports. */

export type { StoredAttachment, DebtDenomination };

export interface PersonView {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  shareId: string;
  /** How many debts reference this person (people manager / delete guard). */
  debtCount: number;
}

/** A user-defined denomination from the debt-things catalogue. */
export interface ThingView {
  id: string;
  name: string;
  logoUrl: string | null;
  unit: 'g' | 'piece';
  /** Per-unit reference value (minor units of `valueCurrency`). */
  valueMinor: number;
  valueCurrency: string;
  /** How many debt rows / repayments use it (manager / delete guard). */
  useCount: number;
}

/** One principal row of a debt basket. */
export interface DebtRowView {
  id: string;
  denom: DebtDenomination;
  amountMinor: number;
}

/** A free-form repayment. */
export interface DebtEntryView {
  id: string;
  denom: DebtDenomination;
  amountMinor: number;
  note: string | null;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  createdAt: string;
  attachments: StoredAttachment[];
}

/** The running balance for one denomination of a debt. */
export interface DenomBalanceView {
  denom: DebtDenomination;
  owedMinor: number;
  repaidMinor: number;
  outstandingMinor: number;
  progress: number;
  settled: boolean;
  /** Outstanding converted to the display currency — `null` if it can't be. */
  equivalentMinor: number | null;
}

export interface DebtView {
  id: string;
  direction: DebtDirection;
  description: string;
  notes: string | null;
  /** `YYYY-MM-DD` — when the debt was incurred. */
  incurredOn: string;
  createdAt: string;
  settled: boolean;
  person: PersonView;
  rows: DebtRowView[];
  balances: DenomBalanceView[];
  entryCount: number;
  /** Sum of every balance's equivalent (display currency); `null` if any
   * outstanding balance couldn't be converted. */
  equivalentMinor: number | null;
}

export interface DebtDetail extends DebtView {
  entries: DebtEntryView[];
  /** Debt-level attachments. */
  attachments: StoredAttachment[];
}

export interface DebtsData {
  debts: DebtView[];
  people: PersonView[];
  things: ThingView[];
  usedCurrencies: string[];
  defaultCurrency: string;
  /** The currency amounts are shown converted into. */
  displayCurrency: string;
  /** `YYYY-MM-DD` in the user's timezone. */
  today: string;
  /** Absolute origin for building share links (`${appUrl}/d/<shareId>`). */
  appUrl: string;
}

/** What the OTP-verified shared page renders for one person. */
export interface SharedView {
  personName: string;
  ownerName: string;
  /** The owner's display currency — equivalents are shown in it. */
  displayCurrency: string;
  /** The owner's things (id → name/logo), for rendering marks on shared rows. */
  things: Array<{ id: string; name: string; logoUrl: string | null }>;
  debts: Array<{
    id: string;
    direction: DebtDirection;
    description: string;
    incurredOn: string;
    settled: boolean;
    rows: DebtRowView[];
    balances: DenomBalanceView[];
    entries: DebtEntryView[];
    attachments: StoredAttachment[];
    equivalentMinor: number | null;
  }>;
}
