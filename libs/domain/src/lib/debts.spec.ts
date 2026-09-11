import { describe, expect, it } from 'vitest';
import {
  debtEquivalentTotals,
  debtHeadline,
  debtHeadlineForOther,
  debtIsSettled,
  debtProgress,
  denomBalances,
  denomKey,
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
const rolex = {
  kind: 'thing',
  thingId: '11111111-1111-4111-8111-111111111111',
  thingName: 'Rolex Submariner',
  unit: 'piece',
} as const;

describe('denomBalances', () => {
  it('nets principal rows against free-form repayments per denomination', () => {
    const rows = [
      { denom: gbp, amountMinor: 10000 },
      { denom: gbp, amountMinor: 2000 }, // two GBP rows sum
      { denom: eur, amountMinor: 3000 },
      { denom: gold21, amountMinor: 10000 },
    ];
    const entries = [
      { denom: gbp, amountMinor: 5000 },
      { denom: gold21, amountMinor: 10000 }, // clears the gold row
    ];
    const bal = denomBalances(rows, entries);
    const g = bal.find((b) => b.denom.kind === 'money' && b.denom.currency === 'GBP')!;
    expect(g).toMatchObject({ owedMinor: 12000, repaidMinor: 5000, outstandingMinor: 7000, settled: false });
    const au = bal.find((b) => b.denom.kind === 'gold')!;
    expect(au).toMatchObject({ owedMinor: 10000, repaidMinor: 10000, outstandingMinor: 0, settled: true });
    // money before gold
    expect(bal[0]!.denom.kind).toBe('money');
  });

  it('clamps an overpayment', () => {
    const bal = denomBalances(
      [{ denom: eur, amountMinor: 1000 }],
      [{ denom: eur, amountMinor: 4000 }],
    );
    expect(bal[0]).toMatchObject({ outstandingMinor: 0, progress: 1, settled: true });
  });

  it('tracks a thing denomination and sorts it after money + gold', () => {
    const bal = denomBalances(
      [
        { denom: eur, amountMinor: 1000 },
        { denom: gold21, amountMinor: 5000 },
        { denom: rolex, amountMinor: 2000 },
      ],
      [{ denom: rolex, amountMinor: 1000 }],
    );
    expect(bal.map((b) => b.denom.kind)).toEqual(['money', 'gold', 'thing']);
    expect(bal[2]).toMatchObject({ owedMinor: 2000, repaidMinor: 1000, outstandingMinor: 1000 });
  });
});

describe('debtIsSettled', () => {
  it('is true when flagged, or when every balance is clear', () => {
    const clear = denomBalances([{ denom: eur, amountMinor: 100 }], [{ denom: eur, amountMinor: 100 }]);
    const open = denomBalances([{ denom: eur, amountMinor: 100 }], []);
    expect(debtIsSettled(clear, null)).toBe(true);
    expect(debtIsSettled(open, null)).toBe(false);
    expect(debtIsSettled(open, new Date())).toBe(true);
    expect(debtIsSettled([], null)).toBe(false);
  });
});

describe('summariseDebts', () => {
  it('groups per-denomination outstanding balances by direction', () => {
    const totals = summariseDebts([
      { direction: 'they_owe', denom: gbp, outstandingMinor: 8000 },
      { direction: 'i_owe', denom: gbp, outstandingMinor: 5000 },
      { direction: 'they_owe', denom: eur, outstandingMinor: 3000 },
      { direction: 'they_owe', denom: gold21, outstandingMinor: 6000 },
      { direction: 'i_owe', denom: gbp, outstandingMinor: 0 }, // settled — excluded
    ]);
    const g = totals.find((t) => t.denom.kind === 'money' && t.denom.currency === 'GBP')!;
    expect(g).toMatchObject({ theyOweMinor: 8000, iOweMinor: 5000, netMinor: 3000, count: 2 });
    const au = totals.find((t) => t.denom.kind === 'gold')!;
    expect(au).toMatchObject({ theyOweMinor: 6000, iOweMinor: 0, count: 1 });
    expect(totals[0]!.denom.kind).toBe('money'); // money first
  });

  it('returns nothing when everything is settled', () => {
    expect(
      summariseDebts([{ direction: 'they_owe', denom: gbp, outstandingMinor: 0 }]),
    ).toEqual([]);
  });
});

describe('formatDebtAmount', () => {
  it('formats money, gold and things', () => {
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
    expect(formatDebtAmount(2000, rolex)).toBe('2 × Rolex Submariner');
    expect(formatDebtAmount(3500, { ...rolex, unit: 'g' })).toBe(
      '3.5 g of Rolex Submariner',
    );
  });
});

describe('denomKey', () => {
  it('is stable per denomination and keys things by id', () => {
    expect(denomKey({ kind: 'money', currency: 'eur' })).toBe('money:EUR');
    expect(denomKey(rolex)).toBe(`thing:${rolex.thingId}`);
    expect(denomKey(gold21)).toBe('gold:k21:');
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

describe('debtEquivalentTotals', () => {
  it('splits both sides and counts what could not be priced', () => {
    const t = debtEquivalentTotals([
      { direction: 'they_owe', equivalentMinor: 10000 },
      { direction: 'they_owe', equivalentMinor: 2500 },
      { direction: 'i_owe', equivalentMinor: 4000 },
      { direction: 'i_owe', equivalentMinor: null },
    ]);
    expect(t).toEqual({
      theyOweMinor: 12500,
      iOweMinor: 4000,
      netMinor: 8500,
      priced: 3,
      unpriced: 1,
    });
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
