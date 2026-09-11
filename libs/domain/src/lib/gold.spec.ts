import { describe, expect, it } from 'vitest';
import {
  GOLD_TYPE_BY_KEY,
  goldFineGrams,
  goldMarkSpec,
  formatGold,
  goldQuantityString,
  goldTypeLabel,
  goldUnitFor,
  parseGoldQuantity,
} from './gold';

describe('catalogue', () => {
  it('includes the 50 g bar', () => {
    expect(GOLD_TYPE_BY_KEY.get('bar_50g')).toMatchObject({
      unit: 'piece',
      group: 'bar',
    });
  });
});

describe('goldFineGrams', () => {
  it('scales carat purity by weight', () => {
    expect(goldFineGrams('k24', 10)).toBeCloseTo(10);
    expect(goldFineGrams('k21', 10)).toBeCloseTo(8.75);
    expect(goldFineGrams('k18', 4)).toBeCloseTo(3);
  });
  it('prices coins and bars per piece', () => {
    expect(goldFineGrams('coin_egp', 2)).toBeCloseTo(14);
    expect(goldFineGrams('bar_50g', 1)).toBeCloseTo(49.95);
    expect(goldFineGrams('bar_oz', 1)).toBeCloseTo(31.072, 2);
  });
  it('returns null for a custom or unknown type', () => {
    expect(goldFineGrams('custom', 5)).toBeNull();
    expect(goldFineGrams('nope', 5)).toBeNull();
  });
});

describe('parseGoldQuantity', () => {
  it('scales to thousandths', () => {
    expect(parseGoldQuantity('10')).toBe(10000);
    expect(parseGoldQuantity('2.5')).toBe(2500);
    expect(parseGoldQuantity('1,000')).toBe(1_000_000);
    expect(parseGoldQuantity('12.345')).toBe(12345);
  });
  it('rejects zero / negative / junk', () => {
    expect(() => parseGoldQuantity('0')).toThrow();
    expect(() => parseGoldQuantity('-3')).toThrow();
    expect(() => parseGoldQuantity('abc')).toThrow();
  });
});

describe('goldQuantityString', () => {
  it('trims trailing zeros', () => {
    expect(goldQuantityString(10000)).toBe('10');
    expect(goldQuantityString(2500)).toBe('2.5');
    expect(goldQuantityString(12345)).toBe('12.345');
    expect(goldQuantityString(12300)).toBe('12.3');
  });
});

describe('goldTypeLabel / goldUnitFor', () => {
  it('resolves built-ins', () => {
    expect(goldTypeLabel('k21', null)).toBe('21K gold');
    expect(goldUnitFor('k21', null)).toBe('g');
    expect(goldUnitFor('coin_sovereign', null)).toBe('piece');
  });
  it('resolves custom', () => {
    expect(goldTypeLabel('custom', '  Scrap gold ')).toBe('Scrap gold');
    expect(goldTypeLabel('custom', null)).toBe('Custom gold');
    expect(goldUnitFor('custom', 'piece')).toBe('piece');
    expect(goldUnitFor('custom', null)).toBe('g');
  });
});

describe('formatGold', () => {
  it('grams vs pieces', () => {
    expect(formatGold(10000, 'k21', null, 'g')).toBe('10 g of 21K gold');
    expect(formatGold(3000, 'coin_egp', null, 'piece')).toBe(
      '3 × Egyptian gold pound',
    );
    expect(formatGold(1500, 'custom', 'Bracelet', 'piece')).toBe(
      '1.5 × Bracelet',
    );
  });
});

describe('goldMarkSpec', () => {
  it('describes coins and bars, null for custom/unknown', () => {
    expect(goldMarkSpec('coin_sovereign')).toMatchObject({
      shape: 'coin',
      glyph: 'G',
      title: 'Gold sovereign (King George)',
    });
    expect(goldMarkSpec('bar_5g')).toMatchObject({
      shape: 'bar',
      glyph: '999',
      sub: '5g',
    });
    expect(goldMarkSpec('k21')).toMatchObject({ shape: 'bar', glyph: '21K' });
    expect(goldMarkSpec('custom')).toBeNull();
    expect(goldMarkSpec('nope')).toBeNull();
  });
});
