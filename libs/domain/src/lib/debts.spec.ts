import { describe, expect, it } from 'vitest';
import {
  debtHeadline,
  debtHeadlineForOther,
  debtProgress,
  formatDebtAmount,
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

const gbp = { kind: 'money', currency: 'GBP' } as const;
const eur = { kind: 'money', currency: 'EUR' } as const;
const gold21 = {
  kind: 'gold',
  goldType: 'k21',
  goldLabel: null,
  unit: 'g',
} as const;

describe('summariseDebts', () => {
  it('groups outstanding remainders by denomination and direction', () => {
    const totals = summariseDebts([
      { direction: 'they_owe', denom: gbp, principalMinor: 10000, paidMinor: 2000 },
      { direction: 'i_owe', denom: gbp, principalMinor: 5000, paidMinor: 0 },
      { direction: 'they_owe', denom: eur, principalMinor: 3000, paidMinor: 0 },
      { direction: 'they_owe', denom: gold21, principalMinor: 10000, paidMinor: 4000 },
      // fully settled — excluded
      { direction: 'i_owe', denom: gbp, principalMinor: 4000, paidMinor: 4000 },
    ]);
    const g = totals.find((t) => t.denom.kind === 'money' && t.denom.currency === 'GBP');
    expect(g).toMatchObject({ theyOweMinor: 8000, iOweMinor: 5000, netMinor: 3000, count: 2 });
    const e = totals.find((t) => t.denom.kind === 'money' && t.denom.currency === 'EUR');
    expect(e).toMatchObject({ theyOweMinor: 3000, iOweMinor: 0, netMinor: 3000, count: 1 });
    const au = totals.find((t) => t.denom.kind === 'gold');
    expect(au).toMatchObject({ theyOweMinor: 6000, iOweMinor: 0, count: 1 });
  });

  it('returns nothing when every debt is settled', () => {
    expect(
      summariseDebts([
        { direction: 'they_owe', denom: gbp, principalMinor: 100, paidMinor: 100 },
      ]),
    ).toEqual([]);
  });
});

describe('formatDebtAmount', () => {
  it('formats money and gold', () => {
    expect(formatDebtAmount(12345, { kind: 'money', currency: 'GBP' })).toMatch(
      /£123\.45/,
    );
    expect(formatDebtAmount(10000, gold21)).toBe('10 g of 21K gold');
    expect(
      formatDebtAmount(2500, {
        kind: 'gold',
        goldType: 'coin_sovereign',
        goldLabel: null,
        unit: 'piece',
      }),
    ).toBe('2.5 × Gold sovereign (King George)');
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
