import {
  addMonths,
  anchorForDayOfMonth,
  daysBetween,
  startOfMonth,
} from './dates';

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

  describe('anchorForDayOfMonth', () => {
    it('uses this month when the day is still ahead', () => {
      expect(anchorForDayOfMonth(20, '2026-09-05')).toBe('2026-09-20');
    });

    it('rolls to next month when the day has passed', () => {
      expect(anchorForDayOfMonth(3, '2026-09-05')).toBe('2026-10-03');
    });

    it('clamps to the length of the chosen month', () => {
      expect(anchorForDayOfMonth(31, '2026-02-01')).toBe('2026-02-28');
    });

    it('keeps an existing series in its own month, swapping only the day', () => {
      expect(anchorForDayOfMonth(15, '2026-09-20', '2026-03-01')).toBe(
        '2026-03-15',
      );
    });
  });
});
