import {
  cleanMerchant,
  type AutomationSubject,
  type RecordSource,
} from '@wib/domain';

/** Fields a review-expense automation is tested against. Pure. */
export function buildReviewSubject(input: {
  description: string;
  rawType: string | null;
  amountMinor: number;
  currency: string;
  bankName: string;
}): AutomationSubject {
  return {
    name: cleanMerchant(input.description, input.rawType),
    description: input.description,
    amount: Math.abs(input.amountMinor) / 100,
    direction: input.amountMinor < 0 ? 'out' : 'in',
    currency: input.currency,
    bank: input.bankName,
    rawType: input.rawType ?? '',
  };
}

/** Fields a "payment or expense added" automation is tested against. Pure. */
export function buildRecordSubject(input: {
  kind: 'payment' | 'expense';
  /** `manual` (user added it) or `automation` (the engine auto-filed it). */
  source: RecordSource;
  name: string;
  amountMinor: number;
  currency: string;
  recurrence?: string | null;
  accountName?: string | null;
  methodName?: string | null;
}): AutomationSubject {
  return {
    kind: input.kind,
    source: input.source,
    name: input.name,
    amount: Math.abs(input.amountMinor) / 100,
    currency: input.currency,
    recurrence: input.recurrence ?? '',
    account: input.accountName ?? '',
    method: input.methodName ?? '',
  };
}
