import { describe, expect, it } from 'vitest';
import {
  accountPie,
  applySpendFilter,
  buildCustomSeries,
  buildSeries,
  clampSpan,
  computeStat,
  daysIn,
  itemsInMonth,
  matchesFilter,
  spendBars,
  spendFilterCount,
  statStrip,
  tagPie,
  type SpendItem,
} from './dashboard-compute';

const MONTH = '2026-06';
const PREV = '2026-05';

function item(o: Partial<SpendItem>): SpendItem {
  return {
    date: '2026-06-10',
    minor: 1000,
    name: 'Thing',
    notes: null,
    accountId: null,
    accountName: null,
    accountColor: null,
    methodId: null,
    methodName: null,
    bankId: null,
    bankName: null,
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

  it('breaks this month down into recorded vs planned', () => {
    expect(statStrip(rows, MONTH, 'GBP')).toMatchObject({
      recordedMinor: 1400,
      recordedCount: 2,
      plannedMinor: 2500,
      plannedCount: 1,
      totalMinor: 3900,
    });
  });
});

describe('buildCustomSeries', () => {
  it('groups by day into a chronological bar series with zero-filled gaps', () => {
    const s = buildCustomSeries(
      { groupBy: 'day', measure: 'sum' },
      [
        item({ date: '2026-06-03', minor: 700 }),
        item({ date: '2026-06-03', minor: 300 }),
      ],
      MONTH,
      'GBP',
    );
    expect(s.display).toBe('bar');
    expect(s.categorical).toBe(false);
    expect(s.points).toHaveLength(30);
    expect(s.points[0]).toMatchObject({ label: '1', value: 0 });
    expect(s.points[2]).toMatchObject({ label: '3', value: 1000 });
    expect(s.totalMinor).toBe(1000);
  });

  it('groups by account, sorts desc, caps to top N with an "Other" bucket', () => {
    const s = buildCustomSeries(
      { groupBy: 'account', measure: 'sum', display: 'pie', limit: 2 },
      [
        item({ accountId: 'a', accountName: 'A', minor: 100 }),
        item({ accountId: 'b', accountName: 'B', minor: 500 }),
        item({ accountId: 'c', accountName: 'C', minor: 300 }),
        item({ accountId: 'd', accountName: 'D', minor: 50 }),
      ],
      MONTH,
      'GBP',
    );
    expect(s.points.map((p) => [p.label, p.value])).toEqual([
      ['B', 500],
      ['C', 300],
      ['Other', 150],
    ]);
    expect(s.display).toBe('pie');
  });

  it('counts group members with measure "count"; tags count once each', () => {
    const s = buildCustomSeries(
      { groupBy: 'tag', measure: 'count' },
      [
        item({ tags: [{ id: 'x', name: 'X', color: '' }, { id: 'y', name: 'Y', color: '' }] }),
        item({ tags: [{ id: 'x', name: 'X', color: '' }] }),
      ],
      MONTH,
      'GBP',
    );
    expect(s.isMoney).toBe(false);
    expect(s.points.map((p) => [p.label, p.value]).sort()).toEqual([
      ['X', 2],
      ['Y', 1],
    ]);
  });

  it('forces a pie request back to a bar for a time group-by', () => {
    const s = buildCustomSeries(
      { groupBy: 'weekday', measure: 'sum', display: 'pie' },
      [item({ date: '2026-06-01', minor: 100 })],
      MONTH,
      'GBP',
    );
    expect(s.display).toBe('bar');
    expect(s.points).toHaveLength(7);
    expect(s.points[0]?.label).toBe('Mon');
  });
});

describe('buildSeries', () => {
  it('maps the legacy month_spend_line preset to day bars', () => {
    const s = buildSeries(
      { id: 'c1', kind: 'month_spend_line', title: 'Spend', config: {} },
      [item({ date: '2026-06-05', minor: 700 })],
      MONTH,
      'GBP',
    );
    expect(s.display).toBe('bar');
    expect(s.points).toHaveLength(30);
    expect(s.totalMinor).toBe(700);
  });

  it('treats a stored groupBy as custom even on a legacy kind', () => {
    const s = buildSeries(
      {
        id: 'c2',
        kind: 'account_pie',
        title: 'x',
        config: { groupBy: 'source', measure: 'count' },
      },
      [item({ source: 'expense' }), item({ source: 'planned' })],
      MONTH,
      'GBP',
    );
    expect(s.isMoney).toBe(false);
    expect(s.points.map((p) => p.label).sort()).toEqual(['Expenses', 'Planned']);
  });

  it('flags an empty chart', () => {
    const s = buildSeries(
      { id: 'c3', kind: 'account_pie', title: 'Accounts', config: {} },
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

describe('matchesFilter / applySpendFilter', () => {
  it('AND across facets, OR within an id list', () => {
    const rows = [
      item({ accountId: 'a', source: 'expense', minor: 500 }),
      item({ accountId: 'b', source: 'expense', minor: 5000 }),
      item({ accountId: 'a', source: 'planned', minor: 500 }),
    ];
    const out = applySpendFilter(rows, {
      accountIds: ['a', 'b'],
      source: 'expense',
      amountMaxMinor: 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.accountId).toBe('a');
  });

  it('matches tags by membership and search across fields', () => {
    const row = item({
      name: 'Netflix',
      tags: [{ id: 't1', name: 'Streaming', color: '' }],
      bankName: 'Wise',
    });
    expect(matchesFilter(row, { tagIds: ['t1'] })).toBe(true);
    expect(matchesFilter(row, { tagIds: ['t9'] })).toBe(false);
    expect(matchesFilter(row, { search: 'flix' })).toBe(true);
    expect(matchesFilter(row, { search: 'wise' })).toBe(true);
    expect(matchesFilter(row, { search: 'nope' })).toBe(false);
  });

  it('no filter matches everything', () => {
    expect(matchesFilter(item({}), undefined)).toBe(true);
    expect(spendFilterCount(undefined)).toBe(0);
    expect(spendFilterCount({ accountIds: ['a'], search: 'x' })).toBe(2);
  });
});

describe('computeStat', () => {
  const rows = [
    item({ date: '2026-06-01', minor: 1000, tags: [{ id: 'g', name: 'Groceries', color: '' }] }),
    item({ date: '2026-06-20', minor: 3000, tags: [{ id: 'g', name: 'Groceries', color: '' }] }),
    item({ date: '2026-06-15', minor: 9999 }),
    item({ date: '2026-05-10', minor: 2000, tags: [{ id: 'g', name: 'Groceries', color: '' }] }),
  ];

  it('sums the filtered current-month rows', () => {
    const r = computeStat(
      rows,
      { measure: 'sum', filter: { tagIds: ['g'] } },
      MONTH,
      PREV,
    );
    expect(r.value).toBe(4000);
    expect(r.matched).toBe(2);
    expect(r.isMoney).toBe(true);
    expect(r.compare).toBeNull();
  });

  it('counts, and compares to the previous month', () => {
    const r = computeStat(
      rows,
      { measure: 'count', filter: { tagIds: ['g'] }, compare: 'prev_month' },
      MONTH,
      PREV,
    );
    expect(r.value).toBe(2);
    expect(r.isMoney).toBe(false);
    expect(r.compare).toMatchObject({ prevValue: 1, deltaValue: 1, deltaPct: 1 });
  });

  it('avg / max ignore other months', () => {
    expect(
      computeStat(rows, { measure: 'max' }, MONTH, PREV).value,
    ).toBe(9999);
    expect(
      computeStat(rows, { measure: 'avg', filter: { tagIds: ['g'] } }, MONTH, PREV).value,
    ).toBe(2000);
  });
});
