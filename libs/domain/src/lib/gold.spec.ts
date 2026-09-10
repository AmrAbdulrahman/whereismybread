import { describe, expect, it } from 'vitest';
import {
  formatGold,
  goldQuantityString,
  goldTypeLabel,
  goldUnitFor,
  parseGoldQuantity,
} from './gold';

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
