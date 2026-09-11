import { describe, expect, it } from 'vitest';
import type { DebtDenomination } from '@wib/domain';
import { debtEquivalentMinor, type ThingValueMap } from './pricing';

// EUR-based FX map (units of X per 1 EUR).
const RATES = { EUR: 1, USD: 1.1, GBP: 0.85 };
const SPOT = 3110.34768; // USD / oz → exactly $100 per fine gram
const NO_THINGS: ThingValueMap = new Map();

const money = (c: string): DebtDenomination => ({ kind: 'money', currency: c });
const gold = (
  goldType: string,
  unit: 'g' | 'piece' = 'g',
): DebtDenomination => ({ kind: 'gold', goldType, goldLabel: null, unit });
const thing = (thingId: string): DebtDenomination => ({
  kind: 'thing',
  thingId,
  thingName: 'Rolex',
  unit: 'piece',
});

describe('debtEquivalentMinor', () => {
  it('converts money via FX', () => {
    expect(
      debtEquivalentMinor(money('USD'), 11000, RATES, SPOT, 'EUR', NO_THINGS),
    ).toBe(10000);
    expect(
      debtEquivalentMinor(money('EUR'), 5000, RATES, SPOT, 'EUR', NO_THINGS),
    ).toBe(5000);
  });

  it('returns null when there is no FX rate', () => {
    expect(
      debtEquivalentMinor(money('JPY'), 100000, RATES, SPOT, 'EUR', NO_THINGS),
    ).toBeNull();
  });

  it('prices carat gold from spot + purity', () => {
    const v = debtEquivalentMinor(gold('k24'), 10_000, RATES, SPOT, 'EUR', NO_THINGS);
    expect(v).toBeCloseTo(90909, -1);
    const v21 = debtEquivalentMinor(gold('k21'), 10_000, RATES, SPOT, 'EUR', NO_THINGS);
    expect(v21).toBeCloseTo(79545, -1);
  });

  it('cannot price a custom gold type or without a spot', () => {
    expect(
      debtEquivalentMinor(gold('custom', 'piece'), 2000, RATES, SPOT, 'EUR', NO_THINGS),
    ).toBeNull();
    expect(
      debtEquivalentMinor(gold('k24'), 10_000, RATES, null, 'EUR', NO_THINGS),
    ).toBeNull();
  });

  it('prices a thing from its per-unit reference value', () => {
    const things: ThingValueMap = new Map([
      ['t1', { valueMinor: 1_100_000, valueCurrency: 'USD' }], // $11,000
    ]);
    // 2 pieces → $22,000 → EUR /1.1 → 20,000.00
    expect(
      debtEquivalentMinor(thing('t1'), 2000, RATES, SPOT, 'EUR', things),
    ).toBe(2_000_000);
    // unknown thing, or zero value → null
    expect(
      debtEquivalentMinor(thing('t9'), 2000, RATES, SPOT, 'EUR', things),
    ).toBeNull();
  });
});
