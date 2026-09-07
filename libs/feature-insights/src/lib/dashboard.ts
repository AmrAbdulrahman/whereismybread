import 'server-only';

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
  getAccounts,
  getBanks,
  getBoardData,
  getExpensesData,
  getTags,
} from '@wib/feature-payments/server';
import type { BoardOccurrence, ExpenseLine } from '@wib/feature-payments';
import {
  buildSeries,
  computeStat,
  statStrip,
  type ChartSeries,
  type SpendItem,
  type SpendSource,
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
  /** Which spend sources feed the charts + headline total. */
  sources: SpendSource[];
  stat: StatStripData;
  stats: StatCardData[];
  charts: ChartSeries[];
  accounts: DashboardOption[];
  tags: DashboardOption[];
  methods: DashboardOption[];
  banks: DashboardOption[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALL_SOURCES: SpendSource[] = ['planned', 'expense'];

function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(year, monthIndex + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Parse `?src=planned,expense` — defaults to both, never empty. */
function parseSources(raw?: string): SpendSource[] {
  if (!raw) return ALL_SOURCES;
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SpendSource => s === 'planned' || s === 'expense');
  return wanted.length > 0 ? [...new Set(wanted)] : ALL_SOURCES;
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
  { kind: 'month_spend_line' as const, title: 'Spending this month', config: {} },
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
}

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
  const { context, board } = await getBoardData({
    from: `${prevMonth}-01`,
    to: endOfMonth(`${month}-01`),
  });

  return {
    allItems: [
      ...expenseItems(expenses, currency, rates),
      ...plannedItems(board.occurrences, currency, rates),
    ],
    month,
    prevMonth,
    currency,
    methods: context.methods.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
    })),
  };
}

/**
 * The Stats dashboard for `/insights`. One shared month (`?m=`) and one shared
 * planned/expenses source filter (`?src=`) drive the fixed stat strip and every
 * chart; a `stat` tile carries its own faceted filter + measure and ignores the
 * source toggle. Reads are sequential (Supabase pooler).
 */
export async function getDashboardData(
  monthParam?: string,
  sourcesParam?: string,
): Promise<DashboardData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('getDashboardData: not signed in');

  const sources = parseSources(sourcesParam);

  let rows: DashboardChart[] = await listDashboardCharts(user.id);
  if (rows.length === 0) {
    rows = await seedDashboardCharts(user.id, DEFAULT_CHARTS);
  }

  const { allItems, month, prevMonth, currency, methods } =
    await loadSpendItems(monthParam);
  const accounts = await getAccounts();
  const tags = await getTags();
  const banks = await getBanks();

  const active = new Set(sources);
  const selected = allItems.filter((it) => active.has(it.source));

  const chartRows = rows.filter((r) => r.kind !== 'stat');
  const statRows = rows.filter((r) => r.kind === 'stat');

  const stat = statStrip(allItems, month, currency, active);
  const charts = chartRows.map((c) =>
    buildSeries(
      { id: c.id, kind: c.kind, title: c.title, config: c.config },
      selected,
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

  const opt = (x: { id: string; name: string; color: string }) => ({
    id: x.id,
    name: x.name,
    color: x.color,
  });

  return {
    month,
    prevMonth,
    nextMonth: shiftMonth(month, 1),
    currency: currency.toUpperCase(),
    sources,
    stat,
    stats,
    charts,
    accounts: accounts.map(opt),
    tags: tags.map(opt),
    methods,
    banks: banks.map(opt),
  };
}
