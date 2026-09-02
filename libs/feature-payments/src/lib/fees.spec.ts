import { describe, expect, it } from 'vitest';
import { feeMinor } from './fees';

describe('feeMinor', () => {
  it('is nothing without a fee', () => {
    expect(feeMinor(10000, 'none', 500, 5)).toBe(0);
  });

  it('adds a flat fixed amount regardless of the base', () => {
    expect(feeMinor(10000, 'fixed', 150, 0)).toBe(150);
    expect(feeMinor(1, 'fixed', 150, 0)).toBe(150);
  });

  it('takes a percentage of the base, rounded', () => {
    expect(feeMinor(10000, 'percent', 0, 2.5)).toBe(250);
    expect(feeMinor(999, 'percent', 0, 3)).toBe(30); // 29.97 → 30
  });

  it('never goes negative', () => {
    expect(feeMinor(10000, 'fixed', -100, 0)).toBe(0);
    expect(feeMinor(10000, 'percent', 0, -5)).toBe(0);
  });
});
