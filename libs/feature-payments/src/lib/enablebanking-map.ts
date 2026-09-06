import { createHash } from 'node:crypto';
import { currencyMeta } from '@wib/domain';
import type { ImportedTransactionInput } from '@wib/db';
import type { EbTransaction } from './enablebanking-client';

/**
 * Convert a decimal amount string ("1234.56") to integer minor units for the
 * given currency, without floating-point rounding error.
 */
export function amountToMinor(amount: string, currency: string): number {
  const decimals = currencyMeta(currency).decimals;
  const neg = amount.trim().startsWith('-');
  const clean = amount.replace(/[^0-9.]/g, '');
  const [whole = '0', frac = ''] = clean.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const minor =
    BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
  const n = Number(minor);
  return neg ? -n : n;
}

function isDebit(indicator: string | null | undefined): boolean {
  if (!indicator) return false;
  return indicator.toUpperCase().startsWith('D');
}

function describe(t: EbTransaction): string {
  const remit = (t.remittance_information ?? [])
    .filter(Boolean)
    .join(' ')
    .trim();
  if (remit) return remit;
  const party = isDebit(t.credit_debit_indicator)
    ? t.creditor?.name
    : t.debtor?.name;
  if (party) return party.trim();
  if (t.creditor?.name) return t.creditor.name.trim();
  if (t.debtor?.name) return t.debtor.name.trim();
  const code = t.bank_transaction_code?.description ?? t.bank_transaction_code?.code;
  if (code) return code.trim();
  if (t.note) return t.note.trim();
  return '(no description)';
}

function occurredAt(t: EbTransaction): { date: Date; hasTime: boolean } {
  const raw =
    t.transaction_date ?? t.booking_date ?? t.value_date ?? null;
  if (!raw) return { date: new Date(), hasTime: false };
  // Date-only "YYYY-MM-DD" → midnight UTC, no time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { date: new Date(`${raw}T00:00:00Z`), hasTime: false };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { date: new Date(), hasTime: false };
  return { date: d, hasTime: true };
}

function stableId(t: EbTransaction): string {
  if (t.transaction_id) return t.transaction_id;
  if (t.entry_reference) return t.entry_reference;
  const h = createHash('sha256');
  h.update(
    JSON.stringify([
      t.booking_date,
      t.value_date,
      t.transaction_amount?.amount,
      t.transaction_amount?.currency,
      t.credit_debit_indicator,
      describe(t),
    ]),
  );
  return `h_${h.digest('hex').slice(0, 24)}`;
}

/**
 * Map an Enable Banking transaction to the shape `insertSyncedTransactions`
 * wants. `source` is the account label (e.g. "Wise · GBP"). Returns null for
 * transactions we should skip (cancelled / rejected).
 */
export function mapEbTransaction(
  t: EbTransaction,
  source: string,
): ImportedTransactionInput | null {
  const status = (t.status ?? 'BOOK').toUpperCase();
  if (status === 'CANC' || status === 'FAYL' || status === 'RJCT') return null;

  const currency = (t.transaction_amount?.currency ?? 'GBP').toUpperCase();
  const magnitude = amountToMinor(
    t.transaction_amount?.amount ?? '0',
    currency,
  );
  const signed = isDebit(t.credit_debit_indicator)
    ? -Math.abs(magnitude)
    : Math.abs(magnitude);

  const when = occurredAt(t);
  const externalId = stableId(t);

  const balance = t.balance_after_transaction?.amount
    ? amountToMinor(t.balance_after_transaction.amount, currency)
    : null;

  return {
    dedupKey: `enablebanking:${externalId}`.slice(0, 200),
    source,
    externalId,
    occurredAt: when.date,
    occurredHasTime: when.hasTime,
    description: describe(t).slice(0, 500),
    amountMinor: signed,
    currency: currency.slice(0, 8),
    rawType:
      t.bank_transaction_code?.code ??
      t.credit_debit_indicator ??
      null,
    runningBalanceMinor: balance,
    rawPayload: t as unknown as Record<string, unknown>,
  };
}
