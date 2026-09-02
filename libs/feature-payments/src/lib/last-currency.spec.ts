import { afterEach, describe, expect, it } from 'vitest';
import { readLastCurrency, writeLastCurrency } from './last-currency';

afterEach(() => window.localStorage.clear());

describe('last-currency', () => {
  it('round-trips a code, upper-casing it', () => {
    writeLastCurrency('egp');
    expect(readLastCurrency()).toBe('EGP');
  });

  it('returns null when nothing is stored', () => {
    expect(readLastCurrency()).toBeNull();
  });

  it('ignores a junk value', () => {
    window.localStorage.setItem('wib:last-currency', 'not-a-code');
    expect(readLastCurrency()).toBeNull();
  });
});
