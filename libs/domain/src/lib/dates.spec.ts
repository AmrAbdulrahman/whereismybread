import {
  addMonths,
  anchorForAnnualDate,
  anchorForDayOfMonth,
  daysBetween,
  startOfMonth,
  weeksInMonth,
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

  describe('weeksInMonth', () => {
    it('covers every day of the month with whole Monday–Sunday weeks', () => {
      // September 2026 starts on a Tuesday, ends on a Wednesday.
      const weeks = weeksInMonth('2026-09-15');
      expect(weeks).toEqual([
        { start: '2026-08-31', end: '2026-09-06' },
        { start: '2026-09-07', end: '2026-09-13' },
        { start: '2026-09-14', end: '2026-09-20' },
        { start: '2026-09-21', end: '2026-09-27' },
        { start: '2026-09-28', end: '2026-10-04' },
      ]);
      // every week starts on a Monday and is exactly 7 days
      for (const w of weeks) {
        expect(new Date(`${w.start}T00:00:00Z`).getUTCDay()).toBe(1);
        expect(daysBetween(w.start, w.end)).toBe(6);
      }
    });

    it('handles a month that starts on a Monday', () => {
      // June 2026 starts on a Monday.
      const weeks = weeksInMonth('2026-06-01');
      expect(weeks[0]).toEqual({ start: '2026-06-01', end: '2026-06-07' });
    });
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

  describe('anchorForAnnualDate', () => {
    it('uses this year when the date is still ahead', () => {
      expect(anchorForAnnualDate(20, 12, '2026-09-05')).toBe('2026-12-20');
    });

    it('rolls to next year when the date has already passed', () => {
      expect(anchorForAnnualDate(15, 3, '2026-09-05')).toBe('2027-03-15');
    });

    it('lands on today when the month and day match exactly', () => {
      expect(anchorForAnnualDate(5, 9, '2026-09-05')).toBe('2026-09-05');
    });

    it('clamps to the length of the chosen month', () => {
      expect(anchorForAnnualDate(30, 2, '2026-01-01')).toBe('2026-02-28');
    });

    it('keeps an existing series in its own year, swapping the month/day', () => {
      expect(anchorForAnnualDate(1, 6, '2026-09-20', '2024-03-15')).toBe(
        '2024-06-01',
      );
    });
  });
});
