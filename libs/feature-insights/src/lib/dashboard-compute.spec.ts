import { describe, expect, it } from 'vitest';
import {
  accountPie,
  buildSeries,
  clampSpan,
  daysIn,
  itemsInMonth,
  spendBars,
  statStrip,
  tagPie,
  type SpendItem,
} from './dashboard-compute';

const MONTH = '2026-06';

function item(o: Partial<SpendItem>): SpendItem {
  return {
    date: '2026-06-10',
    minor: 1000,
    accountId: null,
    accountName: null,
    accountColor: null,
    tags: [],
    source: 'expense',
    budgeted: false,
    ...o,
  };
}

describe('daysIn / itemsInMonth', () => {
  it('counts calendar days', () => {
    expect(daysIn('2026-02')).toBe(28);
    expect(daysIn('2026-06')).toBe(30);
  });
  it('keeps only rows dated in the month', () => {
    const rows = [
      item({ date: '2026-06-01' }),
      item({ date: '2026-06-30' }),
      item({ date: '2026-05-31' }),
      item({ date: '2026-07-01' }),
    ];
    expect(itemsInMonth(rows, MONTH)).toHaveLength(2);
  });
});

describe('spendBars', () => {
  it('sums per day, one bar per calendar day, no running total', () => {
    const bars = spendBars(
      [
        item({ date: '2026-06-01', minor: 1500 }),
        item({ date: '2026-06-01', minor: 500 }),
        item({ date: '2026-06-03', minor: 2000 }),
      ],
      MONTH,
    );
    expect(bars).toHaveLength(30);
    expect(bars[0]).toMatchObject({ day: 1, minor: 2000 });
    expect(bars[1]).toMatchObject({ day: 2, minor: 0 });
    expect(bars[2]).toMatchObject({ day: 3, minor: 2000 });
  });
});

describe('accountPie', () => {
  it('groups by account, sorts by value, honours excludeAccountIds', () => {
    const slices = accountPie(
      [
        item({ accountId: 'a', accountName: 'Food', minor: 1000 }),
        item({ accountId: 'a', accountName: 'Food', minor: 500 }),
        item({ accountId: 'b', accountName: 'Fun', minor: 2000 }),
        item({ accountId: 'c', accountName: 'Skip', minor: 9999 }),
      ],
      MONTH,
      ['c'],
    );
    expect(slices.map((s) => [s.label, s.valueMinor])).toEqual([
      ['Fun', 2000],
      ['Food', 1500],
    ]);
  });

  it('buckets missing accounts under "No account" (neutral colour)', () => {
    const [slice] = accountPie([item({ accountId: null, minor: 1000 })], MONTH);
    expect(slice?.label).toBe('No account');
    expect(slice?.color).toBe('#94a3b8');
  });
});

describe('tagPie', () => {
  it('splits an amount evenly across its tags, remainder on the last', () => {
    const slices = tagPie(
      [
        item({
          minor: 1000,
          tags: [
            { id: 'x', name: 'X', color: '' },
            { id: 'y', name: 'Y', color: '' },
            { id: 'z', name: 'Z', color: '' },
          ],
        }),
      ],
      MONTH,
    );
    expect(slices.reduce((s, x) => s + x.valueMinor, 0)).toBe(1000);
    expect(slices.map((s) => s.valueMinor).sort()).toEqual([333, 333, 334]);
  });

  it('buckets untagged spend unless includeTagIds is given', () => {
    const rows = [
      item({ minor: 1000, tags: [] }),
      item({ minor: 500, tags: [{ id: 'x', name: 'X', color: '' }] }),
    ];
    expect(tagPie(rows, MONTH).map((s) => s.label)).toEqual(['Untagged', 'X']);
    expect(tagPie(rows, MONTH, ['x']).map((s) => s.label)).toEqual(['X']);
  });
});

describe('statStrip', () => {
  const rows = [
    item({ source: 'expense', minor: 1000 }),
    item({ source: 'expense', minor: 400 }),
    item({ source: 'planned', minor: 2500 }),
    item({ source: 'expense', minor: 9999, date: '2026-05-01' }),
  ];

  it('breaks down recorded vs planned; total follows the source filter', () => {
    const both = statStrip(rows, MONTH, 'GBP', new Set(['planned', 'expense']));
    expect(both).toMatchObject({
      recordedMinor: 1400,
      recordedCount: 2,
      plannedMinor: 2500,
      plannedCount: 1,
      totalMinor: 3900,
    });

    const expensesOnly = statStrip(rows, MONTH, 'GBP', new Set(['expense']));
    expect(expensesOnly.totalMinor).toBe(1400);

    const plannedOnly = statStrip(rows, MONTH, 'GBP', new Set(['planned']));
    expect(plannedOnly.totalMinor).toBe(2500);
  });
});

describe('buildSeries', () => {
  it('renders month_spend_line as day bars', () => {
    const s = buildSeries(
      { id: 'c1', kind: 'month_spend_line', title: 'Spend', config: {} },
      [item({ date: '2026-06-05', minor: 700 })],
      MONTH,
      'GBP',
    );
    expect(s.bars).toHaveLength(30);
    expect(s.totalMinor).toBe(700);
    expect(s.empty).toBe(false);
  });

  it('flags an empty chart', () => {
    const s = buildSeries(
      { id: 'c2', kind: 'account_pie', title: 'Accounts', config: {} },
      [],
      MONTH,
      'GBP',
    );
    expect(s.empty).toBe(true);
  });
});

describe('clampSpan', () => {
  it('keeps span within 1..2', () => {
    expect(clampSpan(undefined)).toBe(1);
    expect(clampSpan(0)).toBe(1);
    expect(clampSpan(2)).toBe(2);
    expect(clampSpan(5)).toBe(2);
  });
});
