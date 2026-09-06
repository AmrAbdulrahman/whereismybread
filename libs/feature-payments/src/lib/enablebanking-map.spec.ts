import { describe, expect, it } from 'vitest';
import { amountToMinor, mapEbTransaction } from './enablebanking-map';
import type { EbTransaction } from './enablebanking-client';

describe('amountToMinor', () => {
  it('converts decimal strings without float error', () => {
    expect(amountToMinor('1234.56', 'GBP')).toBe(123456);
    expect(amountToMinor('0.10', 'EUR')).toBe(10);
    expect(amountToMinor('100', 'USD')).toBe(10000);
  });

  it('honours the currency exponent', () => {
    expect(amountToMinor('1000', 'JPY')).toBe(1000);
    expect(amountToMinor('1.5', 'JPY')).toBe(1);
  });

  it('keeps a leading minus', () => {
    expect(amountToMinor('-42.00', 'GBP')).toBe(-4200);
  });
});

const base: EbTransaction = {
  transaction_id: 'tx-1',
  transaction_amount: { currency: 'GBP', amount: '25.00' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-02-10',
  remittance_information: ['TESCO STORES 2913'],
};

describe('mapEbTransaction', () => {
  it('signs debits negative and credits positive', () => {
    expect(mapEbTransaction(base, 'Wise · GBP')?.amountMinor).toBe(-2500);
    expect(
      mapEbTransaction(
        { ...base, credit_debit_indicator: 'CRDT' },
        'Wise · GBP',
      )?.amountMinor,
    ).toBe(2500);
  });

  it('derives a stable dedup key from the transaction id', () => {
    expect(mapEbTransaction(base, 'Wise · GBP')?.dedupKey).toBe(
      'enablebanking:tx-1',
    );
  });

  it('falls back to a content hash when there is no id', () => {
    const { transaction_id: _omit, ...noId } = base;
    const key = mapEbTransaction(noId, 'Wise · GBP')?.dedupKey ?? '';
    expect(key).toMatch(/^enablebanking:h_[0-9a-f]{24}$/);
  });

  it('uses remittance info as the description', () => {
    expect(mapEbTransaction(base, 'Wise · GBP')?.description).toBe(
      'TESCO STORES 2913',
    );
  });

  it('treats a date-only booking date as midnight UTC without a time', () => {
    const row = mapEbTransaction(base, 'Wise · GBP');
    expect(row?.occurredHasTime).toBe(false);
    expect(row?.occurredAt.toISOString()).toBe('2026-02-10T00:00:00.000Z');
  });

  it('skips cancelled transactions', () => {
    expect(mapEbTransaction({ ...base, status: 'CANC' }, 'Wise · GBP')).toBeNull();
  });
});
