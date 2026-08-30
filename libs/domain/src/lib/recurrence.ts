/**
 * Shared vocabulary for anything that repeats. The engine that expands these
 * into concrete due-date occurrences lands in Phase 2 — this file only fixes
 * the terms so the schema and the UI agree now.
 */
export const RECURRENCES = [
  'one_time',
  'monthly',
  'quarterly',
  'annual',
] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const INSTALLMENT_FREQUENCIES = ['monthly', 'quarterly'] as const;
export type InstallmentFrequency = (typeof INSTALLMENT_FREQUENCIES)[number];

export const PAYMENT_METHOD_KINDS = [
  'direct_debit',
  'credit_card',
  'cash',
  'manual_transfer',
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export function monthsBetweenOccurrences(
  recurrence: Exclude<Recurrence, 'one_time'>,
): number {
  switch (recurrence) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'annual':
      return 12;
  }
}
