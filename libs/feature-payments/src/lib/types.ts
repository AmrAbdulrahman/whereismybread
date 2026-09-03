import type { PaymentOverrides } from '@wib/db';
import type { Money, PaymentMethodKind, RateMap } from '@wib/domain';

export interface OccurrenceTag {
  id: string;
  name: string;
  color: string;
}

export interface OccurrenceMethod {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  iconKey: string;
  logoUrl: string | null;
  color: string;
}

export interface OccurrenceAccount {
  id: string;
  name: string;
  color: string;
}

export interface OccurrenceBank {
  id: string;
  name: string;
  color: string;
}

export interface OccurrenceRecipientMethod {
  id: string;
  name: string;
  iconKey: string;
  logoUrl: string | null;
  color: string;
}

/** A file attached to a payment, stored in Vercel Blob. */
export interface OccurrenceAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  pathname: string;
}

/** One record of a `group` payment, resolved for display. */
export interface OccurrenceLineItem {
  id: string;
  name: string;
  /** The record's value in its own currency. */
  amount: Money;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
}

/** One concrete due date of a payment, with its paid state. */
export interface BoardOccurrence {
  key: string; // `${paymentId}:${dueDate}`
  paymentId: string;
  name: string;
  dueDate: string; // YYYY-MM-DD
  /** The full charge for this occurrence (base + fee; rate × units when per-unit). */
  amount: Money;
  /** The surcharge portion of `amount`, in the same currency's minor units. */
  feeMinor: number;
  /** "+2.5%" / "+€1.50" when this payment has a fee, else null. */
  feeLabel: string | null;
  amountKind: 'fixed' | 'per_unit' | 'group';
  /** e.g. "session" — per-unit payments only. */
  unitName: string | null;
  /** Units billed this occurrence — per-unit payments only. */
  units: number | null;
  /** Price of one unit — per-unit payments only. */
  rate: Money | null;
  /** The records this amount is the sum of — group payments only. */
  lineItems: OccurrenceLineItem[] | null;
  /** Files attached to the payment (series-level, shown on every occurrence). */
  attachments: OccurrenceAttachment[];
  recurrence: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  isOneTime: boolean;
  isSubscription: boolean;
  /** True when this month has a per-occurrence override. */
  isException: boolean;
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  method: OccurrenceMethod | null;
  account: OccurrenceAccount | null;
  bank: OccurrenceBank | null;
  /** How a manual payment is sent — set only when the method is manual. */
  recipientMethod: OccurrenceRecipientMethod | null;
  tags: OccurrenceTag[];
  status: 'scheduled' | 'paid' | 'skipped';
}

export interface DayGroup {
  date: string;
  relativeLabel: string; // "Today", "in 3 days", "12 Oct"
  occurrences: BoardOccurrence[];
  /** Sum of the day's occurrences, converted into `currency`. */
  totalMinor: number;
  /** The display currency — day totals are always shown converted. */
  currency: string;
}

/** A `group` record as the form edits it (value is a typed string). */
export interface EditableLineItem {
  id: string;
  name: string;
  value: string;
  currency: string;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
}

export interface EditablePayment {
  id: string;
  name: string;
  amountKind: 'fixed' | 'per_unit' | 'group';
  /** Fixed: the charge. Per-unit: the price of one unit. Major units as typed. */
  amount: string;
  /** The records — group payments only (empty otherwise). */
  lineItems: EditableLineItem[];
  /** Attachments already saved against this payment (edit mode). */
  attachments: OccurrenceAttachment[];
  unitName: string | null;
  defaultUnits: string;
  /** `none` | `fixed` | `percent` surcharge on top of the amount. */
  feeKind: 'none' | 'fixed' | 'percent';
  /** For `fixed` a major-unit amount, for `percent` a number like "2.5". As typed. */
  feeValue: string;
  currency: string;
  methodId: string | null;
  accountId: string | null;
  bankId: string | null;
  recipientMethodId: string | null;
  recurrence: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  anchorDate: string;
  /** For recurring payments — the day it lands each period, as typed ('' if none). */
  dayOfMonth: string;
  endsOn: string | null;
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  isSubscription: boolean;
  notes: string | null;
  tags: string[];
}

export interface PaymentBoard {
  today: string;
  window: { from: string; to: string };
  /**
   * `YYYY-MM` of the earliest month any payment can produce an occurrence in
   * (the earliest series/one-time start). `null` when there are no payments.
   * The list uses it to know when scrolling back has reached the beginning.
   */
  startedMonth: string | null;
  occurrences: BoardOccurrence[];
  groups: DayGroup[];
  editable: Record<string, EditablePayment>;
  /** Per-occurrence overrides, keyed `${paymentId}:${dueDate}`. */
  overrides: Record<string, PaymentOverrides>;
  /** Whether the user has any payments at all (regardless of the window). */
  hasPayments: boolean;
  /** Currency every amount is shown converted into. */
  displayCurrency: string;
  /** Currency income is stored and edited in. */
  defaultCurrency: string;
  /** 'fixed' → edit a monthly amount; 'hourly' → edit hours worked. */
  incomeMode: 'fixed' | 'hourly';
  /** Currency the global income / hourly rate are stored in. */
  incomeCurrency: string;
  /** Pay per hour in `incomeCurrency` minor units (hourly mode). */
  hourlyRateMinor: number;
  /** Usual hours per month (hourly mode) — the per-month default. */
  monthlyHours: number;
  /** Effective monthly income in `displayCurrency` minor units, keyed `YYYY-MM`. */
  incomeByMonth: Record<string, number>;
  /** Effective monthly income + its currency (for the editor), keyed `YYYY-MM`. */
  incomeRawByMonth: Record<string, { minor: number; currency: string }>;
  /** What each overridden month actually stores. */
  incomeOverrideByMonth: Record<
    string,
    {
      amountMinor: number | null;
      currency: string | null;
      hours: number | null;
    }
  >;
  /** The global monthly income in `displayCurrency` minor units. */
  defaultIncomeMinor: number;
  /** The global effective monthly income in `incomeCurrency` minor units. */
  globalIncomeMinor: number;
  /** Months (`YYYY-MM`) whose income is a per-month override. */
  overriddenIncomeMonths: string[];
  /** Exchange rates (units per 1 EUR) for the converted display. */
  rates: RateMap;
  /** Distinct currencies already in use — surfaced first in the picker. */
  usedCurrencies: string[];
  summary: {
    currency: string;
    dueThisMonthMinor: number;
    recurringMinor: number;
    oneTimeMinor: number;
    count: number;
  };
}
