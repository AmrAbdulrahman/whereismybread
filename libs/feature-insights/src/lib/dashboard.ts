import 'server-only';

import { unstable_cache } from 'next/cache';
import { getCurrentUser } from '@wib/auth/server';
import {
  getRates,
  listDashboardCharts,
  seedDashboardCharts,
  type DashboardChart,
  type DashboardChartConfig,
} from '@wib/db';
import {
  convertMoney,
  endOfMonth,
  todayIn,
  type Money,
  type RateMap,
} from '@wib/domain';
import {
  canonicalWindow,
  getBoardData,
  getExpensesData,
} from '@wib/feature-payments/server';
import type { BoardOccurrence, ExpenseLine } from '@wib/feature-payments';
import {
  buildSeries,
  computeStat,
  statStrip,
  type ChartSeries,
  type SpendItem,
  type StatResult,
  type StatStripData,
} from './dashboard-compute';

export interface DashboardOption {
  id: string;
  name: string;
  color: string;
}

export interface StatCardData {
  id: string;
  title: string;
  config: DashboardChartConfig;
  result: StatResult;
}

export interface DashboardData {
  /** The month in view, `YYYY-MM`. */
  month: string;
  prevMonth: string;
  nextMonth: string;
  currency: string;
  stat: StatStripData;
  stats: StatCardData[];
  charts: ChartSeries[];
  accounts: DashboardOption[];
  tags: DashboardOption[];
  methods: DashboardOption[];
  banks: DashboardOption[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(year, monthIndex + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function minorIn(amount: Money, currency: string, rates: RateMap): number {
  const c = convertMoney(amount, currency, rates);
  return c.currency === currency.toUpperCase() ? c.minorUnits : 0;
}

function expenseItems(
  expenses: ExpenseLine[],
  currency: string,
  rates: RateMap,
): SpendItem[] {
  return expenses.map((e) => ({
    date: e.date,
    minor: minorIn(e.amount, currency, rates),
    name: e.name,
    notes: e.notes,
    accountId: e.accountId,
    accountName: e.accountName,
    accountColor: e.accountColor,
    methodId: null,
    methodName: null,
    bankId: e.bankId,
    bankName: e.bankName,
    tags: e.tags,
    source: 'expense' as const,
    budgeted: e.budgetId != null,
  }));
}

function plannedItems(
  occurrences: BoardOccurrence[],
  currency: string,
  rates: RateMap,
): SpendItem[] {
  return occurrences
    .filter((o) => o.status !== 'skipped')
    .map((o) => ({
      date: o.dueDate,
      minor: minorIn(o.amount, currency, rates),
      name: o.name,
      notes: null,
      accountId: o.account?.id ?? null,
      accountName: o.account?.name ?? null,
      accountColor: o.account?.color ?? null,
      methodId: o.method?.id ?? null,
      methodName: o.method?.name ?? null,
      bankId: o.bank?.id ?? null,
      bankName: o.bank?.name ?? null,
      tags: o.tags,
      source: 'planned' as const,
      budgeted: false,
    }));
}

const DEFAULT_CHARTS = [
  {
    kind: 'month_spend_line' as const,
    title: 'Spending this month',
    config: {},
  },
  { kind: 'account_pie' as const, title: 'By account', config: {} },
  { kind: 'tag_pie' as const, title: 'By tag', config: {} },
];

export interface SpendItemsBundle {
  allItems: SpendItem[];
  /** `YYYY-MM`. */
  month: string;
  prevMonth: string;
  currency: string;
  methods: DashboardOption[];
  accounts: DashboardOption[];
  tags: DashboardOption[];
  banks: DashboardOption[];
}

const toOption = (x: { id: string; name: string; color: string }) => ({
  id: x.id,
  name: x.name,
  color: x.color,
});

/**
 * Every spend row for the given month **and the one before it** (so a
 * "vs last month" compare needs no extra query), plus the method lookup that
 * comes free with the board fetch. Shared by `getDashboardData` and the
 * stat-preview action.
 */
export async function loadSpendItems(
  monthParam?: string,
): Promise<SpendItemsBundle> {
  const user = await getCurrentUser();
  if (!user) throw new Error('loadSpendItems: not signed in');

  const today = todayIn(user.timezone);
  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : today.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);
  const currency = user.displayCurrency;

  const rates = await getRates();
  const expenses = await getExpensesData();
  // The common case (no `?m=`, or `?m=` a month inside the default look-ahead)
  // reuses the shared page bundle — one cached read, zero extra round trips.
  // Only browsing to a month outside that window fetches its own slice.
  const canon = canonicalWindow(today);
  const wantFrom = `${prevMonth}-01`;
  const wantTo = endOfMonth(`${month}-01`);
  const withinCanon = wantFrom >= canon.from && wantTo <= canon.to;
  const { context, board } = withinCanon
    ? await getBoardData()
    : await getBoardData({ from: wantFrom, to: wantTo });

  return {
    allItems: [
      ...expenseItems(expenses, currency, rates),
      ...plannedItems(board.occurrences, currency, rates),
    ],
    month,
    prevMonth,
    currency,
    methods: context.methods.map(toOption),
    accounts: context.accounts.map(toOption),
    tags: context.tags.map(toOption),
    banks: context.banks.map(toOption),
  };
}

/**
 * The Stats dashboard for `/insights`. The `?m=` month picker scopes the fixed
 * strip and every tile; each chart / stat is otherwise self-contained — its own
 * faceted filter (incl. planned vs expense) decides what it counts. Reads are
 * sequential (Supabase pooler).
 */
export async function getDashboardData(
  monthParam?: string,
): Promise<DashboardData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('getDashboardData: not signed in');

  let rows: DashboardChart[] = await unstable_cache(
    () => listDashboardCharts(user.id),
    ['dashboard-charts', user.id],
    { tags: [`user-data:${user.id}`], revalidate: 60 },
  )();
  if (rows.length === 0) {
    rows = await seedDashboardCharts(user.id, DEFAULT_CHARTS);
  }

  const {
    allItems,
    month,
    prevMonth,
    currency,
    methods,
    accounts,
    tags,
    banks,
  } = await loadSpendItems(monthParam);

  const chartRows = rows.filter((r) => r.kind !== 'stat');
  const statRows = rows.filter((r) => r.kind === 'stat');

  const stat = statStrip(allItems, month, currency);
  const charts = chartRows.map((c) =>
    buildSeries(
      { id: c.id, kind: c.kind, title: c.title, config: c.config },
      allItems,
      month,
      currency,
    ),
  );
  const stats: StatCardData[] = statRows.map((s) => ({
    id: s.id,
    title: s.title,
    config: s.config,
    result: computeStat(allItems, s.config, month, prevMonth),
  }));

  return {
    month,
    prevMonth,
    nextMonth: shiftMonth(month, 1),
    currency: currency.toUpperCase(),
    stat,
    stats,
    charts,
    accounts,
    tags,
    methods,
    banks,
  };
}
