import { describe, expect, it } from 'vitest';
import {
  debtHeadline,
  debtHeadlineForOther,
  debtProgress,
  isOtpCode,
  summariseDebts,
} from './debts';

describe('debtProgress', () => {
  it('reports a partial repayment', () => {
    const p = debtProgress({ principalMinor: 12000, paidMinor: 5000 });
    expect(p.paidMinor).toBe(5000);
    expect(p.remainingMinor).toBe(7000);
    expect(p.progress).toBeCloseTo(5000 / 12000);
    expect(p.settled).toBe(false);
  });

  it('settles when the full amount is repaid', () => {
    const p = debtProgress({ principalMinor: 12000, paidMinor: 12000 });
    expect(p.remainingMinor).toBe(0);
    expect(p.progress).toBe(1);
    expect(p.settled).toBe(true);
  });

  it('clamps an overpayment to the principal', () => {
    const p = debtProgress({ principalMinor: 12000, paidMinor: 20000 });
    expect(p.paidMinor).toBe(12000);
    expect(p.remainingMinor).toBe(0);
    expect(p.settled).toBe(true);
  });

  it('ignores negative inputs', () => {
    const p = debtProgress({ principalMinor: -5, paidMinor: -5 });
    expect(p.paidMinor).toBe(0);
    expect(p.remainingMinor).toBe(0);
    expect(p.settled).toBe(true);
  });
});

describe('summariseDebts', () => {
  it('groups outstanding remainders by currency and direction', () => {
    const totals = summariseDebts([
      { direction: 'they_owe', currency: 'GBP', principalMinor: 10000, paidMinor: 2000 },
      { direction: 'i_owe', currency: 'GBP', principalMinor: 5000, paidMinor: 0 },
      { direction: 'they_owe', currency: 'EUR', principalMinor: 3000, paidMinor: 0 },
      // fully settled — excluded
      { direction: 'i_owe', currency: 'GBP', principalMinor: 4000, paidMinor: 4000 },
    ]);
    const gbp = totals.find((t) => t.currency === 'GBP');
    expect(gbp).toMatchObject({ theyOweMinor: 8000, iOweMinor: 5000, netMinor: 3000, count: 2 });
    const eur = totals.find((t) => t.currency === 'EUR');
    expect(eur).toMatchObject({ theyOweMinor: 3000, iOweMinor: 0, netMinor: 3000, count: 1 });
  });

  it('returns nothing when every debt is settled', () => {
    expect(
      summariseDebts([
        { direction: 'they_owe', currency: 'GBP', principalMinor: 100, paidMinor: 100 },
      ]),
    ).toEqual([]);
  });
});

describe('headlines', () => {
  it('reads from each point of view', () => {
    expect(debtHeadline('they_owe', 'Sarah')).toBe('Sarah owes you');
    expect(debtHeadline('i_owe', 'Sarah')).toBe('You owe Sarah');
    expect(debtHeadlineForOther('they_owe', 'Amr')).toBe('You owe Amr');
    expect(debtHeadlineForOther('i_owe', 'Amr')).toBe('Amr owes you');
  });
});

describe('isOtpCode', () => {
  it('accepts a 6-digit code and rejects anything else', () => {
    expect(isOtpCode('012345')).toBe(true);
    expect(isOtpCode(' 123456 ')).toBe(true);
    expect(isOtpCode('12345')).toBe(false);
    expect(isOtpCode('abcdef')).toBe(false);
  });
});
