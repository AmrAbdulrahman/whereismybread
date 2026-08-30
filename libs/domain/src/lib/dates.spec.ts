import { addMonths, daysBetween, startOfMonth } from './dates';

describe('dates', () => {
  it('clamps end-of-month when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('adds months across a year boundary', () => {
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
  });

  it('finds the first of the month', () => {
    expect(startOfMonth('2026-08-30')).toBe('2026-08-01');
  });
});
