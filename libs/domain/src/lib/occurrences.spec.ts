import {
  expandOccurrences,
  nextOccurrence,
  type RecurrenceSpec,
} from './occurrences';

const dates = (specs: ReturnType<typeof expandOccurrences>) =>
  specs.map((o) => o.dueDate);

describe('expandOccurrences', () => {
  it('one-time: emitted only if inside the window', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'one_time',
      anchorDate: '2026-03-10',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-03-01', to: '2026-03-31' })),
    ).toEqual(['2026-03-10']);
    expect(
      expandOccurrences(spec, { from: '2026-04-01', to: '2026-04-30' }),
    ).toEqual([]);
  });

  it('monthly: one per month on the anchor day', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-01-15',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2026-04-30' })),
    ).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });

  it('monthly on the 31st clamps to the last day of short months', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-01-31',
      dayOfMonth: 31,
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2026-05-15' })),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('quarterly steps three months', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'quarterly',
      anchorDate: '2026-02-28',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2026-12-31' })),
    ).toEqual(['2026-02-28', '2026-05-28', '2026-08-28', '2026-11-28']);
  });

  it('annual steps a year', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'annual',
      anchorDate: '2025-06-01',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2028-12-31' })),
    ).toEqual(['2026-06-01', '2027-06-01', '2028-06-01']);
  });

  it('never emits before the anchor', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-06-10',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2026-12-31' })),
    ).toEqual([
      '2026-06-10',
      '2026-07-10',
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ]);
  });

  it('with a fixed day-of-month, the anchor only picks the starting month', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-08-30',
      dayOfMonth: 1,
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-08-01', to: '2026-11-30' })),
    ).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  });

  it('respects endsOn', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-01-05',
      endsOn: '2026-03-05',
    };
    expect(
      dates(expandOccurrences(spec, { from: '2026-01-01', to: '2026-12-31' })),
    ).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('jumps efficiently to a far-future window', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2000-01-20',
    };
    const result = expandOccurrences(spec, {
      from: '2030-01-01',
      to: '2030-03-31',
    });
    expect(dates(result)).toEqual(['2030-01-20', '2030-02-20', '2030-03-20']);
    expect(result[0]?.sequence).toBe(360);
  });

  it('nextOccurrence finds the upcoming date or null past the end', () => {
    const spec: RecurrenceSpec = {
      recurrence: 'monthly',
      anchorDate: '2026-01-10',
      endsOn: '2026-04-10',
    };
    expect(nextOccurrence(spec, '2026-02-15')).toBe('2026-03-10');
    expect(nextOccurrence(spec, '2026-05-01')).toBeNull();
  });
});
