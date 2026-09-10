import { describe, expect, it } from 'vitest';
import type { DebtDenomination } from '@wib/domain';
import { debtEquivalentMinor } from './pricing';

// EUR-based FX map (units of X per 1 EUR).
const RATES = { EUR: 1, USD: 1.1, GBP: 0.85 };
const SPOT = 3110.34768; // USD / oz → exactly $100 per fine gram

const money = (c: string): DebtDenomination => ({ kind: 'money', currency: c });
const gold = (
  goldType: string,
  unit: 'g' | 'piece' = 'g',
): DebtDenomination => ({ kind: 'gold', goldType, goldLabel: null, unit });

describe('debtEquivalentMinor', () => {
  it('converts money via FX', () => {
    // 110.00 USD → EUR at 1.1 → 100.00
    expect(debtEquivalentMinor(money('USD'), 11000, RATES, SPOT, 'EUR')).toBe(
      10000,
    );
    // already in the display currency
    expect(debtEquivalentMinor(money('EUR'), 5000, RATES, SPOT, 'EUR')).toBe(
      5000,
    );
  });

  it('returns null when there is no FX rate', () => {
    expect(
      debtEquivalentMinor(money('JPY'), 100000, RATES, SPOT, 'EUR'),
    ).toBeNull();
  });

  it('prices carat gold from spot + purity', () => {
    // 10 g of 24K = 10 fine g = $1000 → EUR /1.1 ≈ 909.09
    const v = debtEquivalentMinor(gold('k24'), 10_000, RATES, SPOT, 'EUR');
    expect(v).toBeCloseTo(90909, -1);
    // 10 g of 21K = 8.75 fine g = $875
    const v21 = debtEquivalentMinor(gold('k21'), 10_000, RATES, SPOT, 'EUR');
    expect(v21).toBeCloseTo(79545, -1);
  });

  it('cannot price a custom gold type or without a spot', () => {
    expect(
      debtEquivalentMinor(gold('custom', 'piece'), 2000, RATES, SPOT, 'EUR'),
    ).toBeNull();
    expect(
      debtEquivalentMinor(gold('k24'), 10_000, RATES, null, 'EUR'),
    ).toBeNull();
  });
});
